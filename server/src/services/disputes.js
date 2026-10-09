import { all, get, run } from '../db/index.js';

/**
 * سامانه مدیریت شکایات و داوری مشتریان مطابق با الزامات مرکز توسعه تجارت الکترونیکی (اینماد)
 * با تعیین ضرب‌الاجل ۴۸ ساعته پاسخگویی قانونی
 */

export class DisputeService {
  /**
   * ثبت شکایت رسمی توسط خریدار
   */
  createDispute({ orderId, userId, customerName, phone, title, description, category = 'delivery' }) {
    const id = `dsp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const trackingCode = `DSP-${Date.now().toString().slice(-6)}`;
    const now = new Date();
    // مهلت قانونی پاسخگویی: ۴۸ ساعت
    const deadline = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();

    run(
      `INSERT INTO disputes (
         id, tracking_code, order_id, user_id, customer_name, phone,
         title, description, category, status, deadline_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      id,
      trackingCode,
      orderId || null,
      userId || null,
      customerName,
      phone,
      title,
      description,
      category,
      deadline,
      now.toISOString()
    );

    return {
      id,
      trackingCode,
      deadlineAt: deadline,
      status: 'open',
    };
  }

  /**
   * پاسخ کارشناس یا مدیر به شکایت
   */
  respondToDispute(disputeId, { responderId, responseMessage, newStatus = 'answered' }) {
    const dispute = get(`SELECT * FROM disputes WHERE id = ?`, disputeId);
    if (!dispute) throw new Error('شکایت مورد نظر یافت نشد.');

    const now = new Date().toISOString();
    run(
      `UPDATE disputes 
       SET status = ?, response_message = ?, responder_id = ?, answered_at = ?, updated_at = ?
       WHERE id = ?`,
      newStatus,
      responseMessage,
      responderId,
      now,
      now,
      disputeId
    );

    return {
      id: disputeId,
      status: newStatus,
      answeredAt: now,
    };
  }

  /**
   * فهرست شکایات نزدیک به انقضای مهلت پاسخگویی
   */
  getOverdueOrUrgentDisputes() {
    const urgentCutoff = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    return all(
      `SELECT * FROM disputes
       WHERE status = 'open' AND deadline_at <= ?
       ORDER BY deadline_at ASC LIMIT 50`,
      urgentCutoff,
    );
  }
}

export const disputeService = new DisputeService();
