import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit, get, run, tx } from '../db/index.js';
import { config } from '../config.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RETENTION_DAYS = 3650;
const __filename = fileURLToPath(import.meta.url);

function resolveDays(value, label) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) {
    throw new Error(`${label} must be an integer between 1 and ${MAX_RETENTION_DAYS} days.`);
  }
  return days;
}

function buildPlan(policy, now) {
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new Error('Retention run requires a valid timestamp.');
  const nowIso = nowDate.toISOString();
  const rule = (name, field, predicate = '< ?') => {
    const days = resolveDays(policy[name], name);
    return { days, cutoff: new Date(nowDate.getTime() - days * DAY_MS).toISOString(), field, predicate };
  };
  const rules = {
    login_attempts: rule('loginAttemptsDays', 'created_at'),
    sms_otps: rule('smsOtpsDays', 'created_at'),
    refresh_tokens: rule('refreshTokensDays', 'created_at'),
    payment_callback_events: rule('paymentCallbacksDays', 'created_at'),
    client_telemetry_errors: rule('telemetryErrorsDays', 'created_at'),
    aggregated_client_errors: rule('aggregatedErrorsDays', 'last_seen_at'),
    ai_logs: rule('aiLogsDays', 'created_at'),
    notifications: rule('notificationsDays', 'created_at'),
    user_login_history: rule('loginHistoryDays', 'logged_in_at'),
  };
  return { nowIso, rules };
}

const RETENTION_SQL = {
  login_attempts: 'DELETE FROM login_attempts WHERE created_at < ?',
  sms_otps: 'DELETE FROM sms_otps WHERE created_at < ? AND expires_at < ?',
  refresh_tokens: `DELETE FROM refresh_tokens
    WHERE (revoked = 1 AND created_at < ?)
       OR (expires_at < ? AND created_at < ?)`,
  payment_callback_events: 'DELETE FROM payment_callback_events WHERE created_at < ?',
  client_telemetry_errors: 'DELETE FROM client_telemetry_errors WHERE created_at < ?',
  aggregated_client_errors: 'DELETE FROM aggregated_client_errors WHERE last_seen_at < ?',
  ai_logs: 'DELETE FROM ai_logs WHERE created_at < ?',
  notifications: 'DELETE FROM notifications WHERE created_at < ?',
  user_login_history: 'DELETE FROM user_login_history WHERE logged_in_at < ?',
};

function countExpired(table, cutoff, nowIso) {
  if (table === 'refresh_tokens') {
    return Number(get(`SELECT COUNT(*) AS count FROM refresh_tokens
      WHERE (revoked = 1 AND created_at < ?) OR (expires_at < ? AND created_at < ?)`, cutoff, nowIso, cutoff).count);
  }
  if (table === 'sms_otps') {
    return Number(get('SELECT COUNT(*) AS count FROM sms_otps WHERE created_at < ? AND expires_at < ?', cutoff, nowIso).count);
  }
  const { field } = {
    login_attempts: { field: 'created_at' },
    payment_callback_events: { field: 'created_at' },
    client_telemetry_errors: { field: 'created_at' },
    aggregated_client_errors: { field: 'last_seen_at' },
    ai_logs: { field: 'created_at' },
    notifications: { field: 'created_at' },
    user_login_history: { field: 'logged_in_at' },
  }[table];
  return Number(get(`SELECT COUNT(*) AS count FROM ${table} WHERE ${field} < ?`, cutoff).count);
}

/**
 * Preview or purge only short-lived operational/diagnostic records.
 * Financial records, order history, privacy requests and audit_logs are deliberately excluded.
 */
export function purgeExpiredData({ now = new Date(), policy = config.dataRetention, dryRun = true } = {}) {
  const { nowIso, rules } = buildPlan(policy, now);
  const preview = {};
  for (const [table, rule] of Object.entries(rules)) {
    preview[table] = { cutoff: rule.cutoff, days: rule.days, eligible: countExpired(table, rule.cutoff, nowIso) };
  }
  preview.expired_password_reset_tokens = Number(get(`SELECT COUNT(*) AS count FROM users
    WHERE reset_expires IS NOT NULL AND reset_expires < ?`, nowIso).count);
  if (dryRun) return { dry_run: true, evaluated_at: nowIso, counts: preview, deleted: null };

  const deleted = {};
  tx(() => {
    for (const [table, rule] of Object.entries(rules)) {
      const result = table === 'refresh_tokens'
        ? run(RETENTION_SQL[table], rule.cutoff, nowIso, rule.cutoff)
        : table === 'sms_otps'
          ? run(RETENTION_SQL[table], rule.cutoff, nowIso)
          : run(RETENTION_SQL[table], rule.cutoff);
      deleted[table] = Number(result.changes || 0);
    }
    const resetTokens = run(`UPDATE users SET reset_token=NULL, reset_token_hash=NULL, reset_expires=NULL
      WHERE reset_expires IS NOT NULL AND reset_expires < ?`, nowIso);
    deleted.expired_password_reset_tokens = Number(resetTokens.changes || 0);
    const totalDeleted = Object.values(deleted).reduce((sum, count) => sum + count, 0);
    if (totalDeleted > 0) {
      audit({
        userName: 'data-retention-scheduler',
        action: 'data_retention_purge',
        entity: 'retention_policy',
        meta: { deleted, total: totalDeleted, evaluated_at: nowIso },
      });
    }
  });
  return { dry_run: false, evaluated_at: nowIso, counts: preview, deleted };
}

export function startDataRetentionScheduler({ intervalMs = config.dataRetention.intervalMs } = {}) {
  if (!config.dataRetention.enabled) return () => {};
  const interval = Number(intervalMs);
  if (!Number.isSafeInteger(interval) || interval < 60_000) {
    throw new Error('DATA_RETENTION_INTERVAL_MS must be at least 60000.');
  }
  let running = false;
  const runOnce = () => {
    if (running) return;
    running = true;
    try {
      const result = purgeExpiredData({ dryRun: false });
      const deleted = Object.values(result.deleted).reduce((sum, count) => sum + count, 0);
      if (deleted) console.info(`Data-retention job deleted ${deleted} expired record(s).`);
    } catch (error) {
      console.error('Data-retention job failed.', error?.message || error);
    } finally {
      running = false;
    }
  };
  runOnce();
  const timer = setInterval(runOnce, interval);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function runCli(args) {
  const mode = args[0] || 'preview';
  if (mode === 'preview') {
    console.log(JSON.stringify(purgeExpiredData({ dryRun: true }), null, 2));
    return;
  }
  if (mode === 'apply') {
    if (!config.dataRetention.enabled) {
      throw new Error('Refusing to purge data: set DATA_RETENTION_ENABLED=1 after reviewing the approved retention policy.');
    }
    console.log(JSON.stringify(purgeExpiredData({ dryRun: false }), null, 2));
    return;
  }
  throw new Error('Usage: node server/src/services/data-retention.js [preview|apply]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`Data-retention operation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
