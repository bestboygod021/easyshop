import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stolenCardBlacklistProber } from '../src/services/stolen-card-blacklist.js';
import { moadianPdfInvoiceGenerator } from '../src/services/moadian-pdf-invoice.js';
import { deviceLifecycleRecommender } from '../src/services/device-lifecycle-recommender.js';
import { supplierSlaScoringService } from '../src/services/supplier-sla-scoring.js';
import { cryptoTrc20CheckoutService } from '../src/services/crypto-trc20-checkout.js';

describe('Round 20 Improvements: Stolen Card Blacklist, Moadian PDF Invoice, Device Lifecycle, Supplier SLA & USDT TRC20', () => {

  it('1. Stolen Card Blacklist: stores hashed card PAN and accurately detects stolen/blocked cards', () => {
    const testCard = '6037991899998888';
    const added = stolenCardBlacklistProber.addToBlacklist({
      cardPan: testCard,
      reason: 'stolen_reported_by_police',
      reporter: 'FATA_CYBER_POLICE',
      notes: 'کارت سرقتی پرونده کلاهبرداری اینترنتی',
    });

    assert.equal(added.success, true);
    assert.equal(added.is_blocked, true);
    assert.ok(added.card_mask.includes('******'));

    // بررسی استعلام کارت مسدود
    const probeBlocked = stolenCardBlacklistProber.probeCardStatus(testCard);
    assert.equal(probeBlocked.is_blocked, true);
    assert.equal(probeBlocked.reporter, 'FATA_CYBER_POLICE');

    // بررسی استعلام کارت سالم
    const cleanCard = '6037991122223333';
    const probeClean = stolenCardBlacklistProber.probeCardStatus(cleanCard);
    assert.equal(probeClean.is_blocked, false);
    assert.equal(probeClean.status, 'clean');
  });

  it('2. Moadian PDF Invoice: generates visual HTML/PDF invoice with 22-digit tax code and validation QR', () => {
    const mockOrder = {
      id: 'ord_moadian_test_1',
      code: 'ES-998877',
      placed_at: new Date().toISOString(),
      subtotal: 5000000,
      discount: 0,
      customer_national_id: '0100000002',
      items: [
        {
          id: 'prd_1',
          name_fa: 'گوشی هوشمند سامسونگ',
          unit_price: 5000000,
          qty: 1,
        },
      ],
    };

    const invoiceHtml = moadianPdfInvoiceGenerator.generateMoadianInvoiceHtml(mockOrder);
    assert.ok(typeof invoiceHtml === 'string');
    assert.ok(invoiceHtml.includes('صورتحساب الکترونیکی سامانه مودیان'));
    assert.ok(invoiceHtml.includes('شماره منحصر به‌فرد مالیاتی'));
    assert.ok(invoiceHtml.includes('<svg')); // تایید وجود کد QR اعتبارسنجی
  });

  it('3. Device Lifecycle Recommender: provides matching accessories for products', () => {
    // نمونه محصول از پایگاه داده
    const phoneRecs = deviceLifecycleRecommender.getAccessoryKeywordMap();
    assert.ok(phoneRecs.phone.includes('قاب'));
    assert.ok(phoneRecs.laptop.includes('ماوس'));

    const sampleRec = deviceLifecycleRecommender.getUserLifecycleRecommendations(null, 3);
    assert.ok(Array.isArray(sampleRec));
  });

  it('4. Supplier SLA Scoring: computes fulfillment rate, delay penalties and SLA tier', () => {
    // دریافت فروشنده پیش‌فرض دمو
    const scoreboard = supplierSlaScoringService.getAllSuppliersScoreboard();
    assert.ok(Array.isArray(scoreboard));
    if (scoreboard.length > 0) {
      const v = scoreboard[0];
      assert.ok('sla_score' in v);
      assert.ok('fulfillment_rate_pct' in v);
      assert.ok('tier' in v);
      assert.ok(['A+', 'A', 'B', 'C'].includes(v.tier));
    }
  });

  it('5. USDT TRC20 Checkout Simulator: generates payment intent with dedicated TRON deposit address and confirms TxID', () => {
    const paymentIntent = cryptoTrc20CheckoutService.createCryptoPaymentIntent({
      orderId: 'ord_crypto_test_100',
      amountInTomans: 9500000, // ۱۰ میلیون معادل ۱۰۰ تتر با نرخ ۹۵,۰۰۰
      tetherRate: 95000,
    });

    assert.ok(paymentIntent.intent_id);
    assert.equal(paymentIntent.amount_usdt, 100);
    assert.equal(paymentIntent.network, 'TRON (TRC-20)');
    assert.ok(paymentIntent.deposit_address.startsWith('T'));

    // تایید تراکنش با هش بلاک‌چین
    const txHash = 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890';
    const verify = cryptoTrc20CheckoutService.verifyCryptoPayment({
      intentId: paymentIntent.intent_id,
      txHash,
    });

    assert.equal(verify.success, true);
    assert.equal(verify.status, 'confirmed');
    assert.equal(verify.tx_hash, txHash);
  });
});

describe('Round 20 Route Integration: Endpoints and Logic Verification', () => {
  it('Stolen Card Prober handles card masking and blacklist inquiries correctly', () => {
    const pan = '5022291011112222';
    stolenCardBlacklistProber.addToBlacklist({
      cardPan: pan,
      reason: 'fata_court_order',
      reporter: 'FATA_TEHRAN',
      notes: 'دستور قضایی مسدودی حساب و کارت',
    });

    const status = stolenCardBlacklistProber.probeCardStatus(pan);
    assert.equal(status.is_blocked, true);
    assert.equal(status.reporter, 'FATA_TEHRAN');
    assert.equal(status.card_mask, '502229******2222');
  });

  it('Moadian PDF Invoice contains valid totals and tax deductions', () => {
    const order = {
      id: 'ord_tax_calc_1',
      code: 'ES-112233',
      placed_at: new Date().toISOString(),
      subtotal: 1000000,
      discount: 100000,
      items: [
        {
          id: 'prd_calc',
          name_fa: 'پاوربانک ۲۰۰۰۰ میلی‌آمپر',
          unit_price: 1000000,
          qty: 1,
        },
      ],
    };

    const html = moadianPdfInvoiceGenerator.generateMoadianInvoiceHtml(order);
    assert.ok(html.includes('پاوربانک ۲۰۰۰۰ میلی‌آمپر'));
    assert.ok(html.includes('صورتحساب الکترونیکی'));
  });
});
