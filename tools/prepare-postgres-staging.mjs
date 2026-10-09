#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PostgresRepository } from '../server/src/db/postgres-repository.js';
import { initializePostgresApplicationSchema } from '../server/src/db/repository.js';
import { POSTGRES_SCHEMA_MIGRATIONS, POSTGRES_SCHEMA_TABLE_NAMES } from '../server/src/db/postgres-schema.js';

const SCHEMA_VERSION = POSTGRES_SCHEMA_MIGRATIONS[0].version;

export function parsePostgresPrepareArgs(argv, env) {
  const allowed = new Set(['--apply', '--confirm-staging']);
  const unknown = argv.find((argument) => !allowed.has(argument));
  if (unknown) throw new Error(`Unsupported argument: ${unknown}`);

  const apply = argv.includes('--apply');
  if (!apply) {
    return {
      apply: false,
      expectedTableCount: POSTGRES_SCHEMA_TABLE_NAMES.length,
      migrationVersions: POSTGRES_SCHEMA_MIGRATIONS.map(({ version }) => version),
      networkConnectionAttempted: false,
    };
  }

  if (!argv.includes('--confirm-staging') || env.PG_REHEARSAL_CONFIRM_STAGING !== '1') {
    throw new Error('Applying schema requires --confirm-staging and PG_REHEARSAL_CONFIRM_STAGING=1.');
  }
  const connectionString = String(env.PG_REHEARSAL_DATABASE_URL || '').trim();
  if (!connectionString || /[\r\n]/.test(connectionString)) {
    throw new Error('PG_REHEARSAL_DATABASE_URL must be supplied through the approved secret store.');
  }

  let target;
  try { target = new URL(connectionString); } catch { throw new Error('PG_REHEARSAL_DATABASE_URL is invalid.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new Error('PG_REHEARSAL_DATABASE_URL must use a PostgreSQL URL scheme.');
  }
  if (!['verify-ca', 'verify-full'].includes(target.searchParams.get('sslmode'))) {
    throw new Error('Staging schema apply requires sslmode=verify-ca or sslmode=verify-full.');
  }

  return {
    apply: true,
    expectedTableCount: POSTGRES_SCHEMA_TABLE_NAMES.length,
    migrationVersions: POSTGRES_SCHEMA_MIGRATIONS.map(({ version }) => version),
    networkConnectionAttempted: false,
  };
}

async function assertEmptyOrFullyBootstrapped(repository) {
  const rows = await repository.all(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const names = new Set(rows.map((row) => String(row.table_name).toLowerCase()));
  const hasLedger = names.has('easyshop_schema_migrations');
  const applicationTables = [...names].filter((name) => name !== 'easyshop_schema_migrations');
  if (!hasLedger && applicationTables.length === 0) return;

  if (!hasLedger) {
    throw new Error('Refusing schema apply: public schema is not empty and has no EasyShop migration ledger.');
  }
  const ledger = await repository.all('SELECT version FROM easyshop_schema_migrations');
  const installedVersions = new Set(ledger.map((row) => row.version));
  if (applicationTables.length === 0 && installedVersions.size === 0) return;
  if (!installedVersions.has(SCHEMA_VERSION)) {
    throw new Error('Refusing schema apply: public tables exist without the expected EasyShop schema migration.');
  }

  const missing = POSTGRES_SCHEMA_TABLE_NAMES.filter((table) => !names.has(table));
  const unexpected = applicationTables.filter((table) => !POSTGRES_SCHEMA_TABLE_NAMES.includes(table));
  if (missing.length || unexpected.length) {
    throw new Error('Refusing schema apply: target table inventory does not match the recorded EasyShop schema.');
  }
}

async function applyStagingSchema(plan, connectionString) {
  const repository = new PostgresRepository({
    connectionString,
    requireTls: true,
    poolOptions: { max: 1, application_name: 'easyshop-staging-schema-bootstrap' },
  });
  try {
    const server = await repository.get(`SELECT
      current_setting('server_version_num')::integer AS version_num
    `);
    if (!Number.isInteger(server?.version_num) || server.version_num < 120000) {
      throw new Error('The staging PostgreSQL server must be version 12 or newer.');
    }
    await assertEmptyOrFullyBootstrapped(repository);
    const migrations = await initializePostgresApplicationSchema(repository);
    const tables = await repository.all(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    return {
      mode: 'staging_schema_apply',
      status: 'schema_applied',
      postgres_major_version: Math.floor(server.version_num / 10_000),
      application_table_count: tables.filter((row) => row.table_name !== 'easyshop_schema_migrations').length,
      migrations,
      data_import_performed: false,
      application_cutover_performed: false,
      network_connection_attempted: true,
    };
  } finally {
    await repository.close();
  }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const plan = parsePostgresPrepareArgs(argv, env);
  if (!plan.apply) {
    console.log(JSON.stringify({ mode: 'plan_only', ...plan }, null, 2));
    return;
  }
  const connectionString = String(env.PG_REHEARSAL_DATABASE_URL || '').trim();
  try {
    const result = await applyStagingSchema(plan, connectionString);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = String(error?.message || 'unknown failure').replaceAll(connectionString, '[REDACTED_DATABASE_URL]');
    console.error(`PostgreSQL staging schema apply failed: ${message}`);
    process.exitCode = 1;
  }
}

const currentFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (currentFile && import.meta.url === pathToFileURL(currentFile).href) {
  main().catch((error) => {
    console.error(`PostgreSQL staging preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
