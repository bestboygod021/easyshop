/**
 * High-Value Bank Transfer Engine (Round 27)
 * Handles Satna / Paya high-value direct bank wire payments (>100M Toman).
 * Requires two-person audit workflow (Accountant preliminary verification & Financial Auditor final approval).
 */

export class HighValueBankTransferService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Submit bank transfer receipt for an order
   */
  async submitBankTransfer({ orderId, userId, amountToman, bankName, trackingNumber, senderIban, receiptImageUrl }) {
    if (!orderId || !amountToman || !trackingNumber) {
      throw new Error('شناسه سفارش، مبلغ حواله و شماره پیگیری بانکی الزامی است');
    }

    const transferId = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO high_value_bank_transfers 
       (id, order_id, user_id, amount_toman, bank_name, tracking_number, sender_iban, receipt_image_url, status, accountant_verified, auditor_approved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_ACCOUNTANT', 0, 0, ?)`,
      [transferId, orderId, userId, Number(amountToman), bankName, trackingNumber, senderIban, receiptImageUrl, now]
    );

    return {
      transfer_id: transferId,
      order_id: orderId,
      amount_toman: Number(amountToman),
      status: 'PENDING_ACCOUNTANT',
      message: 'فیش حواله بانکی با موفقیت ثبت شد و در صف بررسی حسابداری قرار گرفت.'
    };
  }

  /**
   * Step 1: Accountant verification
   */
  async verifyByAccountant(transferId, accountantUserId, notes = '') {
    const transfer = await this.db.get('SELECT * FROM high_value_bank_transfers WHERE id = ?', [transferId]);
    if (!transfer) throw new Error('حواله بانکی یافت نشد');
    if (transfer.status !== 'PENDING_ACCOUNTANT') {
      throw new Error('این حواله در وضعیت بررسی حسابداری نیست');
    }

    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE high_value_bank_transfers 
       SET status = 'PENDING_AUDITOR', accountant_verified = 1, accountant_user_id = ?, accountant_notes = ?, accountant_verified_at = ?
       WHERE id = ?`,
      [accountantUserId, notes, now, transferId]
    );

    return {
      transfer_id: transferId,
      status: 'PENDING_AUDITOR',
      message: 'تأیید اولیه حسابداری انجام شد؛ در انتظار تأیید نهایی بازرس مالی.'
    };
  }

  /**
   * Step 2: Financial Auditor final approval & release order
   */
  async approveByAuditor(transferId, auditorUserId, auditorNotes = '') {
    const transfer = await this.db.get('SELECT * FROM high_value_bank_transfers WHERE id = ?', [transferId]);
    if (!transfer) throw new Error('حواله بانکی یافت نشد');
    if (transfer.status !== 'PENDING_AUDITOR' || transfer.accountant_verified !== 1) {
      throw new Error('این حواله ابتدا باید به تأیید واحد حسابداری برسد');
    }

    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE high_value_bank_transfers 
       SET status = 'APPROVED_AND_SETTLED', auditor_approved = 1, auditor_user_id = ?, auditor_notes = ?, auditor_approved_at = ?
       WHERE id = ?`,
      [auditorUserId, auditorNotes, now, transferId]
    );

    // Release order to paid status
    await this.db.run(`UPDATE orders SET status = 'paid' WHERE id = ?`, [transfer.order_id]);

    return {
      transfer_id: transferId,
      order_id: transfer.order_id,
      status: 'APPROVED_AND_SETTLED',
      order_released: true,
      message: 'حواله با موفقیت توسط بازرس مالی تأیید و سفارش مربوطه فعال و پرداخت شد.'
    };
  }
}
