import { all, get } from '../db/index.js';

/**
 * سیستم پیش‌بینی زمان پایان موجودی انبار (Stock Depletion Forecaster)
 * محاسبه نرخ سوخت و سرعت فروش روزانه (Sales Velocity) و تخمین تاریخ اتمام موجودی (Runout Date)
 */
export class StockDepletionForecaster {
  /**
   * محاسبه سرعت فروش روزانه و پیش‌بینی روزهای باقی‌مانده تا صفر شدن موجودی یک محصول
   * @param {string} productId شناسه محصول
   * @param {number} daysWindow بازه زمانی ارزیابی گذشته (پیش‌فرض ۳۰ روز)
   */
  forecastProductDepletion(productId, daysWindow = 30) {
    const product = get('SELECT id, name_fa, stock, low_stock_threshold FROM products WHERE id = ?', productId);
    if (!product) throw new Error('محصول مورد نظر یافت نشد.');

    const sinceDate = new Date(Date.now() - daysWindow * 24 * 3600 * 1000).toISOString();

    // محاسبه تعداد کل فروش محصول در بازه زمانی تعیین‌شده
    const salesRow = get(
      `SELECT COALESCE(SUM(oi.qty), 0) AS total_sold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = ? AND o.payment_status = 'paid' AND o.placed_at >= ?`,
      productId,
      sinceDate,
    );

    const totalSold = salesRow?.total_sold || 0;
    const dailyVelocity = totalSold > 0 ? Number((totalSold / daysWindow).toFixed(2)) : 0;
    const currentStock = Math.max(0, product.stock || 0);

    let daysRemaining = null;
    let estimatedRunoutDate = null;
    let urgencyLevel = 'safe'; // 'critical' | 'warning' | 'safe'

    if (dailyVelocity > 0) {
      daysRemaining = Math.round(currentStock / dailyVelocity);
      const runoutTimestamp = Date.now() + daysRemaining * 24 * 3600 * 1000;
      estimatedRunoutDate = new Date(runoutTimestamp).toISOString().split('T')[0];

      if (daysRemaining <= 7) {
        urgencyLevel = 'critical';
      } else if (daysRemaining <= 15 || currentStock <= (product.low_stock_threshold || 5)) {
        urgencyLevel = 'warning';
      }
    } else if (currentStock <= (product.low_stock_threshold || 5)) {
      urgencyLevel = 'warning';
    }

    return {
      product_id: product.id,
      product_name: product.name_fa,
      current_stock: currentStock,
      evaluated_days: daysWindow,
      total_sold_in_window: totalSold,
      daily_sales_velocity: dailyVelocity,
      days_remaining_estimate: daysRemaining,
      estimated_runout_date: estimatedRunoutDate,
      urgency_level: urgencyLevel,
      recommended_reorder_qty: Math.max(10, Math.ceil(dailyVelocity * 30)), // پیشنهاد تامین برای ۳۰ روز آینده
    };
  }

  /**
   * گزارش محصولات در معرض اتمام موجودی برای داشبورد انبارداری
   */
  getCriticalStockForecast(limit = 10) {
    const products = all("SELECT id FROM products WHERE status = 'active' LIMIT 50");
    const forecasts = [];

    for (const p of products) {
      try {
        const fc = this.forecastProductDepletion(p.id, 30);
        if (fc.urgency_level === 'critical' || fc.urgency_level === 'warning') {
          forecasts.push(fc);
        }
      } catch {
        // ignore
      }
    }

    forecasts.sort((a, b) => {
      const daysA = a.days_remaining_estimate !== null ? a.days_remaining_estimate : 999;
      const daysB = b.days_remaining_estimate !== null ? b.days_remaining_estimate : 999;
      return daysA - daysB;
    });

    return forecasts.slice(0, limit);
  }
}

export const stockDepletionForecaster = new StockDepletionForecaster();
