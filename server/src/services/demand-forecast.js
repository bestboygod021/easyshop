import { all } from '../db/index.js';

/**
 * سرویس پیش‌بینی تقاضا و سفارش‌گذاری هوشمند انبار (Demand Forecasting & Reorder Advisor)
 */
export class DemandForecastService {
  /**
   * محاسبه نرخ فروش روزانه در ۳۰ روز گذشته و روزهای باقی‌مانده تا اتمام موجودی
   */
  getReorderRecommendations(leadTimeDays = 7) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const products = all(
      `SELECT p.id, p.name_fa, p.stock, p.low_stock_threshold,
              COALESCE(SUM(oi.qty), 0) as units_sold_30d
       FROM products p
       LEFT JOIN order_items oi ON p.id = oi.product_id
       LEFT JOIN orders o ON oi.order_id = o.id AND o.payment_status = 'paid' AND o.placed_at >= ?
       WHERE p.status = 'active'
       GROUP BY p.id`
      , thirtyDaysAgo
    );

    return products.map(prod => {
      const sold = Number(prod.units_sold_30d) || 0;
      const dailyRunRate = sold / 30;
      const currentStock = Number(prod.stock) || 0;
      const daysOfSupply = dailyRunRate > 0 ? Math.floor(currentStock / dailyRunRate) : 999;
      const reorderPoint = Math.ceil(dailyRunRate * leadTimeDays) + (prod.low_stock_threshold || 5);
      const shouldReorder = currentStock <= reorderPoint;

      return {
        product_id: prod.id,
        name_fa: prod.name_fa,
        current_stock: currentStock,
        sold_last_30_days: sold,
        daily_velocity: Number(dailyRunRate.toFixed(2)),
        estimated_days_left: daysOfSupply,
        suggested_reorder_point: reorderPoint,
        recommended_reorder_qty: shouldReorder ? Math.max(10, Math.ceil(dailyRunRate * 30)) : 0,
        urgency: daysOfSupply <= 3 ? 'critical' : (shouldReorder ? 'warning' : 'ok')
      };
    });
  }
}

export const demandForecastService = new DemandForecastService();
