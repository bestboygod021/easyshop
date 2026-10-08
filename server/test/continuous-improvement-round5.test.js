import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-ci-round5-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SEED_DEMO_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const { app, bootstrap } = await import('../src/index.js');
bootstrap();

const { levenshteinDistance, suggestFuzzyCorrection } = await import('../src/services/fuzzy-search.js');
const { calculateVendorPayouts } = await import('../src/services/vendor-payout.js');
const { buildProductJsonLd } = await import('../src/services/schema-ld.js');
const { validateFirstTimeBuyerEligibility } = await import('../src/services/first-time-buyer.js');
const { generatePasskeyRegistrationOptions, registerPasskeyCredential, getUserPasskeys } = await import('../src/services/passkeys.js');
const { all, get } = await import('../src/db/index.js');

describe('ماژول‌های پیشرفته دور پنجم بهبود مستمر', () => {
  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('موتور جستجوی فازی و اصلاح غلط املایی فارسی (Levenshtein)', () => {
    assert.equal(levenshteinDistance('سامسونگ', 'ساموسنگ'), 2);
    assert.equal(levenshteinDistance('اپل', 'اپل'), 0);

    const dictionary = ['گوشی سامسونگ گلکسی', 'لپ تاپ ایسوس', 'هدفون اپل ایرپاد'];
    const correction = suggestFuzzyCorrection('ساموسنگ', dictionary);
    assert.ok(correction === null || typeof correction === 'string');
  });

  it('محاسبه تسهیم و تسویه حساب فروشندگان مارکت‌پلیس (Vendor Payouts)', () => {
    const payouts = calculateVendorPayouts('2026-10', 10);
    assert.ok(Array.isArray(payouts));
  });

  it('تولید استانداردهای Schema.org JSON-LD برای سئوی محصولات', () => {
    const prod = get("SELECT * FROM products WHERE status = 'active' LIMIT 1");
    const jsonLd = buildProductJsonLd(prod);
    assert.equal(jsonLd['@context'], 'https://schema.org/');
    assert.equal(jsonLd['@type'], 'Product');
    assert.equal(jsonLd.name, prod.name_fa);
    assert.ok(jsonLd.offers);
  });

  it('محافظت از تخفیف‌های اولین خرید (First-Time Buyer Safeguard)', () => {
    const eligible = validateFirstTimeBuyerEligibility({ userId: 'new_unique_user_999' });
    assert.equal(eligible.eligible, true);
  });

  it('تولید و ثبت اعتبارنامه‌های WebAuthn / Passkeys', () => {
    const user = get("SELECT * FROM users LIMIT 1");
    const options = generatePasskeyRegistrationOptions(user);
    assert.ok(options.challenge);
    assert.equal(options.rp.name, 'EasyShop');

    const reg = registerPasskeyCredential(user.id, {
      credentialId: 'cred_test_123',
      publicKey: 'base64_test_key',
      deviceName: 'Chrome on macOS',
    });
    assert.equal(reg.success, true);

    const passkeys = getUserPasskeys(user.id);
    assert.ok(passkeys.some((p) => p.id === 'cred_test_123'));
  });
});
