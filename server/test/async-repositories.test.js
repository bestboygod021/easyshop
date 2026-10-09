import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncSqliteRepository } from '../src/db/async-sqlite-repository.js';
import { PostgresRepository, convertQuestionPlaceholders } from '../src/db/postgres-repository.js';
import { runPostgresMigrations } from '../src/db/postgres-migrations.js';

const sqliteConnections = new Set();

afterEach(() => {
  for (const connection of sqliteConnections) connection.close();
  sqliteConnections.clear();
});

function sqliteRepository() {
  const connection = new DatabaseSync(':memory:');
  sqliteConnections.add(connection);
  return new AsyncSqliteRepository(connection);
}

class RecordingPgClient {
  calls = [];
  released = false;

  async query(sql, parameters) {
    this.calls.push({ sql, parameters, argumentCount: arguments.length });
    if (sql.startsWith('SELECT')) {
      return { rows: [{ id: parameters?.[0] ?? 7, name: 'sample' }], rowCount: 1 };
    }
    return { rows: [], rowCount: sql.startsWith('UPDATE') ? 2 : 1 };
  }

  release() {
    this.released = true;
  }
}

class RecordingPgPool {
  client = new RecordingPgClient();

  query(sql, parameters) {
    return this.client.query(sql, parameters);
  }

  async connect() {
    return this.client;
  }
}

class MemoryMigrationRepository {
  applied = new Map();
  calls = [];

  async transaction(callback) {
    const previous = new Map(this.applied);
    const transaction = {
      run: async (sql, parameters = []) => {
        this.calls.push({ sql, parameters });
        if (sql.startsWith('INSERT INTO easyshop_schema_migrations')) {
          this.applied.set(parameters[0], parameters[1]);
        }
        if (sql.includes('FAIL_MIGRATION')) throw new Error('simulated migration failure');
        return { changes: 1, rows: [] };
      },
      all: async () => [...this.applied].map(([version, checksum]) => ({ version, checksum })),
    };
    try {
      return await callback(transaction);
    } catch (error) {
      this.applied = previous;
      throw error;
    }
  }
}

describe('staged async database repository contract', () => {
  it('SQLite compatibility adapter exposes async all/get/run with a stable result shape', async () => {
    const repository = sqliteRepository();
    await repository.run('CREATE TABLE records (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    const inserted = await repository.run('INSERT INTO records (name) VALUES (?)', ['alpha']);

    assert.equal(inserted.changes, 1);
    assert.equal(await repository.get('SELECT name FROM records WHERE id = ?', [1]).then((row) => row.name), 'alpha');
    assert.deepEqual(await repository.all('SELECT id, name FROM records ORDER BY id'), [{ id: 1, name: 'alpha' }]);
  });

  it('SQLite adapter rolls back awaited work and isolates nested savepoint failures', async () => {
    const repository = sqliteRepository();
    await repository.run('CREATE TABLE records (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');

    await assert.rejects(repository.transaction(async (transaction) => {
      await transaction.run('INSERT INTO records (name) VALUES (?)', ['outer-rollback']);
      await Promise.resolve();
      throw new Error('rollback requested');
    }), /rollback requested/);
    assert.equal((await repository.get('SELECT COUNT(*) AS count FROM records')).count, 0);

    await repository.transaction(async (transaction) => {
      await transaction.run('INSERT INTO records (name) VALUES (?)', ['kept']);
      await assert.rejects(transaction.transaction(async (nested) => {
        await nested.run('INSERT INTO records (name) VALUES (?)', ['discarded']);
        throw new Error('savepoint rollback');
      }), /savepoint rollback/);
      await transaction.run('INSERT INTO records (name) VALUES (?)', ['also-kept']);
    });
    assert.deepEqual(
      (await repository.all('SELECT name FROM records ORDER BY id')).map((row) => row.name),
      ['kept', 'also-kept'],
    );
  });

  it('serializes non-transactional SQLite queries behind an awaited transaction', async () => {
    const repository = sqliteRepository();
    await repository.run('CREATE TABLE records (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    let markStarted;
    let resumeTransaction;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const hold = new Promise((resolve) => { resumeTransaction = resolve; });
    const transaction = repository.transaction(async (scoped) => {
      await scoped.run('INSERT INTO records (name) VALUES (?)', ['first']);
      markStarted();
      await hold;
      await scoped.run('INSERT INTO records (name) VALUES (?)', ['second']);
    });

    await started;
    let outsideQueryFinished = false;
    const outsideQuery = repository.run('INSERT INTO records (name) VALUES (?)', ['outside'])
      .then(() => { outsideQueryFinished = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(outsideQueryFinished, false);

    resumeTransaction();
    await transaction;
    await outsideQuery;
    assert.deepEqual(
      (await repository.all('SELECT name FROM records ORDER BY id')).map((row) => row.name),
      ['first', 'second', 'outside'],
    );
  });

  it('PostgreSQL placeholder conversion ignores literals, quoted identifiers, and comments', () => {
    const converted = convertQuestionPlaceholders(
      `SELECT '?' AS literal, "?" AS quoted_identifier, ? AS id -- ? ignored\n/* ? ignored */ AND body = $tag$?$tag$`,
    );
    assert.equal(converted.count, 1);
    assert.equal(converted.sql, `SELECT '?' AS literal, "?" AS quoted_identifier, $1 AS id -- ? ignored\n/* ? ignored */ AND body = $tag$?$tag$`);
  });

  it('PostgreSQL adapter returns the same all/get/run shapes and binds positional values', async () => {
    const pool = new RecordingPgPool();
    const repository = new PostgresRepository({ pool });

    assert.deepEqual(await repository.get('SELECT id, name FROM records WHERE id = ?', [42]), { id: 42, name: 'sample' });
    assert.deepEqual(await repository.all('SELECT id, name FROM records WHERE id = ?', [43]), [{ id: 43, name: 'sample' }]);
    assert.equal((await repository.run('UPDATE records SET name = ? WHERE id = ?', ['changed', 44])).changes, 2);
    assert.deepEqual(pool.client.calls.map((call) => call.sql), [
      'SELECT id, name FROM records WHERE id = $1',
      'SELECT id, name FROM records WHERE id = $1',
      'UPDATE records SET name = $1 WHERE id = $2',
    ]);
    await assert.rejects(repository.get('SELECT id FROM records', [99]), /placeholder count/);
  });

  it('PostgreSQL no-parameter migrations use the simple query protocol', async () => {
    const pool = new RecordingPgPool();
    const repository = new PostgresRepository({ pool });
    const schema = 'CREATE TABLE one_probe (id TEXT PRIMARY KEY); CREATE TABLE two_probe (id TEXT PRIMARY KEY);';

    await repository.transaction((transaction) => transaction.run(schema));

    assert.equal(pool.client.calls[1].sql, schema);
    assert.equal(pool.client.calls[1].argumentCount, 1);
  });

  it('PostgreSQL adapter rolls back failed transactions and releases the client', async () => {
    const pool = new RecordingPgPool();
    const repository = new PostgresRepository({ pool });

    await assert.rejects(repository.transaction(async (transaction) => {
      await transaction.run('INSERT INTO records (name) VALUES (?)', ['not-committed']);
      throw new Error('transaction should roll back');
    }), /transaction should roll back/);

    assert.deepEqual(pool.client.calls.map((call) => call.sql), [
      'BEGIN',
      'INSERT INTO records (name) VALUES ($1)',
      'ROLLBACK',
    ]);
    assert.equal(pool.client.released, true);
  });

  it('PostgreSQL connections fail closed without TLS in secure mode', () => {
    assert.throws(
      () => new PostgresRepository({
        connectionString: 'postgresql://app:password@db.example.test/easyshop',
        PoolClass: RecordingPgPool,
        requireTls: true,
      }),
      /PostgreSQL TLS/,
    );
  });
});

describe('PostgreSQL versioned migration runner', () => {
  it('checksums and applies a migration once, then verifies the immutable checksum', async () => {
    const repository = new MemoryMigrationRepository();
    const migrations = [{ version: '0001_probe', sql: 'CREATE TABLE repository_probe (id TEXT PRIMARY KEY)' }];

    assert.deepEqual(await runPostgresMigrations(repository, migrations), [
      { version: '0001_probe', status: 'applied' },
    ]);
    assert.deepEqual(await runPostgresMigrations(repository, migrations), [
      { version: '0001_probe', status: 'already_applied' },
    ]);
    assert.equal(repository.calls.filter((call) => call.sql === migrations[0].sql).length, 1);
    await assert.rejects(
      runPostgresMigrations(repository, [{ ...migrations[0], sql: 'CREATE TABLE repository_probe (id BIGINT)' }]),
      /Checksum mismatch/,
    );
  });

  it('does not retain a migration ledger entry after migration failure', async () => {
    const repository = new MemoryMigrationRepository();
    await assert.rejects(
      runPostgresMigrations(repository, [{ version: '0001_failing', sql: 'FAIL_MIGRATION' }]),
      /simulated migration failure/,
    );
    assert.equal(repository.applied.size, 0);
  });
});
