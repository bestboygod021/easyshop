import { all } from '../db/index.js';

/**
 * سیستم پیشنهاد هوشمند بسته‌های ترکیبی پرفروش (Smart Bundle Recommendations)
 */
export class SmartBundleService {
  /**
   * دریافت بسته‌های اقتصادی پیشنهادی مرتبط با سبد خرید
   * @param {string[]} cartProductIds شناسه‌های محصولات داخل سبد خریدار
   */
  getSuggestedBundles(cartProductIds = []) {
    // بسته‌های پیش‌ساخته تعریف‌شده در سیستم
    const bundles = all(
      `SELECT b.id, b.title, b.discount_pct
       FROM product_bundles b
       WHERE b.is_active = 1
       LIMIT 5`
    );

    if (bundles.length > 0) {
      return bundles.map(b => {
        const items = all(
          `SELECT bi.product_id, bi.qty, p.name_fa, p.price, p.thumbnail
           FROM product_bundle_items bi
           JOIN products p ON bi.product_id = p.id
           WHERE bi.bundle_id = ?`,
          b.id
        );

        const origTotal = items.reduce((sum, it) => sum + (it.price * it.qty), 0);
        const bPrice = Math.round(origTotal * (1 - b.discount_pct / 100));

        return {
          bundle_id: b.id,
          title: b.title,
          discount_pct: b.discount_pct,
          bundle_price: bPrice,
          original_total: origTotal,
          savings: origTotal - bPrice,
          items
        };
      });
    }

    // در صورت عدم تعریف باندل در جدول، پیشنهاد بسته مکمل پویا از محصولات مرتبط
    const complementary = all(
      `SELECT id, name_fa, price, thumbnail, rating_avg
       FROM products
       WHERE status = 'active'
       ORDER BY sold_count DESC
       LIMIT 3`
    );

    if (complementary.length >= 2) {
      const origTotal = complementary.reduce((sum, p) => sum + p.price, 0);
      const discountPct = 10;
      const bPrice = Math.round(origTotal * 0.9);

      return [{
        bundle_id: 'dynamic_starter_bundle',
        title: 'پک اقتصادی منتخب خریداران',
        discount_pct: discountPct,
        bundle_price: bPrice,
        original_total: origTotal,
        savings: origTotal - bPrice,
        items: complementary.map(p => ({
          product_id: p.id,
          name_fa: p.name_fa,
          price: p.price,
          thumbnail: p.thumbnail,
          qty: 1
        }))
      }];
    }

    return [];
  }
}

export const smartBundleService = new SmartBundleService();
