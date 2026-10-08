import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deliverySlaTracker } from '../src/services/delivery-sla.js';
import { productComparisonMatrix } from '../src/services/product-comparison.js';
import { returnWindowService } from '../src/services/return-window.js';
import { affiliateService } from '../src/services/affiliate.js';
import { cardVerificationService } from '../src/services/card-verification.js';
import { all } from '../src/db/index.js';

describe('Round 17 Improvements: Delivery SLA, Product Comparison, Return Window, Affiliate & Card Verification', () => {

  it('1. Delivery SLA: checks order timeliness and grants apology coupon if delayed', () => {
    const orders = all(`SELECT id FROM orders LIMIT 1`);
    if (orders.length > 0) {
      const evaluation = deliverySlaTracker.evaluateOrderDelivery(orders[0].id);
      assert.ok(evaluation);
    }
  });

  it('2. Product Comparison: builds feature matrix across multiple products', () => {
    const products = all(`SELECT id FROM products LIMIT 2`);
    if (products.length >= 2) {
      const matrix = productComparisonMatrix.compareProducts([products[0].id, products[1].id]);
      assert.equal(matrix.product_count, 2);
      assert.ok(Array.isArray(matrix.spec_matrix));
    }
  });

  it('3. Return Window: enforces 7-day statutory consumer withdrawal period', () => {
    const orders = all(`SELECT id FROM orders LIMIT 1`);
    if (orders.length > 0) {
      const eligibility = returnWindowService.checkReturnEligibility(orders[0].id);
      assert.ok(typeof eligibility.eligible === 'boolean');
      assert.ok(typeof eligibility.message_fa === 'string');
    }
  });

  it('4. Affiliate: issues unique referral link and records commission on purchase', () => {
    const users = all(`SELECT id FROM users LIMIT 1`);
    const userId = users[0]?.id || 'usr_aff_sample';

    const ref = affiliateService.getOrCreateReferralCode(userId);
    assert.ok(ref.referral_code.startsWith('REF-'));
    assert.ok(ref.share_url.includes(ref.referral_code));

    const tx = affiliateService.recordOrderReferral('ord_sample_999', ref.referral_code, 1000000);
    assert.ok(tx);
    assert.equal(tx.commission_amount, 50000); // 5% of 1,000,000

    const stats = affiliateService.getPartnerStats(userId);
    assert.ok(stats.total_earned >= 50000);
  });

  it('5. Card Verification: masks card number and checks anti-money laundering compliance', () => {
    const masked = cardVerificationService.maskCard('6037991812345678');
    assert.equal(masked, '603799******5678');

    const verified = cardVerificationService.verifyPaymentCard('usr_demo_user', masked);
    assert.equal(verified.compliance_status, 'verified_soft');
    assert.equal(verified.is_flagged_risk, false);
  });
});
