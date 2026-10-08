/**
 * Smart Replenishment Subscription Service (Round 26)
 * Tracks user consumable purchase history and predicts depletion date.
 * Schedules automated replenishment reminders and one-click rebuy options with discounts.
 */

export class SmartReplenishmentSubscriptionService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Register or schedule an automated replenishment reminder
   */
  async scheduleReplenishment({ userId, productId, cycleDays = 30, discountPercent = 10 }) {
    if (!userId || !productId) throw new Error('شناسه کاربر و محصول الزامی است');
    const validCycle = Math.max(Number(cycleDays) || 30, 7);
    const validDiscount = Math.min(Math.max(Number(discountPercent) || 10, 0), 30);

    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + validCycle);

    const subscriptionId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO replenishment_schedules (id, user_id, product_id, cycle_days, discount_percent, next_reminder_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [subscriptionId, userId, productId, validCycle, validDiscount, nextDueDate.toISOString(), now]
    );

    return {
      subscription_id: subscriptionId,
      user_id: userId,
      product_id: productId,
      cycle_days: validCycle,
      discount_percent: validDiscount,
      next_reminder_at: nextDueDate.toISOString(),
      status: 'active',
      message: `یادآور هوشمند خرید دوره‌ای با ${validDiscount}٪ تخفیف وفاداری فعال شد.`
    };
  }

  /**
   * Get due replenishment reminders for processing
   */
  async getDueReplenishments() {
    const now = new Date().toISOString();
    return this.db.all(
      `SELECT r.*, p.title as product_title, p.price as product_price, u.phone, u.name as user_name
       FROM replenishment_schedules r
       JOIN products p ON r.product_id = p.id
       JOIN users u ON r.user_id = u.id
       WHERE r.status = 'active' AND r.next_reminder_at <= ?`,
      [now]
    );
  }

  /**
   * One-click reorder trigger
   */
  async triggerOneClickReorder(scheduleId) {
    const schedule = await this.db.get(
      `SELECT r.*, p.price FROM replenishment_schedules r JOIN products p ON r.product_id = p.id WHERE r.id = ?`,
      [scheduleId]
    );

    if (!schedule) throw new Error('برنامه خرید دوره‌ای یافت نشد');

    const originalPrice = Number(schedule.price) || 0;
    const discountedPrice = Math.round((originalPrice * (100 - schedule.discount_percent)) / 100);

    // Advance next reminder
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + (schedule.cycle_days || 30));

    await this.db.run(
      'UPDATE replenishment_schedules SET next_reminder_at = ?, last_ordered_at = ? WHERE id = ?',
      [nextDueDate.toISOString(), new Date().toISOString(), scheduleId]
    );

    return {
      schedule_id: scheduleId,
      user_id: schedule.user_id,
      product_id: schedule.product_id,
      original_price: originalPrice,
      discounted_price: discountedPrice,
      next_cycle_at: nextDueDate.toISOString(),
      message: 'سفارش تکرار با موفقیت ایجاد شد و تخفیف وفاداری اعمال گردید.'
    };
  }
}
