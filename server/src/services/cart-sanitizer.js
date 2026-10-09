import { get } from '../db/index.js';

/**
 * سرویس پالایش و ارزیابی لحظه‌ای سبد خرید پیش از مرحله نهایی پرداخت (Cart Health Check)
 * بررسی تغییرات قیمت کالاها، اتمام موجودی انبار و اعمال تعدیلات لازم
 */

export class CartSanitizerService {
  /**
   * بازبینی تمام اقلام سبد خرید نسبت به آخرین وضعیت دیتابیس کالاها
   * @param {Array<{ product_id: string, qty: number, unit_price: number }>} cartItems
   */
  sanitizeCart(cartItems) {
    const issues = [];
    const sanitizedItems = [];
    let priceChanged = false;
    let stockChanged = false;

    for (const item of cartItems) {
      const liveProduct = get(
        `SELECT id, name_fa, price, stock, status FROM products WHERE id = ?`,
        item.product_id
      );

      if (!liveProduct || liveProduct.status !== 'active') {
        issues.push({
          product_id: item.product_id,
          type: 'unavailable',
          message: `کالای «${liveProduct?.name_fa || item.product_id}» ناموجود یا غیرفعال شده و از سبد حذف شد.`,
        });
        stockChanged = true;
        continue;
      }

      let currentQty = item.qty;
      if (liveProduct.stock <= 0) {
        issues.push({
          product_id: item.product_id,
          type: 'out_of_stock',
          message: `موجودی کالای «${liveProduct.name_fa}» به پایان رسیده و از سبد حذف شد.`,
        });
        stockChanged = true;
        continue;
      }

      if (currentQty > liveProduct.stock) {
        issues.push({
          product_id: item.product_id,
          type: 'stock_adjusted',
          message: `تعداد کالای «${liveProduct.name_fa}» به علت محدودیت موجودی از ${currentQty} به ${liveProduct.stock} عدد کاهش یافت.`,
        });
        currentQty = liveProduct.stock;
        stockChanged = true;
      }

      if (item.unit_price && item.unit_price !== liveProduct.price) {
        issues.push({
          product_id: item.product_id,
          type: 'price_updated',
          message: `قیمت کالای «${liveProduct.name_fa}» از ${item.unit_price.toLocaleString('fa-IR')} به ${liveProduct.price.toLocaleString('fa-IR')} تومان تغییر کرده است.`,
        });
        priceChanged = true;
      }

      sanitizedItems.push({
        product_id: liveProduct.id,
        name_fa: liveProduct.name_fa,
        qty: currentQty,
        unit_price: liveProduct.price,
        total: liveProduct.price * currentQty,
      });
    }

    const newSubtotal = sanitizedItems.reduce((acc, it) => acc + it.total, 0);

    return {
      is_modified: priceChanged || stockChanged,
      issues_count: issues.length,
      issues,
      sanitized_items: sanitizedItems,
      new_subtotal: newSubtotal,
    };
  }
}

export const cartSanitizerService = new CartSanitizerService();
