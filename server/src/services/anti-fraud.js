import { get } from '../db/index.js';

/**
 * Anti-Fraud Velocity Engine.
 * Evaluates payment attempt patterns:
 * - Repeated failed attempts in the last 15 minutes (Velocity)
 * - Multiple distinct card numbers used by the same user
 * - High-risk order amount spikes
 * @param {object} param0
 * @param {string} param0.userId
 * @param {number} param0.amount
 * @returns {{ is_suspicious: boolean, risk_score: number, reasons: string[] }}
 */
export function evaluateTransactionRisk({ userId, amount = 0 }) {
  const reasons = [];
  let riskScore = 0; // 0 to 100

  const fifteenMinsAgo = new Date(Date.now() - 15 * 60_000).toISOString();

  // 1. Check failed payment velocity by User
  if (userId) {
    const failedByUser = get(
      `SELECT COUNT(p.id) c FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE o.user_id = ? AND p.status = 'failed' AND p.created_at >= ?`,
      userId,
      fifteenMinsAgo,
    )?.c || 0;

    if (failedByUser >= 4) {
      riskScore += 35;
      reasons.push(`تکرار مداوم خطای پرداخت برای این حساب کاربری (${failedByUser} بار در ۱۵ دقیقه اخیر)`);
    }

    // 2. Check number of distinct card masks used in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const distinctCards = get(
      `SELECT COUNT(DISTINCT card_mask) c FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE o.user_id = ? AND card_mask IS NOT NULL AND p.created_at >= ?`,
      userId,
      oneDayAgo,
    )?.c || 0;

    if (distinctCards >= 4) {
      riskScore += 30;
      reasons.push(`استفاده از چندین کارت بانکی متفاوت (${distinctCards} کارت) در ۲۴ ساعت اخیر`);
    }
  }

  // 3. Very high single transaction amount check
  if (amount > 100_000_000) {
    riskScore += 20;
    reasons.push('مبلغ تراکنش بسیار بالا و نیازمند تایید مضاعف');
  }

  return {
    is_suspicious: riskScore >= 50,
    risk_score: Math.min(100, riskScore),
    reasons,
  };
}
