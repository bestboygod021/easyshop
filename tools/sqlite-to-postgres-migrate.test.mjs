import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PostgresRepository } from '../server/src/db/postgres-repository.js';
import { runPostgresMigrations } from '../server/src/db/postgres-migrations.js';
import { POSTGRES_SCHEMA_MIGRATIONS } from '../server/src/db/postgres-schema.js';
import {
  applySqliteSnapshotImport,
  inspectSqliteSnapshot,
  openSqliteSnapshot,
  planSqliteSnapshotImport,
  sha256File,
  SQLITE_IMPORT_SKIP_TABLES,
} from '../server/src/db/sqlite-postgres-import.js';
import { createSqliteImportFixture } from '../server/test/helpers/sqlite-import-fixture.js';
import { parseSqliteImportArgs } from './sqlite-to-postgres-migrate.mjs';

function pglitePool(engine) {
  const query = async (sql, parameters) => {
    if (parameters === undefined && sql.trim().split(';').filter((statement) => statement.trim()).length > 1) {
      const results = await engine.exec(sql);
      const result = results.at(-1) || {};
      return { rows: result.rows || [], rowCount: result.affectedRows ?? result.rowCount ?? 0 };
    }
    const result = parameters === undefined ? await engine.query(sql) : await engine.query(sql, parameters);
    return { rows: result.rows || [], rowCount: result.affectedRows ?? result.rowCount ?? 0 };
  };
  const client = { query, release() {} };
  return { query, async connect() { return client; }, async end() {} };
}

const fixtures = new Set();
afterEach(() => {
  for (const fixture of fixtures) fixture.dispose();
  fixtures.clear();
});

function makeFixture() {
  const fixture = createSqliteImportFixture();
  fixtures.add(fixture);
  return fixture;
}

describe('SQLite snapshot → PostgreSQL rehearsal importer', () => {
  it('defaults to an offline plan and requires explicit staging and sanitization confirmations for apply', () => {
    const plan = parseSqliteImportArgs([], {});
    assert.equal(plan.apply, false);
    assert.equal(plan.sourcePath, null);
    assert.equal(plan.connectionString, undefined);
    assert.throws(() => parseSqliteImportArgs([
      '--apply', '--source', '/snapshot.sqlite', '--confirm-staging', '--confirm-sanitized-snapshot',
    ], {}), /PG_REHEARSAL_CONFIRM_STAGING/);
    assert.throws(() => parseSqliteImportArgs([
      '--apply', '--source', '/snapshot.sqlite', '--confirm-staging', '--confirm-sanitized-snapshot',
    ], {
      PG_REHEARSAL_CONFIRM_STAGING: '1',
      PG_REHEARSAL_CONFIRM_SANITIZED_SNAPSHOT: '1',
      PG_REHEARSAL_DATABASE_URL: 'postgres://user:password@db.example.test/easyshop?sslmode=require',
    }), /verify-ca or sslmode=verify-full/);
    const apply = parseSqliteImportArgs([
      '--apply', '--source', '/snapshot.sqlite', '--confirm-staging', '--confirm-sanitized-snapshot', '--batch-size', '50',
    ], {
      PG_REHEARSAL_CONFIRM_STAGING: '1',
      PG_REHEARSAL_CONFIRM_SANITIZED_SNAPSHOT: '1',
      PG_REHEARSAL_DATABASE_URL: 'postgres://user:password@db.example.test/easyshop?sslmode=verify-full',
    });
    assert.equal(apply.apply, true);
    assert.equal(apply.batchSize, 50);
  });

  it('inspects a consistent snapshot without opening PostgreSQL or exposing row values', async () => {
    const fixture = makeFixture();
    const snapshot = openSqliteSnapshot(fixture.snapshotPath, { dataDirectory: `${fixture.directory}/active` });
    try {
      const metadata = inspectSqliteSnapshot(snapshot.database);
      assert.equal(metadata.sourceTables.length, 95);
      assert.equal(metadata.tableCounts.users, 1);
      assert.equal(metadata.tableCounts.payments, 2);
      assert.equal(metadata.skippedTables.refresh_tokens, SQLITE_IMPORT_SKIP_TABLES.refresh_tokens);
      assert.ok(metadata.redactedColumns.payments.includes('authority'));
      assert.ok(metadata.redactedColumns.ai_providers.includes('api_key'));
      assert.ok(metadata.redactedColumns.users.includes('password_hash'));
      assert.deepEqual(metadata.derivedColumns.payments, ['applied']);
      assert.equal(metadata.selfReferences.get('categories')[0].from, 'parent_id');

      const fingerprint = await sha256File(snapshot.path);
      const plan = await planSqliteSnapshotImport({
        database: snapshot.database,
        snapshotSha256: fingerprint,
        snapshotSizeBytes: snapshot.sizeBytes,
      });
      const serialized = JSON.stringify(plan);
      assert.equal(plan.mode, 'snapshot_plan_only');
      assert.equal(plan.networkConnectionAttempted, false);
      assert.equal(plan.sourceRowCounts.payments, 2);
      assert.doesNotMatch(serialized, /authority-fixture-secret|provider-ref-fixture|ai-api-key-fixture|refresh-token-fixture/);
    } finally {
      snapshot.database.close();
    }
  });

  it('imports in resumable batches, redacts credentials, defers self-FKs, backfills and reconciles', async () => {
    const fixture = makeFixture();
    const snapshot = openSqliteSnapshot(fixture.snapshotPath, { dataDirectory: `${fixture.directory}/active` });
    const engine = new PGlite();
    const repository = new PostgresRepository({ pool: pglitePool(engine) });
    try {
      assert.deepEqual(await runPostgresMigrations(repository, POSTGRES_SCHEMA_MIGRATIONS), [
        { version: '20261009_03_postgres_application_schema', status: 'applied' },
      ]);
      const snapshotSha256 = await sha256File(snapshot.path);
      let injected = false;
      await assert.rejects(applySqliteSnapshotImport({
        database: snapshot.database,
        snapshotPath: snapshot.path,
        snapshotSha256,
        repository,
        batchSize: 1,
        afterBatch() {
          if (!injected) {
            injected = true;
            throw new Error('simulated process interruption');
          }
        },
      }), /simulated process interruption/);

      const report = await applySqliteSnapshotImport({
        database: snapshot.database,
        snapshotPath: snapshot.path,
        snapshotSha256,
        repository,
        batchSize: 1,
      });
      assert.equal(report.status, 'imported_and_reconciled');
      assert.equal(report.reconciliation.status, 'matched');
      assert.equal(report.reconciliation.rows_verified, 8);
      assert.equal(report.reconciliation.financial_reconciliation.orders.status, 'matched');
      assert.equal(report.reconciliation.financial_reconciliation.orders.groups[0].sums.total, '12500');
      assert.equal(report.reconciliation.financial_reconciliation.payments.status, 'matched');
      assert.equal(report.reconciliation.financial_reconciliation.payments.groups[0].row_count, '2');
      assert.equal(report.reconciliation.financial_reconciliation.payments.groups[0].sums.amount, '25000');
      assert.equal(report.reconciliation.excluded_table_count, Object.keys(SQLITE_IMPORT_SKIP_TABLES).length);
      assert.equal(report.application_cutover_performed, false);

      assert.deepEqual(await repository.get('SELECT password_hash, reset_token, reset_token_hash, device_tokens FROM users WHERE id = ?', ['fixture-user']), {
        password_hash: '!staging-import-account-disabled!',
        reset_token: null,
        reset_token_hash: null,
        device_tokens: '[]',
      });
      assert.deepEqual(await repository.get('SELECT api_key FROM ai_providers WHERE id = ?', ['fixture-ai-provider']), { api_key: null });
      assert.deepEqual(await repository.get(`SELECT authority, ref_id, payload, redirect_url, failure_reason,
        card_mask, card_hash, applied FROM payments WHERE id = ?`, ['fixture-payment']), {
        authority: null,
        ref_id: null,
        payload: null,
        redirect_url: null,
        failure_reason: null,
        card_mask: null,
        card_hash: null,
        applied: 1,
      });
      assert.deepEqual(await repository.all('SELECT id, parent_id FROM categories ORDER BY id'), [
        { id: 'fixture-category-child', parent_id: 'fixture-category-parent' },
        { id: 'fixture-category-parent', parent_id: null },
      ]);
      for (const table of ['refresh_tokens', 'sms_otps', 'checkout_intents', 'webhook_outbox', 'settings']) {
        const count = await repository.get(`SELECT COUNT(*)::integer AS count FROM "${table}"`);
        assert.equal(Number(count.count), 0, `${table} must stay empty in staging`);
      }
      assert.doesNotMatch(JSON.stringify(report), /authority-fixture-secret|provider-ref-fixture|ai-api-key-fixture|refresh-token-fixture/);

      const resumedAgain = await applySqliteSnapshotImport({
        database: snapshot.database,
        snapshotPath: snapshot.path,
        snapshotSha256,
        repository,
        batchSize: 1,
      });
      assert.equal(resumedAgain.reconciliation.status, 'matched');
      assert.equal(Number((await repository.get('SELECT COUNT(*) AS count FROM payments')).count), 2);
      assert.equal(Number((await repository.get('SELECT COUNT(*) AS count FROM users')).count), 1);
      await assert.rejects(applySqliteSnapshotImport({
        database: snapshot.database,
        snapshotSha256: 'f'.repeat(64),
        repository,
        batchSize: 1,
      }), /different snapshot/);

      await repository.run('UPDATE products SET name_fa = ? WHERE id = ?', ['tampered', 'fixture-product']);
      await assert.rejects(applySqliteSnapshotImport({
        database: snapshot.database,
        snapshotPath: snapshot.path,
        snapshotSha256,
        repository,
        batchSize: 1,
      }), /Reconciliation digest mismatch for products/);
      assert.equal((await repository.get('SELECT status FROM easyshop_sqlite_import_runs WHERE source_sha256 = ?', [snapshotSha256])).status, 'in_progress');
    } finally {
      snapshot.database.close();
      await repository.close();
      await engine.close();
    }
  });

  it('rejects the active database path, symlinks, and snapshots with live WAL sidecars', () => {
    const fixture = makeFixture();
    const activeDataDirectory = path.join(fixture.directory, 'active');
    fs.mkdirSync(activeDataDirectory);
    const activeDatabasePath = path.join(activeDataDirectory, 'easyshop.db');
    fs.writeFileSync(activeDatabasePath, 'active database marker');
    assert.throws(() => openSqliteSnapshot(activeDatabasePath, { dataDirectory: activeDataDirectory }), /active SQLite database/);

    const symlinkPath = path.join(fixture.directory, 'snapshot-link.sqlite');
    fs.symlinkSync(fixture.snapshotPath, symlinkPath);
    assert.throws(() => openSqliteSnapshot(symlinkPath, { dataDirectory: activeDataDirectory }), /regular, non-symlink/);

    const walPath = `${fixture.snapshotPath}-wal`;
    fs.writeFileSync(walPath, 'synthetic sidecar');
    assert.throws(() => openSqliteSnapshot(fixture.snapshotPath, { dataDirectory: activeDataDirectory }), /journal\/WAL sidecar/);
    fs.rmSync(walPath, { force: true });
  });
});
