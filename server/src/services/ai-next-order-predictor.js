/**
 * AI Next-Order Predictive Engine Service (Round 29)
 * Analyzes past customer order histories, purchasing cycle cadence, and recurring intervals.
 * Forecasts the user's next purchase date and suggests reorder recommendations.
 */

export class AiNextOrderPredictiveEngine {
  constructor(db) {
    this.db = db;
  }

  /**
   * Forecast next purchase date and generate personalized reorder basket
   */
  async predictNextOrderForUser(userId) {
    if (!userId) throw new Error('شناسه کاربر الزامی است');

    const orders = await this.db.all(
      `SELECT id, total, created_at FROM orders WHERE user_id = ? AND status IN ('completed', 'delivered', 'paid') ORDER BY created_at ASC`,
      [userId]
    );

    if (orders.length < 2) {
      return {
        user_id: userId,
        has_sufficient_history: false,
        message: 'برای پیش‌بینی دقیق بازه خرید بعدی، حداقل ثبت ۲ سفارش قبلی توسط مشتری الزامی است.'
      };
    }

    // Calculate average days between purchases
    let totalGapDays = 0;
    for (let i = 1; i < orders.length; i++) {
      const prev = new Date(orders[i - 1].created_at).getTime();
      const curr = new Date(orders[i].created_at).getTime();
      totalGapDays += (curr - prev) / (1000 * 60 * 60 * 24);
    }

    const averageCadenceDays = Math.max(Math.round(totalGapDays / (orders.length - 1)), 5);
    const lastOrderDate = new Date(orders[orders.length - 1].created_at);
    const predictedNextDate = new Date(lastOrderDate.getTime() + averageCadenceDays * 24 * 60 * 60 * 1000);

    const now = new Date();
    const daysUntilDue = Math.round((predictedNextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Recommend top frequently purchased products
    const topItems = await this.db.all(
      `SELECT oi.title, oi.product_id, COUNT(*) as purchase_frequency 
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.user_id = ?
       GROUP BY oi.product_id
       ORDER BY purchase_frequency DESC LIMIT 3`,
      [userId]
    );

    return {
      user_id: userId,
      has_sufficient_history: true,
      total_past_orders: orders.length,
      average_order_cycle_days: averageCadenceDays,
      last_order_date: lastOrderDate.toISOString(),
      predicted_next_order_date: predictedNextDate.toISOString(),
      days_until_expected_reorder: daysUntilDue,
      is_due_for_reorder: daysUntilDue <= 3,
      predicted_basket_items: topItems.map(item => ({
        product_id: item.product_id,
        title: item.title,
        confidence_score: Math.min(85 + item.purchase_frequency * 5, 98)
      })),
      ai_recommendation: daysUntilDue <= 3
        ? 'موعد تقریبی سفارش مجدد مشتری فرا رسیده است؛ ارسال پوش یا پیامک یادآوری هوشمند توصیه می‌شود.'
        : `مشتری به طور میانگین هر ${averageCadenceDays} روز خرید ثبت می‌کند.`
    };
  }
}
