import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

const SAFE_QUERY_NAME = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,119}$/;

function canonicalize(value, ancestors = new Set()) {
  if (value === null) return null;
  if (value === undefined) return { $type: 'undefined' };
  if (typeof value === 'bigint') return { $type: 'bigint', value: value.toString() };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $type: 'number', value: String(value) };
  if (value instanceof Date) return { $type: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $type: 'buffer', value: value.toString('base64') };
  if (typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new TypeError('Shadow-read result contains a circular value.');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, ancestors));
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key], ancestors)]));
  } finally {
    ancestors.delete(value);
  }
}

function resultDigest(value, normalize, key) {
  const normalized = normalize(value);
  return crypto.createHmac('sha256', key).update(JSON.stringify(canonicalize(normalized))).digest('hex');
}

function safeErrorCode(error) {
  const candidate = String(error?.code || error?.name || 'Error');
  return /^[A-Za-z0-9_.-]{1,40}$/.test(candidate) ? candidate : 'Error';
}

function countRows(value) {
  if (Array.isArray(value)) return value.length;
  return value === null || value === undefined ? 0 : 1;
}

/**
 * Compares explicitly paired read operations while always returning the
 * primary result. Shadow queries run in the background and failures are
 * reported as redacted hashes/codes only; no SQL, row contents, or errors are
 * emitted. This harness does not create or configure either repository.
 */
export class ShadowReadHarness {
  #primary;
  #shadow;
  #enabled;
  #onComparison;
  #hashKey = crypto.randomBytes(32);
  #pending = new Set();

  constructor({
    primary,
    shadow,
    enabled = process.env.PG_SHADOW_READ_ENABLED === '1',
    onComparison = () => {},
  } = {}) {
    if (!primary || typeof primary !== 'object') throw new TypeError('A primary read repository is required.');
    if (enabled && (!shadow || typeof shadow !== 'object')) {
      throw new TypeError('An explicit shadow read repository is required when shadow reads are enabled.');
    }
    if (typeof onComparison !== 'function') throw new TypeError('onComparison must be a function.');
    this.#primary = primary;
    this.#shadow = shadow;
    this.#enabled = Boolean(enabled);
    this.#onComparison = onComparison;
  }

  async read({ name, primaryRead, shadowRead, normalize = (value) => value } = {}) {
    if (typeof name !== 'string' || !SAFE_QUERY_NAME.test(name)) throw new TypeError('A stable, non-sensitive shadow query name is required.');
    if (typeof primaryRead !== 'function' || typeof shadowRead !== 'function') {
      throw new TypeError('Primary and shadow read callbacks are required.');
    }
    if (typeof normalize !== 'function') throw new TypeError('normalize must be a function.');

    const primaryValue = await primaryRead(this.#primary);
    if (!this.#enabled) return primaryValue;

    const startedAt = performance.now();
    const pending = Promise.resolve()
      .then(() => shadowRead(this.#shadow))
      .then((shadowValue) => {
        try {
          const primaryHash = resultDigest(primaryValue, normalize, this.#hashKey);
          const shadowHash = resultDigest(shadowValue, normalize, this.#hashKey);
          return {
            query_name: name,
            status: primaryHash === shadowHash ? 'match' : 'mismatch',
            primary_hmac_sha256: primaryHash,
            shadow_hmac_sha256: shadowHash,
            primary_rows: countRows(primaryValue),
            shadow_rows: countRows(shadowValue),
            duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
          };
        } catch (error) {
          return {
            query_name: name,
            status: 'shadow_error',
            error_code: safeErrorCode(error),
            duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
          };
        }
      }, (error) => ({
        query_name: name,
        status: 'shadow_error',
        error_code: safeErrorCode(error),
        duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
      }))
      .then((comparison) => this.#onComparison(Object.freeze(comparison)))
      .catch(() => undefined);
    this.#pending.add(pending);
    pending.finally(() => this.#pending.delete(pending));
    return primaryValue;
  }

  async flush() {
    while (this.#pending.size > 0) await Promise.all([...this.#pending]);
  }
}
