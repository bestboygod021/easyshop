/**
 * Tiered Wholesale Volume Pricing Service (Round 28)
 * Configures dynamic tiered pricing based on purchase volume (e.g. 5+ units: 10% off, 20+ units: 20% off).
 * Evaluates cart line items and applies appropriate wholesale tier discounts.
 */

export class WholesaleVolumePricingService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Set tiered price brackets for a product
   */
  async configureProductTiers(productId, tiers = []) {
    if (!productId) throw new Error('شناسه محصول الزامی است');
    if (!Array.isArray(tiers) || tiers.length === 0) {
      throw new Error('حداقل یک پلکان تخفیف حجمی باید تعریف شود');
    }

    // Sort ascending by min_quantity
    const sorted = tiers
      .map(t => ({
        min_quantity: Math.max(Number(t.min_quantity) || 1, 1),
        discount_percent: Math.min(Math.max(Number(t.discount_percent) || 0, 0), 60)
      }))
      .sort((a, b) => a.min_quantity - b.min_quantity);

    const now = new Date().toISOString();
    // Clear old tiers
    await this.db.run('DELETE FROM product_volume_tiers WHERE product_id = ?', [productId]);

    for (const tier of sorted) {
      const id = `pvt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await this.db.run(
        `INSERT INTO product_volume_tiers (id, product_id, min_quantity, discount_percent, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, productId, tier.min_quantity, tier.discount_percent, now]
      );
    }

    return {
      product_id: productId,
      tiers: sorted,
      message: `${sorted.length} پلکان تخفیف تعداد با موفقیت ثبت شد.`
    };
  }

  /**
   * Calculate effective unit price and discount for a specific quantity
   */
  async calculateVolumePrice(productId, quantity, basePriceToman = null) {
    const qty = Math.max(Number(quantity) || 1, 1);
    let basePrice = Number(basePriceToman);

    if (!basePrice) {
      const prod = await this.db.get('SELECT price FROM products WHERE id = ?', [productId]);
      basePrice = Number(prod?.price || 0);
    }

    const tiers = await this.db.all(
      'SELECT * FROM product_volume_tiers WHERE product_id = ? ORDER BY min_quantity DESC',
      [productId]
    );

    let activeTier = null;
    for (const tier of tiers) {
      if (qty >= tier.min_quantity) {
        activeTier = tier;
        break;
      }
    }

    const discountPercent = activeTier ? Number(activeTier.discount_percent) : 0;
    const discountedUnitPrice = Math.round(basePrice * (1 - discountPercent / 100));
    const totalPrice = discountedUnitPrice * qty;
    const totalSavings = (basePrice - discountedUnitPrice) * qty;

    return {
      product_id: productId,
      quantity: qty,
      base_unit_price: basePrice,
      discount_percent_applied: discountPercent,
      effective_unit_price: discountedUnitPrice,
      total_price_toman: totalPrice,
      total_savings_toman: totalSavings,
      tier_triggered: Boolean(activeTier)
    };
  }
}
