import { get, all, run } from '../db/index.js';

/**
 * سرویس رزرو موقت اقلام سبد خرید همراه با تایمر انقضا (Cart Reservation Countdown)
 */
export class CartReservationService {
  constructor(reservationMinutes = 15) {
    this.reservationDurationMs = reservationMinutes * 60 * 1000;
  }

  /**
   * رزرو موقت یک قلم کالا در سبد خرید خریدار
   */
  reserveItem({ cartId, productId, qty }) {
    if (!cartId || !productId || !qty) {
      throw new Error('شناسه سبد خرید، کالا و تعداد الزامی است.');
    }

    const product = get(`SELECT id, stock, name_fa FROM products WHERE id = ?`, productId);
    if (!product) throw new Error('کالای مورد نظر یافت نشد.');

    // محاسبه موجودی رزرو شده توسط سایر سبدهای فعال
    const now = new Date().toISOString();
    const reservedElsewhere = get(
      `SELECT COALESCE(SUM(qty), 0) as total_reserved
       FROM cart_reservations
       WHERE product_id = ? AND expires_at > ? AND cart_id != ?`,
      productId, now, cartId
    )?.total_reserved || 0;

    const availableStock = product.stock - reservedElsewhere;
    if (availableStock < qty) {
      return {
        success: false,
        reason: 'insufficient_stock',
        available_stock: Math.max(0, availableStock),
        message_fa: `موجودی در دسترس این کالا برای رزرو کافی نیست (${availableStock} عدد موجود است).`
      };
    }

    const expiresAt = new Date(Date.now() + this.reservationDurationMs).toISOString();
    const id = `res_${Math.random().toString(36).substring(2, 10)}`;

    run(
      `INSERT INTO cart_reservations (id, cart_id, product_id, qty, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(cart_id, product_id) DO UPDATE SET qty = ?, expires_at = ?`,
      id, cartId, productId, qty, expiresAt, now,
      qty, expiresAt
    );

    return {
      success: true,
      cart_id: cartId,
      product_id: productId,
      reserved_qty: qty,
      expires_at: expiresAt,
      remaining_seconds: Math.floor(this.reservationDurationMs / 1000)
    };
  }

  /**
   * دریافت زمان باقی‌مانده از رزرو سبد خرید
   */
  getCartReservationStatus(cartId) {
    const now = new Date().toISOString();
    const reservations = all(
      `SELECT r.*, p.name_fa, p.price
       FROM cart_reservations r
       JOIN products p ON r.product_id = p.id
       WHERE r.cart_id = ? AND r.expires_at > ?`,
      cartId, now
    );

    if (!reservations.length) {
      return { is_reserved: false, remaining_seconds: 0, items: [] };
    }

    // کمترین زمان انقضا در سبد
    const minExpiresAt = reservations.reduce((min, cur) => cur.expires_at < min ? cur.expires_at : min, reservations[0].expires_at);
    const diffSeconds = Math.max(0, Math.floor((new Date(minExpiresAt).getTime() - Date.now()) / 1000));

    return {
      is_reserved: diffSeconds > 0,
      remaining_seconds: diffSeconds,
      items: reservations.map(r => ({
        product_id: r.product_id,
        name_fa: r.name_fa,
        qty: r.qty,
        expires_at: r.expires_at
      }))
    };
  }

  /**
   * پاک‌سازی رکوردهای رزرو منقضی‌شده
   */
  cleanupExpiredReservations() {
    const now = new Date().toISOString();
    const result = run(`DELETE FROM cart_reservations WHERE expires_at <= ?`, now);
    return { cleaned_at: now, cleaned_count: result?.changes || 0 };
  }
}

export const cartReservationService = new CartReservationService();
