import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresRepository } from '../src/db/postgres-repository.js';
import { runPostgresMigrations } from '../src/db/postgres-migrations.js';
import {
  POSTGRES_DATA_BACKFILLS,
  POSTGRES_SCHEMA_MIGRATIONS,
  POSTGRES_SCHEMA_TABLE_NAMES,
} from '../src/db/postgres-schema.js';

const connectionString = String(process.env.PG_INTEGRATION_DATABASE_URL || '').trim();

describe('real PostgreSQL integration', { skip: !connectionString }, () => {
  it('creates the application schema, records migrations, applies backfill, and rolls back failed work', async () => {
    const repository = new PostgresRepository({
      connectionString,
      requireTls: false, // isolated ephemeral CI service only; staging/production must verify TLS.
      poolOptions: { max: 2, application_name: 'easyshop-postgres-integration-test' },
    });
    const orderId = 'ci_postgres_order_backfill_probe';
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

      await repository.run(`INSERT INTO orders (id, code, status, payment_status, placed_at, updated_at)
        VALUES (?, ?, 'processing', 'paid', ?, ?)`, [
        orderId,
        'CI-PG-BACKFILL-PROBE',
        '2026-10-09T00:00:00.000Z',
        '2026-10-09T00:00:00.000Z',
      ]);
      await repository.run(`INSERT INTO payments (id, order_id, amount, status, created_at)
        VALUES (?, ?, 100, 'paid', ?), (?, ?, 100, 'paid', ?)`, [
        'ci_postgres_payment_first', orderId, '2026-10-09T00:01:00.000Z',
        'ci_postgres_payment_second', orderId, '2026-10-09T00:02:00.000Z',
      ]);
      assert.deepEqual(await runPostgresMigrations(repository, POSTGRES_DATA_BACKFILLS), [
        { version: '20261009_04_payment_applied_marker', status: 'applied' },
      ]);
      assert.deepEqual(await repository.all(
        'SELECT id, applied FROM payments WHERE order_id = ? ORDER BY created_at, id',
        [orderId],
      ), [
        { id: 'ci_postgres_payment_first', applied: 1 },
        { id: 'ci_postgres_payment_second', applied: 0 },
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
    } finally {
      await repository.close();
    }
  });
});
