/**
 * Tiered Vendor Commission Matrix Service (Round 27)
 * Computes tiered marketplace commission percentages based on product category,
 * vendor tier level (PLATINUM, GOLD, SILVER, BRONZE), and monthly sales volume.
 */

export class TieredVendorCommissionService {
  constructor(db) {
    this.db = db;
    // Base category rates
    this.categoryBaseRates = {
      electronics: 6.0,
      mobile: 4.5,
      fashion: 15.0,
      cosmetics: 12.0,
      home_appliances: 7.0,
      default: 8.0
    };
    // Tier discounts
    this.tierDiscounts = {
      PLATINUM: 2.0, // 2% reduction
      GOLD: 1.5,
      SILVER: 0.8,
      BRONZE: 0.0
    };
  }

  /**
   * Calculate effective commission rate and payout split for a sale
   */
  calculateCommission({ categoryKey = 'default', vendorTier = 'BRONZE', saleAmountToman = 0 }) {
    const sale = Math.max(Number(saleAmountToman) || 0, 0);
    const baseRate = this.categoryBaseRates[categoryKey] || this.categoryBaseRates.default;
    const tierDiscount = this.tierDiscounts[vendorTier.toUpperCase()] || 0;

    // Commission cannot drop below 2.0%
    const effectiveCommissionRate = Math.max(baseRate - tierDiscount, 2.0);

    const commissionAmount = Math.round((sale * effectiveCommissionRate) / 100);
    const vendorPayoutAmount = sale - commissionAmount;

    return {
      sale_amount_toman: sale,
      category: categoryKey,
      vendor_tier: vendorTier.toUpperCase(),
      base_commission_rate: baseRate,
      tier_discount_rate: tierDiscount,
      effective_commission_rate: effectiveCommissionRate,
      commission_amount_toman: commissionAmount,
      vendor_payout_toman: vendorPayoutAmount
    };
  }

  /**
   * Evaluate and update vendor tier based on 30-day fulfilled sales
   */
  async evaluateVendorTier(vendorId) {
    if (!vendorId) throw new Error('شناسه فروشنده الزامی است');

    const salesRow = await this.db.get(
      `SELECT COALESCE(SUM(total), 0) as total_sales FROM orders WHERE vendor_id = ? AND status IN ('completed', 'delivered')`,
      [vendorId]
    );

    const totalSales = Number(salesRow?.total_sales || 0);
    let newTier = 'BRONZE';

    if (totalSales >= 1000000000) { // 1 Billion Toman
      newTier = 'PLATINUM';
    } else if (totalSales >= 400000000) { // 400 Million Toman
      newTier = 'GOLD';
    } else if (totalSales >= 100000000) { // 100 Million Toman
      newTier = 'SILVER';
    }

    await this.db.run('UPDATE vendors SET tier = ? WHERE id = ?', [newTier, vendorId]);

    return {
      vendor_id: vendorId,
      total_sales_toman: totalSales,
      calculated_tier: newTier,
      message: `گرید فروشنده با توجه به حجم فروش به سطح ${newTier} ارتقا یافت.`
    };
  }
}
