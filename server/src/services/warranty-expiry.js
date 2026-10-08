import { all } from '../db/index.js';

/**
 * سیستم هشدار انقضای گارانتی و پیشنهاد تمدید خدمات (Warranty Expiry Alert Service)
 */
export class WarrantyExpiryService {
  /**
   * شناسایی گارانتی‌هایی که طی ۳۰ روز آینده منقضی می‌شوند
   */
  getUpcomingExpiringWarranties(daysWindow = 30) {
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysWindow * 24 * 3600 * 1000).toISOString();
    const nowIso = now.toISOString();

    const expiring = all(
      `SELECT w.id, w.order_id, w.product_id, w.user_id, w.serial_number, w.expires_at as valid_until,
              p.name_fa as product_name, u.full_name as customer_name, u.phone as customer_phone
       FROM product_warranties w
       LEFT JOIN products p ON w.product_id = p.id
       LEFT JOIN users u ON w.user_id = u.id
       WHERE w.expires_at >= ? AND w.expires_at <= ? AND w.status = 'active'
       ORDER BY w.expires_at ASC`,
      nowIso, futureDate
    );

    return expiring.map(item => {
      const remainingDays = Math.ceil((new Date(item.valid_until).getTime() - now.getTime()) / (24 * 3600 * 1000));
      return {
        warranty_id: item.id,
        serial_number: item.serial_number,
        product_name: item.product_name,
        customer_name: item.customer_name || 'مشتری گرامی',
        customer_phone: item.customer_phone,
        valid_until: item.valid_until,
        days_left: remainingDays,
        renewal_offer: {
          extension_months: 12,
          cost: 150000,
          title_fa: 'تمدید یک‌ساله گارانتی طلایی تعویض',
        },
        alert_message_fa: `گارانتی کالای «${item.product_name}» تا ${remainingDays} روز دیگر به پایان می‌رسد. جهت تمدید گارانتی طلایی اقدام فرمایید.`
      };
    });
  }
}

export const warrantyExpiryService = new WarrantyExpiryService();
