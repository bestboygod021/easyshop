import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PostgresRepository } from '../src/db/postgres-repository.js';
import { runPostgresMigrations } from '../src/db/postgres-migrations.js';
import { POSTGRES_DATA_BACKFILLS, POSTGRES_SCHEMA_MIGRATIONS, POSTGRES_SCHEMA_TABLE_NAMES } from '../src/db/postgres-schema.js';
import { applySqliteSnapshotImport, openSqliteSnapshot, sha256File } from '../src/db/sqlite-postgres-import.js';
import { createSqliteImportFixture } from './helpers/sqlite-import-fixture.js';

const connectionString = String(process.env.PG_INTEGRATION_DATABASE_URL || '').trim();

describe('real PostgreSQL integration', { skip: !connectionString }, () => {
  it('imports and reconciles a synthetic sanitized snapshot, backfills payments, and rolls back failed work', async () => {
    const repository = new PostgresRepository({
      connectionString,
      requireTls: false, // isolated ephemeral CI service only; staging/production must verify TLS.
      poolOptions: { max: 2, application_name: 'easyshop-postgres-integration-test' },
    });
    const fixture = createSqliteImportFixture();
    let snapshot;
    try {
      assert.deepEqual(await runPostgresMigrations(repository, POSTGRES_SCHEMA_MIGRATIONS), [
        { version: '20261009_03_postgres_application_schema', status: 'applied' },
      ]);
      const tables = await repository.all(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      assert.equal(tables.length, POSTGRES_SCHEMA_TABLE_NAMES.length + 1);

      snapshot = openSqliteSnapshot(fixture.snapshotPath, { dataDirectory: path.join(fixture.directory, 'active') });
      const importReport = await applySqliteSnapshotImport({
        database: snapshot.database,
        snapshotPath: snapshot.path,
        snapshotSha256: await sha256File(snapshot.path),
        repository,
        batchSize: 2,
      });
      assert.equal(importReport.status, 'imported_and_reconciled');
      assert.equal(importReport.reconciliation.status, 'matched');
      assert.equal(importReport.reconciliation.rows_verified, 8);
      assert.deepEqual(importReport.post_import_backfills, [
        { version: '20261009_04_payment_applied_marker', status: 'applied' },
      ]);
      assert.deepEqual(await repository.all(
        'SELECT id, applied FROM payments WHERE order_id = ? ORDER BY created_at, id',
        ['fixture-order'],
      ), [
        { id: 'fixture-payment', applied: 1 },
        { id: 'fixture-payment-second', applied: 0 },
      ]);

      await assert.rejects(repository.transaction(async (transaction) => {
        await transaction.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
          'ci_postgres_rollback_probe', 'must-rollback', '2026-10-09T00:00:00.000Z',
        ]);
        throw new Error('rollback probe');
      }), /rollback probe/);
      assert.equal(await repository.get('SELECT key FROM settings WHERE key = ?', ['ci_postgres_rollback_probe']), null);

      assert.deepEqual(await runPostgresMigrations(repository, POSTGRES_SCHEMA_MIGRATIONS), [
        { version: '20261009_03_postgres_application_schema', status: 'already_applied' },
      ]);
      assert.deepEqual(await runPostgresMigrations(repository, POSTGRES_DATA_BACKFILLS), [
        { version: '20261009_04_payment_applied_marker', status: 'already_applied' },
      ]);
    } finally {
      snapshot?.database.close();
      fixture.dispose();
      await repository.close();
    }
  });
});
