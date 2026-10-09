import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cartReservationService } from '../src/services/cart-reservation.js';
import { ticketUrgencyScorer } from '../src/services/ticket-urgency.js';
import { shahkarVerificationService } from '../src/services/shahkar-verification.js';
import { salesExportService } from '../src/services/sales-export.js';
import { productQnAService } from '../src/services/product-qna.js';
import { all } from '../src/db/index.js';

describe('Round 14 Improvements: Cart Reservation, Ticket Scorer, Shahkar Verification, Sales Export & QnA', () => {

  it('1. Cart Reservation: reserves items with countdown and calculates remaining time', () => {
    const products = all(`SELECT id FROM products WHERE stock > 0 LIMIT 1`);
    const prdId = products[0]?.id;

    const res = cartReservationService.reserveItem({
      cartId: 'cart_test_123',
      productId: prdId,
      qty: 1,
    });

    assert.equal(res.success, true);
    assert.ok(res.remaining_seconds > 0);

    const status = cartReservationService.getCartReservationStatus('cart_test_123');
    assert.equal(status.is_reserved, true);
    assert.ok(status.items.length >= 1);
  });

  it('2. Ticket Urgency: analyzes message keywords and scores urgency levels', () => {
    const normalTicket = ticketUrgencyScorer.evaluateUrgency({
      subject: 'سوال در مورد ابعاد کالا',
      message: 'سلام لطفا سایز دقیق را بفرمایید',
    });
    assert.ok(['low', 'normal'].includes(normalTicket.priority));

    const criticalTicket = ticketUrgencyScorer.evaluateUrgency({
      subject: 'خطا در کسر وجه و ناموفق بودن تراکنش',
      message: 'پول از حسابم کم شده ولی سفارش ثبت نشد و پرداخت ناموفق بود! فوری پیگیری کنید',
      orderStatus: 'payment_failed',
    });
    assert.equal(criticalTicket.priority, 'critical');
    assert.ok(criticalTicket.target_sla_hours <= 2);
  });

  it('3. Shahkar Verification: validates Iranian national code and mobile match', async () => {
    // شماره نامعتبر
    const invalidMobile = await shahkarVerificationService.verifyShahkar({
      nationalCode: '0012345678',
      mobile: '12345',
    });
    assert.equal(invalidMobile.matched, false);

    // تطابق معتبر (کد ملی تستی معتبر)
    const validMatch = await shahkarVerificationService.verifyShahkar({
      nationalCode: '0100000002',
      mobile: '09121112233',
    });
    assert.equal(validMatch.matched, true);
    assert.ok(validMatch.national_code_masked.includes('***'));
  });

  it('4. Sales Export: compiles sales aggregates and formats UTF-8 BOM CSV', () => {
    const report = salesExportService.getSalesReport();
    assert.ok(typeof report.order_count === 'number');
    assert.ok(typeof report.total_revenue === 'number');

    const csv = salesExportService.exportToCsv(report);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('شناسه سفارش'));
  });

  it('5. Product Q&A: accepts inquiries and supports verified staff replies', () => {
    const products = all(`SELECT id FROM products LIMIT 1`);
    const prdId = products[0]?.id || 'prd_test_sample';

    const q = productQnAService.askQuestion({
      productId: prdId,
      userId: null,
      questionText: 'آیا این کالا دارای گارانتی شرکتی است؟',
    });
    assert.ok(q.qna_id);

    const answered = productQnAService.answerQuestion(
      q.qna_id,
      'بله، ۱۸ ماه گارانتی رسمی شرکتی دارد.',
      'staff_admin_1'
    );
    assert.equal(answered.qna_id, q.qna_id);

    const list = productQnAService.getProductQnA(prdId);
    assert.ok(list.some(item => item.id === q.qna_id && item.answer));
  });
});
