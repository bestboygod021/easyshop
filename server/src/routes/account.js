import express from 'express';
import { all, get, getSettings, nowIso, parseJson, run, tx, uid } from '../db/index.js';
import { logAudit, requireAuth } from '../middleware/auth.js';
import { asyncHandler, fail, ok, paginate, productPublic } from '../utils/helpers.js';
import { config } from '../config.js';
import { cleanText, clientIp, rateLimit } from '../middleware/security.js';

const router = express.Router();
router.use(requireAuth);

/* ------------------------------- آدرس‌ها -------------------------------- */
router.get(
  '/addresses',
  asyncHandler((req, res) => ok(res, { items: all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', req.user.id) })),
);

router.post(
  '/addresses',
  asyncHandler((req, res) => {
    const isDefault = Boolean(req.body?.is_default);
    const receiver = cleanText(req.body?.receiver, { max: 80, multiline: false });
    const phone = String(req.body?.phone || '').replace(/[^0-9+\-\s]/g, '').slice(0, 20);
    const line = cleanText(req.body?.line, { max: 300, multiline: false });
    const title = cleanText(req.body?.title, { max: 60, multiline: false }) || 'آدرس من';
    const province = cleanText(req.body?.province, { max: 60, multiline: false }) || null;
    const city = cleanText(req.body?.city, { max: 60, multiline: false }) || null;
    const postalCode = String(req.body?.postal_code || '').replace(/[^0-9-]/g, '').slice(0, 20) || null;
    if (!receiver || !phone || !line) return fail(res, 'نام گیرنده، تلفن و نشانی الزامی است.');
    if (!/^[0-9+\-\s]{7,20}$/.test(phone)) return fail(res, 'شماره تماس معتبر وارد کنید.');
    if (postalCode && !/^[0-9-]{8,12}$/.test(postalCode)) return fail(res, 'کد پستی معتبر وارد کنید.');
    if (all('SELECT id FROM addresses WHERE user_id = ?', req.user.id).length >= 20) {
      return fail(res, 'حداکثر ۲۰ آدرس برای هر کاربر مجاز است.', 429);
    }
    const id = uid('adr');
    if (isDefault) run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', req.user.id);
    run(
      `INSERT INTO addresses (id,user_id,title,receiver,phone,province,city,postal_code,line,is_default,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, req.user.id, title, receiver, phone, province, city, postalCode, line, isDefault ? 1 : 0, nowIso(),
    );
    return ok(res, { address: get('SELECT * FROM addresses WHERE id = ?', id) }, 201);
  }),
);

router.put(
  '/addresses/:id',
  asyncHandler((req, res) => {
    const addr = get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!addr) return fail(res, 'آدرس یافت نشد.', 404);
    const b = req.body || {};
    const phone = b.phone !== undefined ? String(b.phone).replace(/[^0-9+\-\s]/g, '').slice(0, 20) : null;
    if (phone !== null && !/^[0-9+\-\s]{7,20}$/.test(phone)) return fail(res, 'شماره تماس معتبر وارد کنید.');
    if (b.is_default) run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', req.user.id);
    run(
      `UPDATE addresses SET title = COALESCE(?, title), receiver = COALESCE(?, receiver), phone = COALESCE(?, phone),
       province = COALESCE(?, province), city = COALESCE(?, city), postal_code = COALESCE(?, postal_code),
       line = COALESCE(?, line), is_default = COALESCE(?, is_default) WHERE id = ?`,
      b.title !== undefined ? cleanText(b.title, { max: 60, multiline: false }) : null,
      b.receiver !== undefined ? cleanText(b.receiver, { max: 80, multiline: false }) : null,
      phone,
      b.province !== undefined ? cleanText(b.province, { max: 60, multiline: false }) : null,
      b.city !== undefined ? cleanText(b.city, { max: 60, multiline: false }) : null,
      b.postal_code !== undefined ? String(b.postal_code).replace(/[^0-9-]/g, '').slice(0, 20) : null,
      b.line !== undefined ? cleanText(b.line, { max: 300, multiline: false }) : null,
      b.is_default !== undefined ? (b.is_default ? 1 : 0) : null, addr.id,
    );
    return ok(res, { address: get('SELECT * FROM addresses WHERE id = ?', addr.id) });
  }),
);

router.delete(
  '/addresses/:id',
  asyncHandler((req, res) => {
    run('DELETE FROM addresses WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    return ok(res, { message: 'آدرس حذف شد.' });
  }),
);

/* ------------------------------- کیف پول -------------------------------- */
router.get(
  '/wallet',
  asyncHandler((req, res) => {
    const user = get('SELECT wallet, loyalty_points FROM users WHERE id = ?', req.user.id);
    const transactions = all('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 60', req.user.id);
    const settings = getSettings();
    return ok(res, {
      wallet: user.wallet,
      loyalty_points: user.loyalty_points,
      loyalty_value: user.loyalty_points * 1000,
      cashback_percent: settings.commerce?.cashback_percent ?? 2,
      transactions,
    });
  }),
);

router.post(
  '/wallet/topup',
  rateLimit({ ...config.security.rateLimits.write, scope: 'wallet-topup' }),
  asyncHandler((req, res) => {
    const raw = Number(req.body?.amount);
    // فقط عدد صحیح و در محدوده‌ی مجاز: جلوگیری از شارژ بی‌نهایت/منفی/اعشاری
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) return fail(res, 'مبلغ شارژ باید یک عدد صحیح باشد.');
    const amount = raw;
    if (amount < 10_000) return fail(res, 'حداقل مبلغ شارژ ۱۰٬۰۰۰ تومان است.');
    if (amount > config.security.maxWalletTopup) {
      return fail(res, `حداکثر مبلغ هر شارژ ${config.security.maxWalletTopup.toLocaleString('fa-IR')} تومان است.`);
    }

    const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
    // سقف روزانه‌ی شارژ (جلوگیری از سوءاستفاده‌ی خودکار/پول‌شویی ساده)
    const todaySum = get(
      "SELECT COALESCE(SUM(amount),0) s FROM wallet_topups WHERE user_id = ? AND status = 'paid' AND created_at > datetime('now','-1 day')",
      user.id,
    ).s;
    if (todaySum + amount > config.security.maxWalletTopupDaily) {
      return fail(res, 'سقف شارژ روزانه‌ی کیف پول رعایت نشده است.', 429);
    }

    const ref = `TOPUP-${uid('').slice(-6)}`;
    const topupId = uid('wtp');
    const ts = nowIso();
    tx(() => {
      run('UPDATE users SET wallet = wallet + ? WHERE id = ?', amount, user.id);
      run(
        'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
        uid('wtx'), user.id, amount, 'credit', 'شارژ کیف پول', ref, user.wallet + amount, ts,
      );
      run(
        `INSERT INTO wallet_topups (id,user_id,amount,gateway,ref_id,status,ip,created_at,verified_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        topupId, user.id, amount, 'mock', ref, 'paid', clientIp(req), ts, ts,
      );
    });
    logAudit(req, 'wallet_topup', 'user', user.id, { amount, ref });
    return ok(res, { message: 'کیف پول شارژ شد.', wallet: user.wallet + amount, ref });
  }),
);

router.post(
  '/loyalty/convert',
  rateLimit({ ...config.security.rateLimits.write, scope: 'loyalty-convert' }),
  asyncHandler((req, res) => {
    const rawPoints = Number(req.body?.points);
    if (!Number.isFinite(rawPoints) || !Number.isInteger(rawPoints) || rawPoints < 10) {
      return fail(res, 'حداقل امتیاز قابل تبدیل ۱۰ است.');
    }
    const points = rawPoints;
    const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
    if (points > user.loyalty_points) return fail(res, 'امتیاز کافی ندارید.');
    const value = points * 1000;
    run('UPDATE users SET loyalty_points = loyalty_points - ?, wallet = wallet + ? WHERE id = ?', points, value, user.id);
    run(
      'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
      uid('wtx'), user.id, value, 'credit', 'تبدیل امتیاز باشگاه مشتریان', `${points} امتیاز`, user.wallet + value, nowIso(),
    );
    return ok(res, { message: `${points} امتیاز به ${value.toLocaleString('fa-IR')} تومان تبدیل شد.`, wallet: user.wallet + value });
  }),
);

/* ----------------------------- علاقه‌مندی‌ها ----------------------------- */
router.get(
  '/wishlist',
  asyncHandler((req, res) => {
    const rows = all(
      `SELECT p.*, c.name_fa AS category_name, c.slug AS category_slug, w.created_at AS added_at
       FROM wishlist w JOIN products p ON p.id = w.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE w.user_id = ? ORDER BY w.created_at DESC`,
      req.user.id,
    );
    return ok(res, { items: rows.map((r) => ({ ...productPublic(r, { withDescription: false }), added_at: r.added_at })) });
  }),
);

router.post(
  '/wishlist/:productId',
  rateLimit({ ...config.security.rateLimits.write, scope: 'wishlist' }),
  asyncHandler((req, res) => {
    const product = get('SELECT id FROM products WHERE id = ? OR slug = ?', req.params.productId, req.params.productId);
    if (!product) return fail(res, 'محصول یافت نشد.', 404);
    const exists = get('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?', req.user.id, product.id);
    if (exists) {
      run('DELETE FROM wishlist WHERE id = ?', exists.id);
      return ok(res, { in_wishlist: false, message: 'از علاقه‌مندی‌ها حذف شد.' });
    }
    run('INSERT INTO wishlist (id,user_id,product_id,created_at) VALUES (?,?,?,?)', uid('wsh'), req.user.id, product.id, nowIso());
    return ok(res, { in_wishlist: true, message: 'به علاقه‌مندی‌ها اضافه شد.' });
  }),
);

/* ------------------------------- اعلان‌ها -------------------------------- */
router.get(
  '/notifications',
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 30, 100);
    const items = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', req.user.id, limit, offset);
    const unread = get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).c;
    return ok(res, { items, unread });
  }),
);

router.post(
  '/notifications/read',
  asyncHandler((req, res) => {
    if (req.body?.id) run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', req.body.id, req.user.id);
    else run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', req.user.id);
    return ok(res, { message: 'اعلان‌ها خوانده شد.' });
  }),
);

/* ------------------------------ داشبورد من ------------------------------ */
router.get(
  '/dashboard',
  asyncHandler((req, res) => {
    const orders = all('SELECT * FROM orders WHERE user_id = ? ORDER BY placed_at DESC LIMIT 5', req.user.id);
    const totalSpent = get("SELECT COALESCE(SUM(total),0) s FROM orders WHERE user_id = ? AND payment_status='paid'", req.user.id).s;
    const orderCount = get('SELECT COUNT(*) c FROM orders WHERE user_id = ?', req.user.id).c;
    const openTickets = get("SELECT COUNT(*) c FROM tickets WHERE user_id = ? AND status NOT IN ('closed','resolved')", req.user.id).c;
    const wishlist = get('SELECT COUNT(*) c FROM wishlist WHERE user_id = ?', req.user.id).c;
    const user = get('SELECT wallet, loyalty_points FROM users WHERE id = ?', req.user.id);
    const timeline = all(
      `SELECT DATE(placed_at) d, COALESCE(SUM(total),0) total FROM orders
       WHERE user_id = ? AND placed_at >= datetime('now','-6 months') GROUP BY DATE(placed_at) ORDER BY d`,
      req.user.id,
    );
    return ok(res, {
      stats: { total_spent: totalSpent, orders: orderCount, open_tickets: openTickets, wishlist, wallet: user.wallet, loyalty_points: user.loyalty_points },
      recent_orders: orders.map((o) => ({
        id: o.id, code: o.code, status: o.status, total: o.total, placed_at: o.placed_at,
        item_count: get('SELECT COUNT(*) c FROM order_items WHERE order_id = ?', o.id).c,
      })),
      timeline,
      notifications: all('SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 5', req.user.id),
    });
  }),
);

/* --------------------------- بازدیدهای اخیر ---------------------------- */
router.get(
  '/recently-viewed',
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'recently-viewed' }),
  asyncHandler((req, res) => {
    const items = all(
      `SELECT p.*, c.name_fa AS category_name, c.slug AS category_slug FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status='active' ORDER BY p.view_count DESC LIMIT 8`,
    );
    return ok(res, { items: items.map((r) => productPublic(r, { withDescription: false })) });
  }),
);

/* ------------------------------ تیکت‌های من ------------------------------ */
router.get(
  '/summary',
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'account-summary' }),
  asyncHandler((req, res) => {
    const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
    return ok(res, {
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, wallet: user.wallet, loyalty_points: user.loyalty_points, avatar: user.avatar, created_at: user.created_at },
      counters: {
        orders: get('SELECT COUNT(*) c FROM orders WHERE user_id = ?', req.user.id).c,
        tickets: get('SELECT COUNT(*) c FROM tickets WHERE user_id = ?', req.user.id).c,
        addresses: get('SELECT COUNT(*) c FROM addresses WHERE user_id = ?', req.user.id).c,
        wishlist: get('SELECT COUNT(*) c FROM wishlist WHERE user_id = ?', req.user.id).c,
        notifications: get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).c,
      },
    });
  }),
);

export default router;
