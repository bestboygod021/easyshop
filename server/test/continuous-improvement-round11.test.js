import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceSigner } from '../src/services/invoice-signer.js';
import { recommendationService } from '../src/services/recommendations.js';
import { multiCurrencyService } from '../src/services/multi-currency.js';
import { clientErrorAggregator } from '../src/services/client-error-aggregator.js';
import { deliveryDateEstimator } from '../src/services/delivery-estimator.js';

describe('Round 11 Improvements: Invoice Signer, Cross-Sell, Multi-Currency, Error Aggregator & Delivery Estimator', () => {

  it('1. Invoice Signer: generates deterministic SHA-256 HMAC and verifies signature', () => {
    const orderPayload = {
      code: 'ES-140030',
      created_at: '2026-03-31T12:00:00Z',
      subtotal: 500000,
      tax: 50000,
      total: 550000,
      customer_phone: '09121112233',
    };

    const signed = invoiceSigner.signInvoice(orderPayload);
    assert.ok(signed.hash);
    assert.equal(signed.signature.length, 32);

    // بررسی امضای معتبر
    const validCheck = invoiceSigner.verifyInvoice(orderPayload, signed.signature);
    assert.equal(validCheck.valid, true);

    // بررسی امضای دستکاری شده
    const fakeSignature = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
    const fakeCheck = invoiceSigner.verifyInvoice(orderPayload, fakeSignature);
    assert.equal(fakeCheck.valid, false);
  });

  it('2. Cross-Sell Recommendations: queries related products and upsell upgrades', () => {
    const crossSell = recommendationService.getFrequentlyBoughtTogether('prd_sample_id', 4);
    assert.ok(Array.isArray(crossSell));

    const upsell = recommendationService.getUpsellRecommendations('cat_sample', 100000, 4);
    assert.ok(Array.isArray(upsell));
  });

  it('3. Multi-Currency: converts tomans to rials and USDT accurately', () => {
    multiCurrencyService.setTetherRate(100000); // برای سادگی تست: هر تتر ۱۰۰ هزار تومان
    const res = multiCurrencyService.convertAmount(250000);

    assert.equal(res.toman, 250000);
    assert.equal(res.rial, 2500000);
    assert.equal(res.usdt, 2.5);
    assert.ok(res.formatted.toman.includes('تومان'));
    assert.ok(res.formatted.rial.includes('ریال'));
  });

  it('4. Client Error Aggregator: groups errors by fingerprint and aggregates occurrences', () => {
    const uniqueUrl = `https://shop.ir/checkout-${Date.now()}`;
    const errPayload = {
      errorMsg: 'Uncaught TypeError: Cannot read properties of undefined',
      url: uniqueUrl,
      userAgent: 'Mozilla/5.0 Chrome/120',
    };

    // ثبت بار اول
    const record1 = clientErrorAggregator.recordError(errPayload);
    assert.equal(record1.occurrences, 1);
    assert.equal(record1.is_new, true);

    // ثبت مجدد همان خطا
    const record2 = clientErrorAggregator.recordError(errPayload);
    assert.equal(record2.occurrences, 2);
    assert.equal(record2.is_new, false);

    const topErrors = clientErrorAggregator.getTopErrors(5);
    assert.ok(topErrors.length >= 1);
    assert.equal(topErrors.some(e => e.fingerprint.includes(uniqueUrl) && e.occurrences === 2), true);
  });

  it('5. Delivery Estimator: calculates working days bypassing Fridays', () => {
    // تست پیک درون شهری تهران (همان روز)
    const peykEst = deliveryDateEstimator.estimateDelivery('peyk', 'تهران');
    assert.equal(peykEst.business_days_needed, 0);

    // تست تیپاکس و پست پیشتاز
    const postEst = deliveryDateEstimator.estimateDelivery('post', 'اصفهان');
    assert.equal(postEst.business_days_needed, 3);
    assert.ok(postEst.estimated_range_fa.includes('بین'));
    assert.ok(postEst.estimated_date_iso.length, 10);
  });
});
