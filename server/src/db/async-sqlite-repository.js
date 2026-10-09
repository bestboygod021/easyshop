import { AsyncLocalStorage } from 'node:async_hooks';

function parametersArray(parameters) {
  if (!Array.isArray(parameters)) {
    throw new TypeError('Repository query parameters must be an array.');
  }
  return parameters;
}

function plainRow(row) {
  return row === null || row === undefined ? null : Object.fromEntries(Object.entries(row));
}

class AsyncMutex {
  #tail = Promise.resolve();

  runExclusive(operation) {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

/**
 * Promise-shaped compatibility adapter around the existing synchronous
 * node:sqlite connection. Queries still execute synchronously on the event
 * loop; the mutex serializes only calls made through this adapter. Do not
 * mix its transactions with direct legacy helpers on the same connection.
 */
export class AsyncSqliteRepository {
  #database;
  #mutex = new AsyncMutex();
  #transactionContext = new AsyncLocalStorage();
  #nestedTail = Promise.resolve();
  #savepointCounter = 0;

  constructor(database) {
    if (!database || typeof database.prepare !== 'function' || typeof database.exec !== 'function') {
      throw new TypeError('AsyncSqliteRepository requires a DatabaseSync-compatible connection.');
    }
    this.#database = database;
  }

  async all(sql, parameters = []) {
    return this.#execute(() => this.#database.prepare(sql).all(...parametersArray(parameters)).map(plainRow));
  }

  async get(sql, parameters = []) {
    return this.#execute(() => plainRow(this.#database.prepare(sql).get(...parametersArray(parameters))));
  }

  async run(sql, parameters = []) {
    return this.#execute(() => this.#database.prepare(sql).run(...parametersArray(parameters)));
  }

  async transaction(callback) {
    if (typeof callback !== 'function') throw new TypeError('Transaction callback is required.');
    if (this.#transactionContext.getStore() === this) return this.#nestedTransaction(callback);

    return this.#mutex.runExclusive(async () => {
      this.#database.exec('BEGIN IMMEDIATE');
      try {
        const result = await this.#transactionContext.run(this, () => callback(this));
        this.#database.exec('COMMIT');
        return result;
      } catch (error) {
        try { this.#database.exec('ROLLBACK'); } catch { /* preserve the original failure */ }
        throw error;
      }
    });
  }

  #execute(operation) {
    if (this.#transactionContext.getStore() === this) return operation();
    return this.#mutex.runExclusive(operation);
  }

  #nestedTransaction(callback) {
    const operation = this.#nestedTail.then(async () => {
      const savepoint = `easyshop_sp_${++this.#savepointCounter}`;
      this.#database.exec(`SAVEPOINT ${savepoint}`);
      try {
        const result = await callback(this);
        this.#database.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        try { this.#database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch { /* preserve original failure */ }
        try { this.#database.exec(`RELEASE SAVEPOINT ${savepoint}`); } catch { /* preserve original failure */ }
        throw error;
      }
    });
    this.#nestedTail = operation.then(() => undefined, () => undefined);
    return operation;
  }
}
