import { get } from '../db/index.js';

/**
 * سرویس محاسبه ارزش طول عمر مشتری (Customer Lifetime Value - CLV)
 * و سطح‌بندی وفاداری (برنزی، نقره‌ای، طلایی و الماس)
 */

export class CustomerClvService {
  /**
   * محاسبه مجموع خریدها، تعداد سفارش‌ها و تعیین رتبه مشتری
   * @param {string} userId شناسه کاربر
   */
  calculateCustomerTier(userId) {
    if (!userId) {
      return { tier: 'guest', tier_fa: 'کاربر مهمان', clv: 0, order_count: 0, discount_pct: 0 };
    }

    const stats = get(
      `SELECT 
         COUNT(*) as total_orders,
         COALESCE(SUM(total), 0) as total_spent
       FROM orders 
       WHERE user_id = ? AND payment_status = 'paid'`,
      userId
    );

    const spent = Number(stats?.total_spent) || 0;
    const count = Number(stats?.total_orders) || 0;

    let tier = 'bronze';
    let tierFa = 'عضو عادی (برنزی)';
    let discountPct = 0;

    if (spent >= 20000000 || count >= 15) {
      tier = 'diamond';
      tierFa = 'عضو ویژه الماس';
      discountPct = 10;
    } else if (spent >= 10000000 || count >= 8) {
      tier = 'gold';
      tierFa = 'عضو طلایی';
      discountPct = 7;
    } else if (spent >= 3000000 || count >= 3) {
      tier = 'silver';
      tierFa = 'عضو نقره‌ای';
      discountPct = 4;
    }

    return {
      tier,
      tier_fa: tierFa,
      clv: spent,
      order_count: count,
      loyalty_discount_pct: discountPct,
    };
  }
}

export const customerClvService = new CustomerClvService();
