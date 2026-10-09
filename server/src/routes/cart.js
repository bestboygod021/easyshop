import express from 'express';
import { all, get, run, uid, nowIso, getSettings } from '../db/index.js';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler, cartItems, cartTotals, fail, getCart, ok } from '../utils/helpers.js';
import { config } from '../config.js';
import { cleanText, rateLimit } from '../middleware/security.js';

const router = express.Router();

/**
 * کلید نشست سبد مهمان: فقط قالب محدود و قابل پیش‌بینی‌نبودن حداقلی پذیرفته می‌شود
 * (جلوگیری از تزریق مقادیر دلخواه/بلند در دیتابیس و سرقت سبد با حدس کلید)
 */
const SESSION_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const sessionOf = (req) => {
  const raw = req.headers['x-session-key'] || req.query.session_key || req.body?.session_key;
  const key = String(raw || '').trim();
  return SESSION_KEY_RE.test(key) ? key : null;
};

function cartPayload(cart) {
  const items = cart ? cartItems(cart.id) : [];
  const settings = getSettings();
  return {
    cart_id: cart?.id ?? null,
    items,
    totals: cartTotals(cart, items, settings),
    coupon_code: cart?.coupon_code ?? null,
    settings: { commerce: settings.commerce || null },
  };
}

/** GET /api/cart */
router.get(
  '/',
  optionalAuth,
  asyncHandler((req, res) => {
    const cart = getCart(req.user?.id ?? null, sessionOf(req), { create: false });
    return ok(res, cartPayload(cart));
  }),
);

/** POST /api/cart/items — افزودن محصول */
router.post(
  '/items',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'cart-add' }),
  asyncHandler((req, res) => {
    const product_id = String(req.body?.product_id || '').slice(0, 80);
    const variant_id = req.body?.variant_id ? String(req.body.variant_id).slice(0, 80) : null;
    const qty = Number(req.body?.qty) || 1;
    const note = cleanText(req.body?.note, { max: 200, multiline: false }) || null;
    const product = get('SELECT * FROM products WHERE id = ? OR slug = ?', product_id, product_id);
    if (!product || product.status !== 'active') return fail(res, 'محصول یافت نشد یا غیرفعال است.', 404);
    const quantity = Math.max(1, Math.min(20, Number(qty) || 1));
    const variant = variant_id ? get('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', variant_id, product.id) : null;
    const available = variant ? variant.stock : product.stock;
    if (available <= 0) return fail(res, 'این محصول فعلاً موجود نیست.');
    const cart = getCart(req.user?.id ?? null, sessionOf(req));
    const existing = get(
      `SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND COALESCE(variant_id,'') = ?`,
      cart.id, product.id, variant_id || '',
    );
    const newQty = Math.min(available, (existing?.qty || 0) + quantity);
    if (existing) {
      run('UPDATE cart_items SET qty = ?, note = COALESCE(?, note) WHERE id = ?', newQty, note ?? null, existing.id);
    } else {
      run(
        'INSERT INTO cart_items (id,cart_id,product_id,variant_id,qty,note,created_at) VALUES (?,?,?,?,?,?,?)',
        uid('cit'), cart.id, product.id, variant?.id ?? null, newQty, note ?? null, nowIso(),
      );
    }
    run('UPDATE carts SET updated_at = ? WHERE id = ?', nowIso(), cart.id);
    return ok(res, { message: `${product.name_fa} به سبد خرید اضافه شد.`, ...cartPayload(cart) }, 201);
  }),
);

/** PATCH /api/cart/items/:id — تغییر تعداد */
router.patch(
  '/items/:id',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'cart-update' }),
  asyncHandler((req, res) => {
    const cart = getCart(req.user?.id ?? null, sessionOf(req), { create: false });
    if (!cart) return fail(res, 'سبد خرید یافت نشد.', 404);
    const item = get('SELECT * FROM cart_items WHERE id = ? AND cart_id = ?', req.params.id, cart.id);
    if (!item) return fail(res, 'آیتم یافت نشد.', 404);
    const product = get('SELECT * FROM products WHERE id = ?', item.product_id);
    const variant = item.variant_id ? get('SELECT * FROM product_variants WHERE id = ?', item.variant_id) : null;
    const available = variant ? variant.stock : product.stock;
    const qty = Math.max(1, Math.min(available || 1, Number(req.body?.qty) || item.qty));
    run('UPDATE cart_items SET qty = ? WHERE id = ?', qty, item.id);
    run('UPDATE carts SET updated_at = ? WHERE id = ?', nowIso(), cart.id);
    return ok(res, cartPayload(cart));
  }),
);

/** DELETE /api/cart/items/:id */
router.delete(
  '/items/:id',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'cart-remove' }),
  asyncHandler((req, res) => {
    const cart = getCart(req.user?.id ?? null, sessionOf(req), { create: false });
    if (!cart) return fail(res, 'سبد خرید یافت نشد.', 404);
    run('DELETE FROM cart_items WHERE id = ? AND cart_id = ?', req.params.id, cart.id);
    run('UPDATE carts SET updated_at = ? WHERE id = ?', nowIso(), cart.id);
    return ok(res, cartPayload(cart));
  }),
);

/** DELETE /api/cart — خالی کردن سبد */
router.delete(
  '/',
  rateLimit({ ...config.security.rateLimits.write, scope: 'cart-clear' }),
  optionalAuth,
  asyncHandler((req, res) => {
    const cart = getCart(req.user?.id ?? null, sessionOf(req), { create: false });
    if (cart) {
      run('DELETE FROM cart_items WHERE cart_id = ?', cart.id);
      run('UPDATE carts SET coupon_code = NULL, updated_at = ? WHERE id = ?', nowIso(), cart.id);
    }
    return ok(res, cartPayload(cart));
  }),
);

/** POST /api/cart/coupon — اعمال کد تخفیف */
router.post(
  '/coupon',
  optionalAuth,
  rateLimit({ max: 10, windowMs: 10 * 60_000, scope: 'cart-coupon' }),
  asyncHandler((req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase().slice(0, 40);
    if (code && !/^[A-Z0-9_-]{3,40}$/.test(code)) return fail(res, 'کد تخفیف نامعتبر است.');
    const cart = getCart(req.user?.id ?? null, sessionOf(req));
    if (!code) {
      run('UPDATE carts SET coupon_code = NULL WHERE id = ?', cart.id);
      return ok(res, { message: 'کد تخفیف حذف شد.', ...cartPayload(cart) });
    }
    const coupon = get('SELECT * FROM coupons WHERE upper(code) = ? AND is_active = 1', code);
    if (!coupon) return fail(res, 'کد تخفیف نامعتبر است.');
    if (coupon.ends_at && new Date(coupon.ends_at) < new Date()) return fail(res, 'این کد تخفیف منقضی شده است.');
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) return fail(res, 'ظرفیت استفاده از این کد تکمیل شده است.');
    if (req.user) {
      const used = get('SELECT COUNT(*) c FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?', coupon.id, req.user.id).c;
      if (used >= coupon.per_user_limit) return fail(res, 'شما قبلاً از این کد استفاده کرده‌اید.');
    }
    const items = cartItems(cart.id);
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    if (coupon.min_subtotal && subtotal < coupon.min_subtotal) {
      return fail(res, `حداقل مبلغ سفارش برای این کد ${Number(coupon.min_subtotal).toLocaleString('fa-IR')} تومان است.`);
    }
    run('UPDATE carts SET coupon_code = ?, updated_at = ? WHERE id = ?', coupon.code, nowIso(), cart.id);
    return ok(res, { message: 'کد تخفیف اعمال شد.', ...cartPayload({ ...cart, coupon_code: coupon.code }) });
  }),
);

/** POST /api/cart/merge — ادغام سبد مهمان با سبد کاربر پس از ورود */
router.post(
  '/merge',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'cart-merge' }),
  asyncHandler((req, res) => {
    const sessionKey = sessionOf(req);
    if (!req.user || !sessionKey) return fail(res, 'برای ادغام سبد باید وارد شده باشید.');
    const guestCart = get('SELECT * FROM carts WHERE session_key = ? ORDER BY created_at DESC LIMIT 1', sessionKey);
    if (!guestCart) return ok(res, cartPayload(getCart(req.user.id, null, { create: false })));
    const userCart = getCart(req.user.id, null);
    for (const item of all('SELECT * FROM cart_items WHERE cart_id = ?', guestCart.id)) {
      const exists = get(
        `SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND COALESCE(variant_id,'') = ?`,
        userCart.id, item.product_id, item.variant_id || '',
      );
      if (exists) {
        const p = get('SELECT stock FROM products WHERE id = ?', item.product_id);
        const maxQty = Math.max(1, Math.min(20, p?.stock ?? 1));
        run('UPDATE cart_items SET qty = MIN(?, ? + ?) WHERE id = ?', maxQty, exists.qty, item.qty, exists.id);
      }
      else run('UPDATE cart_items SET cart_id = ? WHERE id = ?', userCart.id, item.id);
    }
    run('DELETE FROM carts WHERE id = ?', guestCart.id);
    return ok(res, cartPayload(userCart));
  }),
);

export default router;
