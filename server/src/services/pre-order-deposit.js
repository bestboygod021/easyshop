/**
 * Pre-Order & Partial Deposit Engine (Round 25)
 * Allows customers to reserve out-of-stock or upcoming items with a partial deposit (e.g. 20%).
 * Records pre-order allocation, estimated delivery date, and balance due.
 */

export class PreOrderDepositService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Set up or update pre-order settings for a product
   */
  async configureProductPreOrder(productId, { isEnabled, depositPercentage = 20, estimatedArrivalDays = 14, quotaLimit = 100 }) {
    if (!productId) throw new Error('Product ID is required');
    const enabled = isEnabled ? 1 : 0;
    const pct = Math.min(Math.max(Number(depositPercentage) || 20, 5), 90);
    const days = Math.max(Number(estimatedArrivalDays) || 14, 1);
    const quota = Math.max(Number(quotaLimit) || 50, 1);

    const now = new Date().toISOString();

    const existing = await this.db.get('SELECT * FROM pre_order_configs WHERE product_id = ?', [productId]);
    if (existing) {
      await this.db.run(
        `UPDATE pre_order_configs 
         SET is_enabled = ?, deposit_percentage = ?, estimated_arrival_days = ?, quota_limit = ?, updated_at = ?
         WHERE product_id = ?`,
        [enabled, pct, days, quota, now, productId]
      );
    } else {
      await this.db.run(
        `INSERT INTO pre_order_configs (id, product_id, is_enabled, deposit_percentage, estimated_arrival_days, quota_limit, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`poc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, productId, enabled, pct, days, quota, now, now]
      );
    }

    return {
      product_id: productId,
      is_enabled: Boolean(enabled),
      deposit_percentage: pct,
      estimated_arrival_days: days,
      quota_limit: quota
    };
  }

  /**
   * Create a pre-order reservation with partial deposit
   */
  async createPreOrderReservation({ userId, productId, quantity = 1, unitPrice }) {
    if (!userId || !productId) throw new Error('User ID and Product ID are required');
    const qty = Math.max(Number(quantity) || 1, 1);

    const config = await this.db.get('SELECT * FROM pre_order_configs WHERE product_id = ? AND is_enabled = 1', [productId]);
    if (!config) {
      throw new Error('این کالا در حال حاضر امکان پیش‌خرید با بیعانه را ندارد');
    }

    // Check quota
    const activeCountRow = await this.db.get(
      'SELECT COALESCE(SUM(quantity), 0) as reserved FROM pre_orders WHERE product_id = ? AND status IN (?, ?)',
      [productId, 'pending_deposit', 'deposit_paid']
    );
    const reserved = Number(activeCountRow?.reserved || 0);
    if (reserved + qty > config.quota_limit) {
      throw new Error(`سقف ظرفیت پیش‌خرید برای این کالا تکمیل شده است (باقی‌مانده: ${Math.max(0, config.quota_limit - reserved)})`);
    }

    const price = Number(unitPrice) || 0;
    const totalAmount = price * qty;
    const depositAmount = Math.round((totalAmount * config.deposit_percentage) / 100);
    const remainingBalance = totalAmount - depositAmount;

    const arrivalDate = new Date();
    arrivalDate.setDate(arrivalDate.getDate() + (config.estimated_arrival_days || 14));

    const preOrderId = `pre_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO pre_orders (id, user_id, product_id, quantity, unit_price, total_amount, deposit_amount, remaining_balance, status, estimated_arrival_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [preOrderId, userId, productId, qty, price, totalAmount, depositAmount, remainingBalance, 'deposit_paid', arrivalDate.toISOString(), now]
    );

    return {
      pre_order_id: preOrderId,
      user_id: userId,
      product_id: productId,
      quantity: qty,
      total_amount: totalAmount,
      deposit_amount: depositAmount,
      remaining_balance: remainingBalance,
      status: 'deposit_paid',
      estimated_arrival_at: arrivalDate.toISOString(),
      message: `پیش‌خرید با پرداخت بیعانه ${config.deposit_percentage}٪ با موفقیت ثبت شد.`
    };
  }

  /**
   * Get user's active pre-orders
   */
  async getUserPreOrders(userId) {
    if (!userId) return [];
    return this.db.all('SELECT * FROM pre_orders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }
}
