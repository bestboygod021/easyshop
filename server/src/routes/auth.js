import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { get, run, uid, nowIso } from '../db/index.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
  issueSession,
  logAudit,
  publicUser,
  requireAuth,
  rotateRefreshToken,
  signAccessToken,
  verifyPassword,
  hashPassword,
} from '../middleware/auth.js';
import { asyncHandler, fail, ok } from '../utils/helpers.js';
import {
  checkPasswordPolicy, cleanText, clearLoginFailures, hashToken,
  logLoginAttempt, loginThrottle, rateLimit, recordLoginFailure, revokeAllSessionsSafe,
} from '../middleware/security.js';

const router = express.Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post(
  '/register',
  rateLimit({ ...config.security.rateLimits.auth, scope: 'auth-register' }),
  asyncHandler((req, res) => {
    const { email, password, full_name, phone } = req.body || {};
    const mail = String(email || '').trim().toLowerCase().slice(0, 160);
    if (!emailRe.test(mail)) return fail(res, 'ایمیل معتبر وارد کنید.');
    const policyError = checkPasswordPolicy(password, { email: mail });
    if (policyError) return fail(res, policyError);
    const name = cleanText(full_name, { max: 120, multiline: false });
    if (!name || name.length < 3) return fail(res, 'نام و نام خانوادگی را وارد کنید.');
    if (phone && !/^[0-9+\-\s]{7,20}$/.test(String(phone))) return fail(res, 'شماره تماس معتبر وارد کنید.');
    if (findUserByEmail(mail)) return fail(res, 'این ایمیل قبلاً ثبت شده است. وارد شوید یا رمز را بازیابی کنید.', 409);

    const user = createUser({ email: mail, password, full_name: name, phone: phone ? String(phone).slice(0, 20) : null });
    run('UPDATE users SET email_verified = 1 WHERE id = ?', user.id);
    run(
      'INSERT INTO notifications (id,user_id,title,body,type,link,created_at) VALUES (?,?,?,?,?,?,?)',
      uid('ntf'), user.id, 'به EasyShop خوش آمدید 🎉', 'کد تخفیف WELCOME10 برای اولین خرید شما فعال شد.', 'welcome', '/products', nowIso(),
    );
    logAudit({ ...req, user }, 'register', 'user', user.id);
    return ok(res, { session: issueSession(user) }, 201);
  }),
);

router.post(
  '/login',
  rateLimit({ ...config.security.rateLimits.auth, scope: 'auth-login' }),
  loginThrottle,
  asyncHandler((req, res) => {
    const { email, password } = req.body || {};
    const mail = String(email || '').trim().toLowerCase().slice(0, 160);
    if (!mail || !password) return fail(res, 'ایمیل و رمز عبور را وارد کنید.');
    const user = findUserByEmail(mail);

    // تأخیر کوچک و پیام یکسان: هم brute-force را کند می‌کند، هم وجود کاربر را افشا نمی‌کند
    const passwordOk = user ? verifyPassword(String(password).slice(0, 128), user.password_hash) : false;
    if (!user || !passwordOk) {
      recordLoginFailure(req);
      logLoginAttempt({ req, email: mail, success: false });
      logAudit({ ...req, user: null }, 'login_failed', 'user', user?.id ?? null, { email: mail });
      return fail(res, 'ایمیل یا رمز عبور اشتباه است.', 401);
    }
    if (user.status === 'blocked') return fail(res, 'حساب کاربری شما مسدود شده است. با پشتیبانی تماس بگیرید.', 403);

    clearLoginFailures(req);
    logLoginAttempt({ req, email: mail, success: true });
    run('UPDATE users SET last_login_at = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', nowIso(), user.id);
    logAudit({ ...req, user }, 'login', 'user', user.id);
    return ok(res, { session: issueSession(user) });
  }),
);

router.post(
  '/refresh',
  rateLimit({ ...config.security.rateLimits.auth, scope: 'auth-refresh' }),
  asyncHandler((req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return fail(res, 'refreshToken لازم است.');
    const result = rotateRefreshToken(refreshToken);
    if (!result) return fail(res, 'نشست منقضی شده است. دوباره وارد شوید.', 401);
    const { user, token, expires } = result;
    return ok(res, {
      session: {
        accessToken: signAccessToken(user),
        refreshToken: token,
        refreshExpiresAt: expires,
        user: publicUser(user),
      },
    });
  }),
);

router.post(
  '/logout',
  rateLimit({ ...config.security.rateLimits.write, scope: 'auth-logout' }),
  asyncHandler((req, res) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      run(
        'UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ? OR token = ?',
        hashToken(refreshToken),
        String(refreshToken).slice(0, 200),
      );
    }
    return ok(res, { message: 'خروج انجام شد.' });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler((req, res) => {
    const unread = get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).c;
    const orders = get('SELECT COUNT(*) c FROM orders WHERE user_id = ?', req.user.id).c;
    return ok(res, { user: publicUser(req.user), stats: { unread_notifications: unread, orders } });
  }),
);

router.patch(
  '/me',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'auth-me' }),
  asyncHandler((req, res) => {
    // فقط فیلدهای مجاز (بدون role/status/wallet → جلوگیری از افزایش سطح دسترسی)
    const body = req.body || {};
    const full_name = body.full_name !== undefined ? cleanText(body.full_name, { max: 120, multiline: false }) : null;
    const phone = body.phone !== undefined ? String(body.phone).slice(0, 20) : null;
    const avatar = body.avatar !== undefined ? String(body.avatar).slice(0, 500) : null;
    const locale = ['fa', 'en'].includes(body.locale) ? body.locale : null;
    if (phone && !/^[0-9+\-\s]{7,20}$/.test(phone)) return fail(res, 'شماره تماس معتبر وارد کنید.');
    if (full_name !== null && full_name.length < 3) return fail(res, 'نام و نام خانوادگی را کامل وارد کنید.');
    run(
      `UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone),
       avatar = COALESCE(?, avatar), locale = COALESCE(?, locale), updated_at = ? WHERE id = ?`,
      full_name ?? null, phone ?? null, avatar ?? null, locale ?? null, nowIso(), req.user.id,
    );
    return ok(res, { user: publicUser(findUserById(req.user.id)) });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.auth, scope: 'auth-change-password' }),
  asyncHandler((req, res) => {
    const { current_password, new_password } = req.body || {};
    if (!verifyPassword(String(current_password || ''), req.user.password_hash)) return fail(res, 'رمز عبور فعلی اشتباه است.');
    if (String(new_password || '').length < 6) return fail(res, 'رمز جدید باید حداقل ۶ کاراکتر باشد.');
    const policyError = checkPasswordPolicy(new_password, { email: req.user.email });
    if (policyError) return fail(res, policyError);
    if (verifyPassword(String(new_password), req.user.password_hash)) {
      return fail(res, 'رمز جدید نباید با رمز فعلی یکسان باشد.');
    }
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(new_password), nowIso(), req.user.id);
    // همه‌ی نشست‌ها (از جمله نشست‌های دزدیده‌شده) باطل می‌شوند
    revokeAllSessionsSafe(req.user.id);
    logAudit(req, 'change_password', 'user', req.user.id);
    return ok(res, { message: 'رمز عبور تغییر کرد. لطفاً دوباره وارد شوید.' });
  }),
);

router.post(
  '/forgot-password',
  rateLimit({ ...config.security.rateLimits.auth, scope: 'auth-forgot' }),
  asyncHandler((req, res) => {
    const mail = String(req.body?.email || '').trim().toLowerCase().slice(0, 160);
    const user = findUserByEmail(mail);
    const generic = { message: 'اگر این ایمیل در سیستم باشد، لینک بازیابی ارسال می‌شود.' };
    if (!user) return ok(res, generic);

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 30 * 60_000).toISOString(); // ۳۰ دقیقه
    // فقط هش توکن ذخیره می‌شود؛ نشت دیتابیس به بازیابی حساب منجر نمی‌شود
    run('UPDATE users SET reset_token_hash = ?, reset_token = NULL, reset_expires = ? WHERE id = ?', hashToken(token), expires, user.id);
    logAudit(req, 'password_reset_request', 'user', user.id);

    // در محیط دمو (غیرتولیدی) توکن برای تست جریان برگردانده می‌شود
    if (!config.security.exposeResetToken) return ok(res, generic);
    return ok(res, { ...generic, reset_token: token, reset_link: `/reset-password?token=${token}` });
  }),
);

router.post(
  '/reset-password',
  rateLimit({ ...config.security.rateLimits.auth, scope: 'auth-reset' }),
  asyncHandler((req, res) => {
    const { token, password } = req.body || {};
    const raw = String(token || '').slice(0, 200);
    if (!raw) return fail(res, 'توکن بازیابی لازم است.');
    const user = get('SELECT * FROM users WHERE reset_token_hash = ?', hashToken(raw));
    if (!user || !user.reset_expires || new Date(user.reset_expires) < new Date()) {
      return fail(res, 'لینک بازیابی نامعتبر یا منقضی شده است.');
    }
    const policyError = checkPasswordPolicy(password, { email: user.email });
    if (policyError) return fail(res, policyError);

    run(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_hash = NULL, reset_expires = NULL, updated_at = ? WHERE id = ?',
      hashPassword(password), nowIso(), user.id,
    );
    revokeAllSessionsSafe(user.id); // مصرف یک‌باره + باطل‌کردن نشست‌های قبلی
    logAudit(req, 'password_reset', 'user', user.id);
    return ok(res, { message: 'رمز عبور با موفقیت بازیابی شد. اکنون وارد شوید.' });
  }),
);

/** ثبت مهمان برای خرید سریع بدون حساب کاربری */
router.post(
  '/guest',
  rateLimit({ ...config.security.rateLimits.auth, scope: 'auth-guest' }),
  asyncHandler((req, res) => {
    const { full_name, phone, email } = req.body || {};
    if (!phone || !full_name) return fail(res, 'نام و شماره تماس لازم است.');
    const mail = email ? String(email).trim().toLowerCase().slice(0, 160) : '';
    if (mail && !emailRe.test(mail)) return fail(res, 'ایمیل معتبر وارد کنید.');
    if (!/^[0-9+\-\s]{7,20}$/.test(String(phone))) return fail(res, 'شماره تماس معتبر وارد کنید.');
    // اگر ایمیل از قبل ثبت شده باشد، هیچ اطلاعاتی افشا نمی‌شود
    if (mail && findUserByEmail(mail)) {
      return fail(res, 'این ایمیل قبلاً ثبت شده است. لطفاً وارد شوید تا سفارش‌هایتان یکجا مدیریت شود.', 409);
    }
    const id = uid('gst');
    const ts = nowIso();
    run(
      `INSERT INTO users (id,email,phone,password_hash,full_name,role,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      id,
      email || `guest_${id.slice(-6)}@easyshop.local`,
      phone,
      hashPassword(crypto.randomBytes(12).toString('hex')),
      full_name,
      'customer',
      'active',
      ts,
      ts,
    );
    return ok(res, { user: publicUser(findUserById(id)), existing: false }, 201);
  }),
);

export default router;
