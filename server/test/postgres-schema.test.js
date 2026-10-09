import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA_SQL } from '../src/db/schema.js';
import {
  ADDITIONAL_INDEX_MIGRATIONS,
  TABLE_MIGRATIONS,
} from '../src/db/legacy-schema-migrations.js';
import { PostgresRepository } from '../src/db/postgres-repository.js';
import { runPostgresMigrations } from '../src/db/postgres-migrations.js';
import {
  POSTGRES_DATA_BACKFILLS,
  POSTGRES_SCHEMA_MIGRATIONS,
  POSTGRES_SCHEMA_SQL,
  POSTGRES_SCHEMA_TABLE_NAMES,
} from '../src/db/postgres-schema.js';

function tableNamesFromSharedSql() {
  const definitions = [SCHEMA_SQL, ...TABLE_MIGRATIONS, ...ADDITIONAL_INDEX_MIGRATIONS];
  return [...new Set(definitions.flatMap((sql) => [...sql.matchAll(
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/gi,
  )].map((match) => match[1].toLowerCase())))].filter((name) => name !== 'schema_migrations').sort();
}

function pglitePool(engine) {
  const query = async (sql, parameters) => {
    if (parameters === undefined && sql.trim().split(';').filter((statement) => statement.trim()).length > 1) {
      const results = await engine.exec(sql);
      const result = results.at(-1) || {};
      return {
        rows: result.rows || [],
        rowCount: result.affectedRows ?? result.rowCount ?? 0,
      };
    }
    const result = parameters === undefined
      ? await engine.query(sql)
      : await engine.query(sql, parameters);
    return {
      rows: result.rows || [],
      rowCount: result.affectedRows ?? result.rowCount ?? 0,
    };
  };
  const client = { query, release() {} };
  return {
    query,
    async connect() { return client; },
    async end() {},
  };
}

describe('PostgreSQL application schema bootstrap', () => {
  it('matches the shared SQLite table inventory and contains no PRAGMA statements', () => {
    assert.deepEqual(POSTGRES_SCHEMA_TABLE_NAMES, tableNamesFromSharedSql());
    assert.equal(POSTGRES_SCHEMA_TABLE_NAMES.length, 95);
    assert.doesNotMatch(POSTGRES_SCHEMA_SQL, /\bPRAGMA\b/i);
    assert.doesNotMatch(POSTGRES_SCHEMA_SQL, /\bAUTOINCREMENT\b|\bINSERT\s+OR\s+(?:REPLACE|IGNORE)\b/i);
    assert.equal(POSTGRES_SCHEMA_MIGRATIONS[0].version, '20261009_03_postgres_application_schema');
    assert.equal(POSTGRES_DATA_BACKFILLS[0].version, '20261009_04_payment_applied_marker');
  });

  it('applies all DDL to embedded PostgreSQL and runs the post-import payment backfill once', async () => {
    const engine = new PGlite();
    const repository = new PostgresRepository({ pool: pglitePool(engine) });
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
      assert.equal(tables.length, POSTGRES_SCHEMA_TABLE_NAMES.length + 1); // includes migration ledger

      await repository.run(`INSERT INTO orders (id, code, status, payment_status, placed_at, updated_at)
        VALUES (?, ?, 'processing', 'paid', ?, ?)`, [
        'order_schema_probe',
        'ORD-SCHEMA-PROBE',
        '2026-10-09T00:00:00.000Z',
        '2026-10-09T00:00:00.000Z',
      ]);
      await repository.run(`INSERT INTO payments (id, order_id, amount, status, created_at)
        VALUES (?, ?, 100, 'paid', ?), (?, ?, 100, 'paid', ?)`, [
        'payment_schema_first', 'order_schema_probe', '2026-10-09T00:01:00.000Z',
        'payment_schema_second', 'order_schema_probe', '2026-10-09T00:02:00.000Z',
      ]);

      assert.deepEqual(await runPostgresMigrations(repository, POSTGRES_DATA_BACKFILLS), [
        { version: '20261009_04_payment_applied_marker', status: 'applied' },
      ]);
      const payments = await repository.all(
        'SELECT id, applied FROM payments WHERE order_id = ? ORDER BY created_at, id',
        ['order_schema_probe'],
      );
      assert.deepEqual(payments, [
        { id: 'payment_schema_first', applied: 1 },
        { id: 'payment_schema_second', applied: 0 },
      ]);
      assert.deepEqual(await runPostgresMigrations(repository, POSTGRES_DATA_BACKFILLS), [
        { version: '20261009_04_payment_applied_marker', status: 'already_applied' },
      ]);
    } finally {
      await engine.close();
    }
  });
});
