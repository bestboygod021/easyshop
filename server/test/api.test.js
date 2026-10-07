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

const { app, bootstrap } = await import('../src/index.js');
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
  let json = null;
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
});

describe('کد تخفیف و کیف پول', () => {
  it('کد WELCOME10 اعمال می‌شود', async () => {
    const { body: list } = await get('/api/products?limit=1');
    const p = list.items.find((x) => x.stock > 1) || list.items[0];
    await post('/api/cart/items', { product_id: p.id, qty: 1 }, { token: userToken });
    const { status, body } = await post('/api/cart/coupon', { code: 'WELCOME10' }, { token: userToken });
    assert.equal(status, 200);
    assert.equal(body.coupon_code, 'WELCOME10');
    assert.ok(body.totals.discount > 0);
  });

  it('کد نامعتبر رد می‌شود', async () => {
    const { status, body } = await post('/api/cart/coupon', { code: 'NOT-A-CODE' }, { token: userToken });
    assert.ok(status >= 400 && status < 500, `کد نامعتبر باید رد شود (دریافتی: ${status})`);
    assert.equal(body.ok, false);
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
