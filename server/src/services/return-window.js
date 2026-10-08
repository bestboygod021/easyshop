import { get } from '../db/index.js';

/**
 * سیستم کنترل مهلت قانونی مرجوعی کالا (قانون ۷ روزه تجارت الکترونیک)
 */
export class ReturnWindowService {
  constructor(returnWindowDays = 7) {
    this.returnWindowDays = returnWindowDays;
  }

  /**
   * بررسی امکان ثبت درخواست مرجوعی برای یک سفارش
   */
  checkReturnEligibility(orderId) {
    const order = get(
      `SELECT id, code, status, payment_status, delivered_at
       FROM orders
       WHERE id = ?`,
      orderId
    );

    if (!order) {
      return { eligible: false, reason: 'order_not_found', message_fa: 'سفارش یافت نشد.' };
    }

    if (order.status !== 'delivered' || !order.delivered_at) {
      return { 
        eligible: false, 
        reason: 'not_delivered', 
        message_fa: 'امکان مرجوعی فقط برای سفارش‌های تحویل داده شده فعال است.' 
      };
    }

    const deliveredTime = new Date(order.delivered_at).getTime();
    const expiryTime = deliveredTime + this.returnWindowDays * 24 * 3600 * 1000;
    const now = Date.now();

    const isExpired = now > expiryTime;
    const remainingHours = Math.max(0, Math.floor((expiryTime - now) / (3600 * 1000)));

    return {
      order_id: order.id,
      eligible: !isExpired,
      delivered_at: order.delivered_at,
      expiry_date: new Date(expiryTime).toISOString(),
      remaining_hours: remainingHours,
      remaining_days: Math.ceil(remainingHours / 24),
      message_fa: isExpired 
        ? 'مهلت قانونی ۷ روزه مرجوعی کالا به پایان رسیده است.' 
        : `سفارش تا ${Math.ceil(remainingHours / 24)} روز دیگر امکان ثبت درخواست مرجوعی دارد.`
    };
  }
}

export const returnWindowService = new ReturnWindowService();
