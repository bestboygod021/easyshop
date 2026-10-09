import { all, get, nowIso } from '../db/index.js';

/**
 * سرویس امتیازدهی، نرخ تامین کالا و محاسبه جریمه تاخیر تامین‌کنندگان/فروشندگان
 * (Supplier Fulfillment Rate & SLA Scoring with Penalty Engine)
 */
export class SupplierSlaScoringService {
  /**
   * محاسبه شاخص‌های عملکردی فروشنده شامل:
   * - نرخ تامین و ارسال به موقع (On-Time Fulfillment Rate)
   * - میانگین تاخیر ارسال (روز)
   * - جریمه تاخیرها بر اساس درصد ارزش سفارش
   * - امتیاز کل تامین‌کننده (SLA Score از ۱۰۰)
   */
  calculateSupplierScore(vendorId) {
    const vendor = get("SELECT id, full_name, email, role FROM users WHERE id = ? AND role = 'seller'", vendorId);
    if (!vendor) {
      throw new Error('فروشنده معتبر یافت نشد.');
    }

    // سفارش‌های مربوط به کالاهای این فروشنده
    const items = all(
      `SELECT oi.id, oi.order_id, oi.product_id, oi.qty, oi.total,
              o.placed_at, o.delivered_at, o.status AS order_status,
              p.shipping_days
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE p.created_by = ? AND o.payment_status = 'paid'`,
      vendorId,
    );

    const totalOrders = items.length;
    if (totalOrders === 0) {
      return {
        vendor_id: vendorId,
        vendor_name: vendor.full_name,
        total_orders: 0,
        fulfillment_rate_pct: 100,
        on_time_rate_pct: 100,
        average_delay_days: 0,
        sla_score: 100,
        tier: 'A+',
        penalties_total: 0,
        delayed_orders_count: 0,
      };
    }

    let delayedCount = 0;
    let totalDelayDays = 0;
    let totalPenaltyAmount = 0;
    const penaltyRatePerDay = 0.02; // ۲ درصد جریمه روزانه ارزش کالا به ازای هر روز تاخیر

    for (const item of items) {
      const promisedDays = item.shipping_days || 3;
      if (item.delivered_at) {
        const placed = new Date(item.placed_at).getTime();
        const delivered = new Date(item.delivered_at).getTime();
        const actualDays = Math.ceil((delivered - placed) / (24 * 3600 * 1000));

        if (actualDays > promisedDays) {
          const delayDays = actualDays - promisedDays;
          delayedCount++;
          totalDelayDays += delayDays;
          // محاسبه جریمه تاخیر
          const penalty = Math.round(item.total * penaltyRatePerDay * delayDays);
          totalPenaltyAmount += penalty;
        }
      }
    }

    const onTimeCount = totalOrders - delayedCount;
    const onTimeRatePct = Math.round((onTimeCount / totalOrders) * 100);
    const avgDelayDays = delayedCount > 0 ? Number((totalDelayDays / delayedCount).toFixed(1)) : 0;

    // فرمول امتیاز SLA: پایه ۱۰۰ منهای کسورات تاخیر
    let slaScore = Math.max(10, Math.min(100, Math.round(onTimeRatePct - (avgDelayDays * 5))));

    let tier = 'C';
    if (slaScore >= 90) tier = 'A+';
    else if (slaScore >= 80) tier = 'A';
    else if (slaScore >= 65) tier = 'B';

    return {
      vendor_id: vendorId,
      vendor_name: vendor.full_name,
      total_orders: totalOrders,
      delayed_orders_count: delayedCount,
      on_time_orders_count: onTimeCount,
      fulfillment_rate_pct: onTimeRatePct,
      average_delay_days: avgDelayDays,
      sla_score: slaScore,
      tier,
      penalties_total: totalPenaltyAmount,
      calculated_at: nowIso(),
    };
  }

  /**
   * گزارش مقایسه‌ای کلیه فروشندگان برای پنل مدیریت
   */
  getAllSuppliersScoreboard() {
    const vendors = all("SELECT id, full_name, email FROM users WHERE role = 'seller'");
    return vendors.map((v) => this.calculateSupplierScore(v.id));
  }
}

export const supplierSlaScoringService = new SupplierSlaScoringService();
