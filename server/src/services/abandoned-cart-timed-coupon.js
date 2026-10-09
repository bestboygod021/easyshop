import { all, get, nowIso, run, uid } from '../db/index.js';
import { smsOtpService } from './sms-otp.js';

/**
 * سیستم یادآور هوشمند سبدهای خرید رهاشده همراه با کد تخفیف انگیزاننده ۲۴ ساعته
 * (Abandoned Cart Re-engagement with Timed Coupon Generator)
 */
export class AbandonedCartTimedCouponService {
  /**
   * اسکن سبدهای رها شده بیش از ۳ ساعت و صدور کد تخفیف شتاب‌دهنده خرید
   */
  async processAbandonedCarts(inactivityHours = 3) {
    const thresholdDate = new Date(Date.now() - inactivityHours * 3600 * 1000).toISOString();

    // یافتن سبدهایی که آیتم دارند و به‌روزرسانی آن‌ها قبل از ۳ ساعت پیش بوده
    const abandonedCarts = all(
      `SELECT c.id AS cart_id, c.user_id, c.updated_at,
              u.full_name, u.phone,
              COUNT(ci.id) AS item_count,
              SUM(ci.qty * p.price) AS total_val
       FROM carts c
       JOIN cart_items ci ON ci.cart_id = c.id
       JOIN products p ON p.id = ci.product_id
       JOIN users u ON u.id = c.user_id
       WHERE c.updated_at <= ? AND u.phone IS NOT NULL AND u.phone != ''
       GROUP BY c.id
       LIMIT 20`,
      thresholdDate,
    );

    const results = [];
    const now = nowIso();
    const couponExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // ۲۴ ساعت اعتبار

    for (const cart of abandonedCarts) {
      // بررسی عدم ارسال پیامک تکراری در ۲۴ ساعت گذشته
      const alreadySent = get(
        `SELECT id FROM abandoned_cart_reminders 
         WHERE cart_id = ? AND sent_at >= ?`,
        cart.cart_id,
        new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      );

      if (!alreadySent) {
        const couponCode = `COMEBACK-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const couponId = uid('cpn');

        // ایجاد کد تخفیف اختصاصی ۵٪ با انقضای ۲۴ ساعته
        run(
          `INSERT INTO coupons (
             id, code, type, value, max_discount, starts_at, ends_at,
             usage_limit, is_active, description, created_at
           ) VALUES (?, ?, 'percent', 5, 80000, ?, ?, 1, 1, ?, ?)`,
          couponId,
          couponCode,
          now,
          couponExpiresAt,
          `کد تخفیف یادآوری سبد رهاشده برای ${cart.full_name || cart.user_id}`,
          now,
        );

        // ارسال پیامک ترغیبی به همراه لینک سبد
        const smsText = `${cart.full_name || 'کاربر گرامی'} عزیز، سبد خرید شما در EasyShop منتظر شماست! 🛒✨\nبرای تکمیل سفارش ۵٪ تخفیف اختصاصی دریافت کنید:\nکد: ${couponCode}\nمهلت: فقط تا ۲۴ ساعت آینده\nلینک سبد: https://easyshop.ir/cart`;
        const res = await smsOtpService.sendSms(cart.phone, smsText);

        run(
          `INSERT INTO abandoned_cart_reminders (id, cart_id, user_id, coupon_code, sent_at)
           VALUES (?, ?, ?, ?, ?)`,
          uid('acrem'),
          cart.cart_id,
          cart.user_id,
          couponCode,
          now,
        );

        results.push({
          cart_id: cart.cart_id,
          user_id: cart.user_id,
          phone: cart.phone,
          coupon_code: couponCode,
          items_in_cart: cart.item_count,
          sms_delivered: res.sent,
        });
      }
    }

    return {
      processed_count: results.length,
      dispatched_reminders: results,
      evaluated_at: now,
    };
  }
}

export const abandonedCartTimedCouponService = new AbandonedCartTimedCouponService();
