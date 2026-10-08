import { all, get, run } from '../db/index.js';

/**
 * سرویس یادآوری سبدهای خرید رهاشده (Abandoned Cart Recovery)
 */
export class AbandonedCartService {
  /**
   * دریافت سبدهای خرید رهاشده بر اساس ساعت‌های گذشته
   * @param {number} hoursThreshold حداقل ساعت گذشته از آخرین تغییر
   */
  getAbandonedCarts(hoursThreshold = 2) {
    const thresholdDate = new Date(Date.now() - hoursThreshold * 3600 * 1000).toISOString();
    
    // سبدهایی که آیتم دارند و سفارش ثبت نهایی نشده است
    const carts = all(
      `SELECT c.id, c.user_id, c.session_key, c.updated_at, u.email, u.phone, u.full_name as name
       FROM carts c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.updated_at <= ? 
         AND (SELECT COUNT(*) FROM cart_items ci WHERE ci.cart_id = c.id) > 0
       ORDER BY c.updated_at DESC
       LIMIT 50`,
      thresholdDate
    );

    return carts.map(cart => {
      const items = all(
        `SELECT ci.product_id, ci.qty, p.name_fa, p.price, p.compare_at_price
         FROM cart_items ci
         JOIN products p ON ci.product_id = p.id
         WHERE ci.cart_id = ?`,
        cart.id
      );

      const totalValue = items.reduce((sum, item) => {
        const p = item.price || 0;
        return sum + p * item.qty;
      }, 0);

      return {
        cart_id: cart.id,
        user_id: cart.user_id,
        customer_name: cart.name || 'مشتری گرامی',
        contact: cart.phone || cart.email,
        total_items: items.length,
        total_value: totalValue,
        items,
        abandoned_since: cart.updated_at
      };
    });
  }

  /**
   * ایجاد پیامک یا پیام ترغیبی همراه با کد تخفیف ویژه بازگشت
   */
  generateRecoveryOffer(cartId, discountPct = 10) {
    const cart = get(`SELECT id, user_id FROM carts WHERE id = ?`, cartId);
    if (!cart) return null;

    const promoCode = `COMEBACK-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    return {
      cart_id: cartId,
      promo_code: promoCode,
      discount_percentage: discountPct,
      message_fa: `سلام! سبد خرید شما در ایزی‌شاپ منتظر شماست. با کد تخفیف ${promoCode} از ${discountPct}٪ تخفیف اختصاصی برای تکمیل سفارش خود بهره‌مند شوید.`,
      expires_in_hours: 24
    };
  }
}

export const abandonedCartService = new AbandonedCartService();

/**
 * تابع سازگار با نسخه‌های قبلی سیستم برای شناسایی سبدهای رهاشده
 */
export function findAbandonedCarts(hoursThreshold = 2) {
  return abandonedCartService.getAbandonedCarts(hoursThreshold);
}
