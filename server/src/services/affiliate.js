import { all, get, run } from '../db/index.js';

/**
 * سرویس مدیریت بازاریابی معرف و افیلیت مارکتینگ (Affiliate & Referral Tracking)
 */
export class AffiliateService {
  /**
   * ایجاد یا دریافت کد معرف یک کاربر
   */
  getOrCreateReferralCode(userId) {
    if (!userId) throw new Error('شناسه کاربر الزامی است.');

    const existing = get(`SELECT referral_code FROM affiliate_partners WHERE user_id = ?`, userId);
    if (existing?.referral_code) {
      return { referral_code: existing.referral_code, share_url: `https://easyshop.local/?ref=${existing.referral_code}` };
    }

    const code = `REF-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const id = `aff_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    run(
      `INSERT INTO affiliate_partners (id, user_id, referral_code, commission_pct, total_earned, created_at)
       VALUES (?, ?, ?, 5, 0, ?)`,
      id, userId, code, now
    );

    return {
      referral_code: code,
      share_url: `https://easyshop.local/?ref=${code}`,
      commission_pct: 5
    };
  }

  /**
   * ثبت کمیسیون معرف پس از تکمیل پرداخت سفارش
   */
  recordOrderReferral(orderId, referralCode, orderTotal) {
    if (!orderId || !referralCode || !orderTotal) return null;

    const partner = get(`SELECT * FROM affiliate_partners WHERE referral_code = ?`, referralCode);
    if (!partner) return null;

    const commissionAmount = Math.round((orderTotal * partner.commission_pct) / 100);
    const id = `ref_tx_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    run(
      `INSERT INTO affiliate_transactions (id, partner_id, order_id, order_amount, commission_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, partner.id, orderId, orderTotal, commissionAmount, now
    );

    run(
      `UPDATE affiliate_partners 
       SET total_earned = total_earned + ? 
       WHERE id = ?`,
      commissionAmount, partner.id
    );

    return {
      transaction_id: id,
      partner_id: partner.id,
      commission_amount: commissionAmount,
      recorded_at: now
    };
  }

  /**
   * گزارش عملکرد و پورسانت‌های معرف
   */
  getPartnerStats(userId) {
    const partner = get(`SELECT * FROM affiliate_partners WHERE user_id = ?`, userId);
    if (!partner) return null;

    const txs = all(
      `SELECT * FROM affiliate_transactions WHERE partner_id = ? ORDER BY created_at DESC LIMIT 50`,
      partner.id
    );

    return {
      partner_id: partner.id,
      referral_code: partner.referral_code,
      commission_pct: partner.commission_pct,
      total_earned: partner.total_earned,
      referral_orders_count: txs.length,
      transactions: txs
    };
  }
}

export const affiliateService = new AffiliateService();
