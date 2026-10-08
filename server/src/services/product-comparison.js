import { all } from '../db/index.js';

/**
 * سرویس ماتریس مقایسه مشخصات فنی چند کالا در یک نگاه
 */
export class ProductComparisonMatrix {
  /**
   * مقایسه مشخصات و ویژگی‌های فنی کالاهای ورودی
   * @param {string[]} productIds آرایه شناسه‌های کالاها
   */
  compareProducts(productIds) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return { products: [], spec_matrix: [] };
    }

    const placeholders = productIds.map(() => '?').join(',');
    const products = all(
      `SELECT id, name_fa, price, compare_at_price, brand, stock, specs, thumbnail
       FROM products
       WHERE id IN (${placeholders})`,
      ...productIds
    );

    // استخراج کلیه کلیدهای مشخصات فنی از کالاها
    const allSpecKeys = new Set();
    const productSpecMaps = new Map();

    for (const prod of products) {
      let parsedSpecs = {};
      try {
        const raw = typeof prod.specs === 'string' ? JSON.parse(prod.specs) : prod.specs;
        if (Array.isArray(raw)) {
          for (const item of raw) {
            const key = item.key || item.label;
            if (key) {
              parsedSpecs[key] = item.value;
              allSpecKeys.add(key);
            }
          }
        } else if (raw && typeof raw === 'object') {
          parsedSpecs = raw;
          Object.keys(raw).forEach(k => allSpecKeys.add(k));
        }
      } catch {
        parsedSpecs = {};
      }
      productSpecMaps.set(prod.id, parsedSpecs);
    }

    // ایجاد ردیف‌های مقایسه مشخصات
    const specMatrix = Array.from(allSpecKeys).map(key => {
      const values = {};
      for (const prod of products) {
        values[prod.id] = productSpecMaps.get(prod.id)?.[key] || '—';
      }
      return {
        feature: key,
        values
      };
    });

    return {
      product_count: products.length,
      products: products.map(p => ({
        id: p.id,
        name_fa: p.name_fa,
        price: p.price,
        compare_at_price: p.compare_at_price,
        brand: p.brand || '—',
        stock: p.stock,
        thumbnail: p.thumbnail
      })),
      spec_matrix: specMatrix
    };
  }
}

export const productComparisonMatrix = new ProductComparisonMatrix();
