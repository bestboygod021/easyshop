import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bnplCreditScoringService } from '../src/services/bnpl-scoring.js';
import { warrantyExpiryService } from '../src/services/warranty-expiry.js';
import { deliveryGeolocationService } from '../src/services/delivery-geolocation.js';
import { volumePricingService } from '../src/services/volume-pricing.js';
import { smartBundleService } from '../src/services/smart-bundle.js';
import { all } from '../src/db/index.js';

describe('Round 18 Improvements: BNPL Scoring, Warranty Expiry, Geolocation, Volume Pricing & Smart Bundles', () => {

  it('1. BNPL Scoring: evaluates credit score and defines installment limit', () => {
    const guestResult = bnplCreditScoringService.evaluateCreditScore(null);
    assert.equal(guestResult.eligible_for_bnpl, false);

    const users = all(`SELECT id FROM users LIMIT 1`);
    if (users.length > 0) {
      const userResult = bnplCreditScoringService.evaluateCreditScore(users[0].id);
      assert.ok(typeof userResult.credit_score === 'number');
      assert.ok(userResult.credit_score >= 300);
      assert.ok(typeof userResult.max_credit_limit === 'number');
    }
  });

  it('2. Warranty Expiry: finds warranties approaching termination within window', () => {
    const upcoming = warrantyExpiryService.getUpcomingExpiringWarranties(60);
    assert.ok(Array.isArray(upcoming));
  });

  it('3. Geolocation: verifies coordinates in Iran and computes distance in km', () => {
    const tehranLat = 35.6892;
    const tehranLng = 51.3890;
    const isfahanLat = 32.6546;
    const isfahanLng = 51.6680;

    const distance = deliveryGeolocationService.calculateDistanceKm(tehranLat, tehranLng, isfahanLat, isfahanLng);
    assert.ok(distance > 300 && distance < 400); // فاصله هوایی حدود ۳۴۰ کیلومتر

    const addresses = all(`SELECT id FROM addresses LIMIT 1`);
    if (addresses.length > 0) {
      const pin = deliveryGeolocationService.attachCoordinatesToAddress({
        addressId: addresses[0].id,
        latitude: tehranLat,
        longitude: tehranLng,
      });
      assert.equal(pin.is_within_iran_bounds, true);
      assert.ok(pin.map_url.includes('neshan.org'));
    }
  });

  it('4. Volume Pricing: applies graduated discounts on bulk quantities', () => {
    const basePrice = 100000;

    // خرید تکی: بدون تخفیف
    const single = volumePricingService.calculateTieredPrice(basePrice, 1);
    assert.equal(single.unit_price, 100000);
    assert.equal(single.discount_percentage, 0);

    // خرید بالای ۵ عدد: ۳٪ تخفیف
    const tier5 = volumePricingService.calculateTieredPrice(basePrice, 5);
    assert.equal(tier5.unit_price, 97000);
    assert.equal(tier5.discount_percentage, 3);

    // خرید بالای ۱۰ عدد: ۷٪ تخفیف
    const tier10 = volumePricingService.calculateTieredPrice(basePrice, 10);
    assert.equal(tier10.unit_price, 93000);
    assert.equal(tier10.discount_percentage, 7);

    // خرید بالای ۲۰ عدد: ۱۲٪ تخفیف
    const tier20 = volumePricingService.calculateTieredPrice(basePrice, 20);
    assert.equal(tier20.unit_price, 88000);
    assert.equal(tier20.discount_percentage, 12);
  });

  it('5. Smart Bundles: generates package deals with combined savings', () => {
    const bundles = smartBundleService.getSuggestedBundles();
    assert.ok(Array.isArray(bundles));
    assert.ok(bundles.length >= 1);
    assert.ok(bundles[0].savings > 0);
    assert.ok(bundles[0].items.length >= 2);

    const cartProductIds = all("SELECT id FROM products WHERE status = 'active' LIMIT 2").map((product) => product.id);
    const cartRelevantBundles = smartBundleService.getSuggestedBundles(cartProductIds);
    assert.ok(Array.isArray(cartRelevantBundles));
  });
});
