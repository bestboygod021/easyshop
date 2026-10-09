/**
 * لایه‌ی امنیتی EasyShop
 * ------------------------------------------------------------------
 *  • محدودکننده‌ی نرخ درخواست (Rate limiting) با پنجره‌ی لغزان
 *  • قفل موقت حساب پس از تلاش‌های ناموفق ورود
 *  • پاک‌سازی ورودی‌ها (Prototype Pollution، کنترل‌کاراکترها، طول)
 *  • متن امن برای ذخیره‌سازی و خروجی (XSS)، پاک‌سازی HTML تولیدشده‌ی AI
 *  • محافظت CSRF/Origin برای درخواست‌های تغییردهنده
 *  • هدرهای امنیتی و CSP (همراه با اجازه‌ی iframe پیش‌نمایش ابری)
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { nowIso, run, uid } from '../db/index.js';

/* ------------------------------------------------------------------ */
/*                            ابزارهای پایه                            */
/* ------------------------------------------------------------------ */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** مقایسه‌ی امن دو رشته برای جلوگیری از حمله‌ی زمان‌سنجی */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** شناسه‌ی یکتای درخواست برای ردیابی در لاگ‌ها */
export function requestId(req, res, next) {
  req.id = req.headers['x-request-id']?.slice(0, 64) || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

/**
 * IP واقعی کلاینت.
 * اگر سرور پشت پروکسی معتبر نیست، از سوکت استفاده می‌کنیم تا هدر
 * `X-Forwarded-For` جعلی نتواند محدودیت نرخ را دور بزند.
 */
export function clientIp(req) {
  if (config.trustProxy) return req.ip || req.socket?.remoteAddress || 'unknown';
  return (req.socket?.remoteAddress || req.ip || 'unknown').replace(/^::ffff:/, '');
}

/* ------------------------------------------------------------------ */
/*                        محدودکننده‌ی نرخ درخواست                       */
/* ------------------------------------------------------------------ */

const buckets = new Map();

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets.entries()) {
    const alive = hits.filter((t) => t > now);
    if (alive.length) buckets.set(key, alive);
    else buckets.delete(key);
  }
}, 60_000);
if (sweeper.unref) sweeper.unref();

/**
 * محدودکننده‌ی نرخ ساده و درون‌حافظه‌ای.
 * @param {object} opts
 * @param {number} opts.windowMs پنجره‌ی زمانی (میلی‌ثانیه)
 * @param {number} opts.max     حداکثر درخواست در پنجره
 * @param {string} opts.scope   نام فضا (برای جدا نگه‌داشتن شمارنده‌ها)
 * @param {(req)=>string} [opts.keyFn] کلید دلخواه (پیش‌فرض: IP + کاربر)
 * @param {string} [opts.message]
 */
export function rateLimit({ windowMs = 60_000, max = 60, scope = 'global', keyFn, message, skip } = {}) {
  return (req, res, next) => {
    if (skip && skip(req)) return next();
    const identity = keyFn
      ? keyFn(req)
      : `${clientIp(req)}|${req.user?.id || 'anon'}`;
    const key = `${scope}:${identity}`;
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter((t) => t > now - windowMs);
    const retryAfter = Math.ceil(((hits[0] ?? now) + windowMs - now) / 1000);

    res.setHeader('x-ratelimit-limit', String(max));
    res.setHeader('x-ratelimit-remaining', String(Math.max(0, max - hits.length - 1)));

    if (hits.length >= max) {
      res.setHeader('retry-after', String(Math.max(1, retryAfter)));
      return res.status(429).json({
        ok: false,
        error: message || `تعداد درخواست‌ها زیاد است. لطفاً ${Math.max(1, retryAfter)} ثانیه بعد دوباره تلاش کنید.`,
      });
    }
    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}

/**
 * بازنشانی شمارنده‌های محدودیت نرخ و قفل‌های موقت ورود.
 * فقط برای تست‌های خودکار و نگهداری محلی استفاده می‌شود (از طریق سیگنال SIGUSR2).
 * @returns {number} تعداد سطل‌های پاک‌شده
 */
export function resetRateLimits() {
  const count = buckets.size;
  buckets.clear();
  loginFailures.clear();
  return count;
}

/* ------------------------------------------------------------------ */
/*                       قفل حساب در برابر Brute-force                  */
/* ------------------------------------------------------------------ */

const loginFailures = new Map(); // key -> { count, lockedUntil }

export function loginGuardKey(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${clientIp(req)}|${email}`;
}

export function loginGuardStatus(req) {
  const key = loginGuardKey(req);
  const entry = loginFailures.get(key);
  if (!entry) return { locked: false, remaining: config.security.maxLoginAttempts };
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: entry.lockedUntil - Date.now(), remaining: 0 };
  }
  return { locked: false, remaining: Math.max(0, config.security.maxLoginAttempts - entry.count) };
}

export function recordLoginFailure(req) {
  const key = loginGuardKey(req);
  const entry = loginFailures.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= config.security.maxLoginAttempts) {
    entry.lockedUntil = Date.now() + config.security.lockoutMinutes * 60_000;
    entry.count = 0;
  }
  loginFailures.set(key, entry);
  return entry;
}

export function clearLoginFailures(req) {
  loginFailures.delete(loginGuardKey(req));
}

/** میدل‌ور قفل حساب (پیش از بررسی رمز اجرا می‌شود) */
export function loginThrottle(req, res, next) {
  const status = loginGuardStatus(req);
  if (status.locked) {
    const seconds = Math.ceil(status.retryAfterMs / 1000);
    res.setHeader('retry-after', String(seconds));
    return res.status(429).json({
      ok: false,
      error: `به دلیل تلاش‌های ناموفق، ورود موقتاً قفل شده است. ${seconds} ثانیه دیگر تلاش کنید.`,
    });
  }
  next();
}

/* ------------------------------------------------------------------ */
/*                          سیاست رمز عبور                            */
/* ------------------------------------------------------------------ */

const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', 'password', 'qwerty123', '11111111', '1qaz2wsx',
  'admin123', 'easyshop', '123123123', 'zaq12wsx', 'abcd1234', 'password1',
]);

/** بررسی قدرت رمز؛ در صورت نامعتبر بودن، پیام فارسی برمی‌گرداند */
export function checkPasswordPolicy(password, { email } = {}) {
  const pass = String(password || '');
  if (pass.length < config.security.passwordMinLength) {
    return `رمز عبور باید حداقل ${config.security.passwordMinLength} کاراکتر باشد.`;
  }
  if (pass.length > 128) return 'رمز عبور بیش از حد بلند است.';
  if (!/[A-Za-z]/.test(pass) || !/[0-9]/.test(pass)) {
    return 'رمز عبور باید شامل حرف و عدد باشد.';
  }
  if (COMMON_PASSWORDS.has(pass.toLowerCase())) return 'این رمز عبور بسیار رایج و ناامن است.';
  if (email && pass.toLowerCase().includes(String(email).split('@')[0].toLowerCase())) {
    return 'رمز عبور نباید شامل بخشی از ایمیل شما باشد.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*                        پاک‌سازی ورودی‌ها (XSS)                        */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line no-control-regex -- This sanitizer intentionally matches and removes ASCII control characters.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export const escapeHtml = (str) => String(str ?? '').replace(/[&<>"'`]/g, (c) => HTML_ENTITIES[c]);

/** متن امن برای ذخیره‌سازی: حذف تگ‌ها، کنترل‌کاراکترها و کوتاه‌سازی */
export function cleanText(value, { max = 2000, multiline = true } = {}) {
  let text = String(value ?? '');
  text = text.replace(/<\s*(script|style|iframe|object|embed|svg|math|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ');
  text = text.replace(/<\/?[a-z][^>]*>/gi, ' ');
  text = text.replace(CONTROL_CHARS, '');
  if (!multiline) text = text.replace(/[\r\n\t]+/g, ' ');
  text = text.replace(/[ \t]{2,}/g, ' ').trim();
  return text.slice(0, max);
}

const DANGEROUS_TAGS = /<\s*\/?\s*(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|select|textarea|meta|link|base|svg|math|template|noscript|marquee|video|audio|source|track|portal|slot|dialog)\b[^>]*>/gi;
const EVENT_ATTR = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const URL_ATTR = /\s(href|src|xlink:href|formaction|action|data|poster)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const BAD_PROTOCOL = /^\s*(javascript|vbscript|data|file|blob)\s*:/i;

/**
 * پاک‌سازی HTML (خروجی هوش مصنوعی یا محتوای غنی).
 * فقط تگ‌های امن متن باقی می‌مانند و همه‌ی رویدادها/اسکریپت‌ها حذف می‌شوند.
 */
export function sanitizeHtml(html, { max = 20000 } = {}) {
  let out = String(html ?? '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  out = out.replace(DANGEROUS_TAGS, '');
  out = out.replace(EVENT_ATTR, '');
  out = out.replace(URL_ATTR, (_m, attr, value) => {
    const raw = String(value).replace(/^["']|["']$/g, '').trim();
    if (BAD_PROTOCOL.test(raw)) return '';
    if (/^https?:/i.test(raw) || raw.startsWith('/') || raw.startsWith('#')) {
      return ` ${attr}="${escapeHtml(raw)}"`;
    }
    return '';
  });
  // تگ‌های باقی‌مانده را به فهرست سفید محدود می‌کنیم
  const allowed = /^(p|br|hr|b|strong|i|em|u|s|small|span|div|ul|ol|li|h1|h2|h3|h4|h5|h6|blockquote|code|pre|table|thead|tbody|tr|th|td|a|img)$/i;
  out = out.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (match, slash, tag, attrs) => {
    if (!allowed.test(tag)) return '';
    const safeAttrs = String(attrs)
      .replace(EVENT_ATTR, '')
      .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(?:class|id|name|srcset|sizes|contenteditable|draggable|autofocus)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<${slash}${tag.toLowerCase()}${safeAttrs}>`;
  });
  return out.slice(0, max);
}

/** پاک‌سازی خروجی JSON هوش مصنوعی (همه‌ی رشته‌ها) */
export function sanitizeDeep(value, depth = 0) {
  if (depth > 12) return null;
  if (typeof value === 'string') return sanitizeHtml(value, { max: 12000 });
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitizeDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = sanitizeDeep(v, depth + 1);
    }
    return out;
  }
  return null;
}

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf']);

/**
 * میدل‌ور پاک‌سازی بدنه‌ی درخواست:
 *  • حذف کلیدهای خطرناک (Prototype Pollution)
 *  • محدودکردن عمق و تعداد کلیدها
 *  • حذف کنترل‌کاراکترها و کوتاه‌سازی رشته‌ها
 */
export function sanitizePayload(req, _res, next) {
  const clean = (value, depth) => {
    if (depth > config.security.maxBodyDepth) return undefined;
    if (typeof value === 'string') {
      if (value.length > config.security.maxStringLength) value = value.slice(0, config.security.maxStringLength);
      return value.replace(CONTROL_CHARS, '');
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
    if (Array.isArray(value)) {
      return value.slice(0, config.security.maxArrayLength).map((v) => clean(v, depth + 1)).filter((v) => v !== undefined);
    }
    if (value && typeof value === 'object') {
      const out = {};
      let count = 0;
      for (const [k, v] of Object.entries(value)) {
        if (BLOCKED_KEYS.has(k) || k.startsWith('$') || k.includes('\u0000')) continue;
        if (++count > config.security.maxObjectKeys) break;
        const cleaned = clean(v, depth + 1);
        if (cleaned !== undefined) out[k] = cleaned;
      }
      return out;
    }
    return undefined;
  };

  if (req.body && typeof req.body === 'object') {
    const result = clean(req.body, 0);
    req.body = result && typeof result === 'object' ? result : {};
  }
  next();
}

/** تشخیص بارگذاری فایل فعال (SVG/HTML) بر اساس امضای فایل */
export function sniffImageBuffer(buffer) {
  if (!buffer || !buffer.length) return 'unknown';
  const head = buffer.subarray(0, 512);
  const hex = head.toString('hex').toLowerCase();
  const ascii = head.toString('utf8');
  // امضاهای دودویی (Magic Numbers)
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (hex.startsWith('424d')) return 'image/bmp';
  // فرمت‌های متنی خطرناک برای سرو در دامنه‌ی سایت
  if (/<\?xml[^>]*\?>\s*<svg|<svg[\s>]/i.test(ascii)) return 'image/svg+xml';
  if (/<\?php|^\s*<\?/i.test(ascii)) return 'application/x-php';
  if (/<!doctype html|<html[\s>]|<script[\s>]/i.test(ascii)) return 'text/html';
  if (/^\s*(#!|\{|\[)/.test(ascii) && /\$|function|require|import/.test(ascii)) return 'text/plain';
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/*                     محافظت CSRF و بررسی مبدأ (Origin)                */
/* ------------------------------------------------------------------ */

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originAllowed(origin) {
  if (!origin) return true; // درخواست‌های بدون Origin (ابزارها/اپ بومی قدیمی)
  const list = config.security.trustedOrigins;
  if (list.includes('*')) return true;
  if (list.includes(origin)) return true;
  try {
    const { hostname, protocol, port } = new URL(origin);
    const host = port ? `${hostname}:${port}` : hostname;
    // در محیط تولید، میزبان‌های محلی پذیرفته نمی‌شوند (فقط دامنه‌های اعلام‌شده)
    if (!config.isProd && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0')) return true;
    if (protocol === 'capacitor:' || protocol === 'app:' || protocol === 'file:') return true;
    if (config.security.allowPreviewOrigins && /\.(e2b\.app|arena\.ai)$/i.test(hostname)) return true;
    return config.security.trustedOrigins.some((entry) => {
      const clean = entry.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return clean === host;
    });
  } catch {
    return false;
  }
}

/**
 * برای درخواست‌های تغییردهنده، مبدأ درخواست باید مجاز باشد.
 * (توکن‌ها در هدر Authorization هستند و کوکی نداریم، ولی این لایه
 * از سوءاستفاده‌ی CSRF/Clickjacking از دامنه‌ی ثالث جلوگیری می‌کند.)
 */
/**
 * بررسی مجاز بودن مبدأ (برای WebSocket Upgrade نیز استفاده می‌شود).
 * @param {string|undefined} origin مبدأ درخواست
 * @param {string|undefined} host هدر Host برای تطبیق same-origin
 * @returns {boolean}
 */
export function isOriginAllowed(origin, host) {
  if (!origin) return true;
  if (host) {
    try {
      const { host: oHost } = new URL(origin);
      if (oHost === host) return true;
    } catch {
      return false;
    }
  }
  return originAllowed(origin);
}

export function originGuard(req, res, next) {
  if (!config.security.enforceOrigin || !STATE_CHANGING.has(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (isOriginAllowed(origin, req.headers.host)) return next();
  return res.status(403).json({ ok: false, error: 'مبدأ درخواست مجاز نیست.' });
}

/**
 * محدودسازی سراسری query params:
 *  - سقف تعداد پارامترها و طول هر مقدار
 *  - حذف کلیدهای خطرناک (prototype pollution)
 *  - مقدار logical برای page/limit
 */
export function sanitizeQuery(req, res, next) {
  const q = req.query;
  if (!q || typeof q !== 'object') return next();
  const keys = Object.keys(q);
  if (keys.length > 40) {
    return res.status(400).json({ ok: false, error: 'تعداد پارامترهای درخواست بیش از حد مجاز است.' });
  }
  for (const key of keys) {
    if (key.length > 60 || BLOCKED_KEYS.has(key) || key.startsWith('$') || key.includes('.')) {
      delete q[key];
      continue;
    }
    const value = q[key];
    if (typeof value === 'string') {
      q[key] = cleanText(value, { max: 300, multiline: false });
    } else if (Array.isArray(value)) {
      q[key] = value.slice(0, 10).map((v) => (typeof v === 'string' ? cleanText(v, { max: 300, multiline: false }) : v));
    }
  }
  if (q.page !== undefined) {
    q.page = String(Math.min(10_000, Math.max(1, Math.round(Number(q.page) || 1))));
  }
  if (q.limit !== undefined) {
    q.limit = String(Math.min(1000, Math.max(1, Math.round(Number(q.limit) || 20))));
  }
  return next();
}

/** جلوگیری از ذخیره‌ی پاسخ‌های خصوصی در کش‌ها */
export function noStore(_req, res, next) {
  res.setHeader('cache-control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('pragma', 'no-cache');
  next();
}

/**
 * ابطال همه‌ی نشست‌های کاربر + ثبت تلاش ورود.
 * (به‌صورت تابع مستقل تا از وابستگی حلقه‌ای بین auth.js و security.js جلوگیری شود)
 */
export function revokeAllSessionsSafe(userId) {
  run('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', userId);
  run('UPDATE users SET token_version = COALESCE(token_version,0) + 1, updated_at = ? WHERE id = ?', nowIso(), userId);
}

/** ثبت تلاش ورود در جدول حسابرسی */
export function logLoginAttempt({ req, email, success }) {
  try {
    run(
      'INSERT INTO login_attempts (id,email,ip,success,user_agent,created_at) VALUES (?,?,?,?,?,?)',
      uid('lgn'), String(email || '').toLowerCase().slice(0, 160), clientIp(req), success ? 1 : 0,
      String(req.headers['user-agent'] || '').slice(0, 200), nowIso(),
    );
  } catch {
    /* ثبت لاگ نباید جریان ورود را متوقف کند */
  }
}

/** فایل CSV امن در برابر CSV/Formula Injection */
export function csvSafe(value) {
  let text = String(value ?? '').replace(/[\r\n]+/g, ' ');
  // خنثی‌سازی فرمول‌های Excel/Sheets/LibreOffice
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  // نقل‌قول‌گذاری استاندارد RFC4180 برای فیلدهای دارای کاما/نقل‌قول
  if (/[",;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
