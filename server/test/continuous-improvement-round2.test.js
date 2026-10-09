import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-ci-round2-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SEED_DEMO_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const { app, bootstrap } = await import('../src/index.js');
bootstrap();

const { getCartRecommendations } = await import('../src/services/recommendation.js');
const { validateIranianPostalCode, normalizeAddress } = await import('../src/services/address-normalizer.js');
const { virtualWaitingRoom } = await import('../src/services/waiting-room.js');
const { paymentGatewayInfo, normalizePaymentProvider } = await import('../src/services/payment-gateway.js');
const { all, get, run } = await import('../src/db/index.js');

describe('ماژول‌های پیشرفته دور دوم بهبود مستمر', () => {
  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('موتور پیشنهادگر هوشمند سبد خرید (Cart Recommendations)', () => {
    // Choose a category with a guaranteed fallback candidate; demo stock is randomized and may be zero.
    const category = get("SELECT category_id FROM products WHERE status='active' GROUP BY category_id HAVING COUNT(*) >= 3 LIMIT 1");
    assert.ok(category, 'seed data should include a category with at least three products');
    run("UPDATE products SET stock=MAX(stock,1) WHERE category_id=? AND status='active'", category.category_id);
    const products = all("SELECT id FROM products WHERE status='active' AND category_id=? ORDER BY id LIMIT 2", category.category_id);
    const pIds = products.map((p) => p.id);
    const recs = getCartRecommendations(pIds, 3);
    assert.ok(Array.isArray(recs));
    assert.ok(recs.length > 0);
    assert.ok(recs.every((r) => !pIds.includes(r.id)));
  });

  it('اعتبارسنجی کد پستی ۱۰ رقمی ایران و نرمال‌سازی آدرس', () => {
    // Valid postal code
    const valid = validateIranianPostalCode('1983963114');
    assert.equal(valid.valid, true);
    assert.equal(valid.postal_code, '1983963114');

    // Invalid length
    const invalidShort = validateIranianPostalCode('12345');
    assert.equal(invalidShort.valid, false);

    // Invalid start with 0 or 2
    const invalidStart = validateIranianPostalCode('2983963114');
    assert.equal(invalidStart.valid, false);

    // Normalize full address with geolocation
    const norm = normalizeAddress({
      province: 'تهران',
      city: 'تهران',
      line: 'خیابان ولیعصر کوچه نسترن',
      postalCode: '1983963114',
      lat: 35.72,
      lng: 51.41,
    });
    assert.equal(norm.geocoded, true);
    assert.equal(norm.city, 'تهران');
    assert.ok(norm.coordinates);
  });

  it('اتاق انتظار و صف نوبت‌دهی فروش ویژه (Virtual Waiting Room)', () => {
    const entry = virtualWaitingRoom.requestEntry('user_test_123');
    assert.equal(entry.status, 'granted');
    assert.ok(entry.token.startsWith('vwr_'));

    const isValid = virtualWaitingRoom.validateTicket(entry.token);
    assert.equal(isValid, true);

    const isFakeValid = virtualWaitingRoom.validateTicket('vwr_fake_ticket');
    assert.equal(isFakeValid, false);

    const released = virtualWaitingRoom.releaseTicket(entry.token);
    assert.equal(virtualWaitingRoom.validateTicket(entry.token), false);
  });

  it('شناسایی درگاه BNPL / اسنپ‌پی در ارائه‌دهندگان مجاز', () => {
    assert.equal(normalizePaymentProvider('snapppay'), 'snapppay');
    assert.equal(normalizePaymentProvider('snapp-pay'), 'snapppay');
    assert.equal(normalizePaymentProvider('bnpl'), 'snapppay');

    const info = paymentGatewayInfo('snapppay');
    assert.equal(info.provider, 'snapppay');
    assert.ok(info.label.includes('اسنپ‌پی'));
  });
});
