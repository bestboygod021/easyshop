/**
 * B2B Price List & Visual Catalog Generator (Round 25)
 * Generates formatted tabular B2B wholesale price lists and visual catalog data
 * with product SKU, title, category, retail price, wholesale tiered price, barcode, and availability.
 */

export class B2BPriceListGeneratorService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Generate complete B2B wholesale price list
   */
  async generatePriceList({ categoryId = null, wholesaleDiscountPercent = 15 } = {}) {
    const discount = Math.min(Math.max(Number(wholesaleDiscountPercent) || 15, 0), 50);

    let query = 'SELECT id, title, price, category_id, stock, barcode FROM products WHERE is_active = 1';
    const params = [];

    if (categoryId) {
      query += ' AND category_id = ?';
      params.push(categoryId);
    }

    query += ' ORDER BY category_id ASC, price DESC';

    const products = await this.db.all(query, params);

    const catalogItems = products.map(p => {
      const retailPrice = Number(p.price) || 0;
      const wholesalePrice = Math.round((retailPrice * (100 - discount)) / 100);
      const barcode = p.barcode || `6260${String(p.id).padStart(8, '0')}`;

      return {
        product_id: p.id,
        title: p.title,
        category_id: p.category_id,
        stock_status: p.stock > 0 ? 'موجود در انبار مرکزی' : 'قابل سفارش B2B (تأمین ۴۸ ساعته)',
        retail_price_toman: retailPrice,
        wholesale_price_toman: wholesalePrice,
        saving_amount_toman: retailPrice - wholesalePrice,
        min_order_quantity: 5,
        barcode: barcode
      };
    });

    const generatedDate = new Date().toLocaleDateString('fa-IR');

    return {
      title: 'لیست قیمت و کاتالوگ فروش عمده و سازمانی (B2B)',
      currency: 'تومان',
      wholesale_discount_applied: `${discount}%`,
      generated_at_jalali: generatedDate,
      total_items: catalogItems.length,
      items: catalogItems
    };
  }
}
