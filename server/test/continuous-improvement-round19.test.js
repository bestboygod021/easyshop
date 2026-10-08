import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nationalCardVerifier } from '../src/services/national-card-verifier.js';
import { timeSlotDeliveryService } from '../src/services/time-slot-delivery.js';
import { consumableReplenishmentService } from '../src/services/consumable-replenishment.js';
import { exitIntentSurveyService } from '../src/services/exit-intent-survey.js';
import { vendorSettlementTaxSplitter } from '../src/services/vendor-settlement-tax.js';

describe('Round 19 Improvements: National Card Verifier, Time Slots, Replenishment, Exit Survey & Vendor Tax Splitter', () => {

  it('1. National Card Verifier: verifies Iranian National Code and card PAN format', () => {
    // 0100000002 کد ملی معتبر تایید شده در دورهای قبل
    const validMatch = nationalCardVerifier.verifyNationalCardMatch('0100000002', '6037991812345678');
    assert.equal(validMatch.matched, true);
    assert.equal(validMatch.inquiry_status, 'matched');
    assert.ok(validMatch.card_pan_masked.includes('******'));

    // کد ملی نامعتبر
    const invalidNid = nationalCardVerifier.verifyNationalCardMatch('12345', '6037991812345678');
    assert.equal(invalidNid.matched, false);
    assert.equal(invalidNid.reason, 'invalid_national_code');
  });

  it('2. Time-Slot Delivery: lists available slots and books deliveries within capacity', () => {
    const today = new Date().toISOString().split('T')[0];
    const slots = timeSlotDeliveryService.getAvailableSlots(today);
    assert.ok(Array.isArray(slots));
    assert.ok(slots.length >= 3);

    const booking = timeSlotDeliveryService.bookSlot({
      orderId: 'ord_sample_slot_1',
      deliveryDate: today,
      slotId: 'morning',
    });
    assert.equal(booking.success, true);
    assert.equal(booking.order_id, 'ord_sample_slot_1');
  });

  it('3. Consumable Replenishment: identifies potential recurring reorders', () => {
    const dueList = consumableReplenishmentService.getDueReplenishments();
    assert.ok(Array.isArray(dueList));
  });

  it('4. Exit Intent Survey: collects customer cart exit reasons and produces breakdown', () => {
    const survey = exitIntentSurveyService.recordAbandonmentReason({
      cartId: 'crt_exit_test_1',
      reason: 'high_shipping_cost',
      feedback: 'هزینه ارسال به شهرستان بالا بود',
    });
    assert.ok(survey.survey_id);
    assert.equal(survey.reason, 'high_shipping_cost');

    const summary = exitIntentSurveyService.getAbandonmentSummary();
    assert.ok(summary.total_feedbacks >= 1);
    assert.ok(Array.isArray(summary.reasons_breakdown));
  });

  it('5. Vendor Settlement Tax Splitter: accurately computes commission, withholding tax and net payout', () => {
    const result = vendorSettlementTaxSplitter.calculateSettlementSplit({
      grossSales: 10000000, // ۱۰ میلیون تومان فروش
      commissionPct: 10,    // ۱۰٪ کمیسیون (۱ میلیون)
      withholdingTaxPct: 3, // ۳٪ مالیات تکلیفی (۳۰۰ هزار)
      vatPct: 10            // ۱۰٪ مالیات ارزش افزوده خدمات پلتفرم (۱۰۰ هزار)
    });

    assert.equal(result.gross_sales, 10000000);
    assert.equal(result.platform_commission, 1000000);
    assert.equal(result.platform_vat, 100000);
    assert.equal(result.withholding_tax, 300000);
    assert.equal(result.net_payout, 8600000); // 10,000,000 - 1,000,000 - 100,000 - 300,000 = 8,600,000
    assert.equal(result.total_deductions, 1400000);
  });
});
