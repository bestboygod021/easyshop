import crypto from 'node:crypto';

const VERSION_RE = /^v[1-9][0-9]*$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const EMPTY_CHAIN_VERSION = 'sha256-unkeyed';

function requireVersion(version) {
  if (!VERSION_RE.test(String(version || ''))) throw new Error('Audit HMAC key version must use the form v1, v2, etc.');
  return version;
}

function validateKey(key) {
  if (key === null || key === undefined || key === '') return null;
  const value = Buffer.isBuffer(key) ? key : Buffer.from(String(key), 'utf8');
  if (value.byteLength < 32) throw new Error('Audit HMAC key must contain at least 32 bytes.');
  return value;
}

function canonicalEntry(row) {
  return JSON.stringify([
    row.id ?? null,
    Number(row.chain_seq),
    row.previous_hash ?? null,
    row.user_id ?? null,
    row.user_name ?? null,
    row.action ?? null,
    row.entity ?? null,
    row.entity_id ?? null,
    row.meta ?? null,
    row.ip ?? null,
    row.created_at ?? null,
    row.key_version ?? null,
  ]);
}

export function calculateAuditEntryHash(row, { key = null } = {}) {
  const signingKey = validateKey(key);
  const canonical = canonicalEntry(row);
  return signingKey
    ? crypto.createHmac('sha256', signingKey).update(canonical).digest('hex')
    : crypto.createHash('sha256').update(canonical).digest('hex');
}

function insertChainFields(db, row, sequence, previousHash, key, keyVersion) {
  const entry = {
    ...row,
    chain_seq: sequence,
    previous_hash: previousHash,
    key_version: keyVersion,
  };
  entry.entry_hash = calculateAuditEntryHash(entry, { key });
  db.prepare(`UPDATE audit_logs
    SET chain_seq=?, previous_hash=?, entry_hash=?, key_version=?
    WHERE id=?`).run(sequence, previousHash, entry.entry_hash, keyVersion, row.id);
  return entry;
}

/** One-time atomic backfill of pre-chain audit rows; partial chains fail closed. */
export function backfillAuditLogChain(db, { key = null, keyVersion } = {}) {
  const signingKey = validateKey(key);
  const resolvedVersion = signingKey
    ? `hmac-${requireVersion(keyVersion)}`
    : (keyVersion || EMPTY_CHAIN_VERSION);
  if (!signingKey && resolvedVersion !== EMPTY_CHAIN_VERSION) {
    throw new Error('An audit key is required for a keyed audit chain.');
  }

  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY created_at ASC, id ASC').all();
  const missing = rows.filter((row) => row.chain_seq === null || row.chain_seq === undefined
    || !row.entry_hash || !row.key_version);
  if (!missing.length) return { backfilled: 0, total: rows.length };
  if (missing.length !== rows.length) {
    throw new Error('Audit log has a partial hash chain; restore or repair it before appending new entries.');
  }

  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    let sequence = 0;
    let previousHash = null;
    for (const row of rows) {
      sequence += 1;
      const entry = insertChainFields(db, row, sequence, previousHash, signingKey, resolvedVersion);
      previousHash = entry.entry_hash;
    }
    if (ownsTransaction) db.exec('COMMIT');
    return { backfilled: rows.length, total: rows.length };
  } catch (error) {
    if (ownsTransaction) {
      try { db.exec('ROLLBACK'); } catch { /* preserve the original error */ }
    }
    throw error;
  }
}

/** Append-only chain insertion, safe inside an existing SQLite transaction. */
export function appendAuditLogRecord(db, row, { key = null, keyVersion } = {}) {
  const signingKey = validateKey(key);
  const resolvedVersion = signingKey
    ? `hmac-${requireVersion(keyVersion)}`
    : (keyVersion || EMPTY_CHAIN_VERSION);
  if (!signingKey && resolvedVersion !== EMPTY_CHAIN_VERSION) {
    throw new Error('An audit key is required for a keyed audit chain.');
  }

  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    const integrity = db.prepare(`SELECT COUNT(*) AS count, COALESCE(MAX(chain_seq), 0) AS max_seq,
      SUM(CASE WHEN chain_seq IS NULL OR entry_hash IS NULL OR key_version IS NULL THEN 1 ELSE 0 END) AS missing
      FROM audit_logs`).get();
    if (Number(integrity.missing || 0) > 0 || Number(integrity.count) !== Number(integrity.max_seq)) {
      throw new Error('Audit log chain is incomplete; refusing to append until it is repaired.');
    }

    const last = db.prepare('SELECT chain_seq, entry_hash FROM audit_logs ORDER BY chain_seq DESC LIMIT 1').get();
    const entry = {
      ...row,
      chain_seq: Number(last?.chain_seq || 0) + 1,
      previous_hash: last?.entry_hash || null,
      key_version: resolvedVersion,
    };
    entry.entry_hash = calculateAuditEntryHash(entry, { key: signingKey });
    db.prepare(`INSERT INTO audit_logs
      (id,user_id,user_name,action,entity,entity_id,meta,ip,created_at,chain_seq,previous_hash,entry_hash,key_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      entry.id,
      entry.user_id ?? null,
      entry.user_name ?? null,
      entry.action,
      entry.entity ?? null,
      entry.entity_id ?? null,
      entry.meta ?? null,
      entry.ip ?? null,
      entry.created_at,
      entry.chain_seq,
      entry.previous_hash,
      entry.entry_hash,
      entry.key_version,
    );
    if (ownsTransaction) db.exec('COMMIT');
    return entry;
  } catch (error) {
    if (ownsTransaction) {
      try { db.exec('ROLLBACK'); } catch { /* preserve the original error */ }
    }
    throw error;
  }
}

/**
 * Validate ordering, links, key availability and HMAC/SHA-256 values.
 * `resolveKey(version)` must return the historical secret for that version.
 */
export function verifyAuditLogChain(db, { resolveKey = () => null } = {}) {
  const total = Number(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count);
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY chain_seq ASC').all();
  if (rows.length !== total) return { valid: false, reason: 'unsequenced_entries', total, verified: 0 };

  let expectedSequence = 1;
  let previousHash = null;
  for (const row of rows) {
    if (Number(row.chain_seq) !== expectedSequence) {
      return { valid: false, reason: 'sequence_gap', total, verified: expectedSequence - 1, first_broken_sequence: row.chain_seq };
    }
    if ((row.previous_hash ?? null) !== previousHash) {
      return { valid: false, reason: 'previous_hash_mismatch', total, verified: expectedSequence - 1, first_broken_sequence: row.chain_seq };
    }
    if (!row.entry_hash || !HASH_RE.test(String(row.entry_hash)) || !row.key_version) {
      return { valid: false, reason: 'missing_hash_metadata', total, verified: expectedSequence - 1, first_broken_sequence: row.chain_seq };
    }

    let key = null;
    if (String(row.key_version).startsWith('hmac-')) {
      const version = String(row.key_version).slice('hmac-'.length);
      if (!VERSION_RE.test(version)) {
        return { valid: false, reason: 'unknown_key_version', total, verified: expectedSequence - 1, first_broken_sequence: row.chain_seq };
      }
      key = resolveKey(version);
      if (!key) {
        return { valid: false, reason: 'missing_historical_key', total, verified: expectedSequence - 1, first_broken_sequence: row.chain_seq, key_version: version };
      }
      try { validateKey(key); } catch {
        return { valid: false, reason: 'invalid_historical_key', total, verified: expectedSequence - 1, first_broken_sequence: row.chain_seq, key_version: version };
      }
    } else if (row.key_version !== EMPTY_CHAIN_VERSION) {
      return { valid: false, reason: 'unknown_key_version', total, verified: expectedSequence - 1, first_broken_sequence: row.chain_seq };
    }

    const expectedHash = calculateAuditEntryHash(row, { key });
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const actualBuffer = Buffer.from(String(row.entry_hash), 'hex');
    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      return { valid: false, reason: 'entry_hash_mismatch', total, verified: expectedSequence - 1, first_broken_sequence: row.chain_seq };
    }
    previousHash = row.entry_hash;
    expectedSequence += 1;
  }

  return {
    valid: true,
    reason: null,
    total,
    verified: total,
    latest_sequence: total ? expectedSequence - 1 : 0,
    latest_hash: previousHash,
  };
}

export const AUDIT_CHAIN_EMPTY_VERSION = EMPTY_CHAIN_VERSION;
