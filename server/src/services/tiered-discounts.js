/**
 * سیستم تخفیف‌های پلکانی سبد خرید (Tiered Cart Discounts)
 * تخفیف‌های درصدی یا مبلغی وابسته به ارزش ناخالص سبد
 */

export class TieredDiscountService {
  constructor(tiers = null) {
    // پله‌های پیش‌فرض تخفیف
    this.tiers = tiers || [
      { minSubtotal: 2000000, discountPct: 15, label: 'تخفیف طلایی خرید بالای ۲ میلیون تومان' },
      { minSubtotal: 1000000, discountPct: 10, label: 'تخفیف نقره‌ای خرید بالای ۱ میلیون تومان' },
      { minSubtotal: 500000,  discountPct: 5,  label: 'تخفیف برنزی خرید بالای ۵۰۰ هزار تومان' },
    ];
    // مرتب‌سازی بر اساس بیشترین حد آستانه
    this.tiers.sort((a, b) => b.minSubtotal - a.minSubtotal);
  }

  /**
   * ارزیابی و محاسبه تخفیف پلکانی روی سبد خرید
   * @param {number} subtotal جمع ناخالص اقلام سبد خرید
   * @returns {{ eligible: boolean, discountPct: number, discountAmount: number, tierLabel: string | null }}
   */
  evaluateCartTier(subtotal) {
    for (const tier of this.tiers) {
      if (subtotal >= tier.minSubtotal) {
        const discountAmount = Math.round((subtotal * tier.discountPct) / 100);
        return {
          eligible: true,
          discountPct: tier.discountPct,
          discountAmount,
          tierLabel: tier.label,
        };
      }
    }

    return {
      eligible: false,
      discountPct: 0,
      discountAmount: 0,
      tierLabel: null,
    };
  }
}

export const tieredDiscountService = new TieredDiscountService();
