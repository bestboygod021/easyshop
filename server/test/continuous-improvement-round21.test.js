import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shippingSmsNotifier } from '../src/services/shipping-sms-notifier.js';
import { vendorOnboardingService } from '../src/services/vendor-onboarding.js';
import { searchTrendAnalyticsService } from '../src/services/search-trend-analytics.js';
import { bnplSimulatorService } from '../src/services/bnpl-simulator.js';
import { openGraphMetaService } from '../src/services/opengraph-meta.js';

describe('Round 21 Improvements: Shipping SMS, Vendor Onboarding, Search Trends, BNPL & OpenGraph', () => {

  it('1. Shipping SMS: formats and sends tracking SMS for dispatched orders', async () => {
    const mockOrder = {
      user_name: 'امیر رضایی',
      code: 'ES-778899',
      id: 'ord_sample_sms_1',
    };
    const sms = shippingSmsNotifier.formatShippingSms(mockOrder, '12345678901234567890', 'پست ویژه');
    assert.ok(sms.includes('امیر رضایی'));
    assert.ok(sms.includes('12345678901234567890'));
    assert.ok(sms.includes('پست ویژه'));
  });

  it('2. Vendor Onboarding: accepts application with valid National ID & IBAN, and allows admin review', () => {
    const validNid = '0100000002'; // معتبر
    const validIban = 'IR700120000000000000000000'; // معتبر ۲۴ رقمی بر اساس ISO 13616

    const app = vendorOnboardingService.submitApplication({
      storeName: 'فروشگاه دیجیتال برتر',
      nationalId: validNid,
      shebaIban: validIban,
      phone: '09121112233',
      province: 'تهران',
      city: 'تهران',
    });

    assert.ok(app.application_id);
    assert.equal(app.status, 'pending_review');

    // تایید توسط مدیر
    const review = vendorOnboardingService.reviewApplication(app.application_id, {
      action: 'approve',
      reviewNotes: 'مدارک تایید شد',
    });
    assert.equal(review.new_status, 'approved');
  });

  it('3. Search Trend Analytics: logs query searches and returns top trends', () => {
    searchTrendAnalyticsService.logSearchQuery({
      query: 'گوشی آیفون ۱۳',
      resultsCount: 5,
    });
    searchTrendAnalyticsService.logSearchQuery({
      query: 'کابل شارژ تایپ سی',
      resultsCount: 0,
    });

    const trends = searchTrendAnalyticsService.getTopTrendingSearches(5);
    assert.ok(Array.isArray(trends));
    assert.ok(trends.length > 0);

    const zero = searchTrendAnalyticsService.getZeroResultSearches(5);
    assert.ok(Array.isArray(zero));
  });

  it('4. BNPL 4-Installments Simulator: calculates interest-free installments for products', () => {
    const calc = bnplSimulatorService.calculateInstallments(4000000); // ۴ میلیون تومان
    assert.equal(calc.is_eligible, true);
    assert.equal(calc.installments_count, 4);
    assert.equal(calc.installment_amount, 1000000); // هر قسط ۱ میلیون تومان
    assert.equal(calc.providers.length, 2);
    assert.equal(calc.installment_schedule.length, 4);
  });

  it('5. OpenGraph Meta Tags: generates rich preview tags for social networks', () => {
    const mockProduct = {
      id: 'prd_og_test',
      slug: 'samsung-s24-ultra',
      name_fa: 'گوشی سامسونگ اس ۲۴ اولترا',
      short_desc_fa: 'پرچمدار جدید با دوربین ۲۰۰ مگاپیکسلی و قلم S-Pen',
      price: 65000000,
      stock: 10,
      images: ['https://easyshop.ir/uploads/s24.png'],
    };

    const tags = openGraphMetaService.generateProductMetaTags(mockProduct);
    assert.ok(tags.includes('og:title'));
    assert.ok(tags.includes('گوشی سامسونگ اس ۲۴ اولترا'));
    assert.ok(tags.includes('twitter:card'));
    assert.ok(tags.includes('product:price:amount'));
  });
});
