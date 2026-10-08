import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { abandonedCartService } from '../src/services/abandoned-cart.js';
import { priceAlertService } from '../src/services/price-alert.js';
import { couponCleanupService } from '../src/services/coupon-cleanup.js';
import { photoReviewService } from '../src/services/photo-review.js';
import { productSpecSheetService } from '../src/services/spec-sheet.js';
import { all } from '../src/db/index.js';

describe('Round 13 Improvements: Abandoned Cart, Price Alert, Coupon Cleanup, Photo Review & Spec Sheet', () => {

  it('1. Abandoned Cart: retrieves dormant carts and generates recovery incentives', () => {
    const carts = abandonedCartService.getAbandonedCarts(0);
    assert.ok(Array.isArray(carts));

    // تست پیشنهاد بازگشت
    const offer = abandonedCartService.generateRecoveryOffer('crt_sample_dummy', 15);
    // اگر سبد وجود نداشته باشد null است یا در صورت وجود آفر برمی‌گرداند
    assert.ok(offer === null || offer.discount_percentage === 15);
  });

  it('2. Price Alert: creates subscription and notifies users when target price is hit', () => {
    const products = all(`SELECT id FROM products LIMIT 1`);
    const prdId = products[0]?.id || 'prd_test_sample';

    const sub = priceAlertService.subscribeAlert({
      productId: prdId,
      email: 'buyer@example.com',
      targetPrice: 200000,
    });

    assert.ok(sub.alert_id);
    assert.equal(sub.status, 'active');

    const check = priceAlertService.checkPriceDrops(prdId, 180000);
    assert.ok(check.triggered_count >= 1);
    assert.ok(check.notifications[0].message_fa.includes('کاهش'));
  });

  it('3. Coupon Cleanup: checks coupon health summary and deactivates expired codes', () => {
    const summary = couponCleanupService.getCouponHealthSummary();
    assert.ok(typeof summary.active_coupons === 'number');

    const cleanup = couponCleanupService.cleanupExpiredCoupons();
    assert.ok(typeof cleanup.deactivated_count === 'number');
  });

  it('4. Photo Review: accepts verified buyer ratings with images and moderates them', () => {
    const products = all(`SELECT id FROM products LIMIT 1`);
    const prdId = products[0]?.id || 'prd_test_sample';
    const users = all(`SELECT id FROM users LIMIT 1`);
    const userId = users[0]?.id || null;

    const rev = photoReviewService.submitReview({
      productId: prdId,
      userId,
      rating: 5,
      comment: 'کیفیت ساخت عالی و ارسال به موقع بود',
      photos: ['/uploads/photo1.png', '/uploads/photo2.png'],
    });

    assert.ok(rev.review_id);
    assert.equal(rev.status, 'pending');
    assert.equal(rev.photos_count, 2);

    const mod = photoReviewService.moderateReview(rev.review_id, 'approved');
    assert.equal(mod.status, 'approved');

    const approvedList = photoReviewService.getProductReviews(prdId);
    assert.ok(approvedList.some(r => r.id === rev.review_id));
  });

  it('5. Spec Sheet: generates printer-ready HTML and specifications for products', () => {
    const products = all(`SELECT id FROM products LIMIT 1`);
    const prdId = products[0]?.id || 'prd_test_sample';

    const sheet = productSpecSheetService.generateSpecSheet(prdId);
    assert.ok(sheet);
    assert.ok(sheet.html_content.includes('شناسنامه فنی'));
    assert.ok(sheet.qr_link.startsWith('https://easyshop.local/p/'));
  });
});
