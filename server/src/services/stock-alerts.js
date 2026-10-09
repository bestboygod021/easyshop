import { all, run } from '../db/index.js';

/**
 * سرویس ثبت و اطلاع‌رسانی بازگشت کالا به انبار و کاهش موجودی (Stock Subscriptions)
 */

export class StockAlertService {
  /**
   * ثبت‌نام کاربر برای اطلاع‌رسانی شارژ مجدد کالا
   */
  subscribeUser(productId, { userId = null, phone = null, email = null }) {
    if (!userId && !phone && !email) {
      throw new Error('حداقل یکی از اطلاعات تماس (شناسه کاربر، شماره موبایل یا ایمیل) الزامی است.');
    }

    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    run(
      `INSERT INTO stock_alert_subscriptions (id, product_id, user_id, phone, email, is_notified, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      id,
      productId,
      userId,
      phone,
      email,
      new Date().toISOString()
    );

    return { id, productId, subscribed: true };
  }

  /**
   * بررسی اشتراک‌های منتظر و ارسال نوتیفیکیشن در صورت موجود شدن کالا
   */
  notifyRestockedProduct(productId, newStock) {
    if (newStock <= 0) return { notifiedCount: 0 };

    const waitingSubscribers = all(
      `SELECT * FROM stock_alert_subscriptions 
       WHERE product_id = ? AND is_notified = 0`,
      productId
    );

    if (waitingSubscribers.length === 0) {
      return { notifiedCount: 0 };
    }

    const now = new Date().toISOString();
    for (const sub of waitingSubscribers) {
      run(
        `UPDATE stock_alert_subscriptions 
         SET is_notified = 1, notified_at = ? 
         WHERE id = ?`,
        now,
        sub.id
      );
    }

    return {
      notifiedCount: waitingSubscribers.length,
      product_id: productId,
      newStock,
    };
  }

  /**
   * دریافت کالاهای کم‌موجود برای هشدارهای انبار به مدیران
   */
  getLowStockProducts(threshold = 5) {
    return all(
      `SELECT id, name_fa, sku, stock, price 
       FROM products 
       WHERE status = 'active' AND stock <= ? 
       ORDER BY stock ASC`,
      threshold
    );
  }
}

export const stockAlertService = new StockAlertService();
