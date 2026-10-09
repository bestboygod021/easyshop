import crypto from 'node:crypto';

const LEGACY_BASELINE_VERSION = '0000_legacy_schema_baseline';

const MIGRATIONS = [
  {
    version: '20261009_01_payment_callback_idempotency',
    definition: 'payment_callback_events.callback_key+delivery tracking',
    up(db) {
      const columns = db.prepare('PRAGMA table_info(payment_callback_events)').all();
      const names = new Set(columns.map((column) => column.name));
      if (!names.has('callback_key')) db.exec('ALTER TABLE payment_callback_events ADD COLUMN callback_key TEXT');
      if (!names.has('deliveries')) db.exec('ALTER TABLE payment_callback_events ADD COLUMN deliveries INTEGER NOT NULL DEFAULT 1');
      if (!names.has('last_seen_at')) db.exec('ALTER TABLE payment_callback_events ADD COLUMN last_seen_at TEXT');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_callback_key ON payment_callback_events(callback_key)');
    },
  },
  {
    version: '20261009_02_audit_log_chain_and_privacy_requests',
    definition: 'audit_logs hash-chain columns and privacy request workflow',
    up(db) {
      const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
      if (tables.has('audit_logs')) {
        const columns = new Set(db.prepare('PRAGMA table_info(audit_logs)').all().map((column) => column.name));
        if (!columns.has('chain_seq')) db.exec('ALTER TABLE audit_logs ADD COLUMN chain_seq INTEGER');
        if (!columns.has('previous_hash')) db.exec('ALTER TABLE audit_logs ADD COLUMN previous_hash TEXT');
        if (!columns.has('entry_hash')) db.exec('ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT');
        if (!columns.has('key_version')) db.exec('ALTER TABLE audit_logs ADD COLUMN key_version TEXT');
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_chain_seq ON audit_logs(chain_seq) WHERE chain_seq IS NOT NULL');
      }
      db.exec(`CREATE TABLE IF NOT EXISTS privacy_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        request_type TEXT NOT NULL CHECK (request_type IN ('access','erasure')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','fulfilled')),
        requested_at TEXT NOT NULL,
        reviewed_at TEXT,
        reviewed_by TEXT,
        review_notes TEXT
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_requests(status, requested_at DESC)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_privacy_requests_user ON privacy_requests(user_id, requested_at DESC)');
    },
  },
];

function checksum(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function appliedMigration(db, version) {
  return db.prepare('SELECT version, checksum FROM schema_migrations WHERE version = ?').get(version) || null;
}

/**
 * Versioned, transactional SQLite migrations. The legacy idempotent schema
 * initializer runs first; this ledger records that baseline and versions all
 * subsequent data/schema changes.
 */
export function runVersionedMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const baselineChecksum = checksum('easyshop:legacy-schema-baseline:v1');
  const baseline = appliedMigration(db, LEGACY_BASELINE_VERSION);
  if (baseline && baseline.checksum !== baselineChecksum) {
    throw new Error(`Checksum mismatch for database migration ${LEGACY_BASELINE_VERSION}.`);
  }
  if (!baseline) {
    db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)')
      .run(LEGACY_BASELINE_VERSION, baselineChecksum, new Date().toISOString());
  }

  for (const migration of MIGRATIONS) {
    const migrationChecksum = checksum(`${migration.version}:${migration.definition}:${migration.up.toString()}`);
    const existing = appliedMigration(db, migration.version);
    if (existing) {
      if (existing.checksum !== migrationChecksum) {
        throw new Error(`Checksum mismatch for database migration ${migration.version}.`);
      }
      continue;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migrationChecksum, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* preserve the original migration error */ }
      throw error;
    }
  }

  return db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version').all();
}
