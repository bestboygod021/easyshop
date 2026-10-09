import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidIranianNationalCode, isValidIranianIban } from '../src/services/iran-validators.js';
import { proformaInvoiceService } from '../src/services/proforma-invoice.js';
import { stockAlertService } from '../src/services/stock-alerts.js';
import { searchCacheService } from '../src/services/search-cache.js';
import { dbMaintenanceService } from '../src/services/db-maintenance.js';

describe('Round 8 Improvements: Iran Validators, Proforma Invoices, Stock Alerts, Search Cache & DB Maintenance', () => {

  it('1. Iranian Validators: validates National ID checksum and IBAN MOD-97', () => {
    // نمونه‌های نامعتبر کد ملی
    assert.equal(isValidIranianNationalCode('1111111111'), false, 'All identical digits must fail');
    assert.equal(isValidIranianNationalCode('123'), false, 'Too short must fail');
    assert.equal(isValidIranianNationalCode('1234567890'), false, 'Invalid checksum must fail');

    // نمونه‌های معتبر و نامعتبر شبا
    assert.equal(isValidIranianIban('IR000000000000000000000000'), false);
    assert.equal(isValidIranianIban('invalid-iban'), false);
  });

  it('2. Proforma Invoice: creates formal invoice with tax, checks expiry and converts', () => {
    const proforma = proformaInvoiceService.createProforma({
      customerName: 'شرکت فناوری نوین',
      phone: '09120000000',
      address: 'تهران، خیابان آزادی',
      items: [
        { name: 'زعفران صادراتی', unit_price: 100000, quantity: 2 },
      ],
      validDays: 14,
    });

    assert.ok(proforma.id);
    assert.equal(proforma.subtotal, 200000);
    assert.equal(proforma.tax, 20000); // 10% tax
    assert.equal(proforma.total, 220000);

    const fetched = proformaInvoiceService.getProforma(proforma.id);
    assert.equal(fetched.customer_name, 'شرکت فناوری نوین');
    assert.equal(fetched.is_expired, false);

    const converted = proformaInvoiceService.convertToOrder(proforma.id);
    assert.equal(converted.success, true);
  });

  it('3. Stock Alerts: subscribes users and notifies when inventory restocked', () => {
    const sub = stockAlertService.subscribeUser('prd_test_sample', {
      phone: '09351234567',
    });
    assert.ok(sub.id);
    assert.equal(sub.subscribed, true);

    const notifyResult = stockAlertService.notifyRestockedProduct('prd_test_sample', 10);
    assert.ok(notifyResult.notifiedCount >= 1);

    const lowStock = stockAlertService.getLowStockProducts(100);
    assert.ok(Array.isArray(lowStock));
  });

  it('4. Search Cache: accelerates repeated fuzzy searches using SWR memory cache', async () => {
    const candidates = [
      'سامسونگ',
      'ایسوس',
      'شیائومی',
    ];

    const res1 = await searchCacheService.searchWithCache('سامسنوگ', candidates);
    assert.equal(res1.data, 'سامسونگ');
    assert.equal(res1.fromCache, false);

    const res2 = await searchCacheService.searchWithCache('سامسنوگ', candidates);
    assert.equal(res2.data, 'سامسونگ');
    assert.equal(res2.fromCache, true);
  });

  it('5. DB Maintenance: checks SQLite integrity and returns storage statistics', () => {
    const integrity = dbMaintenanceService.checkIntegrity();
    assert.equal(integrity.status, 'ok');
    assert.deepEqual(integrity.details, ['ok']);

    const stats = dbMaintenanceService.getDatabaseStats();
    assert.ok(stats.page_size > 0);
    assert.ok(stats.page_count > 0);
    assert.ok(stats.total_size_mb >= 0);

    const vacuumRes = dbMaintenanceService.vacuum();
    assert.equal(vacuumRes.success, true);
  });
});
