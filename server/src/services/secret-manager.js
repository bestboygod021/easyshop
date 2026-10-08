import fs from 'node:fs';
import path from 'node:path';

const REDACTED_MARKER = '[PROTECTED_SECRET]';

function sanitizeSecretValue(val) {
  if (typeof val !== 'string') return '';
  return val.trim();
}

/**
 * مدیریت یکپارچه و امن پیکربندی و secretهای محیط staging و production.
 * - خواندن از متغیرهای محیطی یا پرونده‌های محرمانه‌ی سیستمی (مانند Docker/K8s secrets)
 * - حافظه موقت (In-Memory Cache) با TTL جهت کاهش دسترسی به فایل‌سیستم در بارهای بالا
 * - عدم ثبت مقادیر محرمانه در لاگ‌ها، گزارش‌ها یا پیام‌های خطا
 * - جلوگیری از افشای توکن‌ها، رمزها و کلیدهای درگاه
 */
export class SecretManager {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.secretsDir = options.secretsDir || this.env.SECRETS_DIR || null;
    this.cacheTtlMs = Number.isSafeInteger(options.cacheTtlMs) ? options.cacheTtlMs : 30_000;
    this._cache = new Map();
  }

  clearCache() {
    this._cache.clear();
  }

  getSecret(key, defaultValue = '') {
    if (!key || typeof key !== 'string') return defaultValue;

    const now = Date.now();
    const cached = this._cache.get(key);
    if (cached && now < cached.expiresAt) {
      return cached.val;
    }

    let valToCache = defaultValue;

    // ۱. اولویت با فایل محرمانه‌ی mount شده (Docker/Kubernetes Secret)
    if (this.secretsDir) {
      try {
        const filePath = path.join(this.secretsDir, key);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          const trimmed = sanitizeSecretValue(content);
          if (trimmed) {
            valToCache = trimmed;
            this._cache.set(key, { val: trimmed, expiresAt: now + this.cacheTtlMs });
            return trimmed;
          }
        }
      } catch {
        // نادیده گرفتن خطا جهت جلوگیری از افشای مسیرها در لاگ عمومی
      }
    }

    // ۲. خواندن از محیط پردازش
    const val = this.env[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const sanitized = sanitizeSecretValue(String(val));
      this._cache.set(key, { val: sanitized, expiresAt: now + this.cacheTtlMs });
      return sanitized;
    }

    return defaultValue;
  }

  requireSecret(key, label) {
    const value = this.getSecret(key);
    if (!value) {
      const display = label || key;
      throw new Error(`مقدار محرمانه‌ی الزامی پیکربندی نشده است: ${display}`);
    }
    return value;
  }

  /**
   * خلاصه وضعیت secretها بدون افشای مقدار آنها (فقط نشان‌دهنده ست بودن یا نبودن)
   */
  inspectSecretStatus(keys = []) {
    const result = {};
    for (const key of keys) {
      const val = this.getSecret(key);
      result[key] = {
        configured: Boolean(val),
        length: val ? val.length : 0,
        value: val ? REDACTED_MARKER : null,
      };
    }
    return result;
  }
}

export const defaultSecretManager = new SecretManager();
