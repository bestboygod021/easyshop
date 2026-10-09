import { all, run, tx } from '../db/index.js';

/**
 * زمان پیش‌فرض انقضای رزرو موجودی بر حسب دقیقه (مثلاً ۱۵ دقیقه)
 */
export const DEFAULT_RESERVATION_TTL_MINUTES = 15;

/**
 * آزادسازی موجودی رزرو شده برای سفارش‌های در انتظار پرداختی که منقضی شده‌اند
 * @param {number} ttlMinutes مدت زمان مجاز پرداخت قبل از لغو رزرو
 * @returns {{ releasedOrdersCount: number, releasedItemsCount: number }}
 */
export function releaseExpiredOrderReservations(ttlMinutes = DEFAULT_RESERVATION_TTL_MINUTES) {
  const cutoffTime = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

  return tx(() => {
    // یافتن سفارش‌هایی که هنوز در وضعیت pending هستند و زمان مجاز پرداختشان گذشته است
    const expiredOrders = all(
      `SELECT id, code FROM orders 
       WHERE status = 'pending' 
         AND payment_status = 'unpaid'
         AND placed_at <= ?`,
      cutoffTime
    );

    if (expiredOrders.length === 0) {
      return { releasedOrdersCount: 0, releasedItemsCount: 0 };
    }

    let releasedItemsCount = 0;

    for (const order of expiredOrders) {
      const orderItems = all(
        `SELECT product_id, qty FROM order_items WHERE order_id = ?`,
        order.id
      );

      for (const item of orderItems) {
        // بازگرداندن تعداد کالا به انبار
        run(
          `UPDATE products SET stock = stock + ? WHERE id = ?`,
          item.qty,
          item.product_id
        );
        releasedItemsCount += item.qty;
      }

      // به‌روزرسانی وضعیت سفارش به لغو شده به دلیل انقضای زمان پرداخت
      run(
        `UPDATE orders 
         SET status = 'cancelled', 
             customer_note = coalesce(customer_note, '') || ' [لغو خودکار به دلیل انقضای زمان پرداخت و آزادسازی موجودی]',
             cancelled_at = ?,
             updated_at = ? 
         WHERE id = ?`,
        new Date().toISOString(),
        new Date().toISOString(),
        order.id
      );

      // لاگ آزادسازی موجودی
    }

    return {
      releasedOrdersCount: expiredOrders.length,
      releasedItemsCount,
    };
  });
}
