import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidIranianPostalCode, guessProvinceByPostalCode } from '../src/services/postal-code.js';
import { disputeService } from '../src/services/disputes.js';
import { splitPaymentService } from '../src/services/split-payment.js';
import { tieredDiscountService } from '../src/services/tiered-discounts.js';
import { renderPersianInvoiceHtml } from '../src/services/invoice-pdf.js';

describe('Round 9 Improvements: Postal Code, e-Namad Disputes, Split Payment, Tiered Discounts & Persian Invoice HTML', () => {

  it('1. Postal Code: validates 10-digit format and guesses province prefix', () => {
    // کد معتبر تهران با پیشوند ۱
    assert.equal(isValidIranianPostalCode('1999912345'), true);
    assert.equal(guessProvinceByPostalCode('1999912345'), 'تهران');

    // کدهای نامعتبر (دارای 0 یا 2 در ارقام اولیه، یا طول نادرست)
    assert.equal(isValidIranianPostalCode('0123456789'), false);
    assert.equal(isValidIranianPostalCode('2123456789'), false);
    assert.equal(isValidIranianPostalCode('12345'), false);
    assert.equal(isValidIranianPostalCode('abc'), false);
  });

  it('2. e-Namad Disputes: registers complaint with 48h deadline and records response', () => {
    const dispute = disputeService.createDispute({
      orderId: 'ord_1234',
      customerName: 'علی رضایی',
      phone: '09121111111',
      title: 'تأخیر در ارسال مرسوله',
      description: 'سفارش من پس از ۵ روز هنوز به دستم نرسیده است.',
      category: 'delivery',
    });

    assert.ok(dispute.id);
    assert.ok(dispute.trackingCode.startsWith('DSP-'));
    assert.equal(dispute.status, 'open');

    // پاسخ کارشناس
    const response = disputeService.respondToDispute(dispute.id, {
      responderId: 'usr_admin',
      responseMessage: 'با عرض پوزش، بسته به اداره پست تحویل شد و کد رهگیری ارسال گردید.',
      newStatus: 'resolved',
    });
    assert.equal(response.status, 'resolved');
    assert.ok(response.answeredAt);
  });

  it('3. Split Payment: accurately divides checkout between wallet balance and gateway', () => {
    // سناریو ۱: موجودی کیف پول کمتر از کل سفارش
    const split1 = splitPaymentService.calculateSplit(150000, 50000, true);
    assert.equal(split1.walletDeduction, 50000);
    assert.equal(split1.gatewayPayable, 100000);
    assert.equal(split1.requiresGateway, true);
    assert.equal(split1.fullPaidByWallet, false);

    // سناریو ۲: موجودی کیف پول بیشتر یا مساوی کل سفارش
    const split2 = splitPaymentService.calculateSplit(100000, 150000, true);
    assert.equal(split2.walletDeduction, 100000);
    assert.equal(split2.gatewayPayable, 0);
    assert.equal(split2.requiresGateway, false);
    assert.equal(split2.fullPaidByWallet, true);

    // سناریو ۳: عدم استفاده از کیف پول
    const split3 = splitPaymentService.calculateSplit(100000, 100000, false);
    assert.equal(split3.walletDeduction, 0);
    assert.equal(split3.gatewayPayable, 100000);
  });

  it('4. Tiered Discounts: grants stepped discounts based on cart subtotal', () => {
    // خرید زیر ۵۰۰ هزار تومان -> بدون تخفیف
    const tier0 = tieredDiscountService.evaluateCartTier(300000);
    assert.equal(tier0.eligible, false);
    assert.equal(tier0.discountPct, 0);

    // خرید بین ۵۰۰ هزار تا ۱ میلیون تومان -> ۵ درصد
    const tier1 = tieredDiscountService.evaluateCartTier(600000);
    assert.equal(tier1.eligible, true);
    assert.equal(tier1.discountPct, 5);
    assert.equal(tier1.discountAmount, 30000);

    // خرید بالای ۲ میلیون تومان -> ۱۵ درصد
    const tier3 = tieredDiscountService.evaluateCartTier(2500000);
    assert.equal(tier3.eligible, true);
    assert.equal(tier3.discountPct, 15);
    assert.equal(tier3.discountAmount, 375000);
  });

  it('5. Persian Invoice HTML: renders clean, RTL formatted official document', () => {
    const html = renderPersianInvoiceHtml({
      code: 'ES-140029',
      placed_at: '2026-03-31T10:00:00Z',
      customer_name: 'محمد موسوی',
      phone: '09123456789',
      address_line: 'تهران، خیابان شریعتی',
      subtotal: 1000000,
      discount: 100000,
      shipping_cost: 35000,
      total: 935000,
      items: [
        { name_fa: 'پسته رفسنجان', qty: 2, unit_price: 500000 },
      ],
    });

    assert.ok(html.includes('dir="rtl"'));
    assert.ok(html.includes('ES-140029'));
    assert.ok(html.includes('پسته رفسنجان'));
    assert.ok(html.includes('فروشگاه آنلاین ایزی‌شاپ'));
  });
});
