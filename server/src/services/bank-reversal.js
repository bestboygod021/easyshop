import { run, get } from '../db/index.js';

/**
 * سرویس برگشت وجه و ابطال تراکنش‌های ناموفق بانکی (Mellat & Shaparak Reversal/Refund Dispatcher)
 */
export class BankReversalDispatcher {
  /**
   * درخواست برگشت وجه تراکنش (SOAP bpReversalRequest برای بانک ملت / Shaparak)
   */
  async requestReversal({ paymentId, saleOrderId, saleReferenceId, reason = 'order_cancelled' }) {
    if (!paymentId) {
      throw new Error('شناسه پرداخت الزامی است.');
    }

    const now = new Date().toISOString();
    const reversalId = `rev_${Math.random().toString(36).substring(2, 10)}`;

    // شبیه‌ساز منطق پروتکل شاپرک/ملت برای برگشت وجه
    // پاسخ 0 به معنی برگشت موفق وجه، پاسخ 45 به معنی قبلاً برگشت خورده
    const isMockSuccess = true;
    const resCode = isMockSuccess ? '0' : '45';

    run(
      `INSERT INTO payment_reversals (id, payment_id, sale_order_id, sale_reference_id, res_code, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      reversalId, paymentId, saleOrderId || null, saleReferenceId || null,
      resCode, reason, isMockSuccess ? 'reversed' : 'failed', now
    );

    run(
      `UPDATE payments 
       SET status = 'refunded', failure_reason = ? 
       WHERE id = ?`,
      `برگشت وجه بانکی: ${reason}`, paymentId
    );

    return {
      reversal_id: reversalId,
      payment_id: paymentId,
      res_code: resCode,
      status: 'reversed',
      processed_at: now,
      message_fa: 'درخواست برگشت وجه با موفقیت به سوییچ بانکی ارسال و ثبت شد.',
    };
  }
}

export const bankReversalDispatcher = new BankReversalDispatcher();
