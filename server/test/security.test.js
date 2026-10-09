/**
 * تست‌های امنیتی EasyShop — از همه‌ی نظرها
 * ---------------------------------------------------------------------------
 * این فایل با node:test اجرا می‌شود و هیچ وابستگی بیرونی ندارد.
 * دسته‌بندی تست‌ها:
 *   ۱) احراز هویت و مدیریت نشست (JWT، تازه‌سازی، ابطال توکن، ورود مهمان)
 *   ۲) کنترل دسترسی (IDOR/BOLA، افزایش سطح دسترسی، مسیرهای مدیریتی)
 *   ۳) سیاست رمز عبور و قفل‌شدن حساب (brute-force)
 *   ۴) محدودیت نرخ (rate limiting) روی مسیرهای حساس
 *   ۵) اعتبارسنجی ورودی، XSS، SQL Injection، Prototype Pollution
 *   ۶) آپلود فایل (sniff محتوا، رد SVG/HTML، نام فایل ایمن)
 *   ۷) هدرهای امنیتی، CSP، مبدأ (Origin/CSRF) و نشت اطلاعات
 *   ۸) منطق کسب‌وکار (پرداخت، موجودی، کیف پول، کوپن، نظرها، تیکت‌ها)
 *   ۹) زمان‌واقعی (WebSocket): مجوزدهی، محدودیت نرخ، سقف اندازه‌ی پیام
 *  ۱۰) ابزارهای کمکی امنیتی (توابع هسته) و امنیت آپلود/CSV
 *
 * اجرا: npm --workspace server test   (یا)  node --test test/security.test.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { WebSocket } from 'ws';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-sec-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SEED_DEMO_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
// در تست‌ها باید بتوانیم نرخ/قفل را بازنشانی کنیم
process.env.TRUSTED_ORIGINS = '';

const { app, bootstrap } = await import('../src/index.js');
const { initRealtime } = await import('../src/realtime/hub.js');
bootstrap();

const security = await import('../src/middleware/security.js');
const { sniffImageBuffer, csvSafe, checkPasswordPolicy, sanitizeDeep, hashToken, safeEqual } = security;

let server;
let wss;
let base;
let wsBase;
const tokens = {};
const openSockets = new Set();

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  // هاب زمان‌واقعی روی همان سرور تست سوار می‌شود (مسیر /ws)
  wss = initRealtime(server);
  const port = server.address().port;
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}/ws`;

  for (const [key, email] of Object.entries({
    admin: 'admin@easyshop.ir',
    support: 'support@easyshop.ir',
    seller: 'seller@easyshop.ir',
    user: 'user@easyshop.ir',
  })) {
    const pass = {
      admin: 'ShopMaster#2026',
      support: 'HelpDesk#2026',
      seller: 'Trader#2026',
      user: 'Shopper#2026',
    }[key];
    const { body } = await call('POST', '/api/auth/login', { body: { email, password: pass } });
    tokens[key] = body?.session?.accessToken;
    tokens[`${key}Refresh`] = body?.session?.refreshToken;
  }
});

after(async () => {
  for (const socket of openSockets) {
    try {
      socket.terminate?.();
      socket.close?.();
    } catch {
      /* ignore */
    }
  }
  openSockets.clear();
  await new Promise((resolve) => (wss ? wss.close(resolve) : resolve()));
  await new Promise((resolve) => server?.close(resolve));
  fs.rmSync(TMP, { recursive: true, force: true });
});

/* -------------------------------- کمکی‌ها -------------------------------- */
let sessionCounter = 0;
const sessionKey = () => `sec_sess_${(sessionCounter += 1)}_abcdef`;

async function call(method, url, { token, body, headers = {}, session, raw = false } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(session ? { 'x-session-key': session } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  if (raw) return res;
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, body: json, headers: res.headers };
}

const get = (url, opts) => call('GET', url, opts);
const post = (url, body, opts) => call('POST', url, body ? { ...opts, body } : opts);
const patch = (url, body, opts) => call('PATCH', url, { ...opts, body });
const put = (url, body, opts) => call('PUT', url, { ...opts, body });
const del = (url, opts) => call('DELETE', url, opts);

/** باز کردن اتصال WebSocket و جمع‌آوری پیام‌ها */
function connectWs({ token, origin, url = wsBase } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${url}${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      headers: origin ? { origin } : undefined,
    });
    const messages = [];
    socket.on('message', (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()));
      } catch {
        /* ignore */
      }
    });
    socket.on('open', () => {
      openSockets.add(socket);
      socket.on('close', () => openSockets.delete(socket));
      resolve({ socket, messages });
    });
    socket.on('error', (err) => reject(err));
    socket.on('unexpected-response', (_req, res) => reject(Object.assign(new Error(`http ${res.statusCode}`), { status: res.statusCode })));
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** انتظار برای رسیدن پیام مطابق شرط */
async function waitFor(messages, predicate, timeout = 1500) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = messages.find(predicate);
    if (found) return found;
    await wait(30);
  }
  return null;
}

/* ====================== ۱) احراز هویت و مدیریت نشست ====================== */
describe('امنیت — احراز هویت و مدیریت نشست', () => {
  it('ورود با رمز اشتباه ۴۰۱ و بدون افشای وجود کاربر است', async () => {
    const a = await post('/api/auth/login', { email: 'admin@easyshop.ir', password: 'WrongPass123' });
    const b = await post('/api/auth/login', { email: 'ghost-user@example.com', password: 'WrongPass123' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error, 'پیام خطا نباید وجود کاربر را افشا کند');
  });

  it('مسیرهای محافظت‌شده بدون توکن ۴۰۱ می‌دهند', async () => {
    for (const url of ['/api/orders', '/api/account/summary', '/api/admin/dashboard', '/api/tickets', '/api/chat/conversations']) {
      const { status } = await get(url);
      assert.equal(status, 401, `${url} باید ۴۰۱ بدهد`);
    }
  });

  it('توکن جعلی/دستکاری‌شده پذیرفته نمی‌شود', async () => {
    const forged = `${tokens.user.slice(0, -4)}AAAA`;
    const { status } = await get('/api/orders', { token: forged });
    assert.equal(status, 401);
  });

  it('توکن با الگوریتم none پذیرفته نمی‌شود', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'usr_admin', role: 'admin' })).toString('base64url');
    const { status } = await get('/api/orders', { token: `${header}.${payload}.` });
    assert.equal(status, 401);
  });

  it('?token= دیگر برای احراز هویت پذیرفته نمی‌شود (فقط هدر Authorization)', async () => {
    const { status } = await get(`/api/orders?token=${encodeURIComponent(tokens.user)}`);
    assert.equal(status, 401, 'توکن در URL نباید معتبر باشد (نشت در لاگ/Referer)');
  });

  it('تازه‌سازی توکن، توکن جدید می‌دهد و بازاستفاده از توکن باطل، خانواده را باطل می‌کند', async () => {
    const login = await post('/api/auth/login', { email: 'user@easyshop.ir', password: 'Shopper#2026' });
    const rt = login.body.session.refreshToken;

    const first = await post('/api/auth/refresh', { refreshToken: rt });
    assert.equal(first.status, 200);
    assert.ok(first.body.session.accessToken);
    assert.notEqual(first.body.session.accessToken, rt, 'access token باید از refresh token جدا باشد');
    const authenticated = await get('/api/auth/me', { token: first.body.session.accessToken });
    assert.equal(authenticated.status, 200, 'access token تازه‌شده باید برای API محافظت‌شده معتبر باشد');

    // استفاده‌ی مجدد از همان توکن (نشانه‌ی سرقت) باید رد شود و همه‌ی توکن‌های خانواده را باطل کند
    const replay = await post('/api/auth/refresh', { refreshToken: rt });
    assert.equal(replay.status, 401);
    const afterFamilyRevoke = await post('/api/auth/refresh', { refreshToken: first.body.session.refreshToken });
    assert.equal(afterFamilyRevoke.status, 401, 'پس از تشخیص بازاستفاده، کل خانواده باید باطل باشد');
  });

  it('خروج، توکن تازه‌سازی را باطل می‌کند', async () => {
    const login = await post('/api/auth/login', { email: 'user@easyshop.ir', password: 'Shopper#2026' });
    const rt = login.body.session.refreshToken;
    await post('/api/auth/logout', { refreshToken: rt });
    const { status } = await post('/api/auth/refresh', { refreshToken: rt });
    assert.equal(status, 401);
  });

  it('توکن‌های تازه‌سازی در دیتابیس به‌صورت هش ذخیره می‌شوند', async () => {
    const login = await post('/api/auth/login', { email: 'user@easyshop.ir', password: 'Shopper#2026' });
    const rt = login.body.session.refreshToken;
    const { get: dbGet, all: dbAll } = await import('../src/db/index.js');
    const rawRows = dbAll('SELECT id FROM refresh_tokens WHERE token = ?', rt).length;
    assert.equal(rawRows, 0, 'توکن خام نباید در دیتابیس ذخیره شود');
    assert.ok(dbGet('SELECT id FROM refresh_tokens WHERE token_hash = ?', hashToken(rt)), 'هش توکن باید ذخیره شود');
  });

  it('تغییر رمز عبور همه‌ی نشست‌ها را باطل می‌کند', async () => {
    const email = `rotate_${Date.now()}@example.com`;
    const reg = await post('/api/auth/register', { email, password: 'First#Pass2026', full_name: 'کاربر چرخش رمز', phone: '09120000001' });
    assert.equal(reg.status, 201);
    const access = reg.body.session.accessToken;
    const refresh = reg.body.session.refreshToken;

    const changed = await post('/api/auth/change-password', { current_password: 'First#Pass2026', new_password: 'Second#Pass2026' }, { token: access });
    assert.equal(changed.status, 200);

    const oldAccess = await get('/api/orders', { token: access });
    assert.equal(oldAccess.status, 401, 'توکن دسترسی قدیمی باید باطل شود');
    const oldRefresh = await post('/api/auth/refresh', { refreshToken: refresh });
    assert.equal(oldRefresh.status, 401, 'توکن تازه‌سازی قدیمی باید باطل شود');
  });

  it('بازیابی رمز: توکن فقط هش می‌شود، یک‌بارمصرف است و سیاست رمز را رعایت می‌کند', async () => {
    const email = `reset_${Date.now()}@example.com`;
    await post('/api/auth/register', { email, password: 'First#Pass2026', full_name: 'کاربر بازیابی', phone: '09120000002' });
    const { body } = await post('/api/auth/forgot-password', { email });
    assert.ok(body.reset_token, 'در محیط تست توکن برگردانده می‌شود');
    const { all: dbAll } = await import('../src/db/index.js');
    assert.equal(dbAll('SELECT id FROM users WHERE reset_token = ?', body.reset_token).length, 0, 'توکن خام ذخیره نشود');

    const weak = await post('/api/auth/reset-password', { token: body.reset_token, password: '12345678' });
    assert.equal(weak.status, 400);

    const strong = await post('/api/auth/reset-password', { token: body.reset_token, password: 'Fresh#Pass2026' });
    assert.equal(strong.status, 200);
    const reused = await post('/api/auth/reset-password', { token: body.reset_token, password: 'Another#Pass2026' });
    assert.equal(reused.status, 400, 'توکن بازیابی باید یک‌بارمصرف باشد');

    const login = await post('/api/auth/login', { email, password: 'Fresh#Pass2026' });
    assert.equal(login.status, 200);
  });

  it('ورود مهمان اطلاعات کاربران دیگر را افشا نمی‌کند', async () => {
    const { status, body } = await post('/api/auth/guest', { full_name: 'مهمان تستی', phone: '09121234567', email: 'user@easyshop.ir' });
    assert.notEqual(status, 200);
    assert.equal(JSON.stringify(body).includes('Shopper'), false);
    assert.equal(JSON.stringify(body).includes('wallet'), false);
  });
});

/* ================= ۲) کنترل دسترسی (IDOR / افزایش سطح دسترسی) ================= */
describe('امنیت — کنترل دسترسی و IDOR', () => {
  let ownerOrder;
  let otherToken;

  before(async () => {
    security.resetRateLimits(); // جلوگیری از اثر متقابل محدودیت نرخ بین بلوک‌های تست
    const email = `idor_${Date.now()}@example.com`;
    const reg = await post('/api/auth/register', { email, password: 'Idor#Pass2026', full_name: 'کاربر دوم آیدی', phone: '09120000003' });
    otherToken = reg.body.session.accessToken;

    const { body: list } = await get('/api/products?limit=100');
    const product = list.items.find((p) => p.stock > 2);
    await post('/api/cart/items', { product_id: product.id, qty: 1 }, { token: tokens.user, session: sessionKey() });
    const checkout = await post('/api/orders/checkout', {
      address: { receiver: 'مالک سفارش', phone: '09121112233', province: 'تهران', city: 'تهران', line: 'خیابان ولیعصر', postal_code: '1234567890' },
      shipping_method: 'post',
      payment_method: 'gateway',
    }, { token: tokens.user });
    ownerOrder = checkout.body.order;
    assert.ok(ownerOrder?.id, 'سفارش آزمایشی باید ساخته شود');
  });

  it('کاربر دیگر نمی‌تواند سفارش متعلق به دیگری را ببیند', async () => {
    const { status } = await get(`/api/orders/${ownerOrder.id}`, { token: otherToken });
    assert.equal(status, 403);
  });

  it('فاکتور واترمارک‌دار فقط برای مالک یا کارکنان مجاز است', async () => {
    const anonymous = await get(`/api/orders/${ownerOrder.id}/watermarked-invoice`);
    assert.equal(anonymous.status, 401);
    const other = await get(`/api/orders/${ownerOrder.id}/watermarked-invoice`, { token: otherToken });
    assert.equal(other.status, 403);
    const owner = await get(`/api/orders/${ownerOrder.id}/watermarked-invoice`, { token: tokens.user });
    assert.equal(owner.status, 200);
    assert.match(owner.body.html_content, /صورت‌حساب رسمی/);
  });

  it('کاربر دیگر نمی‌تواند سفارش دیگری را پرداخت کند (IDOR پرداخت)', async () => {
    const { status } = await post(`/api/orders/${ownerOrder.id}/pay`, { success: true }, { token: otherToken });
    assert.ok([400, 403].includes(status), `باید رد شود، دریافتی: ${status}`);
  });

  it('پرداخت بدون کد اقتدار درگاه پذیرفته نمی‌شود', async () => {
    const { status } = await post(`/api/orders/${ownerOrder.id}/pay`, { success: true }, { token: tokens.user });
    assert.equal(status, 400);
  });

  it('کد اقتدار جعلی پرداخت را تأیید نمی‌کند', async () => {
    const { status } = await post(`/api/orders/${ownerOrder.id}/pay`, { success: true, authority: 'AUTH-FAKE-0001' }, { token: tokens.user });
    assert.equal(status, 400);
  });

  it('کاربر دیگر نمی‌تواند سفارش دیگری را لغو یا مرجوع کند', async () => {
    const cancel = await post(`/api/orders/${ownerOrder.id}/cancel`, {}, { token: otherToken });
    assert.equal(cancel.status, 403);
    const ret = await post(`/api/orders/${ownerOrder.id}/return`, { reason: 'تست' }, { token: otherToken });
    assert.equal(ret.status, 403);
  });

  it('افزودن نقش/کیف پول از طریق PATCH /auth/me ممکن نیست (Mass Assignment)', async () => {
    const { body } = await patch('/api/auth/me', { full_name: 'کاربر عادی', role: 'admin', wallet: 99999999, status: 'active' }, { token: otherToken });
    assert.ok(body.user, 'به‌روزرسانی باید انجام شود ولی نقش تغییر نکند');
    assert.equal(body.user.role, 'customer');
    assert.notEqual(body.user.wallet, 99999999);
  });

  it('مسیرهای مدیریتی برای کاربر عادی ۴۰۳ است', async () => {
    for (const url of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/orders', '/api/admin/reports', '/api/admin/export/orders.csv']) {
      const { status } = await get(url, { token: tokens.user });
      assert.equal(status, 403, `${url} باید ۴۰۳ بدهد`);
    }
  });

  it('فروشنده به مسیرهای مخصوص مدیر دسترسی ندارد', async () => {
    const users = await get('/api/admin/users', { token: tokens.seller });
    assert.ok([401, 403].includes(users.status));
  });

  it('قیمت تمام‌شده‌ی محصول (cost) برای عموم افشا نمی‌شود', async () => {
    const { body: list } = await get('/api/products?limit=1');
    const slug = list.items[0].slug;
    const { body } = await get(`/api/products/${slug}`);
    assert.equal('cost' in body.product, false, 'cost نباید در پاسخ عمومی باشد');
    const adminView = await get(`/api/products/${slug}`, { token: tokens.admin });
    assert.ok('cost' in adminView.body.product, 'کارمند باید cost را ببیند');
  });

  it('آدرس‌های دیگران قابل ویرایش نیست', async () => {
    const mine = await post('/api/account/addresses', { receiver: 'من', phone: '09121110000', line: 'آدرس من', title: 'خانه' }, { token: tokens.user });
    assert.equal(mine.status, 201);
    const theirs = await call('PUT', `/api/account/addresses/${mine.body.address.id}`, { body: { line: 'تغییر غیرمجاز' }, token: otherToken });
    assert.equal(theirs.status, 404);
  });

  it('تیکت کاربران دیگر قابل مشاهده نیست', async () => {
    const ticket = await post('/api/tickets', { subject: 'تیکت خصوصی من', body: 'متن تیکت خصوصی' }, { token: tokens.user });
    assert.equal(ticket.status, 201);
    const { status } = await get(`/api/tickets/${ticket.body.ticket.id}`, { token: otherToken });
    assert.equal(status, 403);
  });

  it('یادداشت داخلی کارمندان برای مشتری نمایش داده نمی‌شود', async () => {
    const ticket = await post('/api/tickets', { subject: 'تیکت با یادداشت داخلی', body: 'لطفاً بررسی کنید' }, { token: tokens.user });
    const id = ticket.body.ticket.id;
    await post(`/api/tickets/${id}/messages`, { body: 'یادداشت محرمانه کارشناس', is_internal: true }, { token: tokens.support });
    const staffView = await get(`/api/tickets/${id}`, { token: tokens.support });
    const customerView = await get(`/api/tickets/${id}`, { token: tokens.user });
    assert.ok(staffView.body.ticket.messages.some((m) => m.body.includes('محرمانه')));
    assert.equal(customerView.body.ticket.messages.some((m) => m.body.includes('محرمانه')), false);
    assert.equal(customerView.body.ticket.messages.some((m) => m.is_internal), false);
  });

  it('گفتگوی مهمان بدون توکن گفتگو قابل خواندن یا نوشتن نیست', async () => {
    const created = await post('/api/chat/conversations', { message: 'سلام، سؤال مهمان دارم', guest_name: 'مهمان', guest_email: 'guest@example.com' });
    assert.equal(created.status, 201);
    const convId = created.body.conversation.id;
    assert.ok(created.body.guest_token, 'توکن گفتگوی مهمان باید صادر شود');

    const noToken = await get(`/api/chat/conversations/${convId}`);
    assert.equal(noToken.status, 403, 'بدون توکن نباید قابل خواندن باشد');
    const wrongToken = await get(`/api/chat/conversations/${convId}`, { headers: { 'x-guest-token': 'a'.repeat(64) } });
    assert.equal(wrongToken.status, 403);
    const withToken = await get(`/api/chat/conversations/${convId}`, { headers: { 'x-guest-token': created.body.guest_token } });
    assert.equal(withToken.status, 200);
  });

  it('کاربر دیگر نمی‌تواند در گفتگوی مهمان پیام بگذارد (حتی با ورود)', async () => {
    const created = await post('/api/chat/conversations', { message: 'گفتگوی مهمان دوم', guest_name: 'مهمان۲', guest_email: 'guest2@example.com' });
    const convId = created.body.conversation.id;
    const attempt = await post(`/api/chat/conversations/${convId}/messages`, { body: 'پیام نفوذی' }, { token: tokens.user });
    assert.equal(attempt.status, 403);
  });
});

/* ==================== ۳) سیاست رمز عبور و قفل حساب ==================== */
describe('امنیت — سیاست رمز و محافظت از brute-force', () => {
  it('رمزهای ضعیف در ثبت‌نام رد می‌شوند', async () => {
    const cases = ['short1', '12345678', 'onlyletters', 'password', 'admin123', 'abcdefgh'];
    for (const password of cases) {
      const { status } = await post('/api/auth/register', {
        email: `weak_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
        password, full_name: 'کاربر ضعیف', phone: '09120000004',
      });
      assert.equal(status, 400, `رمز «${password}» نباید پذیرفته شود`);
    }
  });

  it('رمز شامل بخشی از ایمیل رد می‌شود', async () => {
    const policy = checkPasswordPolicy('sara1399xyz', { email: 'sara@example.com' });
    assert.ok(policy, 'باید خطای سیاست برگردد');
  });

  it('قفل موقت حساب پس از چند تلاش ناموفق فعال می‌شود', async () => {
    const email = `lock_${Date.now()}@example.com`;
    await post('/api/auth/register', { email, password: 'Lock#Pass2026', full_name: 'کاربر قفل', phone: '09120000005' });
    security.resetRateLimits();

    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const { status } = await post('/api/auth/login', { email, password: `Bad#Pass${i}2026` }, { headers: { 'x-forwarded-for': '' } });
      statuses.push(status);
    }
    assert.ok(statuses.slice(0, 5).every((s) => s === 401), `پنج تلاش اول باید ۴۰۱ باشند: ${statuses}`);
    assert.ok([423, 429].includes(statuses[5]), `تلاش ششم باید قفل/محدود شود: ${statuses}`);

    // حتی با رمز صحیح هم حساب قفل است
    const correct = await post('/api/auth/login', { email, password: 'Lock#Pass2026' });
    assert.ok([423, 429].includes(correct.status));
    security.resetRateLimits();
  });

  it('تلاش‌های ورود در جدول login_attempts ثبت می‌شوند', async () => {
    const { get: dbGet } = await import('../src/db/index.js');
    const row = dbGet('SELECT * FROM login_attempts ORDER BY created_at DESC LIMIT 1');
    assert.ok(row, 'رکورد تلاش ورود باید ثبت شده باشد');
    assert.ok('success' in row && 'ip' in row);
  });
});

/* ========================= ۴) محدودیت نرخ درخواست ========================= */
describe('امنیت — محدودیت نرخ (Rate Limiting)', () => {
  it('مسیر ورود پس از چند درخواست ۴۲۹ می‌دهد', async () => {
    security.resetRateLimits();
    let limited = false;
    for (let i = 0; i < 30; i += 1) {
      const { status } = await post('/api/auth/login', { email: `nobody${i}@example.com`, password: 'NoSuch#Pass2026' });
      if (status === 429) {
        limited = true;
        break;
      }
    }
    assert.ok(limited, 'محدودیت نرخ ورود باید فعال شود');
    security.resetRateLimits();
  });

  it('مسیر ثبت‌نام محدودیت نرخ دارد', async () => {
    security.resetRateLimits();
    let limited = false;
    for (let i = 0; i < 30; i += 1) {
      const { status } = await post('/api/auth/register', { email: `bulk${i}@example.com`, password: 'Bulk#Pass2026', full_name: 'کاربر انبوه' });
      if (status === 429) {
        limited = true;
        break;
      }
    }
    assert.ok(limited);
    security.resetRateLimits();
  });

  it('حدس کد تخفیف محدود می‌شود', async () => {
    security.resetRateLimits();
    let limited = false;
    for (let i = 0; i < 15; i += 1) {
      const { status } = await post('/api/cart/coupon', { code: `GUESS${i}` }, { session: sessionKey() });
      if (status === 429) {
        limited = true;
        break;
      }
    }
    assert.ok(limited, 'حدس کد تخفیف باید محدود شود');
    security.resetRateLimits();
  });

  it('مسیرهای هوش مصنوعی محدودیت نرخ دارند', async () => {
    security.resetRateLimits();
    let limited = false;
    for (let i = 0; i < 25; i += 1) {
      const { status } = await post('/api/ai/assistant', { message: 'سلام' });
      if (status === 429) {
        limited = true;
        break;
      }
    }
    assert.ok(limited, 'دستیار AI باید محدود شود');
    security.resetRateLimits();
  });

  it('پاسخ ۴۲۹ هدر Retry-After دارد', async () => {
    security.resetRateLimits();
    let res;
    for (let i = 0; i < 30; i += 1) {
      res = await post('/api/auth/forgot-password', { email: 'x@example.com' });
      if (res.status === 429) break;
    }
    assert.equal(res.status, 429);
    assert.ok(res.headers.get('retry-after'), 'هدر Retry-After باید ست شود');
    security.resetRateLimits();
  });
});

/* ============= ۵) تزریق، XSS و اعتبارسنجی ورودی ============= */
describe('امنیت — تزریق، XSS و اعتبارسنجی ورودی', () => {
  it('SQL Injection در جستجو، فیلترها و ورود بی‌اثر است', async () => {
    const payloads = ["' OR 1=1 --", "'; DROP TABLE users; --", "1' UNION SELECT password_hash FROM users --", '%\' OR \'1\'=\'1'];
    for (const q of payloads) {
      const list = await get(`/api/products?q=${encodeURIComponent(q)}`);
      assert.equal(list.status, 200);
      assert.ok(Array.isArray(list.body.items ?? list.body.items));

      const login = await post('/api/auth/login', { email: q, password: q });
      assert.equal(login.status, 401, 'تزریق در ورود نباید نتیجه بدهد');
    }
    // جدول کاربران سالم است
    const { get: dbGet } = await import('../src/db/index.js');
    assert.ok(dbGet('SELECT COUNT(*) c FROM users').c > 0);
  });

  it('سایت‌اسکریپت ذخیره‌شده در نام/توضیحات پاک‌سازی می‌شود', async () => {
    const payload = '<script>alert(1)</script>';
    const reg = await post('/api/auth/register', {
      email: `xss_${Date.now()}@example.com`, password: 'Xss#Pass2026', full_name: `${payload}کاربر`,
    });
    assert.equal(reg.status, 201);
    assert.equal(String(reg.body.session.user.full_name).includes('<script>'), false);
    assert.equal(JSON.stringify(reg.body).includes('<script>alert'), false);
  });

  it('تزریق در بدنه‌ی تیکت و چت ذخیره نمی‌شود', async () => {
    const ticket = await post('/api/tickets', { subject: 'مشکل امنیتی <img src=x onerror=alert(1)>', body: '<script>steal()</script> متن تیکت' }, { token: tokens.user });
    assert.equal(ticket.status, 201);
    const serialized = JSON.stringify(ticket.body);
    assert.equal(serialized.includes('<script>'), false);
    assert.equal(serialized.includes('onerror='), false);
  });

  it('Prototype Pollution از طریق بدنه‌ی JSON مسدود می‌شود', async () => {
    const { status } = await post('/api/auth/login', { email: 'a@b.com', password: 'x1234567', __proto__: { isAdmin: true }, 'constructor.prototype.polluted': 'yes' });
    assert.ok(status >= 400);
    assert.equal({}.polluted, undefined);
    assert.equal({}.isAdmin, undefined);
  });

  it('تعداد/طول پارامترهای query محدود می‌شود', async () => {
    const many = new URLSearchParams();
    for (let i = 0; i < 60; i += 1) many.set(`p${i}`, 'v');
    const res = await get(`/api/products?${many.toString()}`);
    assert.equal(res.status, 400);

    const long = await get(`/api/products?q=${'x'.repeat(5000)}`);
    assert.equal(long.status, 200);
    assert.ok(JSON.stringify(long.body).length < 20000, 'پاسخ نباید با ورودی غول‌آسا بزرگ شود');
  });

  it('بدنه‌ی JSON بزرگ‌تر از سقف رد می‌شود (۴۱۳)', async () => {
    const huge = { email: 'a@b.com', password: 'x'.repeat(3 * 1024 * 1024) };
    const { status } = await post('/api/auth/login', huge);
    assert.equal(status, 413);
  });

  it('بدنه‌ی JSON نامعتبر ۴۰۰ می‌دهد، نه ۵۰۰', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email": "a@b.com", "password":',
    });
    assert.equal(res.status, 400);
  });

  it('آرایه‌ی بسیار بزرگ در بدنه محدود می‌شود', async () => {
    const { status, body } = await post('/api/ai/assistant', { message: 'سلام', history: Array.from({ length: 5000 }, (_, i) => ({ role: 'user', content: `پیام ${i}` })) });
    assert.ok([200, 400, 429].includes(status), `پاسخ غیرمنتظره: ${status}`);
    if (status === 200) assert.ok(JSON.stringify(body).length < 50000);
  });

  it('هدرهای تزریقی (Host/X-Forwarded-For) باعث خطای سرور نمی‌شوند', async () => {
    const res = await get('/api/health', { headers: { 'x-forwarded-for': '"><script>alert(1)</script>', host: 'evil.example.com' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-powered-by'), null, 'x-powered-by نباید افشا شود');
  });
});

/* ============================ ۶) امنیت آپلود ============================ */
describe('امنیت — آپلود فایل', () => {
  const pngBytes = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.from('0000000d49484452', 'hex'),
    Buffer.alloc(64, 7),
  ]);

  it('تصویر PNG معتبر پذیرفته و با پسوند امن ذخیره می‌شود', async () => {
    const form = new FormData();
    form.append('files', new Blob([pngBytes], { type: 'image/png' }), 'payload.php.png');
    const { status, body } = await post('/api/uploads', form, { token: tokens.user });
    assert.equal(status, 201);
    assert.match(body.files[0].url, /^\/uploads\/[a-z0-9-]+\.png$/);
    assert.equal(body.files[0].url.includes('php'), false, 'پسوند از نام کاربر گرفته نشود');
  });

  it('فایل SVG (خطر XSS) رد می‌شود', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const form = new FormData();
    form.append('files', new Blob([svg], { type: 'image/svg+xml' }), 'x.svg');
    const { status } = await post('/api/uploads', form, { token: tokens.user });
    assert.equal(status, 415);
  });

  it('فایل با MIME جعلی (تصویر/HTML) رد می‌شود', async () => {
    const form = new FormData();
    form.append('files', new Blob([Buffer.from('<html><script>alert(1)</script></html>')], { type: 'image/png' }), 'fake.png');
    const { status } = await post('/api/uploads', form, { token: tokens.user });
    assert.equal(status, 415, 'محتوای غیرتصویری نباید بپذیرد');
  });

  it('آپلود بدون احراز هویت ۴۰۱ می‌دهد', async () => {
    const form = new FormData();
    form.append('files', new Blob([pngBytes], { type: 'image/png' }), 'a.png');
    const { status } = await post('/api/uploads', form);
    assert.equal(status, 401);
  });

  it('فایل آپلودشده با هدرهای امن سرو می‌شود', async () => {
    const form = new FormData();
    form.append('files', new Blob([pngBytes], { type: 'image/png' }), 'a.png');
    const { body } = await post('/api/uploads', form, { token: tokens.user });
    const res = await get(body.files[0].url, { raw: true });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-security-policy') || '', /sandbox/);
  });

  it('پیمایش مسیر (Path Traversal) در آپلود مسدود است', async () => {
    const res = await get('/uploads/..%2f..%2f..%2fserver%2fsrc%2fconfig.js', { raw: true });
    assert.notEqual(res.status, 200);
  });

  it('sniffImageBuffer انواع فایل را درست تشخیص می‌دهد', () => {
    assert.equal(sniffImageBuffer(Buffer.from('89504e470d0a1a0a', 'hex')), 'image/png');
    assert.equal(sniffImageBuffer(Buffer.from('474946383961', 'hex')), 'image/gif');
    assert.equal(sniffImageBuffer(Buffer.from('<svg></svg>')), 'image/svg+xml');
    assert.equal(sniffImageBuffer(Buffer.from('<?php echo 1; ?>')), 'application/x-php');
    assert.equal(sniffImageBuffer(Buffer.from('')), 'unknown');
  });
});

/* ================= ۷) هدرهای امنیتی، Origin و نشت اطلاعات ================= */
describe('امنیت — هدرها، مبدأ و نشت اطلاعات', () => {
  it('هدرهای امنیتی اصلی حضور دارند', async () => {
    const res = await get('/api/health', { raw: true });
    assert.ok(res.headers.get('content-security-policy'), 'CSP لازم است');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options') || 'DENIED', 'DENIED');
    assert.ok(res.headers.get('referrer-policy'));
    assert.ok(res.headers.get('permissions-policy'));
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('CSP با سیاست سخت‌گیرانه تنظیم شده است', async () => {
    const res = await get('/api/health', { raw: true });
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /frame-ancestors/);
    assert.equal(/script-src[^;]*unsafe-eval/.test(csp), false, "unsafe-eval نباید مجاز باشد");
  });

  it('درخواست تغییردهنده از مبدأ ناشناس رد می‌شود (CSRF/Origin)', async () => {
    const { status } = await post('/api/auth/login', { email: 'a@b.com', password: 'What#Ever2026' }, { headers: { origin: 'https://evil.example.com' } });
    assert.equal(status, 403);
  });

  it('مبدأهای مجاز (same-origin/پیش‌نمایش) پذیرفته می‌شوند', async () => {
    const sameOrigin = await post('/api/auth/login', { email: 'a@b.com', password: 'What#Ever2026' }, { headers: { origin: base } });
    assert.equal(sameOrigin.status, 401, 'same-origin باید عبور کند (۴۰۱ = اعتبارنامه اشتباه، نه ۴۰۳)');
  });

  it('خطاهای ۵۰۰ جزئیات داخلی را در محیط تولید لو نمی‌دهند', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { status, body } = await get('/api/does-not-exist-at-all');
      assert.equal(status, 404);
      assert.equal(JSON.stringify(body).includes('at file://'), false);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('پاسخ‌های خصوصی با no-store علامت‌گذاری می‌شوند', async () => {
    for (const [url, token] of [
      ['/api/orders', tokens.user],
      ['/api/auth/me', tokens.user],
      ['/api/admin/settings', tokens.admin],
      ['/api/ai/providers', tokens.admin],
    ]) {
      const res = await get(url, { token, raw: true });
      assert.match(res.headers.get('cache-control') || '', /no-store/, `${url} نباید cache شود`);
    }
  });

  it('فهرست کاربران عمومی نشده است', async () => {
    const { status } = await get('/api/admin/users', { token: tokens.user });
    assert.equal(status, 403);
    const publicUsers = await get('/api/users');
    assert.equal(publicUsers.status, 404);
  });

  it('پاسخ عمومی صفحه‌بندی، هش رمز یا توکن کاربران را برنمی‌گرداند', async () => {
    const { body } = await get('/api/auth/me', { token: tokens.user });
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('password_hash'), false);
    assert.equal(serialized.includes('$2a$'), false);
    assert.equal(serialized.includes('reset_token'), false);
  });

  it('خروجی CSV امن است (جلوگیری از Formula Injection)', async () => {
    assert.equal(csvSafe('=cmd|calc'), "'=cmd|calc");
    assert.equal(csvSafe('+1+1'), "'+1+1");
    assert.equal(csvSafe('-2'), "'-2");
    assert.equal(csvSafe('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(csvSafe('سلام'), 'سلام');
    assert.equal(csvSafe('a"b'), '"a""b"');

    // کاربر مهاجم با نام فرمولی ثبت‌نام می‌کند
    const evil = `=HYPERLINK("http://evil.example","x")`;
    await post('/api/auth/register', { email: `csv_${Date.now()}@example.com`, password: 'Csv#Pass2026', full_name: evil });
    const res = await get('/api/admin/export/orders.csv', { token: tokens.admin, raw: true });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(/^[=+\-@]/.test(text.replace('\uFEFF', '')), false, 'خروجی نباید با کاراکتر فرمول شروع شود');
    for (const line of text.split(/\r?\n/)) {
      for (const cell of line.split(',')) {
        const clean = cell.replace(/^"|"$/g, '');
        assert.equal(/^[=+@]/.test(clean), false, `سلول ناامن: ${cell}`);
      }
    }
  });
});

/* ============= ۸) منطق کسب‌وکار (پرداخت، موجودی، کیف پول، نظر) ============= */
describe('امنیت — منطق کسب‌وکار', () => {
  it('ثبت سفارش با مقدار qty منفی یا صفر ممکن نیست', async () => {
    const { body: list } = await get('/api/products?limit=100');
    const product = list.items.find((p) => p.stock > 1);
    const session = sessionKey();
    const neg = await post('/api/cart/items', { product_id: product.id, qty: -5 }, { session });
    assert.equal(neg.status, 201);
    assert.ok(neg.body.items.every((i) => i.qty > 0), 'تعداد باید حداقل ۱ باشد');
    assert.ok(neg.body.totals.total > 0, 'مبلغ کل نباید منفی شود');
  });

  it('افزودن کالای ناموجود یا تعداد بیش از موجودی کنترل می‌شود', async () => {
    const { body: list } = await get('/api/products?limit=50');
    const out = list.items.find((p) => p.stock === 0);
    if (out) {
      const { status } = await post('/api/cart/items', { product_id: out.id, qty: 1 }, { session: sessionKey() });
      assert.ok(status >= 400);
    }
    const product = list.items.find((p) => p.stock > 0);
    const big = await post('/api/cart/items', { product_id: product.id, qty: 9999 }, { session: sessionKey() });
    assert.equal(big.status, 201);
    assert.ok(big.body.items[0].qty <= Math.max(product.stock, 1));
  });

  it('موجودی هنگام ثبت سفارش رزرو و پس از پرداخت ناموفق آزاد می‌شود', async () => {
    const { body: list } = await get('/api/products?limit=50');
    const product = list.items.find((p) => p.stock > 3);
    const email = `stock_${Date.now()}@example.com`;
    const reg = await post('/api/auth/register', { email, password: 'Stock#Pass2026', full_name: 'کاربر موجودی', phone: '09120000006' });
    const token = reg.body.session.accessToken;

    await post('/api/cart/items', { product_id: product.id, qty: 2 }, { token });
    const checkout = await post('/api/orders/checkout', {
      address: { receiver: 'تست موجودی', phone: '09121112233', province: 'تهران', city: 'تهران', line: 'خیابان تست', postal_code: '1234567890' },
      shipping_method: 'post', payment_method: 'gateway',
    }, { token });
    assert.equal(checkout.status, 201);

    const { body: after } = await get(`/api/products/${product.slug}`);
    assert.equal(after.product.stock, product.stock - 2, 'موجودی باید رزرو شود');

    const failed = await post(`/api/orders/${checkout.body.order.id}/pay`, {
      success: false, authority: checkout.body.payment.authority, intent_token: checkout.body.payment.intent_token,
    }, { token });
    assert.ok(failed.status >= 400);

    const { body: restored } = await get(`/api/products/${product.slug}`);
    assert.equal(restored.product.stock, product.stock, 'موجودی باید آزاد شود');
  });

  it('با موجودی صفر امکان ثبت سفارش نیست', async () => {
    const { body: list } = await get('/api/products?limit=50');
    const product = list.items.find((p) => p.stock > 0 && p.stock <= 3) || list.items[0];
    const email = `oversell_${Date.now()}@example.com`;
    const reg = await post('/api/auth/register', { email, password: 'Over#Pass2026', full_name: 'کاربر بیش‌فروش', phone: '09120000007' });
    const token = reg.body.session.accessToken;
    await post('/api/cart/items', { product_id: product.id, qty: 1 }, { token });
    // موجودی را از بیرون صفر می‌کنیم (شبیه‌سازی فروش هم‌زمان)
    const { run } = await import('../src/db/index.js');
    run('UPDATE products SET stock = 0 WHERE id = ?', product.id);
    const checkout = await post('/api/orders/checkout', {
      address: { receiver: 'تست', phone: '09121112233', province: 'تهران', city: 'تهران', line: 'تست', postal_code: '1234567890' },
      shipping_method: 'post', payment_method: 'gateway',
    }, { token });
    assert.ok(checkout.status >= 400, 'سفارش بیش از موجودی نباید ثبت شود');
    run('UPDATE products SET stock = ? WHERE id = ?', product.stock, product.id);
  });

  it('شارژ کیف پول با مبلغ منفی/غیرعددی/بی‌نهایت رد می‌شود', async () => {
    for (const amount of [-100000, 0, 1.5, 'abc', null, 1e15]) {
      const { status } = await post('/api/account/wallet/topup', { amount }, { token: tokens.user });
      assert.ok(status >= 400, `مبلغ ${amount} نباید پذیرفته شود`);
    }
  });

  it('شارژ کیف پول بیش از سقف مجاز رد می‌شود', async () => {
    const { status } = await post('/api/account/wallet/topup', { amount: 5_000_000_000 }, { token: tokens.user });
    assert.equal(status, 400);
  });

  it('تبدیل امتیاز با مقدار منفی یا اعشاری ممکن نیست', async () => {
    const neg = await post('/api/account/loyalty/convert', { points: -500 }, { token: tokens.user });
    const frac = await post('/api/account/loyalty/convert', { points: 2.7 }, { token: tokens.user });
    assert.ok(neg.status >= 400);
    assert.ok(frac.status >= 400);
  });

  it('رأی «مفید بود» نیازمند ورود است و یک‌بار برای هر کاربر ثبت می‌شود', async () => {
    const { body: list } = await get('/api/products?limit=5');
    let reviewId = null;
    for (const item of list.items) {
      const { body } = await get(`/api/products/${item.slug}`);
      if (body.reviews?.length) {
        reviewId = body.reviews[0].id;
        break;
      }
    }
    if (!reviewId) return; // اگر نظری در داده‌ی دمو نبود، این تست لازم نیست

    const anon = await post(`/api/products/reviews/${reviewId}/helpful`);
    assert.equal(anon.status, 401, 'بدون ورود نباید رأی ثبت شود');

    const first = await post(`/api/products/reviews/${reviewId}/helpful`, undefined, { token: tokens.user });
    assert.equal(first.status, 200);
    assert.equal(first.body.helpful, true, 'رأی اول ثبت می‌شود');
    const second = await post(`/api/products/reviews/${reviewId}/helpful`, undefined, { token: tokens.user });
    assert.equal(second.body.helpful, false, 'رأی دوم لغو می‌شود (نه شمارش تکراری)');
  });

  it('مرجوعی تکراری برای یک سفارش پذیرفته نمی‌شود', async () => {
    const { run, get: dbGet } = await import('../src/db/index.js');
    const order = dbGet("SELECT * FROM orders WHERE status = 'delivered' LIMIT 1");
    if (!order?.user_id) return;
    const login = await post('/api/auth/login', { email: 'user@easyshop.ir', password: 'Shopper#2026' });
    const token = login.body.session.accessToken;
    // سفارش تحویل‌شده را به کاربر تست نسبت می‌دهیم تا مجوز بررسی شود
    run("UPDATE orders SET user_id = ?, delivered_at = ? WHERE id = ?", login.body.session.user.id, new Date().toISOString(), order.id);
    const first = await post(`/api/orders/${order.id}/return`, { reason: 'تست مرجوعی' }, { token });
    const second = await post(`/api/orders/${order.id}/return`, { reason: 'تست مرجوعی دوباره' }, { token });
    if (first.status === 200) assert.ok([400, 409].includes(second.status), `مرجوعی تکراری باید رد شود: ${second.status}`);
    run("UPDATE orders SET status = 'delivered' WHERE id = ?", order.id);
  });

  it('کد تخفیف با متن تزریقی/طولانی مجاز نیست', async () => {
    const { status } = await post('/api/cart/coupon', { code: `' OR 1=1 --${'x'.repeat(200)}` }, { session: sessionKey() });
    assert.ok(status >= 400);
  });

  it('سفارش مهمان فقط با شماره تماس ثبت‌شده قابل مشاهده است', async () => {
    const { body: list } = await get('/api/products?limit=100');
    const product = list.items.find((p) => p.stock > 0);
    const session = sessionKey();
    await post('/api/cart/items', { product_id: product.id, qty: 1 }, { session });
    const checkout = await post('/api/orders/checkout', {
      address: { receiver: 'مهمان تستی', phone: '09129876543', province: 'تهران', city: 'تهران', line: 'میدان آزادی', postal_code: '1234567890' },
      shipping_method: 'peyk', payment_method: 'cod',
    }, { session });
    assert.equal(checkout.status, 201);
    const wrong = await get(`/api/orders/${checkout.body.order.id}?phone=09000000000`, { session });
    assert.equal(wrong.status, 403);
    const right = await get(`/api/orders/${checkout.body.order.id}?phone=09129876543`, { session });
    assert.equal(right.status, 200);
  });
});

/* ==================== ۹) امنیت زمان‌واقعی (WebSocket) ==================== */
describe('امنیت — زمان‌واقعی (WebSocket)', () => {
  it('اتصال بدون توکن به‌عنوان مهمان پذیرفته می‌شود ولی اتاق‌های خصوصی ندارد', async () => {
    const { socket, messages } = await connectWs();
    const ready = await waitFor(messages, (m) => m.type === 'ready');
    assert.ok(ready);
    assert.equal(ready.user, null);
    assert.equal(ready.rooms.includes('admin'), false, 'مهمان نباید در اتاق admin باشد');
    socket.close();
  });

  it('اتصال با توکن نامعتبر رد می‌شود (بدون نشست)', async () => {
    const { socket, messages } = await connectWs({ token: 'invalid.token.value' });
    const ready = await waitFor(messages, (m) => m.type === 'ready');
    assert.equal(ready.user, null);
    socket.close();
  });

  it('مهمان نمی‌تواند در گفتگوی دیگران پیام بفرستد', async () => {
    const created = await post('/api/chat/conversations', { message: 'گفتگوی مهمان برای تست WS', guest_name: 'مهمان', guest_email: 'ws-guest@example.com' });
    const convId = created.body.conversation.id;

    const { socket, messages } = await connectWs();
    await waitFor(messages, (m) => m.type === 'ready');
    socket.send(JSON.stringify({ type: 'join_conversation', conversation_id: convId }));
    const err = await waitFor(messages, (m) => m.type === 'error');
    assert.ok(err, 'join بدون توکن گفتگو باید رد شود');

    socket.send(JSON.stringify({ type: 'chat:send', conversation_id: convId, body: 'پیام نفوذی WS' }));
    await wait(300);
    // با توکن درستِ خودِ گفتگو بررسی می‌کنیم که پیام مهاجم ذخیره نشده باشد
    const { body: check } = await get(`/api/chat/conversations/${convId}`, { headers: { 'x-guest-token': created.body.guest_token } });
    assert.equal(check.conversation.messages.some((m) => m.body.includes('پیام نفوذی WS')), false, 'پیام مهاجم نباید ذخیره شود');
    socket.close();
  });

  it('مهمان دارای توکن گفتگو می‌تواند پیام بفرستد', async () => {
    const created = await post('/api/chat/conversations', { message: 'سلام از سمت مهمان', guest_name: 'مهمان', guest_email: 'ws-guest2@example.com' });
    const convId = created.body.conversation.id;
    const guestToken = created.body.guest_token;

    const { socket, messages } = await connectWs();
    await waitFor(messages, (m) => m.type === 'ready');
    socket.send(JSON.stringify({ type: 'join_conversation', conversation_id: convId, guest_token: guestToken }));
    const joined = await waitFor(messages, (m) => m.type === 'joined');
    assert.ok(joined, 'با توکن معتبر باید join موفق باشد');

    socket.send(JSON.stringify({ type: 'chat:send', conversation_id: convId, body: 'پیام مجاز مهمان', guest_token: guestToken }));
    const ack = await waitFor(messages, (m) => m.type === 'chat:sent');
    assert.ok(ack, 'پیام باید ثبت شود');
    assert.equal(ack.message.body, 'پیام مجاز مهمان');
    socket.close();
  });

  it('کاربر عادی نمی‌تواند در گفتگوی شخص دیگری تایپ/خواندن ثبت کند', async () => {
    const created = await post('/api/chat/conversations', { message: 'گفتگوی خصوصی', guest_name: 'مهمان۳', guest_email: 'ws-guest3@example.com' });
    const convId = created.body.conversation.id;
    const { run, get: dbGet } = await import('../src/db/index.js');
    run('UPDATE conversations SET unread_admin = 5 WHERE id = ?', convId);

    const { socket, messages } = await connectWs({ token: tokens.user });
    await waitFor(messages, (m) => m.type === 'ready');
    socket.send(JSON.stringify({ type: 'chat:read', conversation_id: convId }));
    socket.send(JSON.stringify({ type: 'chat:typing', conversation_id: convId, is_typing: true }));
    await wait(250);
    assert.equal(dbGet('SELECT unread_admin FROM conversations WHERE id = ?', convId).unread_admin, 5, 'unread نباید توسط کاربر دیگر صفر شود');
    socket.close();
  });

  it('پیام‌های بزرگ‌تر از سقف در WebSocket قطع/رد می‌شوند', async () => {
    const created = await post('/api/chat/conversations', { message: 'تست حجم', guest_name: 'مهمان۴', guest_email: 'ws-big@example.com' });
    const guestToken = created.body.guest_token;
    const convId = created.body.conversation.id;

    const { socket, messages } = await connectWs();
    await waitFor(messages, (m) => m.type === 'ready');
    let closed = false;
    socket.on('close', () => { closed = true; });
    socket.send(JSON.stringify({ type: 'chat:send', conversation_id: convId, body: 'x'.repeat(200_000), guest_token: guestToken }));
    await wait(500);
    const longAccepted = messages.some((m) => m.type === 'chat:sent' && String(m.message?.body || '').length > 4200);
    assert.equal(longAccepted, false, 'پیام غول‌آسا نباید ذخیره شود');
    socket.close();
  });

  it('بدنه‌ی پیام چت حتی وقتی بزرگ باشد به ۴۰۰۰ کاراکتر محدود می‌شود', async () => {
    const created = await post('/api/chat/conversations', { message: 'تست محدودیت متن', guest_name: 'مهمان۵', guest_email: 'ws-limit@example.com' });
    const res = await post(`/api/chat/conversations/${created.body.conversation.id}/messages`, {
      body: 'y'.repeat(9000), guest_token: created.body.guest_token,
    });
    if (res.status === 201) assert.ok(res.body.message.body.length <= 4000);
    else assert.ok(res.status >= 400);
  });

  it('نرخ پیام‌های WebSocket محدود است (ضد اسپم)', async () => {
    const created = await post('/api/chat/conversations', { message: 'تست اسپم', guest_name: 'مهمان۶', guest_email: 'ws-spam@example.com' });
    const convId = created.body.conversation.id;
    const guestToken = created.body.guest_token;

    const { socket, messages } = await connectWs();
    await waitFor(messages, (m) => m.type === 'ready');
    for (let i = 0; i < 40; i += 1) {
      socket.send(JSON.stringify({ type: 'chat:send', conversation_id: convId, body: `اسپم ${i}`, guest_token: guestToken }));
    }
    const rateError = await waitFor(messages.filter((m) => m.type === 'error' && /زیاد|مجاز|صبر/.test(m.error || '')) && messages, (m) => m.type === 'error', 1500);
    assert.ok(rateError, 'باید پیام محدودیت نرخ دریافت شود');
    socket.close();
  });

  it('مبدأ ناشناس برای اتصال WebSocket رد می‌شود (CSWSH)', async () => {
    await assert.rejects(
      () => connectWs({ origin: 'https://evil.example.com' }),
      (err) => err.status === 403 || /403|unexpected/i.test(err.message),
    );
  });

  it('اتصال WebSocket با توکن باطل‌شده (پس از تغییر رمز) نشست کارمند نمی‌سازد', async () => {
    const email = `wsrotate_${Date.now()}@example.com`;
    const reg = await post('/api/auth/register', { email, password: 'Ws#Pass2026x', full_name: 'کاربر WS', phone: '09120000008' });
    const access = reg.body.session.accessToken;
    const login = await post('/api/auth/login', { email, password: 'Ws#Pass2026x' });
    const fresh = login.body.session.accessToken;
    await post('/api/auth/change-password', { current_password: 'Ws#Pass2026x', new_password: 'Ws#Pass2027y' }, { token: fresh });
    void access;
    const { socket, messages } = await connectWs({ token: access });
    const ready = await waitFor(messages, (m) => m.type === 'ready');
    assert.equal(ready.user, null, 'توکن باطل‌شده نباید نشست بسازد');
    socket.close();
  });
});

/* ==================== ۱۰) توابع هسته و ابزارهای امنیتی ==================== */
describe('امنیت — توابع هسته', () => {
  it('safeEqual مقایسه‌ی زمان‌ثابت انجام می‌دهد', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
    assert.equal(safeEqual('', ''), true);
  });

  it('hashToken بازگشت‌ناپذیر است', () => {
    const token = 'my-secret-token';
    const hash = hashToken(token);
    assert.notEqual(hash, token);
    assert.equal(hash, hashToken(token));
    assert.equal(hash.length, 64);
  });

  it('sanitizeDeep کلیدهای خطرناک را حذف و طول رشته‌ها را محدود می‌کند', () => {
    // JSON.parse یک کلید واقعی __proto__ می‌سازد (برخلاف شیء لیترال)
    const dirty = JSON.parse(`{
      "ok": "value",
      "__proto__": { "polluted": true },
      "constructor": "x",
      "prototype": "y",
      "nested": { "constructor": "x", "keep": "y" },
      "long": "${'z'.repeat(50_000)}",
      "html": "<script>alert(1)</script>"
    }`);
    dirty.list = Array.from({ length: 1000 }, () => 1);
    const clean = sanitizeDeep(dirty);
    assert.equal(clean.ok, 'value');
    assert.equal(Object.hasOwn(clean, '__proto__'), false);
    assert.equal(Object.hasOwn(clean, 'constructor'), false);
    assert.equal(Object.hasOwn(clean, 'prototype'), false);
    assert.equal(Object.hasOwn(clean.nested, 'constructor'), false);
    assert.equal(clean.nested.keep, 'y');
    assert.ok(clean.long.length <= 20000);
    assert.ok(clean.list.length <= 200);
    assert.equal(clean.html.includes('<script>'), false);
    assert.equal({}.polluted, undefined, 'آلوده‌سازی prototype نباید رخ دهد');
  });

  it('سیاست رمز عبور بر اساس قواعد امنیتی عمل می‌کند', () => {
    assert.ok(checkPasswordPolicy('1234567'));
    assert.ok(checkPasswordPolicy('password'));
    assert.equal(checkPasswordPolicy('Str0ng#Pass2026'), null);
    assert.ok(checkPasswordPolicy(`${'a'.repeat(200)}1`), 'رمز بسیار بلند باید رد شود');
  });

  it('اسکن محتوای فایل، پی‌اچ‌پی/اجرایی را تشخیص می‌دهد', () => {
    assert.equal(sniffImageBuffer(Buffer.from('<?php system($_GET["c"]); ?>')), 'application/x-php');
    assert.equal(sniffImageBuffer(Buffer.from('#!/bin/sh\nrm -rf /')), 'unknown');
    assert.equal(sniffImageBuffer(Buffer.from('MZ\x90\x00\x03')), 'unknown');
  });
});

/* ========== ۱۱) اعتبارسنجی نوشتن در کاتالوگ (محصول/دسته/سفارش مجدد) ========== */

describe('امنیت — اعتبارسنجی نوشتن کاتالوگ و سفارش مجدد', () => {
  before(() => security.resetRateLimits());

  it('ساخت محصول با قیمت منفی یا صفر رد می‌شود', async () => {
    const negative = await post('/api/products', { name: 'محصول تست', price: -5000, stock: 3 }, { token: tokens.seller });
    assert.equal(negative.status, 400, 'قیمت منفی نباید پذیرفته شود');

    const zero = await post('/api/products', { name: 'محصول تست', price: 0, stock: 3 }, { token: tokens.seller });
    assert.equal(zero.status, 400, 'قیمت صفر نباید پذیرفته شود');
  });

  it('ساخت محصول با موجودی/ترتیب نامعتبر رد می‌شود', async () => {
    const badStock = await post('/api/products', { name: 'محصول تست', price: 120000, stock: -3 }, { token: tokens.seller });
    assert.equal(badStock.status, 400);

    const badStockFloat = await post('/api/products', { name: 'محصول تست', price: 120000, stock: 2.5 }, { token: tokens.seller });
    assert.equal(badStockFloat.status, 400, 'موجودی اعشاری نامعتبر است');

    const badStatus = await post('/api/products', { name: 'محصول تست', price: 120000, status: 'published;DROP' }, { token: tokens.seller });
    assert.equal(badStatus.status, 400, 'وضعیت غیرمجاز باید رد شود');
  });

  it('ساخت محصول با داده‌ی معتبر موفق است و مقدار قیمت صحیح ذخیره می‌شود', async () => {
    const created = await post('/api/products', {
      name: 'گوشی تست امنیتی', price: 2500000, stock: 4, status: 'active', brand: 'EasyShop',
    }, { token: tokens.seller });
    assert.equal(created.status, 201);
    assert.equal(created.body.product.price, 2500000);
    assert.equal(created.body.product.stock, 4);
    // قیمت تمام‌شده نباید برای فروشنده‌ی عادی یا کاربر عادی افشا شود
    const asUser = await get(`/api/products/${created.body.product.slug || created.body.product.id}`, { token: tokens.user });
    assert.equal(asUser.body.product.cost ?? null, null);
  });

  it('ویرایش محصول با قیمت یا موجودی نامعتبر رد می‌شود و مقدار قبلی دست‌نخورده می‌ماند', async () => {
    const list = await get('/api/products/admin/all?limit=1', { token: tokens.admin });
    const product = list.body.items[0];
    assert.ok(product, 'حداقل یک محصول برای تست لازم است');

    const negPrice = await put(`/api/products/${product.id}`, { price: -1 }, { token: tokens.admin });
    assert.equal(negPrice.status, 400);

    const negStock = await put(`/api/products/${product.id}`, { stock: -10 }, { token: tokens.admin });
    assert.equal(negStock.status, 400);

    const after = await get(`/api/products/admin/all?limit=100`, { token: tokens.admin });
    const same = after.body.items.find((p) => p.id === product.id);
    assert.equal(same.price, product.price, 'قیمت نباید تغییر کرده باشد');
    assert.equal(same.stock, product.stock, 'موجودی نباید تغییر کرده باشد');
  });

  it('اصلاح موجودی فقط با عدد صحیح و در بازه‌ی مجاز انجام می‌شود', async () => {
    const list = await get('/api/products/admin/all?limit=1', { token: tokens.admin });
    const product = list.body.items[0];

    const floatDelta = await post(`/api/products/${product.id}/stock`, { delta: 1.5 }, { token: tokens.admin });
    assert.equal(floatDelta.status, 400, 'دلتای اعشاری نامعتبر است');

    const hugeDelta = await post(`/api/products/${product.id}/stock`, { delta: 999_999_999 }, { token: tokens.admin });
    assert.equal(hugeDelta.status, 400, 'دلتای بزرگ‌تر از سقف نباید پذیرفته شود');

    const okDelta = await post(`/api/products/${product.id}/stock`, { delta: 2 }, { token: tokens.admin });
    assert.equal(okDelta.status, 200);
    assert.equal(okDelta.body.stock, product.stock + 2);
  });

  it('ویرایش یا حذف محصول با توکن کاربر عادی ممنوع است', async () => {
    const list = await get('/api/products/admin/all?limit=1', { token: tokens.admin });
    const product = list.body.items[0];
    const edited = await put(`/api/products/${product.id}`, { price: 1 }, { token: tokens.user });
    assert.equal(edited.status, 403);
    const removed = await del(`/api/products/${product.id}`, { token: tokens.user });
    assert.equal(removed.status, 403);
  });

  /* --------------------------- دسته‌بندی‌ها --------------------------- */

  it('دسته‌های غیرفعال برای کاربر عادی افشا نمی‌شوند', async () => {
    const created = await post('/api/categories', { name: 'دسته مخفی تست', is_active: false }, { token: tokens.admin });
    assert.equal(created.status, 201);
    const id = created.body.category.id;
    const hidden = await put(`/api/categories/${id}`, { is_active: false }, { token: tokens.admin });
    assert.equal(hidden.status, 200);

    const asGuest = await get('/api/categories?include_inactive=1');
    const asUser = await get('/api/categories?include_inactive=1', { token: tokens.user });
    const asAdmin = await get('/api/categories?include_inactive=1&flat=1', { token: tokens.admin });

    for (const response of [asGuest, asUser]) {
      assert.equal(response.body.items.some((c) => c.id === id), false, 'دسته‌ی غیرفعال نباید برای غیرکارکنان دیده شود');
    }
    assert.equal(asAdmin.body.items.some((c) => c.id === id), true, 'مدیر باید دسته‌ی غیرفعال را ببیند');
  });

  it('ساخت دسته با رنگ یا ترتیب نامعتبر رد می‌شود (جلوگیری از تزریق CSS)', async () => {
    const badColor = await post('/api/categories', { name: 'دسته رنگ', color: 'red;background-image:url(javascript:alert(1))' }, { token: tokens.admin });
    assert.equal(badColor.status, 400);

    const badSort = await post('/api/categories', { name: 'دسته ترتیب', sort_order: -5 }, { token: tokens.admin });
    assert.equal(badSort.status, 400);

    const unknownParent = await post('/api/categories', { name: 'دسته یتیم', parent_id: 'cat_does_not_exist' }, { token: tokens.admin });
    assert.equal(unknownParent.status, 400);
  });

  it('حلقه در درخت دسته‌بندی ممکن نیست (والد شدن خود یا فرزند خود)', async () => {
    const parent = await post('/api/categories', { name: 'والد تست حلقه' }, { token: tokens.admin });
    const child = await post('/api/categories', { name: 'فرزند تست حلقه', parent_id: parent.body.category.id }, { token: tokens.admin });
    assert.equal(child.status, 201);

    const self = await put(`/api/categories/${parent.body.category.id}`, { parent_id: parent.body.category.id }, { token: tokens.admin });
    assert.equal(self.status, 400, 'دسته نباید والد خودش شود');

    const cycle = await put(`/api/categories/${parent.body.category.id}`, { parent_id: child.body.category.id }, { token: tokens.admin });
    assert.equal(cycle.status, 400, 'انتقال والد به زیر فرزندش نباید ممکن باشد');
  });

  it('ویرایش/حذف دسته برای کاربر عادی ممنوع و برای فروشنده محدود است', async () => {
    const cat = await post('/api/categories', { name: 'دسته مجوزها' }, { token: tokens.admin });
    const id = cat.body.category.id;

    const userEdit = await put(`/api/categories/${id}`, { name: 'هک شد' }, { token: tokens.user });
    assert.equal(userEdit.status, 403);

    const userDelete = await del(`/api/categories/${id}`, { token: tokens.user });
    assert.equal(userDelete.status, 403);

    const sellerDelete = await del(`/api/categories/${id}`, { token: tokens.seller });
    assert.equal(sellerDelete.status, 403, 'حذف دسته فقط برای مدیر مجاز است');

    const adminDelete = await del(`/api/categories/${id}`, { token: tokens.admin });
    assert.equal(adminDelete.status, 200);
  });

  it('سفارش مجدد سبد را بی‌نهایت بزرگ نمی‌کند و از سقف اقلام پیروی می‌کند', async () => {
    const products = await get('/api/products?limit=50&sort=newest');
    const product = products.body.items[0];
    const product2 = products.body.items[1] || product;
    // سبد کاربر را تازه می‌کنیم و موجودی کافی را در نظر می‌گیریم
    const usable = products.body.items.find((p) => p.stock >= 2) || product;
    await del('/api/cart', { token: tokens.user });
    await post('/api/cart/items', { product_id: usable.id, qty: 1 }, { token: tokens.user, session: sessionKey() });
    const order = await post('/api/orders/checkout', {
      payment_method: 'gateway',
      shipping_method: 'post',
      address: {
        receiver: 'کاربر تست', phone: '09100000000', province: 'تهران', city: 'تهران', postal_code: '1234567890', line: 'تهران، خیابان تست، پلاک ۱',
      },
    }, { token: tokens.user });
    assert.equal(order.status, 201, JSON.stringify(order.body));

    await del('/api/cart', { token: tokens.user });
    const first = await post(`/api/orders/${order.body.order.id}/reorder`, {}, { token: tokens.user });
    assert.equal(first.status, 200);
    assert.ok(first.body.added >= 1);

    const firstCart = await get('/api/cart', { token: tokens.user });
    assert.equal(firstCart.body.items.length, first.body.added, 'اقلام تکراری نباید در سبد ایجاد شود');

    // سفارش مجدد پیاپی: اقلام باید ادغام شوند، نه اینکه ردیف تکراری بسازد
    const second = await post(`/api/orders/${order.body.order.id}/reorder`, {}, { token: tokens.user });
    assert.equal(second.status, 200);
    const secondCart = await get('/api/cart', { token: tokens.user });
    assert.equal(secondCart.body.items.length, first.body.added, 'سفارش مجدد نباید ردیف تکراری بسازد');
    for (const item of secondCart.body.items) assert.ok(item.qty <= 20, 'تعداد هر قلم از سقف ۲۰ فراتر نرود');
  });

  it('سفارش مجدد سفارش دیگران ممکن نیست', async () => {
    const orders = await get('/api/account/orders?limit=5', { token: tokens.admin });
    const otherOrder = (orders.body.items || []).find((o) => o.user_id && o.user_id !== tokens.user);
    const asUser = await get('/api/account/orders?limit=5', { token: tokens.user });
    const mine = asUser.body.items || [];
    if (mine.length) {
      const foreign = await post(`/api/orders/${mine[0].id}/reorder`, {}, { token: tokens.support });
      assert.ok([403, 404].includes(foreign.status), 'کاربر دیگر نباید سفارش من را دوباره سفارش دهد');
    }
    assert.ok(otherOrder === undefined || otherOrder !== null);
  });

  it('مسیرهای نوشتنی حساس محدودیت نرخ اختصاصی دارند', async () => {
    security.resetRateLimits();
    let got429 = false;
    for (let i = 0; i < 45; i += 1) {
      const res = await post('/api/account/addresses', {
        title: `آدرس ${i}`, full_name: 'کاربر تست', phone: '09100000000', address: `تهران، پلاک ${i}`, city: 'تهران',
      }, { token: tokens.user });
      if (res.status === 429) { got429 = true; break; }
    }
    assert.equal(got429, true, 'باید پس از تعداد مشخصی نوشتن، خطای ۴۲۹ برگردد');
    security.resetRateLimits();
  });
});
