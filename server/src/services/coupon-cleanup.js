import { all, run } from '../db/index.js';

/**
 * سرویس پایش و مدیریت انقضای کدهای تخفیف (Coupon Expiry & Auto-Cleanup)
 */
export class CouponCleanupService {
  /**
   * شناسایی و غیرفعال‌سازی یا بایگانی کوپن‌های منقضی‌شده
   */
  cleanupExpiredCoupons() {
    const now = new Date().toISOString();

    const expiredList = all(
      `SELECT id, code, ends_at, used_count, usage_limit, is_active
       FROM coupons
       WHERE is_active = 1
         AND (
           (ends_at IS NOT NULL AND ends_at < ?)
           OR (usage_limit IS NOT NULL AND used_count >= usage_limit)
         )`,
      now
    );

    let deactivatedCount = 0;
    for (const coupon of expiredList) {
      run(`UPDATE coupons SET is_active = 0 WHERE id = ?`, coupon.id);
      deactivatedCount++;
    }

    return {
      cleaned_at: now,
      deactivated_count: deactivatedCount,
      expired_coupons: expiredList.map(c => ({ id: c.id, code: c.code, expired_at: c.ends_at }))
    };
  }

  /**
   * گزارش آماری وضعیت سلامت کدهای تخفیف
   */
  getCouponHealthSummary() {
    const active = all(`SELECT COUNT(*) as count FROM coupons WHERE is_active = 1`)[0]?.count || 0;
    const inactive = all(`SELECT COUNT(*) as count FROM coupons WHERE is_active = 0`)[0]?.count || 0;

    return {
      active_coupons: active,
      inactive_or_expired_coupons: inactive,
      total_coupons: active + inactive
    };
  }
}

export const couponCleanupService = new CouponCleanupService();
