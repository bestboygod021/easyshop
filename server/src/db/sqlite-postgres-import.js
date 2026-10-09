import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  POSTGRES_DATA_BACKFILLS,
  POSTGRES_SCHEMA_MIGRATIONS,
  POSTGRES_SCHEMA_TABLE_NAMES,
} from './postgres-schema.js';
import { runPostgresMigrations } from './postgres-migrations.js';

export const SQLITE_IMPORT_SKIP_TABLES = Object.freeze({
  ai_generations: 'unreviewed_user_generated_content',
  ai_logs: 'unreviewed_prompts_and_responses',
  audit_logs: 'staging_must_start_a_new_audit_chain',
  checkout_intents: 'short_lived_payment_authorities',
  crypto_payments: 'wallet_addresses_and_payment_activity',
  login_attempts: 'personal_security_telemetry',
  order_pickup_reservations: 'pickup_tokens_and_active_reservations',
  passkey_credentials: 'production_authentication_credentials',
  payment_callback_events: 'provider_callback_and_replay_metadata',
  refresh_tokens: 'bearer_tokens',
  search_query_logs: 'potentially_identifying_queries',
  settings: 'environment_specific_configuration_must_be_reprovisioned',
  shahkar_logs: 'national_identifiers_and_phone_numbers',
  sms_otps: 'short_lived_authentication_codes',
  stolen_card_blacklist: 'cardholder_data',
  transactional_sms_logs: 'phone_numbers_and_message_payloads',
  user_login_history: 'personal_security_telemetry',
  webhook_outbox: 'pending_external_side_effects',
});

export const SQLITE_IMPORT_REDACT_COLUMNS = Object.freeze({
  ai_providers: Object.freeze({ api_key: 'reprovision_provider_credentials_out_of_band' }),
  conversations: Object.freeze({ guest_token_hash: 'invalidate_guest_sessions' }),
  orders: Object.freeze({ checkout_key: 'checkout_idempotency_credential' }),
  payments: Object.freeze({
    authority: 'payment_provider_credential',
    ref_id: 'payment_provider_reference',
    payload: 'payment_provider_payload',
    redirect_url: 'payment_provider_url',
    failure_reason: 'provider_detail_may_contain_sensitive_data',
    card_mask: 'cardholder_data',
    card_hash: 'cardholder_derived_identifier',
  }),
  users: Object.freeze({
    reset_token: 'invalidate_password_reset_credentials',
    reset_token_hash: 'invalidate_password_reset_credentials',
    device_tokens: 'push_notification_credentials',
  }),
  wallet_topups: Object.freeze({
    idempotency_key: 'payment_idempotency_credential',
    authority: 'payment_provider_credential',
    ref_id: 'payment_provider_reference',
    ip: 'personal_network_identifier',
    redirect_url: 'payment_provider_url',
  }),
});

const DISABLED_STAGING_PASSWORD_HASH = '!staging-import-account-disabled!';
const STAGING_PASSWORD_TRANSFORMS = Object.freeze({ users: Object.freeze({ password_hash: DISABLED_STAGING_PASSWORD_HASH }) });
const POST_IMPORT_DERIVED_COLUMNS = Object.freeze({ payments: new Set(['applied']) });
const FINANCIAL_RECONCILIATION_SPECS = Object.freeze({
  orders: Object.freeze({ groupBy: ['currency', 'status'], sumColumns: ['subtotal', 'discount', 'tax', 'shipping_cost', 'total'] }),
  payments: Object.freeze({ groupBy: ['status'], sumColumns: ['amount'] }),
});
const SQLITE_INTERNAL_TABLES = new Set(['schema_migrations', 'sqlite_sequence']);
const IMPORT_RUNS_TABLE = 'easyshop_sqlite_import_runs';
const IMPORT_PROGRESS_TABLE = 'easyshop_sqlite_import_progress';
const MAX_BIND_PARAMETERS = 60_000;
const HASH_MODULUS = 1n << 256n;
const HASH_MASK = HASH_MODULUS - 1n;
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const MIN_SAFE_SQLITE_ROWID = -Number.MAX_SAFE_INTEGER;

function quoteIdentifier(identifier) {
  if (!SAFE_IDENTIFIER.test(identifier)) throw new TypeError('Unsafe SQL identifier in migration inventory.');
  return `"${identifier}"`;
}

function postgresMigrationChecksum(migration) {
  return crypto.createHash('sha256')
    .update(`${migration.version}\0${migration.sql.trim()}`)
    .digest('hex');
}

function toSafeRowid(value) {
  const rowid = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(rowid)) {
    throw new Error('SQLite snapshot rowid is outside the safe integer range.');
  }
  return rowid;
}

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export function openSqliteSnapshot(snapshotPath, { dataDirectory } = {}) {
  if (!snapshotPath || /[\r\n]/.test(String(snapshotPath))) {
    throw new Error('A local SQLite snapshot file path is required.');
  }
  const inputPath = path.resolve(String(snapshotPath));
  let stat;
  try { stat = fs.lstatSync(inputPath); } catch { throw new Error('SQLite snapshot file does not exist.'); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('SQLite snapshot must be a regular, non-symlink file.');
  const resolvedPath = fs.realpathSync(inputPath);

  const activeDataDirectory = path.resolve(dataDirectory || process.env.DATA_DIR || path.resolve('server/data'));
  const activeDatabasePaths = new Set([path.join(activeDataDirectory, 'easyshop.db')]);
  if (process.env.DATA_DIR && !path.isAbsolute(process.env.DATA_DIR)) {
    activeDatabasePaths.add(path.resolve(process.env.DATA_DIR, 'easyshop.db'));
    activeDatabasePaths.add(path.resolve('server', process.env.DATA_DIR, 'easyshop.db'));
  }
  const isActiveDatabase = [...activeDatabasePaths].some((activeDatabasePath) => inputPath === activeDatabasePath
    || (fs.existsSync(activeDatabasePath) && resolvedPath === fs.realpathSync(activeDatabasePath)));
  if (isActiveDatabase) {
    throw new Error('Refusing to read the active SQLite database; use a separately created snapshot copy.');
  }
  for (const suffix of ['-wal', '-shm', '-journal']) {
    if (fs.existsSync(`${resolvedPath}${suffix}`)) {
      throw new Error('SQLite snapshot has a live journal/WAL sidecar; create a consistent standalone snapshot first.');
    }
  }

  let database;
  try {
    database = new DatabaseSync(resolvedPath, { readOnly: true });
    database.exec('PRAGMA query_only = ON;');
    const integrity = database.prepare('PRAGMA quick_check').get();
    if (String(integrity?.quick_check || '').toLowerCase() !== 'ok') {
      throw new Error('SQLite snapshot failed PRAGMA quick_check.');
    }
    const foreignKeyViolation = database.prepare('PRAGMA foreign_key_check').get();
    if (foreignKeyViolation) throw new Error('SQLite snapshot contains a foreign-key violation.');
    return { database, path: resolvedPath, sizeBytes: stat.size };
  } catch (error) {
    try { database?.close(); } catch { /* preserve original error */ }
    throw error;
  }
}

function listSqliteTables(database) {
  return database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => String(row.name));
}

function tableColumns(database, tableName) {
  return database.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((column) => ({
    name: String(column.name),
    type: String(column.type || ''),
    notNull: Number(column.notnull) === 1,
    defaultValue: column.dflt_value,
    primaryKeyOrder: Number(column.pk || 0),
  }));
}

function foreignKeys(database, tableName) {
  return database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`).all().map((row) => ({
    parentTable: String(row.table),
    from: String(row.from),
    to: String(row.to),
  }));
}

function makeInitialSkippedTables(sourceTables, tableCounts, sourceForeignKeys) {
  const skipped = new Map(Object.entries(SQLITE_IMPORT_SKIP_TABLES)
    .filter(([table]) => sourceTables.has(table)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [child, references] of sourceForeignKeys) {
      if (skipped.has(child)) continue;
      const excludedParent = references.find(({ parentTable }) => skipped.has(parentTable)
        && Number(tableCounts[parentTable] || 0) > 0);
      if (excludedParent) {
        skipped.set(child, 'references_a_table_excluded_for_security');
        changed = true;
      }
    }
  }
  return skipped;
}

function stableImportOrder(tables, sourceForeignKeys, skipped, columnsByTable) {
  const included = tables.filter((table) => !skipped.has(table));
  const includedSet = new Set(included);
  const selfReferences = new Map();
  const dependencies = new Map(included.map((table) => [table, new Set()]));

  for (const table of included) {
    for (const reference of sourceForeignKeys.get(table) || []) {
      if (reference.parentTable === table) {
        const current = selfReferences.get(table) || [];
        current.push(reference);
        selfReferences.set(table, current);
      } else if (includedSet.has(reference.parentTable)) {
        dependencies.get(table).add(reference.parentTable);
      }
    }
  }

  const remaining = new Set(included);
  const ordered = [];
  while (remaining.size) {
    const ready = [...remaining].filter((table) => [...dependencies.get(table)].every((parent) => !remaining.has(parent)));
    if (!ready.length) throw new Error('SQLite snapshot contains a cyclic cross-table foreign-key dependency.');
    ready.sort();
    for (const table of ready) {
      remaining.delete(table);
      ordered.push(table);
    }
  }

  for (const [table, references] of selfReferences) {
    const columns = new Map((columnsByTable.get(table) || []).map((column) => [column.name, column]));
    for (const reference of references) {
      const column = columns.get(reference.from);
      if (!column || column.notNull) {
        throw new Error(`Self-reference ${table}.${reference.from} cannot be deferred safely.`);
      }
    }
  }
  return { ordered, selfReferences };
}

export function inspectSqliteSnapshot(database) {
  if (!database || typeof database.prepare !== 'function') throw new TypeError('An open read-only SQLite snapshot is required.');
  const sourceTables = new Set(listSqliteTables(database));
  const unexpectedTables = [...sourceTables].filter((table) => !POSTGRES_SCHEMA_TABLE_NAMES.includes(table)
    && !SQLITE_INTERNAL_TABLES.has(table));
  if (unexpectedTables.length) {
    throw new Error('SQLite snapshot contains tables outside the approved 95-table application inventory.');
  }

  const tableCounts = {};
  const columns = new Map();
  const sourceForeignKeys = new Map();
  for (const table of POSTGRES_SCHEMA_TABLE_NAMES) {
    if (!sourceTables.has(table)) {
      tableCounts[table] = 0;
      columns.set(table, []);
      sourceForeignKeys.set(table, []);
      continue;
    }
    const countRow = database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get();
    tableCounts[table] = Number(countRow?.count || 0);
    const tableInfo = tableColumns(database, table);
    if (tableCounts[table] > 0 && !tableInfo.some((column) => column.primaryKeyOrder > 0)) {
      throw new Error(`SQLite source table ${table} has rows but no primary key.`);
    }
    columns.set(table, tableInfo);
    sourceForeignKeys.set(table, foreignKeys(database, table));
  }

  const skippedTables = makeInitialSkippedTables(sourceTables, tableCounts, sourceForeignKeys);
  const importOrder = stableImportOrder(POSTGRES_SCHEMA_TABLE_NAMES.filter((table) => sourceTables.has(table)), sourceForeignKeys, skippedTables, columns);
  const redactedColumns = {};
  const derivedColumns = {};
  for (const [table, fields] of Object.entries(POST_IMPORT_DERIVED_COLUMNS)) {
    if (!sourceTables.has(table)) continue;
    const present = [...fields].filter((column) => columns.get(table).some((item) => item.name === column));
    if (present.length) derivedColumns[table] = present;
  }
  const redactionPolicy = { ...SQLITE_IMPORT_REDACT_COLUMNS };
  for (const [table, fields] of Object.entries(STAGING_PASSWORD_TRANSFORMS)) {
    redactionPolicy[table] = { ...(redactionPolicy[table] || {}), ...Object.fromEntries(Object.keys(fields).map((column) => [column, 'replace_with_invalid_staging_value'])) };
  }
  for (const [table, fields] of Object.entries(redactionPolicy)) {
    if (!sourceTables.has(table)) continue;
    const present = Object.keys(fields).filter((column) => columns.get(table).some((item) => item.name === column));
    if (present.length) redactedColumns[table] = present;
  }
  const totalSourceRows = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
  return {
    sourceTables: [...sourceTables].sort(),
    tableCounts,
    columns,
    sourceForeignKeys,
    importOrder: importOrder.ordered,
    selfReferences: importOrder.selfReferences,
    skippedTables: Object.fromEntries(skippedTables),
    redactedColumns,
    derivedColumns,
    totalSourceRows,
  };
}

function jsonSafe(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { $binary: Buffer.from(value).toString('base64') };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, jsonSafe(value[key])]));
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  return value;
}

function normalizeHashValue(value, dataType) {
  if (value === null || value === undefined) return null;
  if (dataType === 'boolean') return value === true || value === 1 || value === '1' || value === 't';
  if (['smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision'].includes(dataType)) {
    const number = Number(value);
    if (Number.isFinite(number)) return { $numeric: number.toString() };
    return { $numeric: String(value) };
  }
  if (dataType === 'json' || dataType === 'jsonb') {
    if (typeof value === 'string') {
      try { return jsonSafe(JSON.parse(value)); } catch { /* preserve non-JSON legacy text */ }
    }
    return jsonSafe(value);
  }
  return jsonSafe(value);
}

function createMultisetDigest(columns, typesByName) {
  return {
    count: 0,
    sum: 0n,
    xor: 0n,
    add(row) {
      const projected = columns.map((column) => [column, normalizeHashValue(row[column], typesByName.get(column) || 'text')]);
      const digest = crypto.createHash('sha256').update(JSON.stringify(projected)).digest('hex');
      const integer = BigInt(`0x${digest}`);
      this.sum = (this.sum + integer) & HASH_MASK;
      this.xor ^= integer;
      this.count += 1;
    },
    result() {
      return {
        count: this.count,
        sum_sha256: this.sum.toString(16).padStart(64, '0'),
        xor_sha256: this.xor.toString(16).padStart(64, '0'),
      };
    },
  };
}

function getColumnTransform(table, column) {
  return STAGING_PASSWORD_TRANSFORMS[table]?.[column] ?? null;
}

function projectSourceRow(table, row, columns, { deferSelfReferences = false, selfReferences = [] } = {}) {
  const selfReferenceColumns = deferSelfReferences ? new Set(selfReferences.map((reference) => reference.from)) : new Set();
  const result = {};
  for (const column of columns) {
    if (selfReferenceColumns.has(column)) result[column] = null;
    else result[column] = getColumnTransform(table, column) ?? row[column];
  }
  return result;
}

function getRedactedColumnSet(table, sourceColumns) {
  const configured = new Set(Object.keys(SQLITE_IMPORT_REDACT_COLUMNS[table] || {}));
  for (const column of POST_IMPORT_DERIVED_COLUMNS[table] || []) configured.add(column);
  return new Set(sourceColumns.filter((column) => configured.has(column)));
}

function buildTableProjection(table, sourceInfo, destinationInfo) {
  const sourceNames = sourceInfo.map((column) => column.name);
  const destinationByName = new Map(destinationInfo.columns.map((column) => [column.name, column]));
  const extraSource = sourceNames.filter((column) => !destinationByName.has(column));
  if (extraSource.length) {
    throw new Error(`SQLite snapshot table ${table} has columns not present in the PostgreSQL schema.`);
  }
  const redacted = getRedactedColumnSet(table, sourceNames);
  const included = sourceNames.filter((column) => !redacted.has(column) && !destinationByName.get(column)?.isGenerated);
  const includedSet = new Set(included);
  const missingRequired = destinationInfo.columns.filter((column) => {
    const hasDefault = column.defaultValue !== null && column.defaultValue !== undefined
      && !/^null(?:\s*::|\s*$)/i.test(String(column.defaultValue).trim());
    return !includedSet.has(column.name) && !column.isNullable && !hasDefault && !column.isIdentity && !column.isGenerated;
  });
  if (missingRequired.length) {
    throw new Error(`Import policy omits required columns in table ${table}; explicit data-owner mapping is required.`);
  }
  const sourcePrimaryKey = sourceInfo.filter((column) => column.primaryKeyOrder > 0)
    .sort((a, b) => a.primaryKeyOrder - b.primaryKeyOrder).map((column) => column.name);
  if (!sourcePrimaryKey.length) throw new Error(`SQLite table ${table} needs a primary key for safe reconciliation.`);
  const destinationPrimaryKey = destinationInfo.primaryKeyColumns;
  if (sourcePrimaryKey.join('\0') !== destinationPrimaryKey.join('\0')) {
    throw new Error(`SQLite and PostgreSQL primary-key inventory differs for table ${table}.`);
  }
  return { includedColumns: included, redactedColumns: [...redacted], primaryKeyColumns: sourcePrimaryKey };
}

async function getPostgresTableInfo(repository, table) {
  const columns = await repository.all(`
    SELECT column_name, data_type, is_nullable, column_default, is_identity, is_generated
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ?
    ORDER BY ordinal_position
  `, [table]);
  const primaryKeyColumns = await repository.all(`
    SELECT key_column.column_name
    FROM information_schema.table_constraints AS constraint_record
    JOIN information_schema.key_column_usage AS key_column
      ON key_column.constraint_catalog = constraint_record.constraint_catalog
      AND key_column.constraint_schema = constraint_record.constraint_schema
      AND key_column.constraint_name = constraint_record.constraint_name
    WHERE constraint_record.table_schema = 'public'
      AND constraint_record.table_name = ?
      AND constraint_record.constraint_type = 'PRIMARY KEY'
    ORDER BY key_column.ordinal_position
  `, [table]);
  return {
    columns: columns.map((column) => ({
      name: String(column.column_name),
      dataType: String(column.data_type),
      isNullable: String(column.is_nullable) === 'YES',
      defaultValue: column.column_default,
      isIdentity: String(column.is_identity) === 'YES',
      isGenerated: String(column.is_generated) !== 'NEVER',
    })),
    primaryKeyColumns: primaryKeyColumns.map((column) => String(column.column_name)),
  };
}

async function assertTargetReady(repository, sourceSha256) {
  const schemaDefinition = POSTGRES_SCHEMA_MIGRATIONS[0];
  const schemaVersion = schemaDefinition.version;
  const expectedChecksum = postgresMigrationChecksum(schemaDefinition);
  const migration = await repository.get(
    'SELECT version, checksum FROM easyshop_schema_migrations WHERE version = ?',
    [schemaVersion],
  );
  if (!migration || migration.checksum !== expectedChecksum) {
    throw new Error('PostgreSQL target is missing the expected EasyShop schema migration or its checksum does not match.');
  }
  const server = await repository.get(`SELECT current_setting('server_version_num')::integer AS version_num`);
  if (!Number.isInteger(server?.version_num) || server.version_num < 120000) {
    throw new Error('PostgreSQL target must be version 12 or newer.');
  }
  for (const backfill of POSTGRES_DATA_BACKFILLS) {
    const applied = await repository.get(
      'SELECT checksum FROM easyshop_schema_migrations WHERE version = ?',
      [backfill.version],
    );
    if (applied && applied.checksum !== postgresMigrationChecksum(backfill)) {
      throw new Error(`PostgreSQL data-backfill checksum mismatch for ${backfill.version}.`);
    }
  }

  const tableRows = await repository.all(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const targetTables = new Set(tableRows.map((row) => String(row.table_name)));
  const allowedInternal = new Set(['easyshop_schema_migrations', IMPORT_RUNS_TABLE, IMPORT_PROGRESS_TABLE]);
  const unexpected = [...targetTables].filter((table) => !POSTGRES_SCHEMA_TABLE_NAMES.includes(table) && !allowedInternal.has(table));
  const missing = POSTGRES_SCHEMA_TABLE_NAMES.filter((table) => !targetTables.has(table));
  if (unexpected.length || missing.length) throw new Error('PostgreSQL target table inventory does not match the 95-table application schema.');

  const internalPresent = [IMPORT_RUNS_TABLE, IMPORT_PROGRESS_TABLE].filter((table) => targetTables.has(table));
  if (internalPresent.length === 1) throw new Error('PostgreSQL import progress ledger is incomplete.');
  const priorRuns = internalPresent.length
    ? await repository.all(`SELECT source_sha256, schema_version, status FROM ${IMPORT_RUNS_TABLE}`)
    : [];
  if (priorRuns.some((run) => run.source_sha256 !== sourceSha256)) {
    throw new Error('PostgreSQL target already contains an import run for a different snapshot.');
  }
  if (!priorRuns.length) {
    for (const table of POSTGRES_SCHEMA_TABLE_NAMES) {
      const count = await repository.get(`SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(table)}`);
      if (Number(count?.count || 0) !== 0) {
        throw new Error('PostgreSQL target is not empty; refusing to merge a snapshot into existing application data.');
      }
    }
  } else if (priorRuns.some((run) => run.schema_version !== schemaVersion)) {
    throw new Error('PostgreSQL import ledger was created for a different schema version.');
  }
}

async function ensureProgressTables(repository) {
  await repository.run(`CREATE TABLE IF NOT EXISTS ${IMPORT_RUNS_TABLE} (
    source_sha256 CHAR(64) PRIMARY KEY,
    import_slot SMALLINT NOT NULL UNIQUE CHECK (import_slot = 1),
    schema_version TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`);
  await repository.run(`CREATE TABLE IF NOT EXISTS ${IMPORT_PROGRESS_TABLE} (
    source_sha256 CHAR(64) NOT NULL REFERENCES ${IMPORT_RUNS_TABLE}(source_sha256) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    last_rowid BIGINT NOT NULL DEFAULT 0,
    rows_copied BIGINT NOT NULL DEFAULT 0,
    source_row_count BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_sha256, table_name)
  )`);
}

async function getProgress(repository, sourceSha256, tableName) {
  return repository.get(`SELECT last_rowid, rows_copied, source_row_count, status
    FROM ${IMPORT_PROGRESS_TABLE} WHERE source_sha256 = ? AND table_name = ?`, [sourceSha256, tableName]);
}

async function setProgress(transaction, sourceSha256, tableName, { lastRowid = MIN_SAFE_SQLITE_ROWID, rowsCopied = 0, sourceRows = 0, status = 'pending' }) {
  await transaction.run(`INSERT INTO ${IMPORT_PROGRESS_TABLE}
    (source_sha256, table_name, last_rowid, rows_copied, source_row_count, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
    ON CONFLICT (source_sha256, table_name) DO UPDATE SET
      last_rowid = EXCLUDED.last_rowid,
      rows_copied = EXCLUDED.rows_copied,
      source_row_count = EXCLUDED.source_row_count,
      status = EXCLUDED.status,
      updated_at = NOW()`, [sourceSha256, tableName, lastRowid, rowsCopied, sourceRows, status]);
}

function sourceRowSelect(table, columns, lastRowid, batchSize) {
  const columnList = columns.map(quoteIdentifier).join(', ');
  const sql = `SELECT rowid AS "__easyshop_source_rowid"${columnList ? `, ${columnList}` : ''}
    FROM ${quoteIdentifier(table)}
    WHERE rowid > ?
    ORDER BY rowid
    LIMIT ?`;
  return { sql, parameters: [lastRowid, batchSize] };
}

function buildInsertSql(table, columns, rowCount) {
  const quotedColumns = columns.map(quoteIdentifier).join(', ');
  const values = [];
  for (let row = 0; row < rowCount; row += 1) {
    values.push(`(${columns.map(() => '?').join(', ')})`);
  }
  return `INSERT INTO ${quoteIdentifier(table)} (${quotedColumns}) VALUES ${values.join(', ')}`;
}

function effectiveBatchSize(requestedBatchSize, columnCount) {
  const safeColumns = Math.max(1, columnCount);
  return Math.max(1, Math.min(requestedBatchSize, 500, Math.floor(MAX_BIND_PARAMETERS / safeColumns)));
}

async function markExcludedTable(repository, sourceSha256, table, rowCount, reason) {
  await setProgress(repository, sourceSha256, table, {
    lastRowid: 0,
    rowsCopied: 0,
    sourceRows: rowCount,
    status: `excluded:${reason}`,
  });
}

async function importTable({ database, repository, sourceSha256, table, sourceRows, sourceInfo, targetInfo, batchSize, selfReferences, afterBatch }) {
  const projection = buildTableProjection(table, sourceInfo, targetInfo);
  const columns = projection.includedColumns;
  if (!columns.length) throw new Error(`Import projection for ${table} has no columns.`);
  const progress = await getProgress(repository, sourceSha256, table);
  if (progress && Number(progress.source_row_count) !== sourceRows) {
    throw new Error(`Source row count changed since the previous import attempt for ${table}.`);
  }
  if (progress?.status === 'complete') return { table, rowsCopied: Number(progress.rows_copied), status: 'already_imported', ...projection };

  let lastRowid = progress ? Number(progress.last_rowid) : MIN_SAFE_SQLITE_ROWID;
  let rowsCopied = progress ? Number(progress.rows_copied) : 0;
  const pageSize = effectiveBatchSize(batchSize, columns.length);
  await setProgress(repository, sourceSha256, table, {
    lastRowid,
    rowsCopied,
    sourceRows,
    status: 'in_progress',
  });

  while (true) {
    const page = sourceRowSelect(table, columns, lastRowid, pageSize);
    const rows = database.prepare(page.sql).all(...page.parameters);
    if (!rows.length) break;
    const stagedRows = rows.map((row) => projectSourceRow(table, row, columns, { deferSelfReferences: true, selfReferences }));
    const insertSql = buildInsertSql(table, columns, stagedRows.length);
    const values = stagedRows.flatMap((row) => columns.map((column) => row[column]));
    const nextRowid = toSafeRowid(rows.at(-1).__easyshop_source_rowid);
    await repository.transaction(async (transaction) => {
      const result = await transaction.run(insertSql, values);
      if (result.changes !== rows.length) throw new Error(`PostgreSQL copied an unexpected row count for ${table}.`);
      await setProgress(transaction, sourceSha256, table, {
        lastRowid: nextRowid,
        rowsCopied: rowsCopied + rows.length,
        sourceRows,
        status: 'in_progress',
      });
    });
    lastRowid = nextRowid;
    rowsCopied += rows.length;
    await afterBatch?.({ table, lastRowid, rowsCopied });
  }

  if (rowsCopied !== sourceRows) throw new Error(`PostgreSQL import row count does not match the SQLite snapshot for ${table}.`);
  await setProgress(repository, sourceSha256, table, {
    lastRowid,
    rowsCopied,
    sourceRows,
    status: 'complete',
  });
  return { table, rowsCopied, status: 'imported', ...projection };
}

async function restoreSelfReferences({ database, repository, sourceSha256, table, sourceRows, primaryKeyColumns, references, batchSize, afterBatch }) {
  for (const reference of references) {
    const progressName = `__selfref__${table}__${reference.from}`;
    const progress = await getProgress(repository, sourceSha256, progressName);
    if (progress?.status === 'complete') continue;
    let lastRowid = progress ? Number(progress.last_rowid) : MIN_SAFE_SQLITE_ROWID;
    let restored = progress ? Number(progress.rows_copied) : 0;
    const pageSize = effectiveBatchSize(batchSize, primaryKeyColumns.length + 1);
    await setProgress(repository, sourceSha256, progressName, {
      lastRowid,
      rowsCopied: restored,
      sourceRows,
      status: 'in_progress',
    });

    while (true) {
      const selected = [...new Set(['rowid', ...primaryKeyColumns, reference.from])].map(quoteIdentifier).join(', ');
      const rows = database.prepare(`SELECT ${selected} FROM ${quoteIdentifier(table)}
        WHERE rowid > ? AND ${quoteIdentifier(reference.from)} IS NOT NULL
        ORDER BY rowid LIMIT ?`).all(lastRowid, pageSize);
      if (!rows.length) break;
      await repository.transaction(async (transaction) => {
        for (const row of rows) {
          const where = primaryKeyColumns.map((column) => `${quoteIdentifier(column)} = ?`).join(' AND ');
          const result = await transaction.run(`UPDATE ${quoteIdentifier(table)}
            SET ${quoteIdentifier(reference.from)} = ? WHERE ${where}`,
          [row[reference.from], ...primaryKeyColumns.map((column) => row[column])]);
          if (result.changes !== 1) throw new Error(`Could not restore self-reference for ${table}.`);
        }
        const nextRowid = toSafeRowid(rows.at(-1).rowid);
        await setProgress(transaction, sourceSha256, progressName, {
          lastRowid: nextRowid,
          rowsCopied: restored + rows.length,
          sourceRows,
          status: 'in_progress',
        });
      });
      lastRowid = toSafeRowid(rows.at(-1).rowid);
      restored += rows.length;
      await afterBatch?.({ table, phase: 'self_reference', column: reference.from, lastRowid, rowsCopied: restored });
    }
    await setProgress(repository, sourceSha256, progressName, {
      lastRowid,
      rowsCopied: restored,
      sourceRows,
      status: 'complete',
    });
  }
}

async function sourceDigest(database, table, columns, typesByName, transforms, batchSize) {
  const digest = createMultisetDigest(columns, typesByName);
  let lastRowid = MIN_SAFE_SQLITE_ROWID;
  while (true) {
    const page = sourceRowSelect(table, columns, lastRowid, batchSize);
    const rows = database.prepare(page.sql).all(...page.parameters);
    if (!rows.length) break;
    for (const row of rows) {
      const projected = projectSourceRow(table, row, columns);
      for (const [column, transformed] of Object.entries(transforms || {})) {
        if (columns.includes(column)) projected[column] = transformed;
      }
      digest.add(projected);
    }
    lastRowid = toSafeRowid(rows.at(-1).__easyshop_source_rowid);
  }
  return digest.result();
}

function keysetPredicate(primaryKeyColumns, lastKey) {
  if (!lastKey) return { sql: '', parameters: [] };
  if (primaryKeyColumns.length === 1) return { sql: `${quoteIdentifier(primaryKeyColumns[0])} > ?`, parameters: [lastKey[0]] };
  return {
    sql: `(${primaryKeyColumns.map(quoteIdentifier).join(', ')}) > (${primaryKeyColumns.map(() => '?').join(', ')})`,
    parameters: lastKey,
  };
}

async function postgresDigest(repository, table, columns, primaryKeyColumns, typesByName, transforms, batchSize) {
  const digest = createMultisetDigest(columns, typesByName);
  const selected = columns.map(quoteIdentifier).join(', ');
  let lastKey = null;
  while (true) {
    const predicate = keysetPredicate(primaryKeyColumns, lastKey);
    const rows = await repository.all(`SELECT ${selected} FROM ${quoteIdentifier(table)}
      ${predicate.sql ? `WHERE ${predicate.sql}` : ''}
      ORDER BY ${primaryKeyColumns.map(quoteIdentifier).join(', ')} LIMIT ?`,
    [...predicate.parameters, batchSize]);
    if (!rows.length) break;
    for (const sourceRow of rows) {
      const row = { ...sourceRow };
      for (const [column, transformed] of Object.entries(transforms || {})) {
        if (columns.includes(column)) row[column] = transformed;
      }
      digest.add(row);
    }
    lastKey = primaryKeyColumns.map((column) => rows.at(-1)[column]);
  }
  return digest.result();
}

function financialAggregateQuery(table) {
  const specification = FINANCIAL_RECONCILIATION_SPECS[table];
  const groups = specification.groupBy.map(quoteIdentifier);
  const sums = specification.sumColumns.map((column) => `COALESCE(SUM(${quoteIdentifier(column)}), 0) AS ${quoteIdentifier(`sum_${column}`)}`);
  return `SELECT ${groups.join(', ')}, COUNT(*) AS row_count, ${sums.join(', ')}
    FROM ${quoteIdentifier(table)}
    GROUP BY ${groups.join(', ')}
    ORDER BY ${groups.join(', ')}`;
}

function normalizeFinancialGroups(rows, table) {
  const specification = FINANCIAL_RECONCILIATION_SPECS[table];
  return rows.map((row) => ({
    group: Object.fromEntries(specification.groupBy.map((column) => [column, row[column] === null ? null : String(row[column])])),
    row_count: BigInt(String(row.row_count)).toString(),
    sums: Object.fromEntries(specification.sumColumns.map((column) => [
      column,
      BigInt(String(row[`sum_${column}`] ?? 0)).toString(),
    ])),
  }));
}

async function reconcileFinancialAggregates(database, repository, skippedTables) {
  const results = {};
  for (const table of Object.keys(FINANCIAL_RECONCILIATION_SPECS)) {
    if (skippedTables[table]) {
      results[table] = { status: 'excluded', reason: skippedTables[table] };
      continue;
    }
    const sql = financialAggregateQuery(table);
    const source = normalizeFinancialGroups(database.prepare(sql).all(), table);
    const destination = normalizeFinancialGroups(await repository.all(sql), table);
    if (JSON.stringify(source) !== JSON.stringify(destination)) {
      throw new Error(`Financial aggregate reconciliation mismatch for ${table}.`);
    }
    results[table] = { status: 'matched', groups: source };
  }
  return results;
}

async function reconcileImport({ database, repository, metadata, batchSize }) {
  const tables = [];
  for (const table of POSTGRES_SCHEMA_TABLE_NAMES) {
    const sourceRows = Number(metadata.tableCounts[table] || 0);
    const skipReason = metadata.skippedTables[table];
    const destinationCount = await repository.get(`SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(table)}`);
    const targetRows = Number(destinationCount?.count || 0);
    if (skipReason) {
      if (targetRows !== 0) throw new Error(`Excluded table ${table} is not empty in the PostgreSQL target.`);
      tables.push({ table, status: 'excluded', reason: skipReason, source_rows: sourceRows, destination_rows: 0 });
      continue;
    }
    if (targetRows !== sourceRows) throw new Error(`Reconciliation row count mismatch for ${table}.`);
    if (sourceRows === 0) {
      tables.push({ table, status: 'matched', source_rows: 0, destination_rows: 0 });
      continue;
    }
    const targetInfo = await getPostgresTableInfo(repository, table);
    const projection = buildTableProjection(table, metadata.columns.get(table), targetInfo);
    const typesByName = new Map(targetInfo.columns.map((column) => [column.name, column.dataType]));
    const transforms = STAGING_PASSWORD_TRANSFORMS[table] || {};
    const source = await sourceDigest(database, table, projection.includedColumns, typesByName, transforms, batchSize);
    const destination = await postgresDigest(repository, table, projection.includedColumns, projection.primaryKeyColumns, typesByName, transforms, batchSize);
    if (source.count !== destination.count || source.sum_sha256 !== destination.sum_sha256 || source.xor_sha256 !== destination.xor_sha256) {
      throw new Error(`Reconciliation digest mismatch for ${table}.`);
    }
    tables.push({ table, status: 'matched', source_rows: source.count, destination_rows: destination.count });
  }
  const financialReconciliation = await reconcileFinancialAggregates(database, repository, metadata.skippedTables);
  return {
    status: 'matched',
    tables,
    imported_table_count: tables.filter((table) => table.status === 'matched' && table.source_rows > 0).length,
    excluded_table_count: tables.filter((table) => table.status === 'excluded').length,
    rows_verified: tables.reduce((sum, table) => sum + table.destination_rows, 0),
    financial_reconciliation: financialReconciliation,
  };
}

export async function applySqliteSnapshotImport({
  database,
  snapshotSha256,
  repository,
  snapshotPath,
  batchSize = 250,
  afterBatch,
} = {}) {
  if (!database || !snapshotSha256 || !/^[a-f0-9]{64}$/.test(snapshotSha256)) {
    throw new TypeError('A read-only SQLite snapshot and its SHA-256 are required.');
  }
  if (!repository || typeof repository.transaction !== 'function') throw new TypeError('A PostgreSQL repository is required.');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new TypeError('Batch size must be between 1 and 500.');
  if (snapshotPath && await sha256File(snapshotPath) !== snapshotSha256) {
    throw new Error('SQLite snapshot fingerprint changed before import; refusing to continue.');
  }

  const metadata = inspectSqliteSnapshot(database);
  const schemaVersion = POSTGRES_SCHEMA_MIGRATIONS[0].version;
  await assertTargetReady(repository, snapshotSha256);
  await ensureProgressTables(repository);
  await repository.run(`INSERT INTO ${IMPORT_RUNS_TABLE} (source_sha256, import_slot, schema_version, status)
    VALUES (?, 1, ?, 'in_progress') ON CONFLICT (source_sha256) DO UPDATE SET status = 'in_progress'`,
  [snapshotSha256, schemaVersion]);

  const reports = [];
  const targetInfoByTable = new Map();
  for (const table of POSTGRES_SCHEMA_TABLE_NAMES) {
    if (metadata.skippedTables[table] || metadata.tableCounts[table] === 0) continue;
    targetInfoByTable.set(table, await getPostgresTableInfo(repository, table));
  }

  for (const table of POSTGRES_SCHEMA_TABLE_NAMES) {
    if (metadata.skippedTables[table]) {
      await markExcludedTable(repository, snapshotSha256, table, metadata.tableCounts[table] || 0, metadata.skippedTables[table]);
      reports.push({ table, status: 'excluded', reason: metadata.skippedTables[table], sourceRows: metadata.tableCounts[table] || 0 });
    }
  }

  for (const table of metadata.importOrder) {
    const sourceRows = metadata.tableCounts[table] || 0;
    if (sourceRows === 0) {
      await setProgress(repository, snapshotSha256, table, { lastRowid: 0, rowsCopied: 0, sourceRows: 0, status: 'complete' });
      continue;
    }
    const result = await importTable({
      database,
      repository,
      sourceSha256: snapshotSha256,
      table,
      sourceRows,
      sourceInfo: metadata.columns.get(table),
      targetInfo: targetInfoByTable.get(table),
      batchSize,
      selfReferences: metadata.selfReferences.get(table) || [],
      afterBatch,
    });
    reports.push(result);
  }

  for (const [table, references] of metadata.selfReferences) {
    if (!metadata.importOrder.includes(table) || !(metadata.tableCounts[table] > 0)) continue;
    const projection = buildTableProjection(table, metadata.columns.get(table), targetInfoByTable.get(table));
    await restoreSelfReferences({
      database,
      repository,
      sourceSha256: snapshotSha256,
      table,
      sourceRows: metadata.tableCounts[table],
      primaryKeyColumns: projection.primaryKeyColumns,
      references,
      batchSize,
      afterBatch,
    });
  }

  if (snapshotPath && await sha256File(snapshotPath) !== snapshotSha256) {
    throw new Error('SQLite snapshot fingerprint changed during import; reconciliation completion was withheld.');
  }

  const backfills = await runPostgresMigrations(repository, POSTGRES_DATA_BACKFILLS);
  const reconciliation = await reconcileImport({ database, repository, metadata, batchSize });
  if (snapshotPath && await sha256File(snapshotPath) !== snapshotSha256) {
    throw new Error('SQLite snapshot fingerprint changed during reconciliation; import remains resumable but incomplete.');
  }
  await repository.run(`UPDATE ${IMPORT_RUNS_TABLE} SET status = 'complete', completed_at = NOW()
    WHERE source_sha256 = ?`, [snapshotSha256]);
  return {
    status: 'imported_and_reconciled',
    source_sha256: snapshotSha256,
    application_table_count: POSTGRES_SCHEMA_TABLE_NAMES.length,
    table_results: reports,
    post_import_backfills: backfills,
    reconciliation,
    application_cutover_performed: false,
  };
}

export async function planSqliteSnapshotImport({ database, snapshotSha256, snapshotSizeBytes } = {}) {
  if (!database) {
    return {
      mode: 'plan_only',
      expectedTableCount: POSTGRES_SCHEMA_TABLE_NAMES.length,
      requiredStagingConfirmations: ['--confirm-staging', '--confirm-sanitized-snapshot'],
      networkConnectionAttempted: false,
    };
  }
  const metadata = inspectSqliteSnapshot(database);
  return {
    mode: 'snapshot_plan_only',
    expectedTableCount: POSTGRES_SCHEMA_TABLE_NAMES.length,
    sourceTableCount: metadata.sourceTables.filter((table) => POSTGRES_SCHEMA_TABLE_NAMES.includes(table)).length,
    sourceRows: metadata.totalSourceRows,
    snapshotSizeBytes,
    snapshotSha256,
    importOrder: metadata.importOrder,
    sourceRowCounts: metadata.tableCounts,
    excludedTables: metadata.skippedTables,
    redactedColumns: metadata.redactedColumns,
    derivedColumns: metadata.derivedColumns,
    requiredStagingConfirmations: ['--confirm-staging', '--confirm-sanitized-snapshot'],
    networkConnectionAttempted: false,
  };
}
