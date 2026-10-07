import express from 'express';
import { all, get, getSettings, notify, nowIso, parseJson, run, stringifyJson, tx, uid } from '../db/index.js';
import { optionalAuth, requireAuth, isStaff, logAudit } from '../middleware/auth.js';
import { asyncHandler, cartItems, cartTotals, fail, getCart, ok, orderPublic, paginate } from '../utils/helpers.js';
import { broadcast } from '../realtime/hub.js';
import { config } from '../config.js';
import { signIntentToken, verifyIntentToken } from '../middleware/auth.js';
import { cleanText, clientIp, rateLimit, safeEqual } from '../middleware/security.js';

const router = express.Router();

function hydrateOrder(order, { withCustomer = false } = {}) {
  const items = all('SELECT * FROM order_items WHERE order_id = ?', order.id);
  const events = all('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC', order.id);
  const payments = all('SELECT id, provider, amount, status, ref_id, created_at, verified_at FROM payments WHERE order_id = ?', order.id);
  const user = withCustomer && order.user_id ? get('SELECT * FROM users WHERE id = ?', order.user_id) : null;
  return orderPublic(order, { items, events, payments, user });
}

/**
 * آزادسازی موجودی رزروشده‌ی سفارش (فقط یک‌بار برای هر سفارش).
 * هنگام لغو، مرجوعی یا پرداخت ناموفق فراخوانی می‌شود.
 */
function releaseReservedStock(order, reason = 'آزادسازی موجودی سفارش') {
  const fresh = get('SELECT * FROM orders WHERE id = ?', order.id) || order;
  if (!fresh.stock_committed) return false;
  const items = all('SELECT * FROM order_items WHERE order_id = ?', fresh.id);
  for (const item of items) {
    if (item.variant_id) run('UPDATE product_variants SET stock = stock + ? WHERE id = ?', item.qty, item.variant_id);
    run('UPDATE products SET stock = stock + ? WHERE id = ?', item.qty, item.product_id);
    run(
      'INSERT INTO inventory_movements (id,product_id,delta,reason,ref,created_at) VALUES (?,?,?,?,?,?)',
      uid('inv'), item.product_id, item.qty, reason, fresh.id, nowIso(),
    );
  }
  run('UPDATE orders SET stock_committed = 0 WHERE id = ?', fresh.id);
  return true;
}

const STATUS_FLOW = ['pending', 'paid', 'processing', 'packed', 'shipped', 'delivered'];
const STATUS_LABELS = {
  pending: 'در انتظار پرداخت',
  paid: 'پرداخت شده',
  processing: 'در حال پردازش',
  packed: 'بسته‌بندی شده',
  shipped: 'ارسال شده',
  delivered: 'تحویل داده شده',
  cancelled: 'لغو شده',
  refunded: 'بازگردانده شده',
  returned: 'مرجوع شده',
};

/** POST /api/orders/checkout — نهایی‌سازی سفارش از سبد خرید */
router.post(
  '/checkout',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'checkout' }),
  asyncHandler((req, res) => {
    const settings = getSettings();
    const commerce = settings.commerce || {};
    const b = req.body || {};
    const sessionKey = req.headers['x-session-key'] || b.session_key || null;
    const cart = getCart(req.user?.id ?? null, sessionKey, { create: false });
    if (!cart) return fail(res, 'سبد خرید خالی است.');
    const items = cartItems(cart.id);
    if (!items.length) return fail(res, 'سبد خرید خالی است.');
    const invalid = items.find((i) => !i.available);
    if (invalid) return fail(res, `«${invalid.name}» موجودی کافی ندارد. لطفاً سبد را به‌روزرسانی کنید.`);

    // فقط روش‌های شناخته‌شده پذیرفته می‌شوند
    const SHIPPING_METHODS = ['post', 'tipax', 'peyk', 'in_person', 'express', 'pickup'];
    const PAYMENT_METHODS = ['gateway', 'wallet', 'cod', 'installment'];
    const shipping = SHIPPING_METHODS.includes(b.shipping_method) ? b.shipping_method : 'post';
    const paymentMethodRequested = PAYMENT_METHODS.includes(b.payment_method) ? b.payment_method : 'gateway';
    if (b.payment_method && !PAYMENT_METHODS.includes(b.payment_method)) return fail(res, 'روش پرداخت نامعتبر است.');
    if (b.shipping_method && !SHIPPING_METHODS.includes(b.shipping_method)) return fail(res, 'روش ارسال نامعتبر است.');

    let address = b.address;
    if (address && typeof address === 'object') {
      address = {
        receiver: cleanText(address.receiver, { max: 80, multiline: false }),
        phone: String(address.phone || '').replace(/[^0-9+\-\s]/g, '').slice(0, 20),
        province: cleanText(address.province, { max: 60, multiline: false }),
        city: cleanText(address.city, { max: 60, multiline: false }),
        postal_code: String(address.postal_code || '').replace(/[^0-9-]/g, '').slice(0, 20),
        line: cleanText(address.line, { max: 300, multiline: false }),
      };
      if (address.phone && !/^[0-9+\-\s]{7,20}$/.test(address.phone)) return fail(res, 'شماره تماس گیرنده معتبر نیست.');
    }
    if (!address && b.address_id) {
      if (!req.user) return fail(res, 'برای استفاده از آدرس ذخیره‌شده باید وارد شوید.', 401);
      const saved = get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', b.address_id, req.user.id);
      if (!saved) return fail(res, 'آدرس یافت نشد.', 404);
      address = {
        receiver: saved.receiver, phone: saved.phone, province: saved.province,
        city: saved.city, postal_code: saved.postal_code, line: saved.line,
      };
    }
    if (!address?.receiver || !address?.phone || !address?.line) {
      return fail(res, 'اطلاعات گیرنده و آدرس را کامل وارد کنید.');
    }

    // موجودی در لحظه‌ی ثبت سفارش دوباره بررسی می‌شود (جلوگیری از فروش بیش از موجودی)
    const shortage = items.find((i) => {
      const row = i.variant_id
        ? get('SELECT stock FROM product_variants WHERE id = ?', i.variant_id)
        : get('SELECT stock FROM products WHERE id = ?', i.product_id);
      return !row || row.stock < i.qty;
    });
    if (shortage) return fail(res, `موجودی «${shortage.name}» کافی نیست. لطفاً سبد را به‌روزرسانی کنید.`);

    const totals = cartTotals(cart, items, settings);
    const paymentMethod = paymentMethodRequested;
    const useLoyalty = Math.max(0, Math.min(req.user?.loyalty_points || 0, Number(b.use_loyalty) || 0));
    const loyaltyDiscount = useLoyalty * 1000; // هر امتیاز = ۱۰۰۰ تومان
    const finalTotal = Math.max(0, totals.total - loyaltyDiscount);

    const orderId = uid('ord');
    const ts = nowIso();
    const code = `ES-${Date.now().toString().slice(-6)}`;

    tx(() => {
      run(
        `INSERT INTO orders (id,code,user_id,status,payment_status,subtotal,discount,tax,shipping_cost,total,coupon_code,address,
          shipping_method,shipping_carrier,customer_note,loyalty_used,placed_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        orderId, code, req.user?.id ?? null, 'pending', 'unpaid',
        totals.subtotal, totals.discount + loyaltyDiscount, totals.tax, totals.shipping_cost, finalTotal,
        totals.coupon?.code ?? null, stringifyJson(address),
        shipping, cleanText(b.shipping_carrier, { max: 60, multiline: false }) || 'پست پیشتاز',
        cleanText(b.note, { max: 500 }) || null, useLoyalty, ts, ts,
      );
      for (const item of items) {
        run(
          `INSERT INTO order_items (id,order_id,product_id,name_fa,thumbnail,variant_name,unit_price,qty,total)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          uid('oit'), orderId, item.product_id, item.name, item.thumbnail, item.variant_name, item.unit_price, item.qty, item.total,
        );
      }
      run(
        'INSERT INTO order_events (id,order_id,status,note,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?)',
        uid('oev'), orderId, 'pending', 'سفارش ثبت شد و در انتظار پرداخت است.', req.user?.id ?? null, req.user?.full_name ?? 'مهمان', ts,
      );
      if (useLoyalty > 0 && req.user) {
        run('UPDATE users SET loyalty_points = loyalty_points - ? WHERE id = ?', useLoyalty, req.user.id);
      }
      // رزرو موجودی: هر قلم به‌صورت شرطی کم می‌شود تا هم‌زمانی باعث oversell نشود
      for (const item of items) {
        if (item.variant_id) {
          const r = run('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?', item.qty, item.variant_id, item.qty);
          if (!r.changes) throw Object.assign(new Error(`موجودی «${item.name}» کافی نیست.`), { status: 409 });
        } else {
          const r = run('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?', item.qty, item.product_id, item.qty);
          if (!r.changes) throw Object.assign(new Error(`موجودی «${item.name}» کافی نیست.`), { status: 409 });
        }
        run(
          'INSERT INTO inventory_movements (id,product_id,delta,reason,ref,user_id,created_at) VALUES (?,?,?,?,?,?,?)',
          uid('inv'), item.product_id, -item.qty, 'رزرو سفارش', orderId, req.user?.id ?? null, ts,
        );
      }
      run('UPDATE orders SET stock_committed = 1 WHERE id = ?', orderId);
      if (totals.coupon?.code && totals.discount > 0) {
        const coupon = get('SELECT * FROM coupons WHERE code = ?', totals.coupon.code);
        if (coupon) {
          run('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', coupon.id);
          if (req.user) run('INSERT INTO coupon_redemptions (id,coupon_id,user_id,order_id,created_at) VALUES (?,?,?,?,?)', uid('red'), coupon.id, req.user.id, orderId, ts);
        }
      }
    });

    // پرداخت‌ها
    let payment = null;
    if (paymentMethod === 'wallet' && req.user) {
      const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
      if (user.wallet >= finalTotal) {
        run('UPDATE users SET wallet = wallet - ? WHERE id = ?', finalTotal, user.id);
        run(
          'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
          uid('wtx'), user.id, finalTotal, 'debit', 'پرداخت سفارش', code, user.wallet - finalTotal, nowIso(),
        );
        payment = { provider: 'wallet', status: 'paid' };
      } else {
        payment = { provider: 'wallet', status: 'failed', error: 'موجودی کیف پول کافی نیست.' };
      }
    } else if (paymentMethod === 'cod') {
      payment = { provider: 'cod', status: 'pending' };
    } else {
      payment = { provider: 'mock', status: 'pending', authority: `AUTH-${uid('').slice(-8).toUpperCase()}` };
    }

    // سبد پس از ثبت موفق سفارش خالی می‌شود (جلوگیری از سفارش تکراری)
    run('DELETE FROM cart_items WHERE cart_id = ?', cart.id);
    run('UPDATE carts SET coupon_code = NULL, updated_at = ? WHERE id = ?', nowIso(), cart.id);

    if (payment.authority) {
      run(
        'INSERT INTO payments (id,order_id,provider,amount,status,authority,created_at) VALUES (?,?,?,?,?,?,?)',
        uid('pay'), orderId, payment.provider, finalTotal, payment.status, payment.authority, nowIso(),
      );
      // توکن امضاشده‌ی درگاه (شبیه‌سازی بازگشت از درگاه پرداخت)
      const intent = signIntentToken(
        { order_id: orderId, authority: payment.authority, amount: finalTotal, user_id: req.user?.id ?? null },
        config.security.paymentIntentTtlSeconds || 1800,
      );
      run(
        `INSERT INTO checkout_intents (id,order_id,user_id,phone,authority,status,created_at,expires_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        uid('cxi'), orderId, req.user?.id ?? null, address.phone ?? null, payment.authority, 'pending',
        nowIso(), new Date(Date.now() + 30 * 60_000).toISOString(),
      );
      payment.intent_token = intent;
    }

    if (payment.status === 'paid') {
      run("UPDATE orders SET payment_status='paid', status='paid', paid_at=?, updated_at=? WHERE id=?", nowIso(), nowIso(), orderId);
      run(
        'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
        uid('oev'), orderId, 'paid', 'پرداخت با موفقیت انجام شد.', 'کیف پول', nowIso(),
      );
      if (req.user) notify({ userId: req.user.id, title: 'پرداخت موفق', body: `سفارش ${code} پرداخت شد.`, type: 'order', link: `/account/orders/${orderId}` });
    }

    const order = get('SELECT * FROM orders WHERE id = ?', orderId);
    broadcast('admin', { type: 'order:new', order: { code, total: finalTotal } });
    if (req.user) broadcast(`user:${req.user.id}`, { type: 'order:new', order: { id: orderId, code, total: finalTotal } });
    logAudit(req, 'checkout', 'order', orderId, { total: finalTotal, payment: payment.provider });

    return ok(res, { order: hydrateOrder(order), payment }, 201);
  }),
);

/** POST /api/orders/:id/pay — تأیید پرداخت درگاه (شبیه‌سازی/زرین‌پال) */
router.post(
  '/:id/pay',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'order-pay' }),
  asyncHandler((req, res) => {
    const order = get('SELECT * FROM orders WHERE id = ? OR code = ?', req.params.id, req.params.id);
    if (!order) return fail(res, 'سفارش یافت نشد.', 404);
    if (order.payment_status === 'paid') return ok(res, { message: 'این سفارش قبلاً پرداخت شده است.', order: hydrateOrder(order) });
    // --- ۱) احراز مالکیت سفارش (مالک، مهمانِ همان سفارش، یا کارمند) ---
    const address = parseJson(order.address, {});
    const guestPhone = String(req.body?.phone || req.query.phone || '').trim();
    const isOwner = Boolean(req.user && order.user_id === req.user.id);
    const guestOk = !order.user_id && guestPhone && safeEqual(guestPhone, String(address?.phone || ''));
    if (!isOwner && !isStaff(req.user) && !guestOk) {
      return fail(res, 'دسترسی به این سفارش مجاز نیست.', 403);
    }

    const payment = get('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1', order.id);
    if (!payment) return fail(res, 'تراکنش یافت نشد.');
    // --- ۲) اعتبارسنجی بازگشت از درگاه ---
    const authority = String(req.body?.authority || '');
    const intent = verifyIntentToken(req.body?.intent_token || '');
    const intentOk =
      intent &&
      intent.order_id === order.id &&
      safeEqual(String(intent.authority), String(payment.authority || '')) &&
      Number(intent.amount) === Number(order.total);
    const authorityOk = authority && safeEqual(authority, String(payment.authority || ''));
    if (!intentOk && !authorityOk) {
      return fail(res, 'اطلاعات پرداخت نامعتبر است. لطفاً از صفحه‌ی سفارش پرداخت را انجام دهید.', 400);
    }
    const checkoutIntent = payment.authority
      ? get('SELECT * FROM checkout_intents WHERE authority = ? ORDER BY created_at DESC LIMIT 1', payment.authority)
      : null;
    if (checkoutIntent) {
      if (checkoutIntent.status !== 'pending') return fail(res, 'این تراکنش قبلاً بررسی شده است.', 409);
      if (new Date(checkoutIntent.expires_at) < new Date()) {
        run("UPDATE checkout_intents SET status='expired' WHERE id = ?", checkoutIntent.id);
        return fail(res, 'مهلت پرداخت این سفارش به پایان رسیده است. سفارش جدید ثبت کنید.', 410);
      }
    }
    if (checkoutIntent) run('UPDATE checkout_intents SET status = ? WHERE id = ?', req.body?.success === false ? 'failed' : 'paid', checkoutIntent.id);

    // نتیجه‌ی نهایی درگاه: فقط درخواست صریح success=false ناموفق تلقی می‌شود
    const success = req.body?.success !== false;
    const refId = `RF${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`;
    run('UPDATE payments SET status = ?, ref_id = ?, verified_at = ? WHERE id = ?', success ? 'paid' : 'failed', refId, nowIso(), payment.id);
    if (!success) {
      run("UPDATE orders SET payment_status='failed', updated_at=? WHERE id=?", nowIso(), order.id);
      releaseReservedStock(order, 'آزادسازی پس از پرداخت ناموفق');
      return fail(res, 'پرداخت ناموفق بود.');
    }
    run("UPDATE orders SET payment_status='paid', status='paid', paid_at=?, updated_at=? WHERE id=?", nowIso(), nowIso(), order.id);
    run(
      'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
      uid('oev'), order.id, 'paid', `پرداخت تأیید شد. کد پیگیری: ${refId}`, 'درگاه پرداخت', nowIso(),
    );
    if (order.user_id) {
      notify({ userId: order.user_id, title: 'پرداخت موفق', body: `سفارش ${order.code} با موفقیت پرداخت شد.`, type: 'order', link: `/account/orders/${order.id}` });
    }
    broadcast('admin', { type: 'order:paid', order: { code: order.code, ref: refId } });
    return ok(res, { message: 'پرداخت با موفقیت تأیید شد.', order: hydrateOrder(get('SELECT * FROM orders WHERE id = ?', order.id)) });
  }),
);

/** GET /api/orders — سفارش‌های کاربر */
router.get(
  '/',
  requireAuth,
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 10, 50);
    const where = isStaff(req.user) && req.query.all === '1' ? [] : ['o.user_id = ?'];
    const params = isStaff(req.user) && req.query.all === '1' ? [] : [req.user.id];
    if (req.query.status) {
      where.push('o.status = ?');
      params.push(req.query.status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = all(
      `SELECT o.*, u.full_name AS customer_name FROM orders o LEFT JOIN users u ON u.id = o.user_id
       ${clause} ORDER BY o.placed_at DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset,
    );
    const total = get(`SELECT COUNT(*) c FROM orders o ${clause}`, ...params).c;
    return ok(res, {
      items: rows.map((o) => ({ ...hydrateOrder(o, { withCustomer: isStaff(req.user) }), id: o.id })),
      total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/** GET /api/orders/:id */
router.get(
  '/:id',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.track, scope: 'order-get' }),
  asyncHandler((req, res) => {
    const order = get('SELECT * FROM orders WHERE id = ? OR code = ?', req.params.id, req.params.id);
    if (!order) return fail(res, 'سفارش یافت نشد.', 404);
    const isOwner = req.user && order.user_id === req.user.id;
    if (!isOwner && !isStaff(req.user)) {
      // مهمان فقط با تطبیق زمان‌ثابت شماره تماس ثبت‌شده به سفارش دسترسی دارد
      const guestOk = !order.user_id && req.query.phone
        && safeEqual(String(req.query.phone), String(parseJson(order.address, {})?.phone || ''));
      if (!guestOk) return fail(res, 'دسترسی به این سفارش مجاز نیست.', 403);
    }
    return ok(res, { order: hydrateOrder(order, { withCustomer: isStaff(req.user) }), status_labels: STATUS_LABELS, flow: STATUS_FLOW });
  }),
);

/** POST /api/orders/:id/cancel — لغو توسط مشتری */
router.post(
  '/:id/cancel',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'order-cancel' }),
  asyncHandler((req, res) => {
    const order = get('SELECT * FROM orders WHERE id = ? OR code = ?', req.params.id, req.params.id);
    if (!order) return fail(res, 'سفارش یافت نشد.', 404);
    if (order.user_id !== req.user.id && !isStaff(req.user)) return fail(res, 'دسترسی مجاز نیست.', 403);
    if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)) return fail(res, 'این سفارش در وضعیت فعلی قابل لغو نیست.');
    const ts = nowIso();
    run("UPDATE orders SET status='cancelled', cancelled_at=?, updated_at=? WHERE id=?", ts, ts, order.id);
    run(
      'INSERT INTO order_events (id,order_id,status,note,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?)',
      uid('oev'), order.id, 'cancelled', cleanText(req.body?.reason, { max: 300 }) || 'لغو توسط مشتری',
      req.user.id, req.user.full_name, ts,
    );
    // بازگشت موجودی فقط اگر قبلاً رزرو شده باشد (جلوگیری از افزایش موجودی جعلی)
    releaseReservedStock(order, 'لغو سفارش');
    if (order.payment_status === 'paid') {
      const user = get('SELECT * FROM users WHERE id = ?', order.user_id);
      if (user) {
        run('UPDATE users SET wallet = wallet + ? WHERE id = ?', order.total, user.id);
        run(
          'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
          uid('wtx'), user.id, order.total, 'credit', 'بازپرداخت لغو سفارش', order.code, user.wallet + order.total, ts,
        );
        notify({ userId: user.id, title: 'بازپرداخت انجام شد', body: `مبلغ سفارش ${order.code} به کیف پول شما بازگشت.`, type: 'wallet', link: '/account/wallet' });
      }
      run("UPDATE orders SET payment_status='refunded', status='refunded' WHERE id=?", order.id);
      run("UPDATE payments SET status='refunded' WHERE order_id=? AND status='paid'", order.id);
    }
    broadcast('admin', { type: 'order:cancelled', order: { code: order.code } });
    return ok(res, { message: 'سفارش لغو شد و مبلغ به کیف پول بازگشت.', order: hydrateOrder(get('SELECT * FROM orders WHERE id = ?', order.id)) });
  }),
);

/** POST /api/orders/:id/return — درخواست مرجوعی */
router.post(
  '/:id/return',
  rateLimit({ ...config.security.rateLimits.write, scope: 'order-return' }),
  requireAuth,
  asyncHandler((req, res) => {
    const order = get('SELECT * FROM orders WHERE id = ? OR code = ?', req.params.id, req.params.id);
    if (!order) return fail(res, 'سفارش یافت نشد.', 404);
    if (order.user_id !== req.user.id && !isStaff(req.user)) return fail(res, 'دسترسی مجاز نیست.', 403);
    if (order.status !== 'delivered') return fail(res, 'فقط سفارش‌های تحویل‌شده قابل مرجوع کردن هستند.');
    if (get("SELECT id FROM tickets WHERE order_id = ? AND category = 'returns'", order.id)) {
      return fail(res, 'برای این سفارش قبلاً درخواست مرجوعی ثبت شده است.', 409);
    }
    const days = (Date.now() - new Date(order.delivered_at || order.placed_at).getTime()) / 864e5;
    if (days > 7) return fail(res, 'مهلت ۷ روزه‌ی مرجوعی این سفارش به پایان رسیده است.');

    const ticketId = uid('tkt');
    const ts = nowIso();
    run(
      `INSERT INTO tickets (id,code,user_id,order_id,subject,category,priority,status,last_message_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ticketId, `TK-${Date.now().toString().slice(-5)}`, req.user.id, order.id,
      `درخواست مرجوعی سفارش ${order.code}`, 'returns', 'high', 'open', ts, ts, ts,
    );
    run(
      'INSERT INTO ticket_messages (id,ticket_id,user_id,author_name,author_role,body,created_at) VALUES (?,?,?,?,?,?,?)',
      uid('tms'), ticketId, req.user.id, req.user.full_name, 'customer',
      cleanText(req.body?.reason, { max: 800 }) || 'درخواست مرجوعی کالا', ts,
    );
    releaseReservedStock(order, 'مرجوعی سفارش');
    run("UPDATE orders SET status='returned', updated_at=? WHERE id=?", ts, order.id);
    run(
      'INSERT INTO order_events (id,order_id,status,note,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?)',
      uid('oev'), order.id, 'returned', 'درخواست مرجوعی ثبت شد و تیکت پشتیبانی ایجاد گردید.', req.user.id, req.user.full_name, ts,
    );
    broadcast('admin', { type: 'ticket:new', ticket: { id: ticketId } });
    return ok(res, { message: 'درخواست مرجوعی ثبت شد. تیم پشتیبانی تا ۲۴ ساعت آینده با شما تماس می‌گیرد.', ticket_id: ticketId });
  }),
);

/** POST /api/orders/:id/reorder — سفارش مجدد */
router.post(
  '/:id/reorder',
  requireAuth,
  rateLimit({ max: 20, windowMs: 10 * 60_000, scope: 'order-reorder' }),
  asyncHandler((req, res) => {
    const order = get('SELECT * FROM orders WHERE id = ? OR code = ?', req.params.id, req.params.id);
    if (!order || order.user_id !== req.user.id) return fail(res, 'سفارش یافت نشد.', 404);
    const cart = getCart(req.user.id, null);

    // سبد خرید بلافاصله پس از تسویه خالی می‌شود؛ اگر کاربر سبد فعال دارد،
    // سقف تعداد اقلام همان سیاست افزودن به سبد (۲۰) رعایت می‌شود.
    const MAX_CART_ITEMS = 20;
    const current = get('SELECT COUNT(*) c FROM cart_items WHERE cart_id = ?', cart.id).c;
    if (current >= MAX_CART_ITEMS) return fail(res, 'سبد خرید پر است؛ ابتدا برخی اقلام را حذف کنید.', 409);

    let added = 0;
    let skipped = 0;
    for (const item of all('SELECT * FROM order_items WHERE order_id = ?', order.id)) {
      if (current + added >= MAX_CART_ITEMS) { skipped += 1; continue; }
      const product = get('SELECT * FROM products WHERE id = ?', item.product_id);
      if (!product || product.status !== 'active' || product.stock <= 0) { skipped += 1; continue; }
      const qty = Math.max(1, Math.min(20, Number(item.qty) || 1, product.stock));
      const existing = get(
        `SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND COALESCE(variant_id,'') = ?`,
        cart.id, product.id, item.variant_id || '',
      );
      if (existing) {
        const merged = Math.min(product.stock, Math.max(1, existing.qty + qty));
        run('UPDATE cart_items SET qty = ? WHERE id = ?', merged, existing.id);
      } else {
        run(
          'INSERT INTO cart_items (id,cart_id,product_id,variant_id,qty,created_at) VALUES (?,?,?,?,?,?)',
          uid('cit'), cart.id, product.id, item.variant_id ?? null, qty, nowIso(),
        );
      }
      added += 1;
    }
    if (!added) return fail(res, 'هیچ‌یک از اقلام این سفارش در حال حاضر قابل خرید نیست.', 409);
    run('UPDATE carts SET updated_at = ? WHERE id = ?', nowIso(), cart.id);
    return ok(res, {
      message: `${added} قلم به سبد خرید اضافه شد${skipped ? ` (${skipped} قلم ناموجود/نامعتبر نادیده گرفته شد)` : ''}.`,
      added,
      skipped,
      cart_id: cart.id,
    });
  }),
);

export default router;
export { STATUS_LABELS, STATUS_FLOW, hydrateOrder };
