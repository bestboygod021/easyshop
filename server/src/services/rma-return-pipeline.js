import { all, get, nowIso, run, uid } from '../db/index.js';

/**
 * سیستم ثبت مرجوعی کالا با چرخه بازرسی کیفی (RMA & Quality Inspection Pipeline)
 * مدیریت گام‌های: ثبت توسط مشتری -> بررسی مستندات -> بازرسی فیزیکی انبار -> واریز عودت وجه
 */
export class RmaReturnPipelineService {
  /**
   * ثبت درخواست اولیه مرجوعی کالا توسط خریدار
   */
  createReturnRequest({ orderId, orderItemId, userId, reason, description = '', photoUrl = null }) {
    if (!orderId || !reason) {
      throw new Error('مشخصات سفارش و علت مرجوعی الزامی است.');
    }

    const order = get('SELECT id, user_id, payment_status, total FROM orders WHERE id = ?', orderId);
    if (!order) throw new Error('سفارش مورد نظر یافت نشد.');

    const rmaId = uid('rma');
    const now = nowIso();

    run(
      `INSERT INTO rma_returns (
         id, order_id, order_item_id, user_id, reason, description,
         photo_url, status, refund_amount, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_approval', 0, ?, ?)`,
      rmaId,
      orderId,
      orderItemId || null,
      userId || order.user_id || null,
      reason,
      description,
      photoUrl,
      now,
      now,
    );

    return {
      rma_id: rmaId,
      order_id: orderId,
      status: 'pending_approval',
      message_fa: 'درخواست مرجوعی ثبت شد و توسط کارشناس پشتیبانی بررسی خواهد شد.',
      created_at: now,
    };
  }

  /**
   * بازرسی کیفی و اقدام کارشناسی (تایید اولیه، دریافت کالا در انبار، تایید سلامت یا رد)
   */
  processInspection(rmaId, { step, notes = '', refundAmount = 0, inspectorId = null }) {
    const record = get('SELECT * FROM rma_returns WHERE id = ?', rmaId);
    if (!record) throw new Error('پرونده مرجوعی یافت نشد.');

    const now = nowIso();
    let newStatus = record.status;

    // استپ‌ها: approve_shipping (تایید ارسال کالا به انبار), received_at_warehouse (دریافت در انبار), passed_inspection (تایید سلامت و واریز وجه), rejected (رد درخواست)
    if (step === 'approve_shipping') {
      newStatus = 'awaiting_return_shipment';
    } else if (step === 'received_at_warehouse') {
      newStatus = 'under_qc_inspection';
    } else if (step === 'passed_inspection') {
      newStatus = 'refunded';
      // واریز وجه به کیف پول کاربر در صورت تایید
      if (record.user_id && refundAmount > 0) {
        const user = get('SELECT wallet FROM users WHERE id = ?', record.user_id);
        const newBalance = (user?.wallet || 0) + refundAmount;
        run('UPDATE users SET wallet = ? WHERE id = ?', newBalance, record.user_id);

        run(
          `INSERT INTO wallet_transactions (id, user_id, amount, type, reason, ref, balance_after, created_at)
           VALUES (?, ?, ?, 'credit', ?, ?, ?, ?)`,
          uid('wtx'),
          record.user_id,
          refundAmount,
          'refund',
          rmaId,
          newBalance,
          now,
        );
      }
    } else if (step === 'rejected') {
      newStatus = 'rejected';
    }

    run(
      `UPDATE rma_returns 
       SET status = ?, refund_amount = ?, review_notes = ?, updated_at = ?
       WHERE id = ?`,
      newStatus,
      refundAmount,
      notes,
      now,
      rmaId,
    );

    return {
      rma_id: rmaId,
      previous_status: record.status,
      new_status: newStatus,
      refund_amount: refundAmount,
      notes,
      updated_at: now,
    };
  }

  /**
   * دریافت فهرست پرونده‌های مرجوعی
   */
  listReturns(userId = null) {
    if (userId) {
      return all('SELECT * FROM rma_returns WHERE user_id = ? ORDER BY created_at DESC', userId);
    }
    return all('SELECT * FROM rma_returns ORDER BY created_at DESC LIMIT 50');
  }
}

export const rmaReturnPipelineService = new RmaReturnPipelineService();
