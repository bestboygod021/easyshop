import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-ci-test-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SEED_DEMO_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const { app, bootstrap } = await import('../src/index.js');
bootstrap();

const { reconcileBankSettlements, calculateReorderPoints } = await import('../src/services/reconciliation.js');
const { enqueueWebhookEvent, processWebhookOutbox } = await import('../src/services/outbox.js');
const { metricsRegistry } = await import('../src/services/metrics.js');
const { all, get, nowIso, run, uid } = await import('../src/db/index.js');

describe('موتور بهبود مستمر (Reconciliation, Webhook Outbox, Inventory, Metrics)', () => {
  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('مغایرت‌گیری بانکی: کشف تراکنش‌های تطبیق‌یافته، ناموجود و مبالغ مغایر', () => {
    const order = get('SELECT id, code FROM orders LIMIT 1');
    const dummyRef = uid('ref');
    const dummyPay = uid('pay');
    run(
      `INSERT INTO payments (id, order_id, provider, amount, status, authority, ref_id, created_at)
       VALUES (?, ?, 'zibal', 250000, 'paid', ?, ?, ?)`,
      dummyPay,
      order ? order.id : null,
      dummyRef,
      dummyRef,
      nowIso(),
    );

    const bankReport = [
      { reference_id: dummyRef, amount: 250000 },
      { reference_id: uid('unknown'), amount: 100000 },
    ];

    const result = reconcileBankSettlements(bankReport, 'zibal');
    assert.equal(result.total_processed, 2);
    assert.equal(result.matched, 1);
    assert.equal(result.missing_locally, 1);
    assert.equal(result.records[0].status, 'matched');
    assert.equal(result.records[1].status, 'missing_locally');
  });

  it('پیش‌بینی تقاضا و نقطه سفارش مجدد کالاها (Reorder Point)', () => {
    const rpoints = calculateReorderPoints(7);
    assert.ok(Array.isArray(rpoints));
    assert.ok(rpoints.length > 0);
    const first = rpoints[0];
    assert.ok('current_stock' in first);
    assert.ok('reorder_point' in first);
    assert.ok('safety_stock' in first);
    assert.ok('needs_reorder' in first);
  });

  it('صف ارسال وب‌هوک مالی و یکپارچه‌سازی (Webhook Outbox)', async () => {
    const testId = enqueueWebhookEvent('test.event', { invoice: '1234', amount: 50000 });
    assert.ok(testId.startsWith('wh_'));

    const item = get('SELECT * FROM webhook_outbox WHERE id = ?', testId);
    assert.equal(item.status, 'pending');

    const results = await processWebhookOutbox(10);
    assert.ok(results.length > 0);

    const updated = get('SELECT * FROM webhook_outbox WHERE id = ?', testId);
    assert.equal(updated.status, 'skipped');
  });

  it('معیارهای استاندارد پرومتئوس و رصدپذیری لحظه‌ای', () => {
    metricsRegistry.recordPayment('zibal', 'success');
    metricsRegistry.recordHttp('GET', '/api/products', 200, 12.5);

    const text = metricsRegistry.toPrometheusText();
    assert.ok(text.includes('easyshop_uptime_seconds'));
    assert.ok(text.includes('easyshop_http_requests_total'));
    assert.ok(text.includes('easyshop_http_request_duration_ms'));
    assert.ok(text.includes('easyshop_payment_attempts_total{provider="zibal",status="success"}'));
  });
});
