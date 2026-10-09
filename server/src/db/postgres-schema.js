import { SCHEMA_SQL } from './schema.js';
import {
  ADDITIONAL_INDEX_MIGRATIONS,
  COLUMN_MIGRATIONS,
  TABLE_MIGRATIONS,
} from './legacy-schema-migrations.js';

function postgresCompatibleBaseSchema(sql) {
  return sql.replace(/^\s*PRAGMA\s+[^;]+;\s*$/gim, '').trim();
}

function addMissingColumns(columns) {
  return columns.map(([table, column, definition]) => {
    if (!/^[a-z_][a-z0-9_]*$/i.test(table) || !/^[a-z_][a-z0-9_]*$/i.test(column)) {
      throw new TypeError('Unsafe identifier in shared schema migration inventory.');
    }
    return `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition};`;
  });
}

/**
 * PostgreSQL bootstrap generated from the same base schema and legacy table/
 * column inventory used by the SQLite initializer. These DDL statements are
 * compatible with PostgreSQL; SQLite-only PRAGMAs are deliberately removed.
 *
 * This creates an empty application schema only. It does not migrate data,
 * replace the synchronous SQLite API, or perform a production cutover.
 */
export const POSTGRES_SCHEMA_SQL = [
  postgresCompatibleBaseSchema(SCHEMA_SQL),
  ...TABLE_MIGRATIONS.map((statement) => `${statement.trim().replace(/;?$/, ';')}`),
  ...addMissingColumns(COLUMN_MIGRATIONS),
  ...ADDITIONAL_INDEX_MIGRATIONS.map((statement) => `${statement.trim().replace(/;?$/, ';')}`),
].filter(Boolean).join('\n\n');

export const POSTGRES_SCHEMA_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: '20261009_03_postgres_application_schema',
    sql: POSTGRES_SCHEMA_SQL,
  }),
]);

/**
 * Backfill the one-time legacy settlement marker after copying SQLite rows.
 * The source SQLite initializer orders ties by rowid; the PostgreSQL import
 * uses deterministic id ordering because rowid does not exist there.
 */
export const POSTGRES_DATA_BACKFILLS = Object.freeze([
  Object.freeze({
    version: '20261009_04_payment_applied_marker',
    sql: `WITH ranked_paid_payments AS (
      SELECT
        id,
        order_id,
        row_number() OVER (PARTITION BY order_id ORDER BY created_at ASC, id ASC) AS payment_rank
      FROM payments
      WHERE status = 'paid' AND applied = 0
    )
    UPDATE payments AS target
    SET applied = 1
    FROM ranked_paid_payments AS ranked
    INNER JOIN orders AS order_record ON order_record.id = ranked.order_id
    WHERE target.id = ranked.id
      AND ranked.payment_rank = 1
      AND order_record.payment_status = 'paid'
      AND order_record.status IN ('paid','processing','packed','shipped','delivered')
      AND NOT EXISTS (
        SELECT 1 FROM payments AS already_applied
        WHERE already_applied.order_id = target.order_id AND already_applied.applied = 1
      )`,
  }),
]);

export const POSTGRES_SCHEMA_TABLE_NAMES = Object.freeze([
  ...new Set([...POSTGRES_SCHEMA_SQL.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase())),
].sort());
export const POSTGRES_SCHEMA_TABLE_COUNT = POSTGRES_SCHEMA_TABLE_NAMES.length;
