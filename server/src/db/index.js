import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

const DB_FILE = path.join(config.dataDir, 'easyshop.db');

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(SCHEMA_SQL);

/**
 * مهاجرت‌های سبک: اگر ستونی در نسخه‌های قبلی دیتابیس وجود نداشته باشد اضافه می‌شود.
 * (SQLite از ALTER TABLE ADD COLUMN پشتیبانی می‌کند)
 */
const COLUMN_MIGRATIONS = [
  ['messages', 'is_internal', 'INTEGER NOT NULL DEFAULT 0'],
  ['messages', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0'],
  ['conversations', 'priority', "TEXT NOT NULL DEFAULT 'normal'"],
  ['conversations', 'source', "TEXT NOT NULL DEFAULT 'web'"],
  ['products', 'seo', "TEXT NOT NULL DEFAULT '{}'"],
  ['orders', 'source', "TEXT NOT NULL DEFAULT 'web'"],
  ['orders', 'device', 'TEXT'],
  ['users', 'device_tokens', "TEXT NOT NULL DEFAULT '[]'"],
  ['ai_providers', 'supports_tools', 'INTEGER NOT NULL DEFAULT 0'],
  ['tickets', 'channel', "TEXT NOT NULL DEFAULT 'web'"],
  // --- امنیت -------------------------------------------------------------
  ['users', 'token_version', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'reset_token_hash', 'TEXT'],
  ['users', 'failed_logins', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'locked_until', 'TEXT'],
  ['refresh_tokens', 'token_hash', 'TEXT'],
  ['refresh_tokens', 'family', 'TEXT'],
  ['conversations', 'guest_token_hash', 'TEXT'],
  ['orders', 'stock_committed', 'INTEGER NOT NULL DEFAULT 0'],
  // تکمیل جدول‌های مالی در دیتابیس‌های قدیمی‌تر
  ['wallet_topups', 'gateway', 'TEXT'],
  ['wallet_topups', 'authority', 'TEXT'],
  ['wallet_topups', 'ip', 'TEXT'],
];

function hasColumn(table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  } catch {
    return false;
  }
}

const TABLE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS login_attempts (
     id         TEXT PRIMARY KEY,
     email      TEXT,
     ip         TEXT,
     success    INTEGER NOT NULL DEFAULT 0,
     user_agent TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at)`,
  `CREATE TABLE IF NOT EXISTS review_helpful (
     review_id  TEXT NOT NULL,
     user_id    TEXT NOT NULL,
     created_at TEXT NOT NULL,
     PRIMARY KEY (review_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS wallet_topups (
     id         TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL,
     amount     INTEGER NOT NULL,
     status     TEXT NOT NULL DEFAULT 'pending',
     gateway    TEXT,
     authority  TEXT,
     ref_id     TEXT,
     ip         TEXT,
     created_at TEXT NOT NULL,
     verified_at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS checkout_intents (
     id         TEXT PRIMARY KEY,
     order_id   TEXT NOT NULL,
     user_id    TEXT,
     phone      TEXT,
     authority  TEXT NOT NULL,
     status     TEXT NOT NULL DEFAULT 'pending',
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_hash ON refresh_tokens(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`,
];

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
  return applied;
}
migrate();

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
  run(
    `INSERT INTO audit_logs (id,user_id,user_name,action,entity,entity_id,meta,ip,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    uid('log'),
    userId ?? null,
    userName ?? null,
    action,
    entity ?? null,
    entityId ?? null,
    stringifyJson(meta ?? {}),
    ip ?? null,
    nowIso(),
  );
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

export function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const out = {};
  for (const r of rows) out[r.key] = parseJson(r.value, r.value);
  return out;
}

export function setSetting(key, value) {
  run(
    `INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    key,
    stringifyJson(value),
    nowIso(),
  );
  return getSettings();
}

export function isSeeded() {
  const row = get('SELECT COUNT(*) AS c FROM products');
  return (row?.c ?? 0) > 0;
}
