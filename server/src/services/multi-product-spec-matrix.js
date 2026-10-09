import { all, parseJson } from '../db/index.js';

/**
 * موتور مقایسه هوشمند مشخصات فنی کالاها در قالب ماتریس تعاملی
 * (Interactive Multi-Product Spec Matrix Generator)
 */
export class MultiProductSpecMatrixService {
  /**
   * تولید ماتریس مقایسه بین ۲ تا ۴ کالا
   */
  generateComparisonMatrix(productIds = []) {
    if (!Array.isArray(productIds) || productIds.length < 2) {
      throw new Error('برای مقایسه، انتخاب حداقل ۲ کالا الزامی است.');
    }

    const targetIds = productIds.slice(0, 4);
    const placeholders = targetIds.map(() => '?').join(',');
    const products = all(
      `SELECT id, name_fa, slug, brand, price, compare_at_price, stock, specs, images, thumbnail, warranty
       FROM products
       WHERE id IN (${placeholders})`,
      ...targetIds,
    );

    if (products.length < 2) {
      throw new Error('حداقل دو کالای معتبر برای مقایسه یافت نشد.');
    }

    // استخراج کلیه کلیدهای مشخصات فنی (Specs Keys) منحصر به‌فرد
    const allSpecKeys = new Set();
    const productParsedSpecs = {};

    for (const p of products) {
      const parsed = typeof p.specs === 'string' ? parseJson(p.specs, {}) : (p.specs || {});
      productParsedSpecs[p.id] = parsed;
      Object.keys(parsed).forEach((k) => allSpecKeys.add(k));
    }

    // تولید ردیف‌های ماتریس مقایسه
    const matrixRows = [];

    // ۱. ردیف‌های پایه (قیمت، برند، موجودی، گارانتی)
    matrixRows.push({
      feature_key: 'price',
      feature_title: 'قیمت فروش',
      values: products.reduce((acc, p) => ({ ...acc, [p.id]: `${(p.price || 0).toLocaleString('fa-IR')} تومان` }), {}),
      is_different: new Set(products.map((p) => p.price)).size > 1,
    });

    matrixRows.push({
      feature_key: 'brand',
      feature_title: 'برند سازنده',
      values: products.reduce((acc, p) => ({ ...acc, [p.id]: p.brand || 'متفرقه' }), {}),
      is_different: new Set(products.map((p) => p.brand)).size > 1,
    });

    matrixRows.push({
      feature_key: 'warranty',
      feature_title: 'مدت و نوع گارانتی',
      values: products.reduce((acc, p) => ({ ...acc, [p.id]: p.warranty || 'گارانتی اصالت و سلامت' }), {}),
      is_different: new Set(products.map((p) => p.warranty)).size > 1,
    });

    // ۲. ردیف‌های مشخصات فنی داینامیک
    for (const key of allSpecKeys) {
      const rowValues = {};
      const distinctValues = new Set();

      for (const p of products) {
        const val = productParsedSpecs[p.id][key] || '—';
        rowValues[p.id] = String(val);
        distinctValues.add(String(val));
      }

      matrixRows.push({
        feature_key: key,
        feature_title: key,
        values: rowValues,
        is_different: distinctValues.size > 1,
      });
    }

    return {
      products_count: products.length,
      products: products.map((p) => ({
        id: p.id,
        name: p.name_fa,
        slug: p.slug,
        thumbnail: p.thumbnail || (Array.isArray(p.images) ? p.images[0] : null),
        price: p.price,
      })),
      matrix_rows: matrixRows,
      differing_features_count: matrixRows.filter((r) => r.is_different).length,
    };
  }
}

export const multiProductSpecMatrixService = new MultiProductSpecMatrixService();
