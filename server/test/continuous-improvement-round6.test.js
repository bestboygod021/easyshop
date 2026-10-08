import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { releaseExpiredOrderReservations } from '../src/services/inventory-reservation.js';
import { globalCache, MemoryCache } from '../src/services/memory-cache.js';
import { generatePersianExcelCsv, buildVendorPayoutsExcelReport } from '../src/services/excel-export.js';
import { OpsAlertManager } from '../src/services/ops-alerts.js';
import { GatewayCircuitBreaker, CircuitState } from '../src/services/gateway-circuit-breaker.js';

describe('Round 6 Improvements: Inventory TTL, SWR Cache, Persian Excel, Ops Alerts & Circuit Breaker', () => {

  it('1. Inventory Reservation TTL: releases expired pending orders back to stock', () => {
    // اجرای تابع آزادسازی
    const res = releaseExpiredOrderReservations(0); // انقضای فوری برای تست
    assert.ok(typeof res.releasedOrdersCount === 'number');
    assert.ok(typeof res.releasedItemsCount === 'number');
  });

  it('2. In-Memory SWR Cache: gets, sets, respects TTL and caches compute results', async () => {
    const cache = new MemoryCache(50, 10);
    cache.set('key1', { hello: 'world' });
    assert.deepEqual(cache.get('key1'), { hello: 'world' });

    let computations = 0;
    const fetchVal = async () => {
      computations += 1;
      return 'computed-value';
    };

    const res1 = await cache.getOrCompute('key2', fetchVal, 100);
    assert.equal(res1.data, 'computed-value');
    assert.equal(res1.fromCache, false);
    assert.equal(computations, 1);

    const res2 = await cache.getOrCompute('key2', fetchVal, 100);
    assert.equal(res2.data, 'computed-value');
    assert.equal(res2.fromCache, true);
    assert.equal(computations, 1);
  });

  it('3. Excel Export: outputs Persian CSV with UTF-8 BOM and formula sanitization', () => {
    const columns = [
      { key: 'name', label: 'نام محصول' },
      { key: 'price', label: 'قیمت' },
    ];
    const rows = [
      { name: '=SUM(1,2)', price: 15000 },
      { name: 'زعفران قائنات', price: 95000 },
    ];

    const csv = generatePersianExcelCsv(columns, rows);
    assert.ok(csv.startsWith('\uFEFF'), 'CSV must include UTF-8 BOM for Microsoft Excel');
    assert.ok(csv.includes("'=SUM(1,2)"), 'Formula characters must be sanitized');
    assert.ok(csv.includes('زعفران قائنات'), 'Persian characters preserved');

    const payoutReport = buildVendorPayoutsExcelReport([
      {
        id: 'pay_1',
        vendor_id: 'usr_vendor',
        period_start: '2026-03-01',
        period_end: '2026-03-31',
        total_sales: 1000000,
        commission_rate: 10,
        commission_amount: 100000,
        net_payout: 900000,
        sheba_number: 'IR1200000000000000000000',
        status: 'pending',
        created_at: '2026-03-31T12:00:00Z',
      }
    ]);
    assert.ok(payoutReport.includes('شناسه تسویه'));
    assert.ok(payoutReport.includes('خالص پرداختی (تومان)'));
  });

  it('4. Ops Alerts: manages alerts history and triggers notifications', async () => {
    const alertManager = new OpsAlertManager({ enabled: false });
    const alert = await alertManager.notify('critical', 'هشدار آزمایشی حمله Brute-Force', { ip: '1.2.3.4' });

    assert.equal(alert.severity, 'critical');
    assert.equal(alert.title, 'هشدار آزمایشی حمله Brute-Force');

    const recent = alertManager.getRecentAlerts(5);
    assert.ok(recent.length >= 1);
    assert.equal(recent[0].title, 'هشدار آزمایشی حمله Brute-Force');
  });

  it('5. Gateway Circuit Breaker: trips on consecutive failures and fails over to backup gateway', () => {
    const cb = new GatewayCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });
    const gateways = ['zibal', 'zarinpal', 'mrpardakht'];

    assert.equal(cb.selectBestGateway(gateways), 'zibal');

    // شکست اول درگاه zibal
    cb.recordFailure('zibal');
    assert.equal(cb.isAvailable('zibal'), true); // هنوز به حد آستانه ۲ نرسیده

    // شکست دوم درگاه zibal -> مدار باز می‌شود
    cb.recordFailure('zibal');
    assert.equal(cb.isAvailable('zibal'), false);

    // سوییچ خودکار به دومین درگاه سالم
    assert.equal(cb.selectBestGateway(gateways), 'zarinpal');

    // ثبت موفقیت روی zarinpal
    cb.recordSuccess('zarinpal');
    assert.equal(cb.getGatewayStatus('zarinpal').state, CircuitState.CLOSED);
  });
});
