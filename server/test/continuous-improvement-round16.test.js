import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { postalAddressMatcher } from '../src/services/postal-address-matcher.js';
import { multiWarehouseService } from '../src/services/multi-warehouse.js';
import { priceStockAuditService } from '../src/services/price-stock-audit.js';
import { watermarkedInvoiceService } from '../src/services/watermarked-invoice.js';
import { demandForecastService } from '../src/services/demand-forecast.js';
import { all } from '../src/db/index.js';

describe('Round 16 Improvements: Postal Matcher, Multi-Warehouse, Price Audit, Watermarked Invoice & Demand Forecast', () => {

  it('1. Postal Matcher: verifies postal code prefix against destination province', () => {
    // 1983963113 کد پستی تهران (پیشوند ۱)
    const matchTehran = postalAddressMatcher.verifyMatch('1983963113', 'تهران');
    assert.equal(matchTehran.is_valid, true);
    assert.equal(matchTehran.matched, true);

    // پیشوند ۱ با استان اصفهان نباید تطابق داشته باشد
    const mismatch = postalAddressMatcher.verifyMatch('1983963113', 'اصفهان');
    assert.equal(mismatch.is_valid, true);
    assert.equal(mismatch.matched, false);
  });

  it('2. Multi-Warehouse: selects nearest regional warehouse based on province', () => {
    const list = multiWarehouseService.getWarehouses();
    assert.ok(list.length >= 3);

    const isfahanDest = multiWarehouseService.findOptimalWarehouse('یزد');
    assert.equal(isfahanDest.id, 'wh_isfahan');

    const defaultCentral = multiWarehouseService.findOptimalWarehouse('البرز');
    assert.equal(defaultCentral.id, 'wh_tehran');
  });

  it('3. Price Audit: records changes in price and stock with author credentials', () => {
    const products = all(`SELECT id FROM products LIMIT 1`);
    const prdId = products[0]?.id || 'prd_test_audit';

    const log = priceStockAuditService.logChange({
      productId: prdId,
      userId: 'usr_staff_manager',
      role: 'admin',
      oldPrice: 100000,
      newPrice: 120000,
      oldStock: 50,
      newStock: 45,
      ip: '127.0.0.1',
      reason: 'افزایش قیمت مصوب شرکت',
    });

    assert.ok(log.audit_id);
    assert.equal(log.price_diff, 20000);
    assert.equal(log.stock_diff, -5);

    const history = priceStockAuditService.getProductAuditHistory(prdId, 5);
    assert.ok(history.length >= 1);
  });

  it('4. Watermarked Invoice: exports styled invoice with payment state watermark', () => {
    const orders = all(`SELECT id FROM orders LIMIT 1`);
    if (orders.length > 0) {
      const inv = watermarkedInvoiceService.generateWatermarkedInvoice(orders[0].id);
      assert.ok(inv);
      assert.ok(inv.html_content.includes('watermark'));
      assert.ok(typeof inv.is_paid === 'boolean');
    }
  });

  it('5. Demand Forecast: analyzes 30-day velocity and suggests reorder replenishment', () => {
    const recommendations = demandForecastService.getReorderRecommendations(7);
    assert.ok(Array.isArray(recommendations));
    assert.ok(recommendations.length > 0);
    assert.ok(typeof recommendations[0].daily_velocity === 'number');
    assert.ok(['ok', 'warning', 'critical'].includes(recommendations[0].urgency));
  });
});
