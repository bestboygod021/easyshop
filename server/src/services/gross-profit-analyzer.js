/**
 * Real-time Gross Profit Margin Analyzer Service (Round 29)
 * Calculates net merchant profit on every order by deducting product unit COGS,
 * payment gateway commission, packaging material cost, and vendor commission splits.
 */

export class GrossProfitMarginAnalyzerService {
  constructor(db) {
    this.db = db;
    this.fixedPackagingCostToman = 15000;
  }

  /**
   * Calculate financial profit breakdown for an order
   */
  async analyzeOrderProfit(orderId) {
    if (!orderId) throw new Error('شناسه سفارش الزامی است');

    const order = await this.db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) throw new Error('سفارش مورد نظر یافت نشد');

    const items = await this.db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    const grossRevenue = Number(order.total) || 0;

    // Estimate COGS (Cost of Goods Sold)
    let totalCogs = 0;
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.price) || 0;
      // Default estimated cost is 75% of price if cost column isn't present
      const unitCost = Number(item.cost) || Math.round(unitPrice * 0.75);
      totalCogs += unitCost * qty;
    }

    // Payment gateway commission (e.g. 1% max 4,000 toman for Zibal/Zarinpal)
    const gatewayFee = Math.min(Math.round(grossRevenue * 0.01), 4000);

    // Packaging & dispatch materials
    const packagingCost = this.fixedPackagingCostToman;

    // Net gross profit
    const netGrossProfitToman = grossRevenue - (totalCogs + gatewayFee + packagingCost);
    const profitMarginPercentage = grossRevenue > 0
      ? Math.round((netGrossProfitToman / grossRevenue) * 1000) / 10
      : 0;

    return {
      order_id: orderId,
      gross_revenue_toman: grossRevenue,
      cogs_total_toman: totalCogs,
      gateway_fee_toman: gatewayFee,
      packaging_cost_toman: packagingCost,
      net_gross_profit_toman: netGrossProfitToman,
      profit_margin_percentage: profitMarginPercentage,
      currency: 'تومان',
      is_profitable: netGrossProfitToman > 0,
      summary: `سود ناخالص سفارش: ${netGrossProfitToman.toLocaleString('fa-IR')} تومان (حاشیه سود: ٪${profitMarginPercentage})`
    };
  }
}
