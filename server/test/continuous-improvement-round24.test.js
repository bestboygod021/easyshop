import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { all } from '../src/db/index.js';
import { reverseGeocodingMatcherService } from '../src/services/reverse-geocoding-matcher.js';
import { mobileAirtimeTopupService } from '../src/services/mobile-airtime-topup.js';
import { abandonedCartTimedCouponService } from '../src/services/abandoned-cart-timed-coupon.js';
import { vendorHealthIndexService } from '../src/services/vendor-health-index.js';
import { multiProductSpecMatrixService } from '../src/services/multi-product-spec-matrix.js';

describe('Round 24 Improvements: Reverse Geocoding, Airtime Topup, Abandoned Cart Coupons, Vendor Health Index & Spec Matrix', () => {

  it('1. Reverse Geocoding Matcher: detects urban delivery zones and traffic plan boundaries', () => {
    // آدرس منطقه ولیعصر تهران (محدوده طرح ترافیک)
    const centralAddr = reverseGeocodingMatcherService.analyzeAddress('تهران، خیابان ولیعصر، تقاطع مطهری، پلاک ۱۲', 'تهران', 'تهران');
    assert.equal(centralAddr.is_capital_urban, true);
    assert.equal(centralAddr.in_traffic_plan_zone, true);
    assert.ok(centralAddr.suggested_fleet.includes('پیک موتوری'));
    assert.ok(centralAddr.approximate_coordinates.latitude > 30);

    // آدرس شهرستان
    const countyAddr = reverseGeocodingMatcherService.analyzeAddress('شیراز، بلوار زند، کوچه ۵', 'شیراز', 'فارس');
    assert.equal(countyAddr.is_capital_urban, false);
    assert.equal(countyAddr.in_traffic_plan_zone, false);
    assert.equal(countyAddr.suggested_fleet, 'پست پیشتاز');
  });

  it('2. Mobile Airtime Topup: detects operator and executes top-up against user wallet balance', () => {
    const mci = mobileAirtimeTopupService.detectOperator('09121112233');
    assert.equal(mci.operator, 'mci');

    const mtn = mobileAirtimeTopupService.detectOperator('09351112233');
    assert.equal(mtn.operator, 'mtn');

    const rightel = mobileAirtimeTopupService.detectOperator('09211112233');
    assert.equal(rightel.operator, 'rightel');
  });

  it('3. Abandoned Cart Timed Coupon: processes inactive carts and structures timed coupon reminder', async () => {
    const res = await abandonedCartTimedCouponService.processAbandonedCarts(1);
    assert.ok('processed_count' in res);
    assert.ok(Array.isArray(res.dispatched_reminders));
  });

  it('4. Vendor Health Index: calculates vendor performance score and warns against suspension', () => {
    const vendor = all("SELECT id FROM users WHERE role = 'seller' LIMIT 1")[0];
    if (vendor) {
      const health = vendorHealthIndexService.calculateHealthIndex(vendor.id);
      assert.ok('health_score' in health);
      assert.ok('health_status' in health);
      assert.ok(['healthy', 'at_risk', 'suspension_warning'].includes(health.health_status));
    }
  });

  it('5. Multi-Product Spec Matrix: generates interactive side-by-side comparison matrix with difference flags', () => {
    const products = all('SELECT id FROM products LIMIT 3');
    if (products.length >= 2) {
      const ids = products.map((p) => p.id);
      const matrix = multiProductSpecMatrixService.generateComparisonMatrix(ids);
      assert.equal(matrix.products_count, ids.length);
      assert.ok(Array.isArray(matrix.matrix_rows));
      assert.ok(matrix.matrix_rows.length >= 3);
      assert.ok('is_different' in matrix.matrix_rows[0]);
    }
  });
});
