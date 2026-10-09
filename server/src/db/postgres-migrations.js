import crypto from 'node:crypto';

const ADVISORY_LOCK_ID = 724009281402;

function validateMigrations(migrations) {
  if (!Array.isArray(migrations)) throw new TypeError('PostgreSQL migrations must be an array.');
  const seen = new Set();
  for (const migration of migrations) {
    if (!migration || !/^[A-Za-z0-9._-]{1,120}$/.test(migration.version || '')) {
      throw new TypeError('Every PostgreSQL migration needs a safe version identifier.');
    }
    if (typeof migration.sql !== 'string' || !migration.sql.trim()) {
      throw new TypeError(`PostgreSQL migration ${migration.version} needs a non-empty SQL script.`);
    }
    if (seen.has(migration.version)) throw new TypeError(`Duplicate PostgreSQL migration ${migration.version}.`);
    seen.add(migration.version);
  }
  return migrations;
}

function checksum(migration) {
  return crypto.createHash('sha256')
    .update(`${migration.version}\0${migration.sql.trim()}`)
    .digest('hex');
}

/**
 * Apply immutable PostgreSQL SQL migrations under a transaction-scoped
 * advisory lock. The runner is intentionally schema-agnostic until the full
 * SQLite-to-PostgreSQL schema and data-backfill plan are approved.
 */
export async function runPostgresMigrations(repository, definitions) {
  if (!repository || typeof repository.transaction !== 'function') {
    throw new TypeError('A PostgreSQL repository with transaction support is required.');
  }
  const migrations = validateMigrations(definitions);

  return repository.transaction(async (transaction) => {
    await transaction.run('SELECT pg_advisory_xact_lock(?)', [ADVISORY_LOCK_ID]);
    await transaction.run(`CREATE TABLE IF NOT EXISTS easyshop_schema_migrations (
      version TEXT PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const appliedRows = await transaction.all(
      'SELECT version, checksum FROM easyshop_schema_migrations ORDER BY version',
    );
    const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]));
    const result = [];

    for (const migration of migrations) {
      const migrationChecksum = checksum(migration);
      const existingChecksum = applied.get(migration.version);
      if (existingChecksum) {
        if (existingChecksum !== migrationChecksum) {
          throw new Error(`Checksum mismatch for PostgreSQL migration ${migration.version}.`);
        }
        result.push({ version: migration.version, status: 'already_applied' });
        continue;
      }

      await transaction.run(migration.sql);
      await transaction.run(
        'INSERT INTO easyshop_schema_migrations (version, checksum, applied_at) VALUES (?, ?, NOW())',
        [migration.version, migrationChecksum],
      );
      result.push({ version: migration.version, status: 'applied' });
    }

    return result;
  });
}
