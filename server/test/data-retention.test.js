import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-retention-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SEED_DEMO_DATA = '0';
process.env.LOG_LEVEL = 'error';

const { db, get, run, uid, audit, verifyAuditLogIntegrity } = await import('../src/db/index.js');
const { purgeExpiredData } = await import('../src/services/data-retention.js');
const now = new Date('2026-10-09T12:00:00.000Z');
const isoDaysAgo = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
const isoDaysAhead = (days) => new Date(now.getTime() + days * 86_400_000).toISOString();
const policy = {
  loginAttemptsDays: 90,
  smsOtpsDays: 30,
  refreshTokensDays: 7,
  paymentCallbacksDays: 180,
  telemetryErrorsDays: 30,
  aggregatedErrorsDays: 180,
  aiLogsDays: 90,
  notificationsDays: 180,
  loginHistoryDays: 180,
};
let userId;
let privacyRequestId;

before(() => {
  userId = uid('usr');
  run(`INSERT INTO users (id,email,password_hash,full_name,created_at,updated_at,reset_token,reset_token_hash,reset_expires)
    VALUES (?,?,?,?,?,?,?,?,?)`, userId, 'retention@example.test', 'test-hash', 'Retention User', isoDaysAgo(300), isoDaysAgo(300),
  'expired-token', 'expired-hash', isoDaysAgo(1));

  run('INSERT INTO login_attempts (id,email,ip,created_at) VALUES (?,?,?,?)', uid('la'), 'old@example.test', '192.0.2.1', isoDaysAgo(100));
  run('INSERT INTO login_attempts (id,email,ip,created_at) VALUES (?,?,?,?)', uid('la'), 'new@example.test', '192.0.2.2', isoDaysAgo(1));
  run(`INSERT INTO sms_otps (id,phone,code,purpose,expires_at,created_at) VALUES (?,?,?,?,?,?)`, uid('otp'), '09120000001', '111111', 'login', isoDaysAgo(31), isoDaysAgo(31));
  run(`INSERT INTO sms_otps (id,phone,code,purpose,expires_at,created_at) VALUES (?,?,?,?,?,?)`, uid('otp'), '09120000002', '222222', 'login', isoDaysAhead(1), isoDaysAgo(1));

  run(`INSERT INTO refresh_tokens (id,user_id,token,expires_at,revoked,created_at) VALUES (?,?,?,?,?,?)`,
    uid('rt'), userId, 'old-revoked-hash', isoDaysAgo(40), 1, isoDaysAgo(10));
  run(`INSERT INTO refresh_tokens (id,user_id,token,expires_at,revoked,created_at) VALUES (?,?,?,?,?,?)`,
    uid('rt'), userId, 'valid-token-hash', isoDaysAhead(20), 0, isoDaysAgo(1));
  run(`INSERT INTO payment_callback_events (id,provider,result,created_at) VALUES (?,?,?,?)`, uid('pce'), 'zarinpal', 'verified_paid', isoDaysAgo(200));
  run(`INSERT INTO payment_callback_events (id,provider,result,created_at) VALUES (?,?,?,?)`, uid('pce'), 'zarinpal', 'verified_paid', isoDaysAgo(1));
  run(`INSERT INTO client_telemetry_errors (id,user_id,error_msg,url,user_agent,created_at) VALUES (?,?,?,?,?,?)`, uid('cte'), userId, 'old error', '/old', 'test-agent', isoDaysAgo(40));
  run(`INSERT INTO client_telemetry_errors (id,user_id,error_msg,url,user_agent,created_at) VALUES (?,?,?,?,?,?)`, uid('cte'), userId, 'new error', '/new', 'test-agent', isoDaysAgo(1));
  run(`INSERT INTO aggregated_client_errors (id,fingerprint,error_msg,first_seen_at,last_seen_at) VALUES (?,?,?,?,?)`, uid('ace'), 'old-fingerprint', 'old grouped error', isoDaysAgo(200), isoDaysAgo(200));
  run(`INSERT INTO aggregated_client_errors (id,fingerprint,error_msg,first_seen_at,last_seen_at) VALUES (?,?,?,?,?)`, uid('ace'), 'new-fingerprint', 'new grouped error', isoDaysAgo(1), isoDaysAgo(1));
  run(`INSERT INTO ai_logs (id,provider,model,status,created_at) VALUES (?,?,?,?,?)`, uid('ail'), 'test', 'test', 'ok', isoDaysAgo(100));
  run(`INSERT INTO ai_logs (id,provider,model,status,created_at) VALUES (?,?,?,?,?)`, uid('ail'), 'test', 'test', 'ok', isoDaysAgo(1));
  run(`INSERT INTO notifications (id,user_id,title,body,type,created_at) VALUES (?,?,?,?,?,?)`, uid('ntf'), userId, 'old', 'old', 'info', isoDaysAgo(200));
  run(`INSERT INTO notifications (id,user_id,title,body,type,created_at) VALUES (?,?,?,?,?,?)`, uid('ntf'), userId, 'new', 'new', 'info', isoDaysAgo(1));
  run(`INSERT INTO user_login_history (id,user_id,ip,logged_in_at) VALUES (?,?,?,?)`, uid('ulh'), userId, '192.0.2.3', isoDaysAgo(200));
  run(`INSERT INTO user_login_history (id,user_id,ip,logged_in_at) VALUES (?,?,?,?)`, uid('ulh'), userId, '192.0.2.4', isoDaysAgo(1));

  privacyRequestId = uid('prv');
  run(`INSERT INTO privacy_requests (id,user_id,request_type,status,requested_at) VALUES (?,?,?,'pending',?)`,
    privacyRequestId, userId, 'erasure', isoDaysAgo(2000));
  audit({ userId, userName: 'Retention User', action: 'retention_test_anchor', entity: 'test', meta: { preserve: true } });
});

after(() => {
  db.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('retention preview and controlled purge', () => {
  it('previews eligible records without changing data', () => {
    const before = Number(get('SELECT COUNT(*) c FROM login_attempts').c);
    const result = purgeExpiredData({ now, policy, dryRun: true });
    assert.equal(result.dry_run, true);
    assert.equal(result.counts.login_attempts.eligible, 1);
    assert.equal(result.counts.sms_otps.eligible, 1);
    assert.equal(result.counts.refresh_tokens.eligible, 1);
    assert.equal(result.counts.payment_callback_events.eligible, 1);
    assert.equal(result.counts.ai_logs.eligible, 1);
    assert.equal(result.counts.expired_password_reset_tokens, 1);
    assert.equal(Number(get('SELECT COUNT(*) c FROM login_attempts').c), before);
  });

  it('deletes only expired operational data, keeps financial/privacy/audit records, and appends an integrity-verifiable audit entry', () => {
    const auditBefore = Number(get('SELECT COUNT(*) c FROM audit_logs').c);
    const result = purgeExpiredData({ now, policy, dryRun: false });
    assert.equal(result.dry_run, false);
    for (const table of [
      'login_attempts', 'sms_otps', 'refresh_tokens', 'payment_callback_events',
      'client_telemetry_errors', 'aggregated_client_errors', 'ai_logs', 'notifications', 'user_login_history',
    ]) assert.equal(result.deleted[table], 1, `${table} should delete only its expired row`);
    assert.equal(result.deleted.expired_password_reset_tokens, 1);
    assert.equal(Number(get('SELECT COUNT(*) c FROM audit_logs').c), auditBefore + 1);
    assert.equal(get('SELECT id FROM privacy_requests WHERE id=?', privacyRequestId)?.id, privacyRequestId);
    assert.equal(get('SELECT reset_token FROM users WHERE id=?', userId).reset_token, null);
    assert.equal(get('SELECT COUNT(*) c FROM ai_logs').c, 1);
    assert.equal(verifyAuditLogIntegrity().valid, true);
  });
});
