/**
 * تست‌های یکپارچه EasyShop — با node:test و fetch (بدون وابستگی بیرونی)
 * اجرا: npm --workspace server test   یا   npm test
 *
 * نکته: داده‌ها در پوشه‌ی موقت ساخته می‌شوند تا دیتابیس فروشگاه دست‌نخورده بماند.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-test-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SEED_DEMO_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.AI_KEY_ENCRYPTION_KEY = 'easyshop-test-key-material-that-is-over-thirty-two-bytes';

const { app, bootstrap } = await import('../src/index.js');
const { get: dbGet } = await import('../src/db/index.js');
const { config } = await import('../src/config.js');
bootstrap(); // آماده‌سازی ارائه‌دهنده‌های AI و داده‌های دمو در پوشه‌ی موقت

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

/* -------------------------------- کمکی‌ها -------------------------------- */
let sessionKeyCounter = 0;
const sessionKey = () => `test_sess_${++sessionKeyCounter}`;

async function call(method, url, { token, body, headers = {}, session } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(session ? { 'x-session-key': session } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

const get = (u, o) => call('GET', u, o);
const post = (u, b, o) => call('POST', u, { ...o, body: b });
const patch = (u, b, o) => call('PATCH', u, { ...o, body: b });
const put = (u, b, o) => call('PUT', u, { ...o, body: b });

let adminToken = '';
let userToken = '';
let user;

/* --------------------------------- تست‌ها -------------------------------- */
describe('سلامت و کشف سرویس', () => {
  it('GET /api/health پاسخ سالم می‌دهد', async () => {
    const { status, body } = await get('/api/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.ok(body.counts.products > 0, 'داده‌های دمو باید بارگذاری شده باشد');
  });

  it('endpoint متریک‌ها با Bearer token محافظت می‌شود و Prometheus exposition می‌دهد', async () => {
    const previous = config.observability.metricsBearerToken;
    config.observability.metricsBearerToken = 'metrics-test-secret';
    try {
      const denied = await fetch(`${base}/metrics`);
      assert.equal(denied.status, 401);
      const allowed = await fetch(`${base}/metrics`, { headers: { authorization: 'Bearer metrics-test-secret' } });
      assert.equal(allowed.status, 200);
      assert.match(allowed.headers.get('content-type'), /text\/plain/);
      const text = await allowed.text();
      assert.match(text, /easyshop_http_requests_total/);
      assert.match(text, /easyshop_http_request_duration_ms_bucket/);
      assert.match(text, /path="\/api\/health"/);
    } finally {
      config.observability.metricsBearerToken = previous;
    }
  });

  it('GET /api/home بخش‌های صفحه اصلی را برمی‌گرداند', async () => {
    const { status, body } = await get('/api/home');
    assert.equal(status, 200);
    assert.ok(body.hero?.length > 0);
    assert.ok(body.featured?.length > 0);
    assert.ok(body.categories?.length > 0);
  });

  it('GET /api/docs مستندات API را برمی‌گرداند', async () => {
    const { status, body } = await get('/api/docs');
    assert.equal(status, 200);
    assert.ok(body.endpoints || body.routes || body.title);
  });
});

describe('احراز هویت', () => {
  it('ثبت‌نام کاربر جدید و دریافت توکن', async () => {
    const email = `test-${Date.now()}@easyshop.ir`;
    const { status, body } = await post('/api/auth/register', { email, password: 'Test#Pass2026', full_name: 'کاربر آزمایشی', phone: '09120000000' });
    assert.equal(status, 201);
    assert.ok(body.session.accessToken);
    userToken = body.session.accessToken;
    user = body.session.user;
    assert.equal(body.session.user.email, email);
  });

  it('ورود مدیر با حساب دمو', async () => {
    const { status, body } = await post('/api/auth/login', { email: 'admin@easyshop.ir', password: 'ShopMaster#2026' });
    assert.equal(status, 200);
    adminToken = body.session.accessToken;
    assert.equal(body.session.user.role, 'admin');
  });

  it('رمز اشتباه رد می‌شود', async () => {
    const { status } = await post('/api/auth/login', { email: 'admin@easyshop.ir', password: 'wrong-password' });
    assert.equal(status, 401);
  });

  it('GET /api/auth/me کاربر جاری را برمی‌گرداند', async () => {
    const { status, body } = await get('/api/auth/me', { token: userToken });
    assert.equal(status, 200);
    assert.equal(body.user.id, user.id);
  });

  it('به‌روزرسانی پروفایل از متد PATCH پشتیبانی می‌شود', async () => {
    const { status, body } = await patch('/api/auth/me', { locale: 'en' }, { token: userToken });
    assert.equal(status, 200);
    assert.equal(body.user.locale, 'en');
  });

  it('مسیر محافظت‌شده بدون توکن ۴۰۱ می‌دهد', async () => {
    const { status } = await get('/api/account/dashboard');
    assert.equal(status, 401);
  });
});

describe('محصولات و دسته‌بندی‌ها', () => {
  it('فهرست محصولات صفحه‌بندی شده است', async () => {
    const { status, body } = await get('/api/products?limit=5');
    assert.equal(status, 200);
    assert.equal(body.items.length, 5);
    assert.ok(body.pages >= 1);
    assert.ok(body.items[0].slug && body.items[0].price > 0);
  });

  it('جستجوی سریع محصولات کار می‌کند', async () => {
    const { status, body } = await get('/api/products/suggest?q=لپ');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
  });

  it('جستجوی سراسری (نوار فرمان) محصول و صفحه برمی‌گرداند', async () => {
    const { status, body } = await get('/api/search?q=هدفون');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.products));
  });

  it('جزئیات محصول با slug', async () => {
    const { body: list } = await get('/api/products?limit=1');
    const slug = list.items[0].slug;
    const { status, body } = await get(`/api/products/${slug}`);
    assert.equal(status, 200);
    assert.equal(body.product.slug, slug);
  });

  it('دسته‌بندی درختی بازگردانده می‌شود', async () => {
    const { body } = await get('/api/categories');
    assert.ok(body.items.length > 0);
    const { body: flat } = await get('/api/categories?flat=1');
    assert.ok(flat.items.length >= body.items.length);
  });

  it('فیلترها و مرتب‌سازی سرور کار می‌کنند', async () => {
    const { body } = await get('/api/products?sort=cheapest&limit=3');
    const prices = body.items.map((p) => p.price);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

    const { body: exp } = await get('/api/products?sort=expensive&limit=3');
    const expPrices = exp.items.map((p) => p.price);
    assert.deepEqual(expPrices, [...expPrices].sort((a, b) => b - a));
  });
});

describe('سبد خرید و سفارش', () => {
  let product;
  let order;
  let payment;
  const session = sessionKey();

  it('افزودن کالا به سبد مهمان', async () => {
    const { body: list } = await get('/api/products?limit=1');
    product = list.items.find((p) => p.stock > 2) || list.items[0];
    const { status, body } = await post('/api/cart/items', { product_id: product.id, qty: 2 }, { session });
    assert.equal(status, 201);
    assert.ok(body.items.length >= 1);
    assert.ok(body.totals.total > 0);
  });

  it('سبد مهمان با توکن کاربری ادغام می‌شود', async () => {
    const { status, body } = await post('/api/cart/merge', { session_key: session }, { token: userToken, session });
    assert.equal(status, 200);
    assert.ok(body.items.length >= 1);
  });

  it('سبد خرید کاربر قابل خواندن است', async () => {
    const { status, body } = await get('/api/cart', { token: userToken });
    assert.equal(status, 200);
    assert.ok(body.items.length >= 1);
    assert.ok(body.totals.subtotal > 0);
  });

  it('ثبت سفارش با آدرس و روش ارسال', async () => {
    const { status, body } = await post(
      '/api/orders/checkout',
      {
        address: { receiver: 'سارا تستی', phone: '09121112233', province: 'تهران', city: 'تهران', line: 'خیابان آزادی، پلاک ۱', postal_code: '1234567890' },
        shipping_method: 'post',
        payment_method: 'gateway',
        note: 'سفارش تست خودکار',
      },
      { token: userToken },
    );
    assert.equal(status, 201);
    order = body.order;
    payment = body.payment; // شامل authority و intent_token امضاشده
    assert.match(order.code, /^ES-\d+/);
    assert.equal(order.status, 'pending');
    assert.equal(order.payment_status, 'unpaid');
    assert.ok(order.total > 0);
  });

  it('پرداخت شبیه‌سازی‌شده سفارش را paid می‌کند (با توکن درگاه)', async () => {
    const { status, body } = await post(
      `/api/orders/${order.id}/pay`,
      { success: true, authority: payment.authority, intent_token: payment.intent_token },
      { token: userToken },
    );
    assert.equal(status, 200);
    assert.equal(body.order.payment_status, 'paid');
    assert.equal(body.order.status, 'paid');
  });

  it('سفارش در پنل کاربری دیده می‌شود', async () => {
    const { body } = await get('/api/account/dashboard', { token: userToken });
    assert.ok(body.stats.orders >= 1);
    assert.ok(body.recent_orders.some((o) => o.id === order.id));
  });

  it('checkout آزمایشی در production رد می‌شود و سبد را نگه می‌دارد', async () => {
    const { body: list } = await get('/api/products?sort=expensive&limit=10');
    const product = list.items.find((item) => item.stock > 0);
    const add = await post('/api/cart/items', { product_id: product.id, qty: 1 }, { token: userToken });
    assert.equal(add.status, 201);

    const previous = config.isProd;
    config.isProd = true;
    let checkout;
    try {
      checkout = await post('/api/orders/checkout', {
        address: { receiver: 'کاربر تست', phone: '09121112233', province: 'تهران', city: 'تهران', line: 'خیابان تست', postal_code: '1234567890' },
        shipping_method: 'post', payment_method: 'gateway',
      }, { token: userToken });
    } finally {
      config.isProd = previous;
    }
    assert.equal(checkout.status, 503);
    const cart = await get('/api/cart', { token: userToken });
    assert.ok(cart.body.items.some((item) => item.product_id === product.id));
  });
});

describe('رزرو موجودی واریانت در checkout و لغو', () => {
  it('شناسه واریانت سفارش ذخیره می‌شود و لغو فقط موجودی همان واریانت را برمی‌گرداند', async () => {
    const productCreate = await post('/api/products', {
      name: 'کالای واریانت تست تراکنش',
      slug: `variant-reserve-${Date.now()}`,
      price: 100_000,
      stock: 50,
      status: 'active',
      variants: [{ name_fa: 'رنگ آبی', stock: 3, price_delta: 5_000 }],
    }, { token: adminToken });
    assert.equal(productCreate.status, 201);
    const productId = productCreate.body.product.id;
    const detailBefore = await get(`/api/products/${productId}`);
    const variant = detailBefore.body.variants[0];
    const productStockBefore = detailBefore.body.product.stock;
    const variantStockBefore = variant.stock;
    assert.equal(variantStockBefore, 3);

    const email = `variant_${Date.now()}@easyshop.ir`;
    const register = await post('/api/auth/register', {
      email, password: 'Variant#Pass2026', full_name: 'کاربر واریانت', phone: '09123334444',
    });
    assert.equal(register.status, 201);
    const token = register.body.session.accessToken;
    const cartAdd = await post('/api/cart/items', { product_id: productId, variant_id: variant.id, qty: 2 }, { token });
    assert.equal(cartAdd.status, 201);

    const checkout = await post('/api/orders/checkout', {
      address: { receiver: 'کاربر واریانت', phone: '09123334444', province: 'تهران', city: 'تهران', line: 'خیابان تست', postal_code: '1234567890' },
      shipping_method: 'post', payment_method: 'gateway',
    }, { token });
    assert.equal(checkout.status, 201);
    const order = checkout.body.order;
    assert.equal(order.items[0].variant_id, variant.id);

    const detailReserved = await get(`/api/products/${productId}`);
    assert.equal(detailReserved.body.variants[0].stock, variantStockBefore - 2);
    assert.equal(detailReserved.body.product.stock, productStockBefore, 'رزرو واریانت نباید stock محصول مادر را تغییر دهد');

    const cancelled = await post(`/api/orders/${order.id}/cancel`, { reason: 'آزمون آزادسازی واریانت' }, { token });
    assert.equal(cancelled.status, 200);
    const detailRestored = await get(`/api/products/${productId}`);
    assert.equal(detailRestored.body.variants[0].stock, variantStockBefore);
    assert.equal(detailRestored.body.product.stock, productStockBefore);

    const secondAdd = await post('/api/cart/items', { product_id: productId, variant_id: variant.id, qty: 2 }, { token });
    assert.equal(secondAdd.status, 201);
    const secondCheckout = await post('/api/orders/checkout', {
      address: { receiver: 'کاربر واریانت', phone: '09123334444', province: 'تهران', city: 'تهران', line: 'خیابان تست', postal_code: '1234567890' },
      shipping_method: 'post', payment_method: 'gateway',
    }, { token });
    assert.equal(secondCheckout.status, 201);
    const paid = await post(`/api/orders/${secondCheckout.body.order.id}/pay`, {
      success: true,
      authority: secondCheckout.body.payment.authority,
      intent_token: secondCheckout.body.payment.intent_token,
    }, { token });
    assert.equal(paid.status, 200);
    const { run: dbRun } = await import('../src/db/index.js');
    dbRun("UPDATE orders SET status='delivered', delivered_at=? WHERE id=?", new Date().toISOString(), secondCheckout.body.order.id);

    const returned = await post(`/api/orders/${secondCheckout.body.order.id}/return`, { reason: 'آزمون مرجوعی واریانت' }, { token });
    assert.equal(returned.status, 200);
    const afterReturn = await get(`/api/products/${productId}`);
    assert.equal(afterReturn.body.variants[0].stock, variantStockBefore);
    assert.equal(afterReturn.body.product.stock, productStockBefore);
  });
});

describe('کد تخفیف و کیف پول', () => {
  it('کد WELCOME10 اعمال می‌شود', async () => {
    const { body: list } = await get('/api/products?sort=expensive&limit=100');
    const p = list.items.find((x) => x.stock > 1 && x.price >= 500_000) || list.items.find((x) => x.stock > 1) || list.items[0];
    await post('/api/cart/items', { product_id: p.id, qty: 1 }, { token: userToken });
    const { status, body } = await post('/api/cart/coupon', { code: 'WELCOME10' }, { token: userToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.coupon_code, 'WELCOME10');
    assert.ok(body.totals.discount > 0);
  });

  it('رزرو کوپن و امتیاز وفاداری با لغو سفارش به‌طور اتمی آزاد می‌شوند', async () => {
    const { run: dbRun } = await import('../src/db/index.js');
    const couponBefore = dbGet('SELECT used_count FROM coupons WHERE code = ?', 'WELCOME10').used_count;
    dbRun('UPDATE users SET loyalty_points = 5 WHERE id = ?', user.id);

    const checkout = await post('/api/orders/checkout', {
      address: { receiver: 'سارا تستی', phone: '09121112233', province: 'تهران', city: 'تهران', line: 'خیابان آزادی', postal_code: '1234567890' },
      shipping_method: 'post', payment_method: 'gateway', use_loyalty: 2,
    }, { token: userToken });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    const orderId = checkout.body.order.id;
    assert.equal(dbGet('SELECT loyalty_points FROM users WHERE id = ?', user.id).loyalty_points, 3);
    assert.equal(dbGet('SELECT used_count FROM coupons WHERE code = ?', 'WELCOME10').used_count, couponBefore + 1);
    assert.equal(dbGet('SELECT COUNT(*) c FROM coupon_redemptions WHERE order_id = ?', orderId).c, 1);
    assert.equal(dbGet('SELECT loyalty_reserved FROM orders WHERE id = ?', orderId).loyalty_reserved, 1);
    assert.equal(dbGet('SELECT coupon_reserved FROM orders WHERE id = ?', orderId).coupon_reserved, 1);

    const cancelled = await post(`/api/orders/${orderId}/cancel`, { reason: 'بررسی آزادسازی رزرو' }, { token: userToken });
    assert.equal(cancelled.status, 200);
    assert.equal(dbGet('SELECT loyalty_points FROM users WHERE id = ?', user.id).loyalty_points, 5);
    assert.equal(dbGet('SELECT used_count FROM coupons WHERE code = ?', 'WELCOME10').used_count, couponBefore);
    assert.equal(dbGet('SELECT COUNT(*) c FROM coupon_redemptions WHERE order_id = ?', orderId).c, 0);
  });

  it('کد نامعتبر رد می‌شود', async () => {
    const { status, body } = await post('/api/cart/coupon', { code: 'NOT-A-CODE' }, { token: userToken });
    assert.ok(status >= 400 && status < 500, `کد نامعتبر باید رد شود (دریافتی: ${status})`);
    assert.equal(body.ok, false);
  });

  it('پرداخت کیف پول ناکافی، سفارش/رزرو را rollback می‌کند و سبد را نگه می‌دارد', async () => {
    const { run: dbRun } = await import('../src/db/index.js');
    dbRun('UPDATE users SET wallet = 0 WHERE id = ?', user.id);
    const { body: list } = await get('/api/products?sort=expensive&limit=20');
    const product = list.items.find((item) => item.stock > 0);
    const stockBefore = dbGet('SELECT stock FROM products WHERE id = ?', product.id).stock;
    const ordersBefore = dbGet('SELECT COUNT(*) c FROM orders WHERE user_id = ?', user.id).c;
    await post('/api/cart/items', { product_id: product.id, qty: 1 }, { token: userToken });

    const checkout = await post('/api/orders/checkout', {
      address: { receiver: 'سارا تستی', phone: '09121112233', province: 'تهران', city: 'تهران', line: 'خیابان آزادی', postal_code: '1234567890' },
      shipping_method: 'post', payment_method: 'wallet',
    }, { token: userToken });
    assert.equal(checkout.status, 409);
    assert.equal(dbGet('SELECT COUNT(*) c FROM orders WHERE user_id = ?', user.id).c, ordersBefore);
    assert.equal(dbGet('SELECT stock FROM products WHERE id = ?', product.id).stock, stockBefore);
    const cart = await get('/api/cart', { token: userToken });
    assert.ok(cart.body.items.some((item) => item.product_id === product.id));
  });

  it('شارژ کیف پول و برداشت امتیاز وفاداری', async () => {
    const { status, body } = await post('/api/account/wallet/topup', { amount: 500000, method: 'gateway' }, { token: userToken });
    assert.equal(status, 200);
    assert.ok(body.wallet >= 500000);

    const { body: wallet } = await get('/api/account/wallet', { token: userToken });
    assert.ok(wallet.wallet >= 500000);

    // اگر امتیاز وفاداری کافی باشد تبدیل انجام می‌شود؛ در غیر این صورت پیام خطای شفاف برمی‌گردد
    if (wallet.loyalty_points >= 10) {
      const { status: s2, body: b2 } = await post('/api/account/loyalty/convert', { points: 10 }, { token: userToken });
      assert.equal(s2, 200);
      assert.ok(b2.wallet > wallet.wallet);
    } else {
      const { status: s3, body: b3 } = await post('/api/account/loyalty/convert', { points: 10 }, { token: userToken });
      assert.equal(s3, 400);
      assert.match(b3.error, /امتیاز/);
    }
  });
});

describe('پشتیبانی: تیکت و گفتگوی زنده', () => {
  let ticketId;

  it('ایجاد تیکت توسط مشتری', async () => {
    const { status, body } = await post(
      '/api/tickets',
      { subject: 'سفارشم دیر رسیده', body: 'سلام، سفارش من ۵ روز است ارسال نشده. لطفاً بررسی کنید.', category: 'order', priority: 'high' },
      { token: userToken },
    );
    assert.equal(status, 201);
    assert.match(body.ticket.code, /^TK-/);
    ticketId = body.ticket.id;
  });

  it('کارشناس به تیکت پاسخ می‌دهد و وضعیت answered می‌شود', async () => {
    const { status, body } = await post(`/api/tickets/${ticketId}/messages`, { body: 'سلام، بررسی شد و امروز ارسال می‌شود.' }, { token: adminToken });
    assert.equal(status, 201);
    assert.equal(body.ticket.status, 'answered');
    assert.equal(body.ticket.messages.length, 2);
  });

  it('فهرست تیکت‌ها برای کارمند شامل تیکت جدید است', async () => {
    const { body } = await get('/api/tickets?limit=50', { token: adminToken });
    assert.ok(body.items.some((t) => t.id === ticketId));
  });

  it('گفتگوی زنده ساخته و پیام‌ها ذخیره می‌شوند', async () => {
    const { status, body } = await post('/api/chat/conversations', { subject: 'سؤال درباره ارسال', message: 'سلام، ارسال به شیراز چند روزه است؟' }, { token: userToken });
    assert.equal(status, 201);
    const convId = body.conversation.id;

    const { status: s2, body: b2 } = await post(`/api/chat/conversations/${convId}/messages`, { body: 'سلام، ۲ تا ۳ روز کاری.' }, { token: adminToken });
    assert.equal(s2, 201);
    assert.ok(b2.message.body.includes('۲'));

    const { body: adminList } = await get('/api/chat/conversations', { token: adminToken });
    assert.ok(adminList.items.some((c) => c.id === convId));
  });
});

describe('هوش مصنوعی چندمدلی', () => {
  it('کاتالوگ مدل‌ها شامل ۵ مدل برتر است', async () => {
    const { status, body } = await get('/api/ai/models');
    assert.equal(status, 200);
    const slugs = body.providers.map((p) => p.slug);
    for (const slug of ['openai', 'anthropic', 'gemini', 'xai', 'deepseek']) {
      assert.ok(slugs.includes(slug), `مدل ${slug} باید در کاتالوگ باشد`);
    }
    assert.equal(body.featured.length, 5);
  });

  it('کلید ارائه‌دهندهٔ AI رمز‌شده ذخیره می‌شود و تنظیمات عمومی راز نمی‌پذیرند', async () => {
    const secret = 'sk-easyshop-integration-test-secret';
    const saved = await put('/api/ai/providers/openai', { api_key: secret }, { token: adminToken });
    assert.equal(saved.status, 200);
    assert.equal(JSON.stringify(saved.body).includes(secret), false);
    const provider = saved.body.providers.find((item) => item.slug === 'openai');
    assert.ok(provider.api_key_masked);
    assert.equal(provider.api_key_masked.includes(secret), false);

    const stored = dbGet('SELECT api_key FROM ai_providers WHERE slug = ?', 'openai').api_key;
    assert.match(stored, /^enc:v2:v1:/);
    assert.notEqual(stored, secret);

    const unsafeSettings = await put('/api/ai/settings', { api_key: 'must-not-be-stored' }, { token: adminToken });
    assert.equal(unsafeSettings.status, 400);
    const home = await get('/api/home');
    assert.equal(JSON.stringify(home.body.settings.ai).includes(secret), false);
    assert.equal(JSON.stringify(home.body.settings.ai).includes('must-not-be-stored'), false);

    const adminSettings = await put('/api/admin/settings', { ai: { api_key: 'also-must-not-leak', default_provider: 'builtin' } }, { token: adminToken });
    assert.equal(adminSettings.status, 200);
    assert.equal(JSON.stringify(adminSettings.body).includes('also-must-not-leak'), false);
    assert.deepEqual(adminSettings.body.settings.ai, { default_provider: 'builtin' });
  });

  it('موتور داخلی بدون کلید API محصول تولید می‌کند', async () => {
    const { status, body } = await post(
      '/api/ai/generate/product',
      { brief: 'پاوربانک ۲۰۰۰۰ میلی‌آمپر با شارژ سریع', provider: 'builtin', category: 'کالای دیجیتال' },
      { token: adminToken },
    );
    assert.equal(status, 201);
    assert.ok(body.product.name_fa?.length > 3);
    assert.ok(body.product.description_fa?.length > 20);
    assert.ok(body.product.price > 0);
    assert.equal(body.generation.provider, 'builtin');
  });

  it('تولید و انتشار خودکار محصول، آن را به فهرست اضافه می‌کند', async () => {
    const before = (await get('/api/products?limit=1')).body.total;
    const { status, body } = await post(
      '/api/ai/generate/product',
      { brief: 'ساعت هوشمند ورزشی ضدآب', provider: 'builtin', auto_publish: true },
      { token: adminToken },
    );
    assert.equal(status, 201);
    assert.ok(body.created_product?.id, 'محصول باید منتشر شده باشد');
    const after = (await get('/api/products?limit=1')).body.total;
    assert.equal(after, before + 1);
  });

  it('تولید تصویر محصول (SVG/data-URL) کار می‌کند', async () => {
    const { status, body } = await post('/api/ai/generate/image', { prompt: 'هدفون بی‌سیم مشکی روی پس‌زمینه سفید', provider: 'builtin' }, { token: adminToken });
    assert.equal(status, 200);
    assert.match(body.url, /^data:image\/(svg\+xml|png)/);
  });

  it('کمپین بازاریابی، سئو و پیشنهاد دسته‌بندی تولید می‌شود', async () => {
    const m = await post('/api/ai/marketing', { topic: 'جشنواره پاییزه لوازم خانگی', provider: 'builtin' }, { token: adminToken });
    assert.equal(m.status, 200);
    assert.ok(m.body.content || m.body.text);

    const s = await post('/api/ai/generate/seo', { topic: 'خرید لپ‌تاپ گیمینگ', provider: 'builtin' }, { token: adminToken });
    assert.equal(s.status, 200);
    assert.ok(s.body.seo.title?.length > 5);

    const c = await post('/api/ai/generate/categories', { topic: 'لوازم ورزشی', provider: 'builtin' }, { token: adminToken });
    assert.equal(c.status, 200);
    assert.ok(c.body.categories.length > 0);
  });

  it('دستیار خرید مشتری پاسخ می‌دهد', async () => {
    const { status, body } = await post('/api/ai/assistant', { message: 'برای خرید هدفون تا ۵ میلیون چه پیشنهادی داری؟' }, {});
    assert.equal(status, 200);
    assert.ok(body.reply?.length > 10);
  });

  it('لاگ فراخوانی‌های AI برای مدیر قابل مشاهده است', async () => {
    const { status, body } = await get('/api/ai/logs?limit=5', { token: adminToken });
    assert.equal(status, 200);
    assert.ok(body.stats.calls > 0);
    assert.ok(Array.isArray(body.items));
  });
});

describe('پنل مدیریت', () => {
  it('داشبورد KPI برمی‌گرداند', async () => {
    const { status, body } = await get('/api/admin/dashboard?days=30', { token: adminToken });
    assert.equal(status, 200);
    for (const key of ['revenue', 'orders', 'customers', 'products', 'tickets_open']) {
      assert.ok(key in body.kpis, `KPI ${key} موجود باشد`);
    }
    assert.ok(Array.isArray(body.sales_series));
    assert.ok(Array.isArray(body.top_products));
    assert.ok(Array.isArray(body.recent_orders));
  });

  it('مدیر می‌تواند وضعیت سفارش را تغییر دهد', async () => {
    const { body: list } = await get('/api/admin/orders?limit=1', { token: adminToken });
    const order = list.items[0];
    const { status, body } = await patch(`/api/admin/orders/${order.id}`, { status: 'shipped', tracking_code: 'TEST-123' }, { token: adminToken });
    assert.equal(status, 200);
    assert.equal(body.order.status, 'shipped');
  });

  it('مدیر فقط به snapshot محدود SLO و تاریخچه هشدارها دسترسی دارد', async () => {
    const response = await get('/api/admin/observability', { token: adminToken });
    assert.equal(response.status, 200);
    assert.ok(response.body.slo);
    assert.ok(Array.isArray(response.body.active_alerts));
    assert.ok(Array.isArray(response.body.recent_alerts));
    const forbidden = await get('/api/admin/observability', { token: userToken });
    assert.equal(forbidden.status, 403);
  });

  it('مدیر می‌تواند کد تخفیف بسازد', async () => {
    const code = `TEST${Date.now().toString().slice(-6)}`;
    const { status } = await post('/api/admin/coupons', { code, type: 'percent', value: 15, min_subtotal: 500000 }, { token: adminToken });
    assert.equal(status, 201);
    const { body } = await get('/api/admin/coupons', { token: adminToken });
    assert.ok(body.items.some((c) => c.code === code));
  });

  it('گزارش‌ها و لاگ سیستم در دسترس مدیر است', async () => {
    const r = await get('/api/admin/reports?days=7', { token: adminToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.sales_by_day));

    const l = await get('/api/admin/audit-logs?limit=5', { token: adminToken });
    assert.equal(l.status, 200);
    assert.ok(l.body.items.length > 0);
  });

  it('تنظیمات فروشگاه قابل خواندن و ذخیره است', async () => {
    const { body } = await get('/api/admin/settings', { token: adminToken });
    assert.ok(body.settings.store?.name);

    const next = { ...body.settings.commerce, tax_percent: 9 };
    const saved = await call('PUT', '/api/admin/settings', { token: adminToken, body: { settings: { commerce: next } } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.commerce.tax_percent, 9);
  });

  it('کاربر عادی به مسیرهای مدیریتی دسترسی ندارد', async () => {
    const { status } = await get('/api/admin/dashboard', { token: userToken });
    assert.equal(status, 403);
  });
});

describe('فایل‌های استاتیک و SPA', () => {
  it('manifest و آیکون‌ها سرو می‌شوند (در صورت وجود build)', async () => {
    const res = await fetch(`${base}/manifest.webmanifest`);
    assert.ok([200, 404].includes(res.status));
  });

  it('مسیر ناشناخته API ۴۰۴ ساختاری می‌دهد', async () => {
    const { status, body } = await get('/api/does-not-exist');
    assert.equal(status, 404);
    assert.equal(body.ok, false);
  });
});
