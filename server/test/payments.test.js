import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-payments-test-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SECRETS_DIR = path.join(TMP, 'secrets');
process.env.SEED_DEMO_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.AI_KEY_ENCRYPTION_KEY = 'easyshop-test-key-material-that-is-over-thirty-two-bytes';

const { app, bootstrap } = await import('../src/index.js');
const { config } = await import('../src/config.js');
const { all, get, run, uid } = await import('../src/db/index.js');
const { reconcileBankSettlements } = await import('../src/services/reconciliation.js');
const { resolveOrderPaymentReview } = await import('../src/services/order-lifecycle.js');
bootstrap();

let server;
let base;
let originalFetch;
let gatewayRequests = 0;
let gatewayVerifications = 0;
let forceAmountMismatch = false;
let authorityCounter = 0;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes('sandbox.zarinpal.com/pg/v4/payment/request.json')) {
      gatewayRequests += 1;
      authorityCounter += 1;
      return new Response(JSON.stringify({
        data: { code: 100, authority: `ZARINPAL_TEST_AUTH_${String(authorityCounter).padStart(4, '0')}` },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('sandbox.zarinpal.com/pg/v4/payment/verify.json')) {
      gatewayVerifications += 1;
      const request = JSON.parse(init.body || '{}');
      const amount = Number(request.amount) + (forceAmountMismatch ? 1 : 0);
      return new Response(JSON.stringify({ data: { code: 100, amount, ref_id: 123456789 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise((resolve) => server?.close(resolve));
  fs.rmSync(TMP, { recursive: true, force: true });
});

async function call(method, route, { token, body, headers = {} } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { response, payload };
}

const post = (route, body, options) => call('POST', route, { ...options, body });
const getJson = (route, options) => call('GET', route, options);

async function addCartProduct(token) {
  const { payload: products } = await getJson('/api/products?sort=cheapest&limit=50');
  const product = products.items.find((item) => item.stock > 0);
  assert.ok(product, 'seed data should include an available product');
  const added = await post('/api/cart/items', { product_id: product.id, qty: 1 }, { token });
  assert.equal(added.response.status, 201);
  return product;
}

async function checkoutWithZarinpal(token, idempotencyKey) {
  return post('/api/orders/checkout', {
    address: {
      receiver: 'کاربر آزمایش', phone: '09121112233', province: 'تهران', city: 'تهران',
      line: 'خیابان آزمون', postal_code: '1234567890',
    },
    shipping_method: 'post',
    payment_method: 'gateway',
    payment_provider: 'zarinpal',
  }, { token, headers: { 'idempotency-key': idempotencyKey } });
}

describe('پرداخت واقعی — callback، verify سمت سرور و idempotency', () => {
  it('redirect درگاه را ثبت می‌کند، callback را سمت سرور verify می‌کند و callback تکراری را بی‌خطر اعمال می‌کند', async () => {
    const previous = {
      isProd: config.isProd,
      provider: config.payment.provider,
      providers: [...config.payment.providers],
      allowMock: config.payment.allowMock,
      merchant: config.payment.zarinpalMerchantId,
      sandbox: config.payment.zarinpalSandbox,
    };
    config.isProd = false;
    config.payment.provider = 'zarinpal';
    config.payment.providers = ['zarinpal'];
    config.payment.allowMock = false;
    config.payment.zarinpalMerchantId = 'test-merchant';
    config.payment.zarinpalSandbox = true;
    forceAmountMismatch = false;

    try {
      const orphanCallback = await fetch(
        `${base}/api/payments/callback/zarinpal?Status=OK&Authority=ORPHAN_SECURITY_TEST_001`,
        { redirect: 'manual' },
      );
      assert.equal(orphanCallback.status, 303);
      assert.match(orphanCallback.headers.get('location'), /status=failed/);
      assert.equal(gatewayVerifications, 0, 'an unknown authority must never trigger a provider verification or credit');
      assert.equal(
        get("SELECT result FROM payment_callback_events WHERE callback_key IS NOT NULL ORDER BY created_at DESC LIMIT 1").result,
        'unknown_payment',
      );

      const login = await post('/api/auth/login', { email: 'user@easyshop.ir', password: 'Shopper#2026' });
      assert.equal(login.response.status, 200);
      const token = login.payload.session.accessToken;
      const product = await addCartProduct(token);
      const start = await checkoutWithZarinpal(token, 'zarinpal-checkout-key-0001');
      assert.equal(start.response.status, 201);
      assert.equal(start.payload.payment.provider, 'zarinpal');
      assert.match(start.payload.payment.redirect_url, /^https:\/\/sandbox\.zarinpal\.com\//);
      assert.ok(start.payload.payment.authority);
      assert.equal(start.payload.payment.intent_token, undefined, 'real providers do not receive mock intent tokens');
      assert.equal(gatewayRequests, 1);

      const replay = await checkoutWithZarinpal(token, 'zarinpal-checkout-key-0001');
      assert.equal(replay.response.status, 200);
      assert.equal(replay.payload.order.id, start.payload.order.id);
      assert.equal(replay.payload.payment.authority, start.payload.payment.authority);
      assert.equal(gatewayRequests, 1, 'idempotent retry must not create another provider payment');

      const directMockAttempt = await post(`/api/orders/${start.payload.order.id}/pay`, {
        success: true,
        authority: start.payload.payment.authority,
      }, { token });
      assert.equal(directMockAttempt.response.status, 503, 'real provider payments cannot be settled by the mock endpoint');

      const callbackUrl = `${base}/api/payments/callback/zarinpal?Status=OK&Authority=${encodeURIComponent(start.payload.payment.authority)}`;
      const firstCallback = await fetch(callbackUrl, { redirect: 'manual' });
      assert.equal(firstCallback.status, 303);
      assert.match(firstCallback.headers.get('location'), /status=success/);
      assert.equal(gatewayVerifications, 1);

      const paidOrder = await getJson(`/api/orders/${start.payload.order.id}`, { token });
      assert.equal(paidOrder.payload.order.payment_status, 'paid');
      const paidPayment = get('SELECT status, applied, ref_id, amount FROM payments WHERE order_id=?', start.payload.order.id);
      assert.deepEqual({ status: paidPayment.status, applied: paidPayment.applied }, { status: 'paid', applied: 1 });

      const duplicateCallback = await fetch(callbackUrl, { redirect: 'manual' });
      assert.equal(duplicateCallback.status, 303);
      assert.match(duplicateCallback.headers.get('location'), /status=success/);
      assert.equal(gatewayVerifications, 1, 'a settled payment must not be verified/applied twice');
      const callbackEvent = all('SELECT deliveries, result FROM payment_callback_events WHERE callback_key IS NOT NULL ORDER BY created_at DESC LIMIT 1')[0];
      assert.equal(callbackEvent.deliveries, 2);
      assert.equal(callbackEvent.result, 'duplicate_paid');

      const reconciliation = reconcileBankSettlements([
        { reference_id: paidPayment.ref_id, amount: Number(paidPayment.amount) },
        { reference_id: paidPayment.ref_id, amount: Number(paidPayment.amount) + 1 },
        { reference_id: 'UNKNOWN-BANK-REFERENCE', amount: 1000 },
      ], 'zarinpal');
      assert.deepEqual(
        { matched: reconciliation.matched, mismatched: reconciliation.mismatched_amount, missing: reconciliation.missing_locally },
        { matched: 1, mismatched: 1, missing: 1 },
        'provider statement reconciliation must expose matched, amount-mismatch, and orphan transactions',
      );

      const admin = get("SELECT id, full_name FROM users WHERE role = 'admin' LIMIT 1");
      const customerId = get("SELECT id FROM users WHERE email='user@easyshop.ir'").id;
      const walletBeforeRefund = Number(get('SELECT wallet FROM users WHERE id=?', customerId).wallet);
      const duplicateCapturedPaymentId = uid('pay');
      run(
        `INSERT INTO payments (id,order_id,provider,amount,status,authority,ref_id,applied,created_at)
         VALUES (?,?,?,?,'paid',?,?,0,?)`,
        duplicateCapturedPaymentId,
        start.payload.order.id,
        'zarinpal',
        paidPayment.amount,
        `ZARINPAL_DUPLICATE_${duplicateCapturedPaymentId}`,
        `DUPREF_${duplicateCapturedPaymentId}`,
        new Date().toISOString(),
      );
      const refund = resolveOrderPaymentReview({
        orderId: start.payload.order.id,
        actor: admin,
        note: 'بازپرداخت آزمون capture تکراری',
      });
      assert.equal(refund.refund_total, Number(paidPayment.amount));
      assert.equal(
        Number(get('SELECT wallet FROM users WHERE id=?', customerId).wallet),
        walletBeforeRefund + Number(paidPayment.amount),
      );
      assert.equal(get('SELECT status FROM payments WHERE id=?', duplicateCapturedPaymentId).status, 'refunded');
      assert.throws(
        () => resolveOrderPaymentReview({ orderId: start.payload.order.id, actor: admin }),
        (error) => error.status === 409,
        'duplicate refund retries must not credit the wallet twice',
      );

      await addCartProduct(token);
      const beforeStock = get('SELECT stock FROM products WHERE id=?', product.id).stock;
      const mismatchCheckout = await checkoutWithZarinpal(token, 'zarinpal-checkout-key-0002');
      assert.equal(mismatchCheckout.response.status, 201);
      forceAmountMismatch = true;
      const mismatchUrl = `${base}/api/payments/callback/zarinpal?Status=OK&Authority=${encodeURIComponent(mismatchCheckout.payload.payment.authority)}`;
      const mismatchCallback = await fetch(mismatchUrl, { redirect: 'manual' });
      assert.equal(mismatchCallback.status, 303);
      assert.match(mismatchCallback.headers.get('location'), /status=failed/);
      const failedOrder = get('SELECT status, payment_status FROM orders WHERE id=?', mismatchCheckout.payload.order.id);
      assert.equal(failedOrder.status, 'cancelled');
      assert.equal(failedOrder.payment_status, 'failed');
      assert.equal(get('SELECT status FROM payments WHERE order_id=?', mismatchCheckout.payload.order.id).status, 'failed');
      assert.equal(get('SELECT stock FROM products WHERE id=?', product.id).stock, beforeStock);
    } finally {
      config.isProd = previous.isProd;
      config.payment.provider = previous.provider;
      config.payment.providers = previous.providers;
      config.payment.allowMock = previous.allowMock;
      config.payment.zarinpalMerchantId = previous.merchant;
      config.payment.zarinpalSandbox = previous.sandbox;
      forceAmountMismatch = false;
    }
  });
});
