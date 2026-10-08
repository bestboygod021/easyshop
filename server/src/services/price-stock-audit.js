import { all, run } from '../db/index.js';

/**
 * سرویس ثبت و ممیزی تاریخچه تغییرات قیمت و موجودی (Vendor Price & Stock Audit Trail)
 */
export class PriceStockAuditService {
  /**
   * ثبت تغییر قیمت یا موجودی محصول توسط مدیر یا فروشنده
   */
  logChange({ productId, userId, role, oldPrice, newPrice, oldStock, newStock, ip = null, reason = 'manual_update' }) {
    if (!productId) throw new Error('شناسه محصول الزامی است.');

    const id = `aud_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const priceChanged = oldPrice !== undefined && newPrice !== undefined && oldPrice !== newPrice;
    const stockChanged = oldStock !== undefined && newStock !== undefined && oldStock !== newStock;

    if (!priceChanged && !stockChanged) {
      return null; // تغییری رخ نداده است
    }

    run(
      `INSERT INTO price_stock_audit_logs 
       (id, product_id, user_id, role, old_price, new_price, old_stock, new_stock, ip, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, productId, userId || null, role || 'staff',
      oldPrice || 0, newPrice || 0, oldStock || 0, newStock || 0,
      ip, reason, now
    );

    return {
      audit_id: id,
      product_id: productId,
      price_diff: priceChanged ? (newPrice - oldPrice) : 0,
      stock_diff: stockChanged ? (newStock - oldStock) : 0,
      logged_at: now
    };
  }

  /**
   * دریافت تاریخچه ممیزی یک کالا
   */
  getProductAuditHistory(productId, limit = 20) {
    return all(
      `SELECT a.*, u.full_name as author_name
       FROM price_stock_audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.product_id = ?
       ORDER BY a.created_at DESC
       LIMIT ?`,
      productId, limit
    );
  }
}

export const priceStockAuditService = new PriceStockAuditService();
