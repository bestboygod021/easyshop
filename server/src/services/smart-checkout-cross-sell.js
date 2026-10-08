/**
 * Smart Checkout Cross-Sell Bumper Service (Round 28)
 * Suggests high-affinity, impulse-buy accessories (cases, screen protectors, fast chargers, cables)
 * directly in the checkout drawer based on cart products with bundled discount incentives.
 */

export class SmartCheckoutCrossSellBumperService {
  constructor(db) {
    this.db = db;
    // Pre-mapped category affinities
    this.categoryAffinityMap = {
      mobile: ['cat_cases', 'cat_chargers', 'cat_screen_protectors'],
      laptop: ['cat_mouse', 'cat_laptop_bags', 'cat_hubs'],
      gaming: ['cat_headsets', 'cat_mousepads', 'cat_controllers']
    };
  }

  /**
   * Get cross-sell add-on recommendations for current cart
   */
  async getCheckoutBumpOffers(cartItemProductIds = [], incentiveDiscountPercent = 15) {
    if (!Array.isArray(cartItemProductIds) || cartItemProductIds.length === 0) {
      return { offers: [], count: 0 };
    }

    const discount = Math.min(Math.max(Number(incentiveDiscountPercent) || 15, 5), 30);

    // Fetch categories of current cart items
    const cartProducts = await this.db.all(
      `SELECT id, category_id, title FROM products WHERE id IN (${cartItemProductIds.map(() => '?').join(',')})`,
      cartItemProductIds
    );

    const relatedCategoryIds = new Set();
    for (const p of cartProducts) {
      const affinities = this.categoryAffinityMap[p.category_id] || ['cat_accessories'];
      affinities.forEach(cat => relatedCategoryIds.add(cat));
    }

    // Query candidate accessory products (in-stock, low-to-mid ticket items)
    const candidates = await this.db.all(
      `SELECT id, title, price, category_id, stock FROM products 
       WHERE id NOT IN (${cartItemProductIds.map(() => '?').join(',')}) AND is_active = 1 AND stock > 0
       ORDER BY price ASC LIMIT 4`,
      cartItemProductIds
    );

    const offers = candidates.map(p => {
      const retailPrice = Number(p.price) || 0;
      const bumpedPrice = Math.round((retailPrice * (100 - discount)) / 100);
      return {
        product_id: p.id,
        title: p.title,
        retail_price_toman: retailPrice,
        bump_price_toman: bumpedPrice,
        saving_toman: retailPrice - bumpedPrice,
        discount_percent: discount,
        badge: '🔥 پیشنهاد ویژه مرحله نهایی سبد'
      };
    });

    return {
      offers,
      count: offers.length,
      discount_applied: `${discount}%`,
      cart_evaluated_count: cartItemProductIds.length
    };
  }
}
