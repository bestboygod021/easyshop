/**
 * Currency Pegged Dynamic Pricing Service (Round 27)
 * Adjusts product retail prices automatically based on benchmark exchange rate fluctuations (USD/AED/Gold gram)
 * with base cost index, margin multiplier, and safety floor/ceiling bounds.
 */

export class DynamicCurrencyPricingService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Set or update dynamic currency pegged configuration for a product
   */
  async configureProductPricing({
    productId,
    basePegCurrency = 'USD', // USD, AED, GOLD_18K
    baseForeignCost,
    targetMarginPercent = 15,
    minPriceToman = 0,
    maxPriceToman = 0,
    isEnabled = true
  }) {
    if (!productId) throw new Error('شناسه محصول الزامی است');
    const foreignCost = Math.max(Number(baseForeignCost) || 0, 0);
    const margin = Math.max(Number(targetMarginPercent) || 0, 0);
    const minPrice = Math.max(Number(minPriceToman) || 0, 0);
    const maxPrice = Math.max(Number(maxPriceToman) || 0, 0);
    const enabled = isEnabled ? 1 : 0;
    const now = new Date().toISOString();

    const existing = await this.db.get('SELECT * FROM product_currency_pegs WHERE product_id = ?', [productId]);
    if (existing) {
      await this.db.run(
        `UPDATE product_currency_pegs 
         SET base_peg_currency = ?, base_foreign_cost = ?, target_margin_percent = ?, min_price_toman = ?, max_price_toman = ?, is_enabled = ?, updated_at = ?
         WHERE product_id = ?`,
        [basePegCurrency, foreignCost, margin, minPrice, maxPrice, enabled, now, productId]
      );
    } else {
      await this.db.run(
        `INSERT INTO product_currency_pegs 
         (id, product_id, base_peg_currency, base_foreign_cost, target_margin_percent, min_price_toman, max_price_toman, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`peg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, productId, basePegCurrency, foreignCost, margin, minPrice, maxPrice, enabled, now, now]
      );
    }

    return {
      product_id: productId,
      base_peg_currency: basePegCurrency,
      base_foreign_cost: foreignCost,
      target_margin_percent: margin,
      is_enabled: Boolean(enabled)
    };
  }

  /**
   * Recalculate product price according to new market currency rate
   */
  async recalculateProductPrice(productId, currentExchangeRateToman) {
    const config = await this.db.get('SELECT * FROM product_currency_pegs WHERE product_id = ? AND is_enabled = 1', [productId]);
    if (!config) throw new Error('تنظیمات قیمت‌گذاری ارزی برای این کالا فعال نیست');

    const rate = Math.max(Number(currentExchangeRateToman) || 0, 0);
    const baseCostToman = Math.round(config.base_foreign_cost * rate);
    const calculatedPrice = Math.round(baseCostToman * (1 + config.target_margin_percent / 100));

    let finalPrice = calculatedPrice;
    if (config.min_price_toman > 0 && finalPrice < config.min_price_toman) {
      finalPrice = config.min_price_toman;
    }
    if (config.max_price_toman > 0 && finalPrice > config.max_price_toman) {
      finalPrice = config.max_price_toman;
    }

    // Update product retail price
    await this.db.run('UPDATE products SET price = ? WHERE id = ?', [finalPrice, productId]);

    return {
      product_id: productId,
      exchange_rate_toman: rate,
      base_foreign_cost: config.base_foreign_cost,
      peg_currency: config.base_peg_currency,
      cost_toman: baseCostToman,
      margin_percent: config.target_margin_percent,
      calculated_price: calculatedPrice,
      final_price_toman: finalPrice,
      updated_at: new Date().toISOString()
    };
  }
}
