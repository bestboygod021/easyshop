import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { all, audit as writeAudit, get, run, uid, nowIso, parseJson, tx } from '../db/index.js';
import { hashToken, checkPasswordPolicy } from './security.js';

export const hashPassword = (password) => bcrypt.hashSync(password, 10);
export const verifyPassword = (password, hash) => bcrypt.compareSync(password, hash);

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.full_name,
      tv: user.token_version || 0, // نسخه‌ی توکن: با تغییر رمز/مسدودسازی باطل می‌شود
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: 'easyshop', audience: 'easyshop-api' },
  );
}

/** توکن داخلی امضاشده برای جریان پرداخت/شارژ کیف پول */
export function signIntentToken(payload, ttlSeconds = 900) {
  return jwt.sign({ ...payload, typ: 'intent' }, config.jwtSecret, {
    expiresIn: ttlSeconds,
    issuer: 'easyshop',
    audience: 'easyshop-intent',
  });
}

export function verifyIntentToken(token) {
  try {
    return jwt.verify(String(token || ''), config.jwtSecret, {
      issuer: 'easyshop',
      audience: 'easyshop-intent',
    });
  } catch {
    return null;
  }
}

export function signRefreshToken(user, { family } = {}) {
  const token = crypto.randomBytes(48).toString('hex');
  const expires = new Date(Date.now() + config.refreshExpiresDays * 864e5).toISOString();
  const tokenFamily = family || uid('fam');
  run(
    `INSERT INTO refresh_tokens (id,user_id,token,token_hash,family,expires_at,created_at)
     VALUES (?,?,?,?,?,?,?)`,
    uid('rt'),
    user.id,
    // ستون قدیمی برای سازگاری پر می‌شود، ولی جست‌وجو بر اساس هش انجام می‌شود
    hashToken(token),
    hashToken(token),
    tokenFamily,
    expires,
    nowIso(),
  );
  return { token, expires, family: tokenFamily };
}

/** یافتن ردیف توکن تازه‌سازی بر اساس هش (با پشتیبانی از ردیف‌های قدیمی) */
function findRefreshRow(token) {
  const hashed = hashToken(token);
  return (
    get('SELECT * FROM refresh_tokens WHERE token_hash = ?', hashed) ||
    get('SELECT * FROM refresh_tokens WHERE token = ? AND (token_hash IS NULL OR token_hash = ?)', token, hashed)
  );
}

export function rotateRefreshToken(token) {
  const rawToken = typeof token === 'string' ? token.trim() : '';
  if (!rawToken || rawToken.length > 200) return null;

  // یک تراکنش اتمی مانع صدور دو refresh token معتبر در درخواست‌های هم‌زمان می‌شود.
  return tx(() => {
    const row = findRefreshRow(rawToken);
    if (!row) return null;

    // تشخیص استفاده‌ی مجدد از توکن باطل‌شده → کل خانواده‌ی توکن‌ها باطل می‌شود
    if (row.revoked) {
      if (row.family) run('UPDATE refresh_tokens SET revoked = 1 WHERE family = ?', row.family);
      else run('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', row.user_id);
      return null;
    }
    if (new Date(row.expires_at) < new Date()) return null;

    const user = get('SELECT * FROM users WHERE id = ?', row.user_id);
    if (!user || user.status === 'blocked') return null;

    const revoked = run('UPDATE refresh_tokens SET revoked = 1 WHERE id = ? AND revoked = 0', row.id);
    if (!revoked.changes) {
      if (row.family) run('UPDATE refresh_tokens SET revoked = 1 WHERE family = ?', row.family);
      else run('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', row.user_id);
      return null;
    }

    return { user, ...signRefreshToken(user, { family: row.family }) };
  });
}

/** ابطال همه‌ی نشست‌های یک کاربر */
export function revokeAllSessions(userId) {
  run('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', userId);
  run('UPDATE users SET token_version = COALESCE(token_version,0) + 1, updated_at = ? WHERE id = ?', nowIso(), userId);
}

export function revokeRefreshToken(token) {
  const row = findRefreshRow(token);
  if (row) run('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', row.id);
  return Boolean(row);
}

export function publicUser(user) {
  if (!user) return null;
  const {
    password_hash, reset_token, reset_expires, reset_token_hash,
    token_version, device_tokens, notes, ...rest
  } = user;
  return { ...rest, permissions: parseJson(rest.permissions, []) };
}

export function issueSession(user) {
  const accessToken = signAccessToken(user);
  const refresh = signRefreshToken(user);
  return {
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expires,
    user: publicUser(user),
  };
}

export function findUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', id);
}

export function findUserByEmail(email) {
  return get('SELECT * FROM users WHERE lower(email) = lower(?)', String(email || '').trim());
}

export function createUser({ email, password, full_name, phone, role = 'customer', status = 'active', locale = 'fa' }) {
  const policyError = checkPasswordPolicy(password, { email });
  if (policyError) throw Object.assign(new Error(policyError), { status: 400 });
  const id = uid('usr');
  const ts = nowIso();
  run(
    `INSERT INTO users (id,email,phone,password_hash,full_name,role,status,locale,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id,
    String(email).toLowerCase().trim(),
    phone ?? null,
    hashPassword(password),
    String(full_name).trim().slice(0, 120),
    ROLES.includes(role) ? role : 'customer',
    ['active', 'blocked', 'pending'].includes(status) ? status : 'active',
    locale,
    ts,
    ts,
  );
  return findUserById(id);
}

export const ROLES = ['customer', 'support', 'seller', 'admin'];
export const STAFF_ROLES = ['support', 'seller', 'admin'];

export function isStaff(user) {
  return Boolean(user && STAFF_ROLES.includes(user.role));
}
export function isAdmin(user) {
  return Boolean(user && user.role === 'admin');
}

/** Middleware: احراز هویت با JWT (اجباری) */
export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { issuer: 'easyshop', audience: 'easyshop-api' });
    const user = findUserById(payload.sub);
    if (!user) return { error: 'کاربر یافت نشد.' };
    if (user.status === 'blocked') return { error: 'حساب کاربری مسدود شده است.' };
    // اگر رمز تغییر کرده یا نشست‌ها باطل شده‌اند، توکن قدیمی بی‌اعتبار است
    if ((payload.tv || 0) !== (user.token_version || 0)) {
      return { error: 'نشست شما منقضی شده است. دوباره وارد شوید.' };
    }
    return { user };
  } catch {
    return { error: 'توکن نامعتبر یا منقضی شده است.' };
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'توکن احراز هویت ارسال نشده است.' });
  const result = verifyAccessToken(token);
  if (result.error) {
    const status = result.error.includes('مسدود') ? 403 : 401;
    return res.status(status).json({ ok: false, error: result.error });
  }
  req.user = result.user;
  next();
}

/** Middleware: نقش‌های مجاز */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'ابتدا وارد شوید.' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'دسترسی لازم برای این عملیات را ندارید.' });
  }
  next();
};

/** احراز هویت اختیاری (مثلاً برای سبد خرید مهمان) */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    const result = verifyAccessToken(token);
    req.user = result.user || null;
  } else {
    req.user = null;
  }
  next();
}

export function logAudit(req, action, entity, entityId, meta) {
  return writeAudit({
    userId: req.user?.id ?? null,
    userName: req.user?.full_name ?? 'سیستم',
    action,
    entity: entity ?? null,
    entityId: entityId ?? null,
    meta: meta ?? {},
    ip: req.ip ?? null,
  });
}

export function staffUsers() {
  return all("SELECT id, full_name, role, avatar FROM users WHERE role IN ('support','admin','seller') AND status='active'");
}
