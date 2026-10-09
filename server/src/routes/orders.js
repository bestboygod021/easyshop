import express from 'express';
import crypto from 'node:crypto';
import { all, get, getSettings, notify, nowIso, parseJson, run, stringifyJson, tx, uid } from '../db/index.js';
import { optionalAuth, requireAuth, isStaff, logAudit } from '../middleware/auth.js';
import { asyncHandler, cartItems, cartTotals, fail, getCart, HttpError, ok, orderPublic, paginate } from '../utils/helpers.js';
import { broadcast } from '../realtime/hub.js';
import { config } from '../config.js';
import { createGatewayPayment, normalizePaymentProvider, paymentGatewayInfo } from '../services/payment-gateway.js';
import { metricsRegistry } from '../services/metrics.js';
import { signIntentToken, verifyIntentToken } from '../middleware/auth.js';
import { cleanText, rateLimit, safeEqual } from '../middleware/security.js';

const router = express.Router();

const CHECKOUT_IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{16,128}$/;

function checkoutIdempotencyKey(req) {
  const raw = req.get('idempotency-key') ?? req.body?.idempotency_key;
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !CHECKOUT_IDEMPOTENCY_KEY_RE.test(raw)) return false;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function canReplayCheckout(order, req) {
  if (req.user) return order.user_id === req.user.id;
  const requestedPhone = String(req.body?.address?.phone || '').replace(/[^0-9+\\-\\s]/g, '').slice(0, 20);
  const storedPhone = String(parseJson(order.address, {})?.phone || '');
  return !order.user_id && requestedPhone && safeEqual(requestedPhone, storedPhone);
}

function replayPayment(payment, order) {
  if (!payment) return null;
  const payload = parseJson(payment.payload, {});
  const result = {
    provider: payment.provider,
    status: payment.status,
    authority: payment.authority,
    redirect_url: payment.redirect_url,
    expires_at: payment.expires_at,
    ...payload,
  };
  if (payment.provider === 'mock' && payment.status === 'pending' && payment.authority) {
    const seconds = Math.max(1, Math.floor((new Date(payment.expires_at || Date.now() + 1800_000).getTime() - Date.now()) / 1000));
    result.intent_token = signIntentToken(
      { order_id: order.id, authority: payment.authority, amount: Number(payment.amount), user_id: order.user_id ?? null },
      seconds,
    );
  }
  return result;
}

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
    if (item.variant_id) {
      run('UPDATE product_variants SET stock = stock + ? WHERE id = ? AND product_id = ?', item.qty, item.variant_id, item.product_id);
    } else if (item.product_id) {
      run('UPDATE products SET stock = stock + ? WHERE id = ?', item.qty, item.product_id);
    }
    if (item.product_id) {
      run(
        'INSERT INTO inventory_movements (id,product_id,delta,reason,ref,created_at) VALUES (?,?,?,?,?,?)',
        uid('inv'), item.product_id, item.qty, reason, fresh.id, nowIso(),
      );
    }
  }
  run('UPDATE orders SET stock_committed = 0 WHERE id = ?', fresh.id);
  return true;
}

export function releaseOrderReservations(order, reason = 'آزادسازی رزرو سفارش') {
  const fresh = get('SELECT * FROM orders WHERE id = ?', order.id) || order;
  releaseReservedStock(fresh, reason);
  if (fresh.loyalty_reserved && fresh.user_id && Number(fresh.loyalty_used) > 0) {
    run('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?', fresh.loyalty_used, fresh.user_id);
  }
  if (fresh.coupon_reserved && fresh.coupon_code) {
    run('UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE upper(code) = upper(?)', fresh.coupon_code);
    run('DELETE FROM coupon_redemptions WHERE order_id = ?', fresh.id);
  }
  run('UPDATE orders SET loyalty_reserved = 0, coupon_reserved = 0 WHERE id = ?', fresh.id);
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
  asyncHandler(async (req, res) => {
    const checkoutKey = checkoutIdempotencyKey(req);
    if (checkoutKey === false) return fail(res, 'کلید تکرارپذیری checkout باید ۱۶ تا ۱۲۸ نویسه‌ی امن باشد.', 400);
    if (checkoutKey) {
      const existingOrder = get('SELECT * FROM orders WHERE checkout_key = ?', checkoutKey);
      if (existingOrder) {
        if (!canReplayCheckout(existingOrder, req)) return fail(res, 'کلید checkout قبلاً برای درخواست دیگری استفاده شده است.', 409);
        const existingPayment = get('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1', existingOrder.id);
        return ok(res, {
          order: hydrateOrder(existingOrder),
          payment: replayPayment(existingPayment, existingOrder),
        });
      }
    }

    const settings = getSettings();
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
    const PAYMENT_METHODS = ['gateway', 'wallet', 'cod'];
    const shipping = SHIPPING_METHODS.includes(b.shipping_method) ? b.shipping_method : 'post';
    const paymentMethodRequested = PAYMENT_METHODS.includes(b.payment_method) ? b.payment_method : 'gateway';
    if (b.payment_method && !PAYMENT_METHODS.includes(b.payment_method)) return fail(res, 'روش پرداخت نامعتبر است.');
    if (b.shipping_method && !SHIPPING_METHODS.includes(b.shipping_method)) return fail(res, 'روش ارسال نامعتبر است.');
    const gatewayProvider = paymentMethodRequested === 'gateway'
      ? normalizePaymentProvider(b.payment_provider || config.payment.provider || (config.isProd ? 'disabled' : 'mock'))
      : null;
    const gatewayInfo = gatewayProvider ? paymentGatewayInfo(gatewayProvider) : null;
    if (gatewayProvider === 'mock' && (config.isProd || !config.payment.allowMock)) {
      return fail(res, 'پرداخت آزمایشی در این محیط غیرفعال است؛ درگاه واقعی را پیکربندی کنید یا از روش دیگری استفاده کنید.', 503);
    }
    if (gatewayInfo && !gatewayInfo.enabled) {
      return fail(res, gatewayInfo.reason || 'درگاه انتخاب‌شده در دسترس نیست.', 503);
    }

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
    if (paymentMethodRequested === 'wallet' && !req.user) {
      return fail(res, 'برای پرداخت از کیف پول ابتدا وارد حساب شوید.', 401);
    }
    if (paymentMethodRequested === 'cod'
      && (String(address.city || '').trim() !== 'تهران' || !['peyk', 'in_person'].includes(shipping))) {
      return fail(res, 'پرداخت در محل فقط برای ارسال شهری تهران یا تحویل حضوری فعال است.');
    }

    // موجودی در لحظه‌ی ثبت سفارش دوباره بررسی می‌شود (جلوگیری از فروش بیش از موجودی)
    const shortage = items.find((i) => {
      const row = i.variant_id
        ? get('SELECT stock FROM product_variants WHERE id = ? AND product_id = ?', i.variant_id, i.product_id)
        : get('SELECT stock FROM products WHERE id = ?', i.product_id);
      return !row || row.stock < i.qty;
    });
    if (shortage) return fail(res, `موجودی «${shortage.name}» کافی نیست. لطفاً سبد را به‌روزرسانی کنید.`);

    const totals = cartTotals(cart, items, settings);
    const paymentMethod = paymentMethodRequested;
    const useLoyalty = Math.max(0, Math.min(req.user?.loyalty_points || 0, Number(b.use_loyalty) || 0));
    const loyaltyDiscount = useLoyalty * 1000; // هر امتیاز = ۱۰۰۰ تومان
    const finalTotal = Math.max(0, totals.total - loyaltyDiscount);

    if (paymentMethod === 'gateway' && finalTotal <= 0) {
      return fail(res, 'مبلغ پرداخت آنلاین باید بیشتر از صفر باشد؛ از روش پرداخت دیگری استفاده کنید.', 400);
    }

    const orderId = uid('ord');
    const ts = nowIso();
    const code = `ES-${Date.now().toString().slice(-6)}`;
    const couponCode = totals.coupon?.code && !totals.coupon.invalid ? totals.coupon.code : null;
    let payment;
    if (paymentMethod === 'wallet') {
      payment = { provider: 'wallet', status: 'paid' };
    } else if (paymentMethod === 'cod') {
      payment = { provider: 'cod', status: 'pending' };
    } else if (gatewayProvider === 'mock') {
      payment = {
        provider: 'mock',
        status: 'pending',
        authority: `AUTH-${crypto.randomBytes(10).toString('hex').toUpperCase()}`,
        amount: finalTotal,
        expires_at: new Date(Date.now() + (config.security.paymentIntentTtlSeconds || 1800) * 1000).toISOString(),
      };
    } else {
      try {
        payment = {
          ...(await createGatewayPayment({
            provider: gatewayProvider,
            amount: finalTotal,
            description: `پرداخت سفارش ${code}`,
            metadata: {
              orderId,
              phone: address.phone,
              email: req.user?.email,
            },
            req,
          })),
          status: 'pending',
        };
      } catch (error) {
        metricsRegistry.recordPayment(gatewayProvider, 'init_failed');
        return fail(res, error?.message || 'ارتباط با درگاه پرداخت برقرار نشد.', error?.status || 502);
      }
    }

    const paymentIntent = payment.provider === 'mock' && payment.authority
      ? signIntentToken(
        { order_id: orderId, authority: payment.authority, amount: finalTotal, user_id: req.user?.id ?? null },
        config.security.paymentIntentTtlSeconds || 1800,
      )
      : null;
    if (paymentIntent) payment.intent_token = paymentIntent;

    tx(() => {
      if (checkoutKey) {
        const duplicate = get('SELECT id FROM orders WHERE checkout_key = ?', checkoutKey);
        if (duplicate) throw new HttpError('درخواست checkout هم‌زمان با همین کلید ثبت شد؛ دوباره تلاش کنید.', 409);
      }
      const latestCartItems = cartItems(cart.id);
      const cartChanged = latestCartItems.length !== items.length
        || latestCartItems.some((item, index) => item.id !== items[index].id || Number(item.qty) !== Number(items[index].qty));
      if (cartChanged) throw new HttpError('سبد خرید هنگام آغاز پرداخت تغییر کرد؛ دوباره تلاش کنید.', 409);
      run(
        `INSERT INTO orders (id,code,user_id,status,payment_status,subtotal,discount,tax,shipping_cost,total,coupon_code,address,
          shipping_method,shipping_carrier,customer_note,loyalty_used,loyalty_reserved,coupon_reserved,checkout_key,placed_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        orderId, code, req.user?.id ?? null, 'pending', 'unpaid',
        totals.subtotal, totals.discount + loyaltyDiscount, totals.tax, totals.shipping_cost, finalTotal,
        couponCode, stringifyJson(address),
        shipping, cleanText(b.shipping_carrier, { max: 60, multiline: false }) || 'پست پیشتاز',
        cleanText(b.note, { max: 500 }) || null, useLoyalty, useLoyalty > 0 ? 1 : 0, couponCode ? 1 : 0, checkoutKey, ts, ts,
      );
      for (const item of items) {
        run(
          `INSERT INTO order_items (id,order_id,product_id,variant_id,name_fa,thumbnail,variant_name,unit_price,qty,total)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          uid('oit'), orderId, item.product_id, item.variant_id ?? null, item.name, item.thumbnail, item.variant_name, item.unit_price, item.qty, item.total,
        );
      }
      run(
        'INSERT INTO order_events (id,order_id,status,note,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?)',
        uid('oev'), orderId, 'pending', 'سفارش ثبت شد و در انتظار پرداخت است.', req.user?.id ?? null, req.user?.full_name ?? 'مهمان', ts,
      );
      if (useLoyalty > 0 && req.user) {
        const changed = run(
          'UPDATE users SET loyalty_points = loyalty_points - ? WHERE id = ? AND loyalty_points >= ?',
          useLoyalty, req.user.id, useLoyalty,
        );
        if (!changed.changes) throw new HttpError('امتیاز وفاداری کافی نیست؛ سبد را دوباره محاسبه کنید.', 409);
      }
      // رزرو موجودی: هر قلم به‌صورت شرطی کم می‌شود تا هم‌زمانی باعث oversell نشود
      for (const item of items) {
        if (item.variant_id) {
          const r = run('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND product_id = ? AND stock >= ?', item.qty, item.variant_id, item.product_id, item.qty);
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
      if (couponCode) {
        const coupon = get('SELECT * FROM coupons WHERE upper(code) = upper(?)', couponCode);
        const now = Date.now();
        if (!coupon || !coupon.is_active
          || (coupon.starts_at && new Date(coupon.starts_at).getTime() > now)
          || (coupon.ends_at && new Date(coupon.ends_at).getTime() < now)
          || (coupon.min_subtotal && totals.subtotal < coupon.min_subtotal)) {
          throw new HttpError('کد تخفیف دیگر معتبر نیست؛ سبد خرید را به‌روزرسانی کنید.', 409);
        }
        if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
          throw new HttpError('ظرفیت استفاده از این کد تکمیل شده است.', 409);
        }
        if (req.user && coupon.per_user_limit) {
          const used = get('SELECT COUNT(*) c FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?', coupon.id, req.user.id)?.c || 0;
          if (used >= coupon.per_user_limit) throw new HttpError('سقف استفاده‌ی شما از این کد تکمیل شده است.', 409);
        }
        const changed = run(
          `UPDATE coupons SET used_count = used_count + 1
           WHERE id = ? AND is_active = 1 AND (usage_limit IS NULL OR usage_limit = 0 OR used_count < usage_limit)`,
          coupon.id,
        );
        if (!changed.changes) throw new HttpError('ظرفیت استفاده از این کد تکمیل شده است.', 409);
        if (req.user) {
          run('INSERT INTO coupon_redemptions (id,coupon_id,user_id,order_id,created_at) VALUES (?,?,?,?,?)', uid('red'), coupon.id, req.user.id, orderId, ts);
        }
      }

      if (payment.provider === 'wallet') {
        const debited = run('UPDATE users SET wallet = wallet - ? WHERE id = ? AND wallet >= ?', finalTotal, req.user.id, finalTotal);
        if (!debited.changes) throw new HttpError('موجودی کیف پول کافی نیست.', 409);
        const balance = get('SELECT wallet FROM users WHERE id = ?', req.user.id)?.wallet ?? 0;
        run(
          'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
          uid('wtx'), req.user.id, finalTotal, 'debit', 'پرداخت سفارش', code, balance, ts,
        );
        run('UPDATE orders SET status = ?, payment_status = ?, paid_at = ?, loyalty_reserved = 0, coupon_reserved = 0 WHERE id = ?',
          'paid', 'paid', ts, orderId);
        run(
          'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
          uid('oev'), orderId, 'paid', 'پرداخت با موفقیت انجام شد.', 'کیف پول', ts,
        );
        notify({ userId: req.user.id, title: 'پرداخت موفق', body: `سفارش ${code} پرداخت شد.`, type: 'order', link: `/account/orders/${orderId}` });
      }

      run(
        `INSERT INTO payments (id,order_id,provider,amount,status,applied,authority,redirect_url,expires_at,payload,ref_id,created_at,verified_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        uid('pay'), orderId, payment.provider, finalTotal, payment.status, payment.status === 'paid' ? 1 : 0,
        payment.authority ?? null, payment.redirect_url ?? null, payment.expires_at ?? null,
        stringifyJson({
          redirect_method: payment.redirect_method || null,
          redirect_fields: payment.redirect_fields || null,
        }),
        payment.status === 'paid' ? code : null, ts, payment.status === 'paid' ? ts : null,
      );
      if (payment.authority) {
        run(
          `INSERT INTO checkout_intents (id,order_id,user_id,phone,authority,status,created_at,expires_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          uid('cxi'), orderId, req.user?.id ?? null, address.phone ?? null, payment.authority, 'pending',
          ts, payment.expires_at || new Date(Date.now() + config.security.paymentIntentTtlSeconds * 1000).toISOString(),
        );
      }

      // سبد و ثبت سفارش به‌صورت اتمی نهایی می‌شوند.
      run('DELETE FROM cart_items WHERE cart_id = ?', cart.id);
      run('UPDATE carts SET coupon_code = NULL, updated_at = ? WHERE id = ?', ts, cart.id);
    });

    const order = get('SELECT * FROM orders WHERE id = ?', orderId);
    if (gatewayProvider) metricsRegistry.recordPayment(gatewayProvider, 'initiated');
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
    if (config.isProd || !config.payment.allowMock) {
      return fail(res, 'تأیید پرداخت آزمایشی غیرفعال است؛ وضعیت پرداخت باید از درگاه بانکی تأیید شود.', 503);
    }
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
    // نتیجه‌ی نهایی درگاه: فقط درخواست صریح success=false ناموفق تلقی می‌شود.
    // وضعیت intent، payment، سفارش و آزادسازی رزروها در یک تراکنش تغییر می‌کنند.
    const success = req.body?.success !== false;
    const refId = `RF${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`;
    const settlement = tx(() => {
      const freshOrder = get('SELECT * FROM orders WHERE id = ?', order.id);
      const freshPayment = get('SELECT * FROM payments WHERE id = ?', payment.id);
      if (!freshOrder || !freshPayment) throw new HttpError('تراکنش یا سفارش یافت نشد.', 404);
      if (freshPayment.status === 'paid' || freshOrder.payment_status === 'paid') {
        return { alreadyPaid: true, order: hydrateOrder(freshOrder) };
      }

      const checkoutIntent = freshPayment.authority
        ? get('SELECT * FROM checkout_intents WHERE authority = ? ORDER BY created_at DESC LIMIT 1', freshPayment.authority)
        : null;
      const ts = nowIso();
      if (checkoutIntent) {
        if (checkoutIntent.status !== 'pending') throw new HttpError('این تراکنش قبلاً بررسی شده است.', 409);
        if (new Date(checkoutIntent.expires_at) < new Date()) {
          run("UPDATE checkout_intents SET status='expired' WHERE id = ? AND status='pending'", checkoutIntent.id);
          run("UPDATE payments SET status='failed', failure_reason='expired', verified_at=? WHERE id=? AND status='pending'", ts, freshPayment.id);
          run("UPDATE orders SET payment_status='failed', status='cancelled', cancelled_at=?, updated_at=? WHERE id=?", ts, ts, freshOrder.id);
          releaseOrderReservations(freshOrder, 'آزادسازی پس از انقضای پرداخت');
          run(
            'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
            uid('oev'), freshOrder.id, 'cancelled', 'مهلت پرداخت پایان یافت و رزروها آزاد شد.', 'سیستم', ts,
          );
          return { expired: true };
        }
        const intentUpdate = run('UPDATE checkout_intents SET status = ? WHERE id = ? AND status = \'pending\'', success ? 'paid' : 'failed', checkoutIntent.id);
        if (!intentUpdate.changes) throw new HttpError('این تراکنش قبلاً بررسی شده است.', 409);
      }

      const paymentUpdate = run(
        "UPDATE payments SET status = ?, ref_id = ?, verified_at = ?, applied = ? WHERE id = ? AND status IN ('pending','failed')",
        success ? 'paid' : 'failed', refId, ts, success ? 1 : 0, freshPayment.id,
      );
      if (!paymentUpdate.changes) throw new HttpError('این تراکنش قبلاً بررسی شده است.', 409);

      if (!success) {
        run("UPDATE orders SET payment_status='failed', status='cancelled', cancelled_at=?, updated_at=? WHERE id=?", ts, ts, freshOrder.id);
        releaseOrderReservations(freshOrder, 'آزادسازی پس از پرداخت ناموفق');
        run(
          'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
          uid('oev'), freshOrder.id, 'cancelled', 'پرداخت ناموفق بود و رزروها آزاد شد.', 'درگاه پرداخت', ts,
        );
        return { success: false };
      }

      run("UPDATE orders SET payment_status='paid', status='paid', paid_at=?, updated_at=?, loyalty_reserved=0, coupon_reserved=0 WHERE id=?", ts, ts, freshOrder.id);
      run(
        'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
        uid('oev'), freshOrder.id, 'paid', `پرداخت تأیید شد. کد پیگیری: ${refId}`, 'درگاه پرداخت', ts,
      );
      if (freshOrder.user_id) {
        notify({ userId: freshOrder.user_id, title: 'پرداخت موفق', body: `سفارش ${freshOrder.code} با موفقیت پرداخت شد.`, type: 'order', link: `/account/orders/${freshOrder.id}` });
      }
      return { success: true, code: freshOrder.code, order: hydrateOrder(get('SELECT * FROM orders WHERE id = ?', freshOrder.id)) };
    });

    if (settlement.expired) return fail(res, 'مهلت پرداخت این سفارش به پایان رسیده است. سفارش جدید ثبت کنید.', 410);
    if (!settlement.success && !settlement.alreadyPaid) return fail(res, 'پرداخت ناموفق بود.');
    if (settlement.alreadyPaid) return ok(res, { message: 'این سفارش قبلاً پرداخت شده است.', order: settlement.order });
    broadcast('admin', { type: 'order:paid', order: { code: settlement.code, ref: refId } });
    return ok(res, { message: 'پرداخت با موفقیت تأیید شد.', order: settlement.order });
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
    const result = tx(() => {
      const order = get('SELECT * FROM orders WHERE id = ? OR code = ?', req.params.id, req.params.id);
      if (!order) throw new HttpError('سفارش یافت نشد.', 404);
      if (order.user_id !== req.user.id && !isStaff(req.user)) throw new HttpError('دسترسی مجاز نیست.', 403);
      if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)) {
        throw new HttpError('این سفارش در وضعیت فعلی قابل لغو نیست.', 409);
      }

      const ts = nowIso();
      run("UPDATE orders SET status='cancelled', cancelled_at=?, updated_at=? WHERE id=?", ts, ts, order.id);
      run(
        'INSERT INTO order_events (id,order_id,status,note,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?)',
        uid('oev'), order.id, 'cancelled', cleanText(req.body?.reason, { max: 300 }) || 'لغو توسط مشتری',
        req.user.id, req.user.full_name, ts,
      );
      // موجودی، امتیاز، کوپن، وضعیت سفارش و بازپرداخت در یک تراکنش انجام می‌شوند.
      releaseOrderReservations(order, 'لغو سفارش');
      let refunded = false;
      if (order.payment_status === 'paid') {
        const user = order.user_id ? get('SELECT * FROM users WHERE id = ?', order.user_id) : null;
        if (!user) throw new HttpError('بازپرداخت سفارش مهمان باید توسط پشتیبانی به‌صورت دستی انجام شود.', 409);
        run('UPDATE users SET wallet = wallet + ? WHERE id = ?', order.total, user.id);
        run(
          'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
          uid('wtx'), user.id, order.total, 'credit', 'بازپرداخت لغو سفارش', order.code, user.wallet + order.total, ts,
        );
        notify({ userId: user.id, title: 'بازپرداخت انجام شد', body: `مبلغ سفارش ${order.code} به کیف پول شما بازگشت.`, type: 'wallet', link: '/account/wallet' });
        run("UPDATE orders SET payment_status='refunded', status='refunded' WHERE id=?", order.id);
        run("UPDATE payments SET status='refunded' WHERE order_id=? AND status='paid'", order.id);
        refunded = true;
      }
      return {
        orderId: order.id,
        code: order.code,
        refunded,
        order: hydrateOrder(get('SELECT * FROM orders WHERE id = ?', order.id)),
      };
    });

    logAudit(req, 'order_cancel', 'order', result.orderId, { refunded: result.refunded });
    broadcast('admin', { type: 'order:cancelled', order: { code: result.code } });
    return ok(res, {
      message: result.refunded ? 'سفارش لغو شد و مبلغ به کیف پول بازگشت.' : 'سفارش لغو شد.',
      order: result.order,
    });
  }),
);

/** POST /api/orders/:id/return — درخواست مرجوعی */
router.post(
  '/:id/return',
  rateLimit({ ...config.security.rateLimits.write, scope: 'order-return' }),
  requireAuth,
  asyncHandler((req, res) => {
    const ticketId = uid('tkt');
    const result = tx(() => {
      const order = get('SELECT * FROM orders WHERE id = ? OR code = ?', req.params.id, req.params.id);
      if (!order) throw new HttpError('سفارش یافت نشد.', 404);
      if (order.user_id !== req.user.id && !isStaff(req.user)) throw new HttpError('دسترسی مجاز نیست.', 403);
      if (order.status !== 'delivered') throw new HttpError('فقط سفارش‌های تحویل‌شده قابل مرجوع کردن هستند.', 409);
      if (get("SELECT id FROM tickets WHERE order_id = ? AND category = 'returns'", order.id)) {
        throw new HttpError('برای این سفارش قبلاً درخواست مرجوعی ثبت شده است.', 409);
      }
      const days = (Date.now() - new Date(order.delivered_at || order.placed_at).getTime()) / 864e5;
      if (days > 7) throw new HttpError('مهلت ۷ روزه‌ی مرجوعی این سفارش به پایان رسیده است.', 409);

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
      return { ticketId, orderId: order.id };
    });
    broadcast('admin', { type: 'ticket:new', ticket: { id: result.ticketId } });
    logAudit(req, 'order_return_request', 'order', result.orderId, { ticket_id: result.ticketId });
    return ok(res, { message: 'درخواست مرجوعی ثبت شد. تیم پشتیبانی تا ۲۴ ساعت آینده با شما تماس می‌گیرد.', ticket_id: result.ticketId });
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
      if (!product || product.status !== 'active') { skipped += 1; continue; }
      const variant = item.variant_id
        ? get('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', item.variant_id, product.id)
        : null;
      const available = item.variant_id ? Number(variant?.stock || 0) : Number(product.stock || 0);
      if (available <= 0) { skipped += 1; continue; }
      const qty = Math.max(1, Math.min(20, Number(item.qty) || 1, available));
      const existing = get(
        `SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND COALESCE(variant_id,'') = ?`,
        cart.id, product.id, item.variant_id || '',
      );
      if (existing) {
        const merged = Math.min(available, Math.max(1, existing.qty + qty));
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
