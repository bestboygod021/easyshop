#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresRepository } from '../server/src/db/postgres-repository.js';
import {
  applySqliteSnapshotImport,
  openSqliteSnapshot,
  planSqliteSnapshotImport,
  sha256File,
} from '../server/src/db/sqlite-postgres-import.js';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TLS_MODES = new Set(['verify-ca', 'verify-full']);

export function parseSqliteImportArgs(argv, env = process.env) {
  const result = {
    apply: false,
    confirmStaging: false,
    confirmSanitizedSnapshot: false,
    sourcePath: String(env.PG_REHEARSAL_SQLITE_SNAPSHOT || '').trim() || null,
    batchSize: 250,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') result.apply = true;
    else if (argument === '--confirm-staging') result.confirmStaging = true;
    else if (argument === '--confirm-sanitized-snapshot') result.confirmSanitizedSnapshot = true;
    else if (argument === '--source') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--source requires a local SQLite snapshot path.');
      result.sourcePath = value;
      index += 1;
    } else if (argument === '--batch-size') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 500) throw new Error('--batch-size must be an integer from 1 through 500.');
      result.batchSize = value;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      result.help = true;
    } else {
      throw new Error(`Unsupported argument: ${argument}`);
    }
  }

  if (!result.apply) return result;
  if (!result.sourcePath) throw new Error('Applying an import requires --source or PG_REHEARSAL_SQLITE_SNAPSHOT.');
  if (!result.confirmStaging || env.PG_REHEARSAL_CONFIRM_STAGING !== '1') {
    throw new Error('Applying an import requires --confirm-staging and PG_REHEARSAL_CONFIRM_STAGING=1.');
  }
  if (!result.confirmSanitizedSnapshot || env.PG_REHEARSAL_CONFIRM_SANITIZED_SNAPSHOT !== '1') {
    throw new Error('Applying an import requires --confirm-sanitized-snapshot and PG_REHEARSAL_CONFIRM_SANITIZED_SNAPSHOT=1.');
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
  if (!TLS_MODES.has(target.searchParams.get('sslmode'))) {
    throw new Error('Staging data import requires sslmode=verify-ca or sslmode=verify-full.');
  }
  result.connectionString = connectionString;
  return result;
}

function helpText() {
  return [
    'SQLite snapshot → PostgreSQL rehearsal importer',
    '',
    'Plan only (default; never connects to PostgreSQL):',
    '  node tools/sqlite-to-postgres-migrate.mjs [--source <snapshot.db>]',
    '',
    'Apply to an isolated staging database only:',
    '  node tools/sqlite-to-postgres-migrate.mjs --source <snapshot.db> --apply',
    '    --confirm-staging --confirm-sanitized-snapshot [--batch-size 250]',
    '',
    'Apply also requires PG_REHEARSAL_DATABASE_URL (sslmode=verify-ca|verify-full),',
    'PG_REHEARSAL_CONFIRM_STAGING=1, and PG_REHEARSAL_CONFIRM_SANITIZED_SNAPSHOT=1.',
    'No production cutover is performed.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseSqliteImportArgs(argv, env);
  if (args.help) {
    console.log(helpText());
    return;
  }
  if (!args.sourcePath) {
    console.log(JSON.stringify(await planSqliteSnapshotImport(), null, 2));
    return;
  }

  const dataDirectory = path.resolve(env.DATA_DIR || path.join(REPOSITORY_ROOT, 'server/data'));
  const snapshot = openSqliteSnapshot(args.sourcePath, { dataDirectory });
  try {
    const snapshotSha256 = await sha256File(snapshot.path);
    if (!args.apply) {
      const plan = await planSqliteSnapshotImport({
        database: snapshot.database,
        snapshotSha256,
        snapshotSizeBytes: snapshot.sizeBytes,
      });
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    const repository = new PostgresRepository({
      connectionString: args.connectionString,
      requireTls: true,
      poolOptions: { max: 1, application_name: 'easyshop-sanitized-sqlite-import' },
    });
    try {
      const report = await applySqliteSnapshotImport({
        database: snapshot.database,
        snapshotPath: snapshot.path,
        snapshotSha256,
        repository,
        batchSize: args.batchSize,
      });
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await repository.close();
    }
  } finally {
    snapshot.database.close();
  }
}

function redactConnectionDetails(message, env = process.env) {
  let safe = String(message || 'Unexpected importer error.');
  const connectionString = String(env.PG_REHEARSAL_DATABASE_URL || '').trim();
  if (connectionString) safe = safe.split(connectionString).join('[redacted PostgreSQL connection]');
  try {
    const parsed = new URL(connectionString);
    for (const credential of [decodeURIComponent(parsed.username), decodeURIComponent(parsed.password)]) {
      if (credential) safe = safe.split(credential).join('[redacted]');
    }
  } catch { /* no valid connection URL to redact */ }
  return safe;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`SQLite snapshot import stopped safely: ${redactConnectionDetails(error.message)}`);
    process.exitCode = 1;
  });
}
