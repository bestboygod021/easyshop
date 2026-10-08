/**
 * Scratch-Off Authenticity Verification Service (Round 26)
 * Generates unique encrypted scratch-off security codes for physical items.
 * Allows customers to verify product authenticity and flags already-scratched/counterfeit codes.
 */

import crypto from 'node:crypto';

export class ScratchAuthenticityService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Helper to hash scratch-off PIN
   */
  hashPin(pin) {
    return crypto.createHash('sha256').update(String(pin).trim().toUpperCase()).digest('hex');
  }

  /**
   * Batch generate authenticity scratch codes for a product batch
   */
  async generateCodesForProduct({ productId, batchNumber = 'BATCH-01', count = 10 }) {
    if (!productId) throw new Error('شناسه محصول الزامی است');
    const validCount = Math.min(Math.max(Number(count) || 1, 1), 500);
    const createdCodes = [];
    const now = new Date().toISOString();

    for (let i = 0; i < validCount; i++) {
      // 12-character alphanumeric scratch code
      const rawPin = `SN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const pinHash = this.hashPin(rawPin);
      const id = `auth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      await this.db.run(
        `INSERT INTO authenticity_codes (id, product_id, batch_number, pin_hash, is_verified, verified_count, created_at)
         VALUES (?, ?, ?, ?, 0, 0, ?)`,
        [id, productId, batchNumber, pinHash, now]
      );

      createdCodes.push({ id, raw_pin: rawPin });
    }

    return {
      product_id: productId,
      batch_number: batchNumber,
      generated_count: createdCodes.length,
      sample_pins: createdCodes.slice(0, 3).map(c => c.raw_pin),
      message: `${createdCodes.length} کد اصالت فیزیکی جدید با موفقیت صادر گردید.`
    };
  }

  /**
   * Verify a scratch code entered by a customer
   */
  async verifyCode(rawPin, userId = null) {
    if (!rawPin || typeof rawPin !== 'string') {
      throw new Error('کد اصالت ۱۲ رقمی الزامی است');
    }

    const pinHash = this.hashPin(rawPin);
    const record = await this.db.get(
      'SELECT a.*, p.title as product_title FROM authenticity_codes a LEFT JOIN products p ON a.product_id = p.id WHERE a.pin_hash = ?',
      [pinHash]
    );

    if (!record) {
      return {
        status: 'INVALID',
        is_authentic: false,
        message: 'هشدار: کد وارد شده در سامانه اصالت کالا یافت نشد! احتمال تقلبی بودن کالا وجود دارد.'
      };
    }

    const now = new Date().toISOString();
    const newCount = (record.verified_count || 0) + 1;

    if (record.is_verified === 1) {
      // Already verified previously
      await this.db.run(
        'UPDATE authenticity_codes SET verified_count = ?, last_verified_at = ? WHERE id = ?',
        [newCount, now, record.id]
      );

      return {
        status: 'PREVIOUSLY_VERIFIED',
        is_authentic: true,
        product_id: record.product_id,
        product_title: record.product_title,
        batch_number: record.batch_number,
        first_verified_at: record.first_verified_at,
        total_verifications: newCount,
        warning: `توجه: این کد قبلاً در تاریخ ${new Date(record.first_verified_at).toLocaleDateString('fa-IR')} استعلام شده است.`
      };
    }

    // First time genuine verification
    await this.db.run(
      'UPDATE authenticity_codes SET is_verified = 1, verified_count = 1, first_verified_at = ?, last_verified_at = ?, verified_by_user_id = ? WHERE id = ?',
      [now, now, userId, record.id]
    );

    return {
      status: 'GENUINE',
      is_authentic: true,
      product_id: record.product_id,
      product_title: record.product_title,
      batch_number: record.batch_number,
      verified_at: now,
      message: 'اصالت کالای خریداری‌شده تأیید شد. کالای شما ۱۰۰٪ اصل و دارای گارانتی معتبر است.'
    };
  }
}
