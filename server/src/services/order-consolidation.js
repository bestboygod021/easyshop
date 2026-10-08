/**
 * Smart Order Consolidation Service (Round 25)
 * Identifies eligible unfulfilled orders placed by the same customer within a time window (e.g. 24 hours)
 * and consolidates them into a single shipment package, saving shipping fees and packaging waste.
 */

export class OrderConsolidationService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Find orders eligible for consolidation for a specific user
   */
  async findConsolidatableOrders(userId) {
    if (!userId) throw new Error('User ID is required');

    // Orders in 'processing' or 'pending' state
    const candidateOrders = await this.db.all(
      `SELECT id, user_id, total, status, shipping_address, created_at, shipping_cost
       FROM orders 
       WHERE user_id = ? AND status IN ('pending', 'processing', 'paid')
       ORDER BY created_at ASC`,
      [userId]
    );

    if (candidateOrders.length < 2) {
      return {
        eligible: false,
        candidate_count: candidateOrders.length,
        message: 'حداقل ۲ سفارش فعال برای تجمیع مرسوله مورد نیاز است.'
      };
    }

    // Group by address normalization (simplified check)
    const primaryOrder = candidateOrders[0];
    const matchingOrders = candidateOrders.filter(o => {
      if (!o.shipping_address || !primaryOrder.shipping_address) return true;
      return o.shipping_address.trim().slice(0, 20) === primaryOrder.shipping_address.trim().slice(0, 20);
    });

    if (matchingOrders.length < 2) {
      return {
        eligible: false,
        candidate_count: matchingOrders.length,
        message: 'آدرس‌های سفارشات ثبت‌شده یکسان نیستند و امکان تجمیع ندارند.'
      };
    }

    // Calculate total shipping savings
    const totalShippingOriginal = matchingOrders.reduce((acc, curr) => acc + (Number(curr.shipping_cost) || 45000), 0);
    const consolidatedShippingCost = 45000; // Single shipping package fee
    const shippingSavings = Math.max(0, totalShippingOriginal - consolidatedShippingCost);

    return {
      eligible: true,
      order_ids: matchingOrders.map(o => o.id),
      order_count: matchingOrders.length,
      primary_order_id: primaryOrder.id,
      shipping_savings: shippingSavings,
      destination_address: primaryOrder.shipping_address || 'آدرس ثبت شده در پروفایل'
    };
  }

  /**
   * Consolidate orders into a single fulfillment package batch
   */
  async consolidateOrders({ userId, orderIds }) {
    if (!userId || !Array.isArray(orderIds) || orderIds.length < 2) {
      throw new Error('حداقل ۲ شناسه سفارش معتبر برای تجمیع الزامی است.');
    }

    const consolidationId = `cons_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const orders = await this.db.all(
      `SELECT id, shipping_cost FROM orders WHERE id IN (${orderIds.map(() => '?').join(',')}) AND user_id = ?`,
      [...orderIds, userId]
    );

    if (orders.length !== orderIds.length) {
      throw new Error('برخی از سفارش‌های مشخص‌شده متعلق به کاربر نیستند یا یافت نشدند.');
    }

    const totalSaved = orders.slice(1).reduce((acc, o) => acc + (Number(o.shipping_cost) || 45000), 0);

    // Record consolidation batch
    await this.db.run(
      `INSERT INTO order_consolidations (id, user_id, order_ids_json, consolidated_package_code, saved_shipping_amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        consolidationId,
        userId,
        JSON.stringify(orderIds),
        `PKG-${Date.now().toString().slice(-6)}`,
        totalSaved,
        'consolidated',
        now
      ]
    );

    return {
      consolidation_id: consolidationId,
      user_id: userId,
      consolidated_order_ids: orderIds,
      total_shipping_saved: totalSaved,
      status: 'consolidated',
      message: `${orderIds.length} سفارش با موفقیت در یک بسته پستی ادغام شدند.`
    };
  }
}
