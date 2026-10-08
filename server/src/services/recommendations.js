import { all } from '../db/index.js';

/**
 * سرویس پیشنهاد هوشمند محصولات مکمل و بیش‌فروشی (Cross-sell & Upsell)
 * بر اساس الگوریتم همبستگی خریدهای پیشین کاربران در سفارشات ثبت‌شده
 */

export class RecommendationService {
  /**
   * یافتن کالاهایی که اغلب همراه با کالای مشخص شده خریداری شده‌اند
   * @param {string} productId شناسه محصول جاری
   * @param {number} limit تعداد اقلام پیشنهادی
   */
  getFrequentlyBoughtTogether(productId, limit = 4) {
    if (!productId) return [];

    // یافتن سفارش‌هایی که شامل این کالا بوده‌اند و استخراج سایر کالاهای آن سفارش‌ها
    const relatedProducts = all(
      `SELECT 
         oi.product_id,
         p.name_fa,
         p.slug,
         p.price,
         p.thumbnail,
         COUNT(*) as co_purchase_count
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id IN (
         SELECT DISTINCT order_id FROM order_items WHERE product_id = ?
       )
       AND oi.product_id != ?
       AND p.status = 'active'
       GROUP BY oi.product_id
       ORDER BY co_purchase_count DESC, p.stock DESC
       LIMIT ?`,
      productId,
      productId,
      limit
    );

    return relatedProducts;
  }

  /**
   * پیشنهاد محصولات ارتقایافته در همان دسته (Upsell) با ویژگی‌ها و رده قیمتی بالاتر
   */
  getUpsellRecommendations(categoryId, currentPrice, limit = 4) {
    if (!categoryId) return [];

    return all(
      `SELECT id, name_fa, slug, price, thumbnail, stock
       FROM products 
       WHERE category_id = ? 
         AND price > ? 
         AND price <= ? 
         AND status = 'active'
       ORDER BY price ASC, stock DESC
       LIMIT ?`,
      categoryId,
      currentPrice,
      currentPrice * 1.5, // پیشنهاد اقلام تا ۵۰ درصد گران‌تر با ارزش بالاتر
      limit
    );
  }
}

export const recommendationService = new RecommendationService();
