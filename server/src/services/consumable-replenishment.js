import { all, get, run } from '../db/index.js';

/**
 * سرویس یادآور و پیشنهاد شارژ مجدد کالاهای تکرارپذیر و مصرفی (Consumables Replenishment Alert)
 */
export class ConsumableReplenishmentService {
  constructor() {
    // دوره‌های تخمینی مصرف به روز
    this.estimatedCyclesDays = {
      'قهوه': 30,
      'چای': 45,
      'باتری': 60,
      'شوینده': 30,
      'پوشک': 20,
      'مکمل': 30,
      'روغن': 40,
    };
  }

  /**
   * شناسایی خریدارانی که موعد مصرف کالای خریداری‌شده‌شان فرارسیده است
   */
  getDueReplenishments() {
    const orders = all(
      `SELECT o.id as order_id, o.user_id, o.placed_at, oi.product_id, p.name_fa,
              u.full_name as customer_name, u.phone as customer_phone
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.payment_status = 'paid'
       ORDER BY o.placed_at DESC
       LIMIT 100`
    );

    const now = Date.now();
    const reminders = [];

    for (const item of orders) {
      // پیدا کردن چرخه مصرف بر اساس نام کالا
      let cycleDays = 30; // پیش‌فرض
      for (const [key, days] of Object.entries(this.estimatedCyclesDays)) {
        if (item.name_fa && item.name_fa.includes(key)) {
          cycleDays = days;
          break;
        }
      }

      const orderTime = new Date(item.placed_at).getTime();
      const elapsedDays = Math.floor((now - orderTime) / (24 * 3600 * 1000));

      // اگر از موعد تخمینی گذشته یا نزدیک به اتمام باشد (بین ۸۰٪ تا ۱۲۰٪ چرخه)
      if (elapsedDays >= Math.floor(cycleDays * 0.8) && elapsedDays <= Math.floor(cycleDays * 1.5)) {
        reminders.push({
          order_id: item.order_id,
          user_id: item.user_id,
          customer_name: item.customer_name || 'مشتری گرامی',
          customer_phone: item.customer_phone,
          product_id: item.product_id,
          product_name: item.name_fa,
          cycle_days: cycleDays,
          elapsed_days: elapsedDays,
          message_fa: `احتمالاً موجودی «${item.name_fa}» شما رو به اتمام است. جهت شارژ مجدد با تخفیف سفارش مجدد اقدام نمایید.`
        });
      }
    }

    return reminders;
  }
}

export const consumableReplenishmentService = new ConsumableReplenishmentService();
