import { get, all, run } from '../db/index.js';

/**
 * ماژول پایش تاخیر ارسال و تخصیص خودکار کد تخفیف عذرخواهی (Delivery SLA Tracker)
 */
export class DeliverySlaTracker {
  /**
   * ارزیابی سفارش تحویل داده شده و بررسی تاخیر در برابر مهلت مجاز
   */
  evaluateOrderDelivery(orderId) {
    const order = get(
      `SELECT id, code, user_id, placed_at, delivered_at
       FROM orders
       WHERE id = ?`,
      orderId
    );

    if (!order) return null;
    if (!order.delivered_at) {
      return { is_evaluated: false, message_fa: 'سفارش هنوز تحویل داده نشده است.' };
    }

    const placedTime = new Date(order.placed_at).getTime();
    const deliveredTime = new Date(order.delivered_at).getTime();
    const promisedDays = 3;
    const promisedMs = promisedDays * 24 * 3600 * 1000;

    const actualDurationDays = Math.ceil((deliveredTime - placedTime) / (24 * 3600 * 1000));
    const isDelayed = (deliveredTime - placedTime) > promisedMs;
    const delayDays = isDelayed ? Math.max(1, actualDurationDays - promisedDays) : 0;

    let apologyCoupon = null;
    if (isDelayed) {
      const code = `APOLOGY-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
      
      // ساخت خودکار کد تخفیف دلجویی (۱۵٪ تا سقف ۵۰ هزار تومان)
      run(
        `INSERT INTO coupons (id, code, type, value, max_discount, starts_at, ends_at, usage_limit, is_active, description, created_at)
         VALUES (?, ?, 'percentage', 15, 50000, ?, ?, 1, 1, ?, ?)`,
        `cpn_${Math.random().toString(36).substring(2, 10)}`, code,
        new Date().toISOString(), expiresAt,
        `کد تخفیف دلجویی بابت ${delayDays} روز تاخیر در تحویل سفارش ${order.code || order.id}`,
        new Date().toISOString()
      );

      apologyCoupon = {
        code,
        discount_percentage: 15,
        max_discount: 50000,
        expires_at: expiresAt,
      };
    }

    return {
      order_id: order.id,
      promised_days: promisedDays,
      actual_days: actualDurationDays,
      is_delayed: isDelayed,
      delay_days: delayDays,
      apology_coupon: apologyCoupon,
      message_fa: isDelayed 
        ? `سفارش با ${delayDays} روز تاخیر تحویل شد. کد دلجویی ${apologyCoupon.code} برای کاربر صادر شد.`
        : 'سفارش در موعد مقرر تحویل داده شده است.'
    };
  }
}

export const deliverySlaTracker = new DeliverySlaTracker();
