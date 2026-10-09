import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-ci-round4-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SEED_DEMO_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const { app, bootstrap } = await import('../src/index.js');
bootstrap();

const { evaluateTransactionRisk } = await import('../src/services/anti-fraud.js');
const { createProductBundle, getBundleDetails } = await import('../src/services/bundles.js');
const { findAbandonedCarts } = await import('../src/services/abandoned-cart.js');
const { trackConsignment } = await import('../src/services/courier-tracking.js');
const { getProviderHealthMetrics } = await import('../src/services/payment-gateway.js');
const { all, get } = await import('../src/db/index.js');

describe('ماژول‌های پیشرفته دور چهارم بهبود مستمر', () => {
  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('موتور ارزیابی ضد تقلب و الگوهای ریسک پرداخت (Anti-Fraud)', () => {
    // Low risk transaction
    const safeCheck = evaluateTransactionRisk({ userId: 'u1', ip: '192.168.1.1', amount: 500000 });
    assert.equal(safeCheck.is_suspicious, false);

    // High risk large amount
    const highAmount = evaluateTransactionRisk({ userId: 'u2', ip: '1.2.3.4', amount: 150_000_000 });
    assert.ok(highAmount.risk_score > 0);
  });

  it('سیستم پکیج‌های محصول و تخفیف‌های باندل (Product Bundling)', () => {
    const prods = all("SELECT id FROM products WHERE status = 'active' LIMIT 2");
    assert.ok(prods.length >= 2);

    const bundle = createProductBundle({
      title: 'بسته ویژه لوازم جانبی',
      discountPct: 15,
      items: [
        { product_id: prods[0].id, qty: 1 },
        { product_id: prods[1].id, qty: 2 },
      ],
    });

    assert.ok(bundle.id.startsWith('bnd_'));
    assert.equal(bundle.discount_pct, 15);
    assert.ok(bundle.bundle_price < bundle.original_total);

    const fetched = getBundleDetails(bundle.id);
    assert.equal(fetched.title, 'بسته ویژه لوازم جانبی');
  });

  it('شناسایی سبدهای رهاشده و پیشنهادهای بازگشت به خرید (Abandoned Cart)', () => {
    const abandoned = findAbandonedCarts(0); // instant cutoff for test
    assert.ok(Array.isArray(abandoned));
  });

  it('رهگیری مرسولات پست پیشتاز و تیپاکس (Courier Tracking)', () => {
    const postTracking = trackConsignment({ carrier: 'post', trackingCode: '1092837465' });
    assert.ok(postTracking.carrier.includes('پست'));
    assert.ok(Array.isArray(postTracking.checkpoints));
    assert.ok(postTracking.carrier_tracking_url.includes('post.ir'));

    const tipaxTracking = trackConsignment({ carrier: 'tipax', trackingCode: '9876543210' });
    assert.ok(tipaxTracking.carrier.includes('تیپاکس'));
    assert.ok(tipaxTracking.carrier_tracking_url.includes('tipax.com'));
  });

  it('سنجش سلامت لحظه‌ای درگاه‌های پرداخت (Gateway Health & Failover)', () => {
    const health = getProviderHealthMetrics(60);
    assert.ok(Array.isArray(health));
  });
});
