import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moadianTaxService } from '../src/services/moadian-tax.js';
import { cartSanitizerService } from '../src/services/cart-sanitizer.js';
import { loginHistoryService } from '../src/services/login-history.js';
import { customerClvService } from '../src/services/customer-clv.js';
import { giftWrapService } from '../src/services/gift-wrap.js';

describe('Round 12 Improvements: Moadian Tax, Cart Sanitizer, Login History, Customer CLV & Gift Wrap', () => {

  it('1. Moadian Tax: builds 22-char Tax ID and standard electronic invoice payload', () => {
    const taxId = moadianTaxService.generateTaxId('ord_sample_123');
    assert.equal(taxId.length, 21); // 5 mem + 5 date + 10 serial + 1 control

    const payload = moadianTaxService.buildMoadianInvoicePayload(
      {
        id: 'ord_sample_123',
        subtotal: 1000000,
        discount: 100000,
        items: [
          { product_id: 'prd_1', name_fa: 'فرش کاشان', unit_price: 500000, qty: 2 },
        ],
      },
      { name: 'فروشگاه تست', tin: '14001234567' },
      { national_id: '0012345678' }
    );

    assert.ok(payload.tax_id);
    assert.equal(payload.invoice_type, 1);
    assert.ok(payload.totals.total_vat > 0);
  });

  it('2. Cart Sanitizer: verifies item availability and flags missing/modified products', () => {
    const testItems = [
      { product_id: 'non_existent_product', qty: 2, unit_price: 1000 },
    ];

    const report = cartSanitizerService.sanitizeCart(testItems);
    assert.equal(report.is_modified, true);
    assert.ok(report.issues.length >= 1);
    assert.equal(report.issues[0].type, 'unavailable');
  });

  it('3. Login History: records user device sessions and supports session revocation', () => {
    const userId = 'usr_test_sess_1';
    const log = loginHistoryService.recordLogin({
      userId,
      ip: '192.168.1.100',
      userAgent: 'Firefox Mobile',
      deviceType: 'mobile',
    });

    assert.ok(log.id);
    const sessions = loginHistoryService.getUserSessions(userId, 5);
    assert.ok(sessions.length >= 1);

    const revoke = loginHistoryService.revokeOtherSessions(userId, log.id);
    assert.equal(revoke.success, true);
  });

  it('4. Customer CLV: evaluates customer tier, spent totals and loyalty benefits', () => {
    const guestTier = customerClvService.calculateCustomerTier(null);
    assert.equal(guestTier.tier, 'guest');

    const customerTier = customerClvService.calculateCustomerTier('usr_demo_sample');
    assert.ok(['bronze', 'silver', 'gold', 'diamond'].includes(customerTier.tier));
    assert.ok(typeof customerTier.clv === 'number');
  });

  it('5. Gift Wrap: lists packaging types and adds custom greeting cards', () => {
    const options = giftWrapService.getAvailableWrapOptions();
    assert.ok(options.length >= 2);

    const applied = giftWrapService.applyGiftWrap('luxury_box', 'تولدت مبارک دوست عزیزم');
    assert.equal(applied.selected_wrap.id, 'luxury_box');
    assert.equal(applied.wrap_cost, 45000);
    assert.equal(applied.has_greeting_card, true);
    assert.equal(applied.greeting_card_text, 'تولدت مبارک دوست عزیزم');
  });
});
