import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-ci-round3-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SEED_DEMO_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const { app, bootstrap } = await import('../src/index.js');
bootstrap();

const { generateCode128Svg, formatIranCode } = await import('../src/services/barcode.js');
const { smartCache } = await import('../src/services/cache.js');
const { calculateRfmSegments } = await import('../src/services/rfm.js');
const { all, get, nowIso, run, uid } = await import('../src/db/index.js');

describe('ماژول‌های پیشرفته دور سوم بهبود مستمر', () => {
  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('تولید بارکد استاندارد GS1-128 و ایران‌کد به صورت SVG', () => {
    const svg = generateCode128Svg('IR-PROD-98765');
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('IR-PROD-98765'));

    const formatted = formatIranCode('1234567890123456');
    assert.equal(formatted, '12345-67890-123456');
  });

  it('کش توزیع‌شده هوشمند درون‌حافظه‌ای با ابطال کلید (SmartCache)', () => {
    smartCache.set('prod:100', { name: 'گوشی موبایل' }, 10);
    const cached = smartCache.get('prod:100');
    assert.deepEqual(cached, { name: 'گوشی موبایل' });

    smartCache.invalidatePrefix('prod:');
    assert.equal(smartCache.get('prod:100'), null);
  });

  it('محاسبه بخش‌بندی RFM مشتریان فروشگاه', () => {
    const rfm = calculateRfmSegments();
    assert.ok(Array.isArray(rfm));
    if (rfm.length > 0) {
      const first = rfm[0];
      assert.ok('scores' in first);
      assert.ok('segment' in first);
      assert.ok('recency_days' in first);
    }
  });

  it('ثبت اشتراک شارژ مجدد کالا (Back in Stock Notification)', () => {
    const product = get("SELECT id FROM products WHERE status = 'active' LIMIT 1");
    const subId = uid('sub');
    run(
      `INSERT INTO back_in_stock_subscriptions (id, product_id, user_id, contact, status, created_at)
       VALUES (?, ?, NULL, '09123456789', 'pending', ?)`,
      subId, product.id, nowIso(),
    );

    const record = get('SELECT * FROM back_in_stock_subscriptions WHERE id = ?', subId);
    assert.equal(record.status, 'pending');
    assert.equal(record.contact, '09123456789');
  });

  it('ثبت تله‌متری خطاهای مرورگر کلاینت', () => {
    const errId = uid('err');
    run(
      `INSERT INTO client_telemetry_errors (id, error_msg, url, user_agent, created_at)
       VALUES (?, 'Uncaught TypeError in React Component', '/checkout', 'Mozilla/5.0', ?)`,
      errId, nowIso(),
    );

    const record = get('SELECT * FROM client_telemetry_errors WHERE id = ?', errId);
    assert.ok(record.error_msg.includes('TypeError'));
  });
});
