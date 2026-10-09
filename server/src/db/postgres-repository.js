import { Pool } from 'pg';

const TLS_MODES = new Set(['require', 'verify-ca', 'verify-full']);

/** Convert SQLite-style positional markers outside SQL literals/comments. */
export function convertQuestionPlaceholders(sql) {
  if (typeof sql !== 'string') throw new TypeError('Repository SQL must be a string.');

  let result = '';
  let index = 0;
  let state = 'normal';
  let blockDepth = 0;
  let dollarDelimiter = '';

  for (let cursor = 0; cursor < sql.length; cursor += 1) {
    const char = sql[cursor];
    const next = sql[cursor + 1];

    if (state === 'single') {
      result += char;
      if (char === "'" && next === "'") {
        result += next;
        cursor += 1;
      } else if (char === "'") {
        state = 'normal';
      }
      continue;
    }

    if (state === 'double') {
      result += char;
      if (char === '"' && next === '"') {
        result += next;
        cursor += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'line-comment') {
      result += char;
      if (char === '\n') state = 'normal';
      continue;
    }

    if (state === 'block-comment') {
      result += char;
      if (char === '/' && next === '*') {
        result += next;
        cursor += 1;
        blockDepth += 1;
      } else if (char === '*' && next === '/') {
        result += next;
        cursor += 1;
        blockDepth -= 1;
        if (blockDepth === 0) state = 'normal';
      }
      continue;
    }

    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarDelimiter, cursor)) {
        result += dollarDelimiter;
        cursor += dollarDelimiter.length - 1;
        state = 'normal';
      } else {
        result += char;
      }
      continue;
    }

    if (char === "'") {
      result += char;
      state = 'single';
    } else if (char === '"') {
      result += char;
      state = 'double';
    } else if (char === '-' && next === '-') {
      result += '--';
      cursor += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      result += '/*';
      cursor += 1;
      state = 'block-comment';
      blockDepth = 1;
    } else if (char === '$') {
      const delimiter = sql.slice(cursor).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (delimiter) {
        result += delimiter;
        cursor += delimiter.length - 1;
        dollarDelimiter = delimiter;
        state = 'dollar-quote';
      } else {
        result += char;
      }
    } else if (char === '?' && next !== '|' && next !== '&' && next !== '?') {
      result += `$${++index}`;
    } else {
      result += char;
    }
  }

  return { sql: result, count: index };
}

function createPoolConfig(connectionString, poolOptions, requireTls) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('PostgreSQL connection configuration is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('PostgreSQL connection configuration must use the postgresql scheme.');
  }

  const sslMode = (parsed.searchParams.get('sslmode') || '').toLowerCase();
  if (requireTls && !TLS_MODES.has(sslMode)) {
    throw new Error('PostgreSQL TLS must use sslmode=require, verify-ca, or verify-full.');
  }

  const ssl = TLS_MODES.has(sslMode)
    ? { ...(poolOptions.ssl && typeof poolOptions.ssl === 'object' ? poolOptions.ssl : {}), rejectUnauthorized: sslMode !== 'require' }
    : undefined;

  return {
    connectionString,
    max: poolOptions.max ?? 10,
    idleTimeoutMillis: poolOptions.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: poolOptions.connectionTimeoutMillis ?? 5_000,
    ...(poolOptions.application_name ? { application_name: poolOptions.application_name } : {}),
    ...(ssl ? { ssl } : {}),
  };
}

function queryParts(sql, parameters) {
  if (!Array.isArray(parameters)) throw new TypeError('Repository query parameters must be an array.');
  const converted = convertQuestionPlaceholders(sql);
  if (converted.count !== parameters.length) {
    throw new TypeError('SQL placeholder count does not match the parameter count.');
  }
  return { sql: converted.sql, parameters };
}

async function execute(client, sql, parameters = []) {
  const prepared = queryParts(sql, parameters);
  // node-postgres uses the extended protocol whenever a values array is passed;
  // PostgreSQL rejects multi-statement schema migrations over that protocol.
  return prepared.parameters.length === 0
    ? client.query(prepared.sql)
    : client.query(prepared.sql, prepared.parameters);
}

function createTransactionRepository(client) {
  let savepointCounter = 0;
  let repository;
  repository = {
    async all(sql, parameters = []) {
      return (await execute(client, sql, parameters)).rows;
    },
    async get(sql, parameters = []) {
      return (await execute(client, sql, parameters)).rows[0] ?? null;
    },
    async run(sql, parameters = []) {
      const result = await execute(client, sql, parameters);
      const changes = Number(result.rowCount || 0);
      return { changes, lastInsertRowid: null, rows: result.rows || [] };
    },
    async transaction(callback) {
      if (typeof callback !== 'function') throw new TypeError('Transaction callback is required.');
      const savepoint = `easyshop_pg_sp_${++savepointCounter}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        const value = await callback(repository);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return value;
      } catch (error) {
        try { await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch { /* preserve the original failure */ }
        try { await client.query(`RELEASE SAVEPOINT ${savepoint}`); } catch { /* preserve the original failure */ }
        throw error;
      }
    },
  };
  return Object.freeze(repository);
}

/**
 * Async PostgreSQL repository for staged domain migrations. It deliberately
 * does not replace the application's existing synchronous SQLite helpers.
 */
export class PostgresRepository {
  #pool;
  #ownsPool;

  constructor({ connectionString, pool, poolOptions = {}, requireTls = true, PoolClass = Pool } = {}) {
    if (process.env.NODE_ENV === 'production' && !requireTls) {
      throw new Error('PostgreSQL TLS cannot be disabled in production.');
    }
    if (pool) {
      this.#pool = pool;
      this.#ownsPool = false;
      return;
    }
    if (!connectionString) throw new Error('DATABASE_URL is required for the PostgreSQL repository.');
    this.#pool = new PoolClass(createPoolConfig(connectionString, poolOptions, requireTls));
    this.#ownsPool = true;
  }

  async all(sql, parameters = []) {
    return (await execute(this.#pool, sql, parameters)).rows;
  }

  async get(sql, parameters = []) {
    return (await execute(this.#pool, sql, parameters)).rows[0] ?? null;
  }

  async run(sql, parameters = []) {
    const result = await execute(this.#pool, sql, parameters);
    const changes = Number(result.rowCount || 0);
    return { changes, lastInsertRowid: null, rows: result.rows || [] };
  }

  async transaction(callback) {
    if (typeof callback !== 'function') throw new TypeError('Transaction callback is required.');
    const client = await this.#pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      const value = await callback(createTransactionRepository(client));
      await client.query('COMMIT');
      transactionOpen = false;
      return value;
    } catch (error) {
      if (transactionOpen) {
        try { await client.query('ROLLBACK'); } catch { /* preserve the original failure */ }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.#ownsPool) await this.#pool.end();
  }
}
