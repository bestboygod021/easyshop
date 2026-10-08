import { all, get } from '../db/index.js';
import { productPublic } from '../utils/helpers.js';

/**
 * سرویس پیشنهاد لوازم جانبی و چرخه‌عمر دستگاه (Device Lifecycle & Accessory Recommender)
 * پیشنهاد محافظ صفحه، شارژر، قاب، و گجت‌های سازگار با دستگاه‌های خریداری شده توسط مشتری
 */
export class DeviceLifecycleRecommender {
  /**
   * جدول نگاشت دسته‌بندی یا کلمات کلیدی دستگاه‌ها به لوازم جانبی مرتبط
   */
  getAccessoryKeywordMap() {
    return {
      phone: ['قاب', 'گلس', 'کاور', 'شارژر', 'هندزفری', 'پاوربانک', 'محافظ صفحه'],
      mobile: ['قاب', 'گلس', 'کاور', 'شارژر', 'هندزفری', 'پاوربانک', 'محافظ صفحه'],
      laptop: ['کیف لپ‌تاپ', 'کوله', 'ماوس', 'پایه خنک‌کننده', 'کول‌پد', 'هاب', 'کیبورد'],
      tablet: ['کیف تبلت', 'قلم لمسی', 'گلس تبلت', 'پایه نگهدارنده'],
      watch: ['بند ساعت', 'محافظ ساعت', 'شارژر مغناطیسی'],
    };
  }

  /**
   * استخراج دستگاه‌های خریداری شده کاربر از تاریخچه سفارشات موفق
   */
  getUserPurchasedDevices(userId) {
    if (!userId) return [];

    const rows = all(
      `SELECT DISTINCT p.id, p.name_fa, p.name_en, p.category_id, p.brand, p.specs, o.placed_at
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = ? AND o.payment_status = 'paid'
       ORDER BY o.placed_at DESC
       LIMIT 5`,
      userId,
    );

    return rows;
  }

  /**
   * پیشنهاد لوازم جانبی بر اساس دستگاه‌های خریداری‌شده کاربر یا یک محصول مشخص
   */
  getRecommendationsForProduct(productId, limit = 4) {
    const product = get('SELECT id, name_fa, name_en, category_id, brand, specs FROM products WHERE id = ?', productId);
    if (!product) return [];

    const map = this.getAccessoryKeywordMap();
    const productName = `${product.name_fa} ${product.name_en || ''}`.toLowerCase();

    let searchKeywords = [];
    if (productName.includes('گوشی') || productName.includes('موبایل') || productName.includes('phone')) {
      searchKeywords = map.phone;
    } else if (productName.includes('لپ‌تاپ') || productName.includes('laptop')) {
      searchKeywords = map.laptop;
    } else if (productName.includes('تبلت') || productName.includes('tablet')) {
      searchKeywords = map.tablet;
    } else if (productName.includes('ساعت') || productName.includes('watch')) {
      searchKeywords = map.watch;
    } else {
      searchKeywords = ['لوازم جانبی', 'کابل', 'پاوربانک', 'شارژر'];
    }

    const brand = product.brand;
    // یافتن محصولات مرتبط که در عنوان آن‌ها کلمات لوازم جانبی وجود دارد
    const conditions = searchKeywords.map(() => 'p.name_fa LIKE ?').join(' OR ');
    const params = searchKeywords.map((k) => `%${k}%`);

    const accessories = all(
      `SELECT p.* FROM products p
       WHERE p.id != ? AND p.status = 'active' AND p.stock > 0
         AND (${conditions})
       ORDER BY (p.brand = ?) DESC, p.sold_count DESC
       LIMIT ?`,
      productId,
      ...params,
      brand,
      limit,
    );

    return accessories.map((p) => productPublic(p, { withDescription: false }));
  }

  /**
   * تولید بسته پیشنهادی چرخه‌عمر مشتری بر اساس تمام سفارشات گذشته او
   */
  getUserLifecycleRecommendations(userId, limit = 6) {
    const devices = this.getUserPurchasedDevices(userId);
    if (!devices || devices.length === 0) {
      // اگر خریدی نداشته، پرفروش‌ترین لوازم جانبی فعال را برگردان
      const general = all(
        `SELECT p.* FROM products p
         WHERE p.status = 'active' AND p.stock > 0
           AND (p.name_fa LIKE '%شارژر%' OR p.name_fa LIKE '%پاوربانک%' OR p.name_fa LIKE '%هندزفری%')
         ORDER BY p.sold_count DESC LIMIT ?`,
        limit,
      );
      return general.map((p) => productPublic(p, { withDescription: false }));
    }

    const latestDevice = devices[0];
    const recs = this.getRecommendationsForProduct(latestDevice.id, limit);

    return {
      based_on_device: {
        id: latestDevice.id,
        name: latestDevice.name_fa,
        brand: latestDevice.brand,
      },
      recommended_accessories: recs,
    };
  }
}

export const deviceLifecycleRecommender = new DeviceLifecycleRecommender();
