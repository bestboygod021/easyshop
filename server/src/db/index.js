import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';
import { ADDITIONAL_INDEX_MIGRATIONS, COLUMN_MIGRATIONS, TABLE_MIGRATIONS } from './legacy-schema-migrations.js';
import { runVersionedMigrations } from './migrations.js';
import { appendAuditLogRecord, backfillAuditLogChain, verifyAuditLogChain } from './audit-chain.js';
import { defaultSecretManager } from '../services/secret-manager.js';

const DB_FILE = path.join(config.dataDir, 'easyshop.db');

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(SCHEMA_SQL);

/**
 * مهاجرت‌های سبک: اگر ستونی در نسخه‌های قبلی دیتابیس وجود نداشته باشد اضافه می‌شود.
 * (SQLite از ALTER TABLE ADD COLUMN پشتیبانی می‌کند)
 */


function hasColumn(table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  } catch {
    return false;
  }
}



export function migrate() {
  const applied = [];
  for (const ddl of TABLE_MIGRATIONS) {
    try {
      db.exec(ddl);
    } catch (err) {
      console.warn('⚠️ ایجاد جدول امنیتی ناموفق:', err.message);
    }
  }
  for (const [table, column, ddl] of COLUMN_MIGRATIONS) {
    try {
      if (!hasColumn(table, column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
        applied.push(`${table}.${column}`);
      }
    } catch (err) {
      console.warn(`⚠️ مهاجرت ${table}.${column} ناموفق:`, err.message);
    }
  }
  // در دیتابیس‌های قدیمی، نخستین پرداخت موفق سفارش فعال را به‌عنوان تراکنش تسویه‌شده علامت می‌زنیم.
  // پرداخت‌های دیرهنگامِ سفارش لغوشده/نیازمند بررسی عمداً applied نمی‌شوند.
  try {
    db.exec(`
      UPDATE payments SET applied = 1
      WHERE status = 'paid' AND applied = 0
        AND NOT EXISTS (
          SELECT 1 FROM payments applied_payment
          WHERE applied_payment.order_id = payments.order_id AND applied_payment.applied = 1
        )
        AND id = (
          SELECT p2.id FROM payments p2
          WHERE p2.order_id = payments.order_id AND p2.status = 'paid'
          ORDER BY p2.created_at ASC, p2.rowid ASC LIMIT 1
        )
        AND order_id IN (
          SELECT id FROM orders
          WHERE payment_status = 'paid' AND status IN ('paid','processing','packed','shipped','delivered')
        )
    `);
  } catch (err) {
    console.warn('⚠️ backfill وضعیت پرداخت تسویه‌شده ناموفق:', err.message);
  }
  for (const ddl of ADDITIONAL_INDEX_MIGRATIONS) {
    try { db.exec(ddl); } catch (err) { console.warn('⚠️ ایجاد شاخص پرداخت ناموفق:', err.message); }
  }
  return applied;
}
migrate();
runVersionedMigrations(db);

const activeAuditKey = config.security.auditLogHmacKey || null;
const activeAuditKeyVersion = config.security.auditLogHmacKeyVersion;
if (config.isProd && (!activeAuditKey || Buffer.byteLength(activeAuditKey, 'utf8') < 32)) {
  throw new Error('Production requires a valid AUDIT_LOG_HMAC_KEY_<VERSION> before the database is opened.');
}
backfillAuditLogChain(db, {
  key: activeAuditKey,
  keyVersion: activeAuditKey ? activeAuditKeyVersion : undefined,
});

/** اجرای یک کوئری و برگرداندن همه‌ی ردیف‌ها */
export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}
/** اجرای یک کوئری و برگرداندن اولین ردیف */
export function get(sql, ...params) {
  return db.prepare(sql).get(...params) ?? null;
}
/** اجرای INSERT/UPDATE/DELETE */
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}
/** تراکنش */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();
export const uid = (prefix = '') =>
  `${prefix}${prefix ? '_' : ''}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
export const stringifyJson = (value, fallback = '{}') =>
  value === undefined ? fallback : JSON.stringify(value ?? null);

export function audit({ userId, userName, action, entity, entityId, meta, ip }) {
  return appendAuditLogRecord(db, {
    id: uid('log'),
    user_id: userId ?? null,
    user_name: userName ?? null,
    action,
    entity: entity ?? null,
    entity_id: entityId ?? null,
    meta: stringifyJson(meta ?? {}),
    ip: ip ?? null,
    created_at: nowIso(),
  }, {
    key: activeAuditKey,
    keyVersion: activeAuditKey ? activeAuditKeyVersion : undefined,
  });
}

export function verifyAuditLogIntegrity() {
  return verifyAuditLogChain(db, {
    resolveKey: (version) => defaultSecretManager.getSecret(`AUDIT_LOG_HMAC_KEY_${version.toUpperCase()}`) || null,
  });
}

export function notify({ userId, title, body, type = 'info', link }) {
  if (!userId) return;
  run(
    `INSERT INTO notifications (id,user_id,title,body,type,link,created_at) VALUES (?,?,?,?,?,?,?)`,
    uid('ntf'),
    userId,
    title,
    body ?? null,
    type,
    link ?? null,
    nowIso(),
  );
}

const SAFE_AI_SETTING_KEYS = new Set([
  'default_provider',
  'auto_fallback',
  'product_auto_publish',
  'allow_customer_assistant',
  'allow_support_ai',
]);

function sanitizeAiSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_AI_SETTING_KEYS.has(key)) continue;
    if (key === 'default_provider' && typeof item === 'string' && item.length <= 40) safe[key] = item;
    if (key !== 'default_provider' && typeof item === 'boolean') safe[key] = item;
  }
  return safe;
}

export function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const out = {};
  for (const r of rows) {
    const value = parseJson(r.value, r.value);
    out[r.key] = r.key === 'ai' ? sanitizeAiSettings(value) : value;
  }
  return out;
}

export function setSetting(key, value) {
  const storedValue = key === 'ai' ? sanitizeAiSettings(value) : value;
  run(
    `INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    key,
    stringifyJson(storedValue),
    nowIso(),
  );
  return getSettings();
}

// Remove legacy credentials or arbitrary values previously written into public AI settings.
const legacyAiSettingsRow = get('SELECT value FROM settings WHERE key = ?', 'ai');
if (legacyAiSettingsRow) {
  const parsedAiSettings = parseJson(legacyAiSettingsRow.value, legacyAiSettingsRow.value);
  const safeAiSettings = sanitizeAiSettings(parsedAiSettings);
  if (JSON.stringify(parsedAiSettings) !== JSON.stringify(safeAiSettings)) {
    run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', stringifyJson(safeAiSettings), nowIso(), 'ai');
  }
}

export function isSeeded() {
  const row = get('SELECT COUNT(*) AS c FROM products');
  return (row?.c ?? 0) > 0;
}
