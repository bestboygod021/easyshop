import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import {
  appendAuditLogRecord,
  backfillAuditLogChain,
  verifyAuditLogChain,
} from '../src/db/audit-chain.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT, action TEXT NOT NULL,
    entity TEXT, entity_id TEXT, meta TEXT, ip TEXT, created_at TEXT NOT NULL,
    chain_seq INTEGER, previous_hash TEXT, entry_hash TEXT, key_version TEXT
  )`);
  return db;
}

function row(id, action, createdAt = '2026-10-09T00:00:00.000Z') {
  return {
    id,
    user_id: null,
    user_name: 'test',
    action,
    entity: 'test',
    entity_id: id,
    meta: JSON.stringify({ stable: true }),
    ip: '127.0.0.1',
    created_at: createdAt,
  };
}

function insertLegacy(db, entry) {
  db.prepare(`INSERT INTO audit_logs (id,user_id,user_name,action,entity,entity_id,meta,ip,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    entry.id, entry.user_id, entry.user_name, entry.action, entry.entity,
    entry.entity_id, entry.meta, entry.ip, entry.created_at,
  );
}

describe('tamper-evident audit chain', () => {
  it('backfills deterministically with HMAC and detects changed payloads', () => {
    const db = fixture();
    const key = 'audit-test-key-material-that-is-over-thirty-two-bytes';
    insertLegacy(db, row('a2', 'second', '2026-10-09T00:00:02.000Z'));
    insertLegacy(db, row('a1', 'first', '2026-10-09T00:00:01.000Z'));
    assert.deepEqual(backfillAuditLogChain(db, { key, keyVersion: 'v7' }), { backfilled: 2, total: 2 });
    const verified = verifyAuditLogChain(db, { resolveKey: (version) => version === 'v7' ? key : null });
    assert.equal(verified.valid, true);
    assert.equal(verified.latest_sequence, 2);
    assert.equal(db.prepare('SELECT action FROM audit_logs WHERE chain_seq=1').get().action, 'first');

    db.prepare('UPDATE audit_logs SET meta=? WHERE chain_seq=1').run('{"tampered":true}');
    const tampered = verifyAuditLogChain(db, { resolveKey: () => key });
    assert.equal(tampered.valid, false);
    assert.equal(tampered.reason, 'entry_hash_mismatch');
    assert.equal(tampered.first_broken_sequence, 1);
    db.close();
  });

  it('supports keyed version rotation while preserving a continuous chain', () => {
    const db = fixture();
    const firstKey = 'first-audit-key-material-longer-than-thirty-two-bytes';
    const secondKey = 'second-audit-key-material-longer-than-thirty-two-bytes';
    appendAuditLogRecord(db, row('one', 'first'), { key: firstKey, keyVersion: 'v1' });
    appendAuditLogRecord(db, row('two', 'second', '2026-10-09T00:00:01.000Z'), { key: secondKey, keyVersion: 'v2' });
    const result = verifyAuditLogChain(db, { resolveKey: (version) => ({ v1: firstKey, v2: secondKey })[version] || null });
    assert.equal(result.valid, true);
    assert.deepEqual(db.prepare('SELECT key_version FROM audit_logs ORDER BY chain_seq').all().map((r) => r.key_version), ['hmac-v1', 'hmac-v2']);
    assert.equal(verifyAuditLogChain(db).reason, 'missing_historical_key');
    db.close();
  });

  it('rejects partial chains and refuses to append across a deletion or sequence gap', () => {
    const db = fixture();
    const key = 'audit-test-key-material-that-is-over-thirty-two-bytes';
    insertLegacy(db, row('legacy', 'old'));
    backfillAuditLogChain(db, { key, keyVersion: 'v1' });
    insertLegacy(db, row('unsequenced', 'new', '2026-10-09T00:00:01.000Z'));
    assert.throws(() => backfillAuditLogChain(db, { key, keyVersion: 'v1' }), /partial hash chain/);
    assert.throws(() => appendAuditLogRecord(db, row('blocked', 'blocked'), { key, keyVersion: 'v1' }), /incomplete/);
    db.prepare("DELETE FROM audit_logs WHERE id='unsequenced'").run();
    appendAuditLogRecord(db, row('second', 'second', '2026-10-09T00:00:02.000Z'), { key, keyVersion: 'v1' });
    db.prepare("DELETE FROM audit_logs WHERE id='legacy'").run();
    assert.throws(() => appendAuditLogRecord(db, row('next', 'next'), { key, keyVersion: 'v1' }), /incomplete/);
    db.close();
  });
});
