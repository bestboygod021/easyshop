import { all, get, run } from '../db/index.js';

/**
 * سرویس اطلاع‌رسانی کاهش قیمت محصولات (Price Drop Alert)
 */
export class PriceAlertService {
  /**
   * ثبت اشتراک اطلاع‌رسانی کاهش قیمت
   */
  subscribeAlert({ productId, userId = null, email = null, phone = null, targetPrice = null }) {
    if (!productId || (!email && !phone && !userId)) {
      throw new Error('شناسه محصول و حداقل یک راه ارتباطی یا شناسه کاربر الزامی است.');
    }

    const id = `alt_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    run(
      `INSERT INTO price_alerts (id, product_id, user_id, email, phone, target_price, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      id, productId, userId, email, phone, targetPrice, now
    );

    return {
      alert_id: id,
      product_id: productId,
      target_price: targetPrice,
      status: 'active',
      subscribed_at: now
    };
  }

  /**
   * بررسی اشتراک‌ها برای کالایی که قیمتش کاهش یافته است
   */
  checkPriceDrops(productId, newPrice) {
    const alerts = all(
      `SELECT id, product_id, user_id, email, phone, target_price
       FROM price_alerts
       WHERE product_id = ? AND status = 'active'
         AND (target_price IS NULL OR target_price >= ?)`,
      productId, newPrice
    );

    const triggered = alerts.map(alert => ({
      alert_id: alert.id,
      contact: alert.phone || alert.email || alert.user_id,
      notified_price: newPrice,
      message_fa: `خبر خوب! قیمت کالای مورد نظر شما به ${newPrice.toLocaleString('fa-IR')} تومان کاهش یافت.`
    }));

    // نشانه‌گذاری هشدارها به عنوان ارسال‌شده
    for (const a of alerts) {
      run(`UPDATE price_alerts SET status = 'notified' WHERE id = ?`, a.id);
    }

    return {
      product_id: productId,
      triggered_count: triggered.length,
      notifications: triggered
    };
  }
}

export const priceAlertService = new PriceAlertService();
