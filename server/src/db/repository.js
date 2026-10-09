import { defaultSecretManager } from '../services/secret-manager.js';
import { AsyncSqliteRepository } from './async-sqlite-repository.js';
import { PostgresRepository } from './postgres-repository.js';
import { runPostgresMigrations } from './postgres-migrations.js';
import { POSTGRES_DATA_BACKFILLS, POSTGRES_SCHEMA_MIGRATIONS } from './postgres-schema.js';

/**
 * Create the optional asynchronous repository used by migrated domain modules.
 * The application-wide synchronous SQLite helpers remain the default until
 * each domain has been moved and verified behind this boundary.
 */
export function initializePostgresApplicationSchema(repository) {
  return runPostgresMigrations(repository, POSTGRES_SCHEMA_MIGRATIONS);
}

/** Apply only after a verified SQLite snapshot has been imported into PostgreSQL. */
export function runPostgresPostImportBackfills(repository) {
  return runPostgresMigrations(repository, POSTGRES_DATA_BACKFILLS);
}

export function createAsyncRepository({
  driver = process.env.DATABASE_DRIVER || 'sqlite',
  sqliteDatabase,
  connectionString,
  secretManager = defaultSecretManager,
  pool,
  poolOptions,
  requireTls = process.env.NODE_ENV === 'production' || process.env.DATABASE_REQUIRE_TLS !== 'false',
} = {}) {
  const selectedDriver = String(driver).toLowerCase();
  if (selectedDriver === 'sqlite') {
    if (!sqliteDatabase) throw new Error('A SQLite DatabaseSync connection is required for the compatibility repository.');
    return new AsyncSqliteRepository(sqliteDatabase);
  }
  if (selectedDriver === 'postgres' || selectedDriver === 'postgresql') {
    if (process.env.NODE_ENV === 'production' && !requireTls) {
      throw new Error('PostgreSQL TLS cannot be disabled in production.');
    }
    const databaseUrl = connectionString || secretManager.getSecret('DATABASE_URL');
    if (!databaseUrl) throw new Error('DATABASE_URL must be mounted in the secret store for the PostgreSQL repository.');
    return new PostgresRepository({
      connectionString: databaseUrl,
      pool,
      poolOptions,
      requireTls,
    });
  }
  throw new Error('DATABASE_DRIVER must be sqlite or postgres.');
}
