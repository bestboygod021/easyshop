/**
 * سرویس تخفیف پلکانی همکاران و خریداران عمده (Tiered B2B Volume Pricing)
 */
export class VolumePricingService {
  constructor() {
    this.defaultTiers = [
      { min_qty: 20, discount_pct: 12, label_fa: 'خرید عمده کارتنی (۱۲٪ تخفیف)' },
      { min_qty: 10, discount_pct: 7, label_fa: 'خرید نیمه‌عمده (۷٪ تخفیف)' },
      { min_qty: 5, discount_pct: 3, label_fa: 'خرید پک ۵ تایی (۳٪ تخفیف)' },
    ];
  }

  /**
   * محاسبه قیمت با تخفیف پلکانی بر اساس تعداد سفارش
   */
  calculateTieredPrice(basePrice, qty, customTiers = null) {
    const quantity = Math.max(1, parseInt(qty, 10) || 1);
    const tiers = customTiers || this.defaultTiers;

    // پیدا کردن بالاترین پله تخفیف مشمول
    const applicableTier = tiers.find(t => quantity >= t.min_qty) || null;
    const discountPct = applicableTier ? applicableTier.discount_pct : 0;

    const unitPrice = discountPct > 0 
      ? Math.round(basePrice * (1 - discountPct / 100))
      : basePrice;

    const originalTotal = basePrice * quantity;
    const discountedTotal = unitPrice * quantity;
    const savings = originalTotal - discountedTotal;

    return {
      base_price: basePrice,
      quantity,
      unit_price: unitPrice,
      discount_percentage: discountPct,
      applicable_tier: applicableTier?.label_fa || 'قیمت عادی تکی',
      total_price: discountedTotal,
      savings,
      available_tiers: tiers.map(t => ({
        min_qty: t.min_qty,
        discount_pct: t.discount_pct,
        label: t.label_fa,
        unit_price_in_tier: Math.round(basePrice * (1 - t.discount_pct / 100))
      }))
    };
  }
}

export const volumePricingService = new VolumePricingService();
