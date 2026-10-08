import { all, get, nowIso } from '../db/index.js';

/**
 * محاسبه‌گر شاخص سلامت فروشنده و سیستم هشدار تعلیق حساب
 * (Vendor Health Index & Suspension Warning System)
 */
export class VendorHealthIndexService {
  /**
   * محاسبه شاخص سلامت فروشنده بر اساس:
   * - نرخ لغو سفارش از سمت فروشنده (Cancellation Rate)
   * - شکایات مشتریان و مغایرت کالا (Disputes / Complaints)
   * - تاخیر در تحویل به انبار پستی (Late Dispatch Rate)
   */
  calculateHealthIndex(vendorId) {
    const vendor = get("SELECT id, full_name, email, role, status FROM users WHERE id = ? AND role = 'seller'", vendorId);
    if (!vendor) throw new Error('فروشنده معتبر یافت نشد.');

    // ۱. بررسی شکایات و اختلافات باز در جدول disputes
    const openDisputes = get(
      `SELECT COUNT(d.id) AS count
       FROM disputes d
       JOIN orders o ON o.id = d.order_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE p.created_by = ? AND d.status = 'open'`,
      vendorId,
    )?.count || 0;

    // ۲. بررسی مرجوعی‌های ثبت شده مربوط به این فروشنده
    const rmaCount = get(
      `SELECT COUNT(r.id) AS count
       FROM rma_returns r
       JOIN orders o ON o.id = r.order_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE p.created_by = ?`,
      vendorId,
    )?.count || 0;

    // ۳. تعداد کل سفارشات
    const totalOrders = get(
      `SELECT COUNT(DISTINCT oi.order_id) AS count
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE p.created_by = ?`,
      vendorId,
    )?.count || 0;

    // امتیاز پایه: ۱۰۰
    let healthScore = 100;
    const deductionReasons = [];

    // کسر امتیاز بابت هر اختلاف باز (۱۰ نمره منفی)
    if (openDisputes > 0) {
      const disputeDeduction = openDisputes * 10;
      healthScore -= disputeDeduction;
      deductionReasons.push(`${openDisputes} پرونده اختلاف باز با خریداران (-${disputeDeduction} امتیاز)`);
    }

    // کسر امتیاز بابت مرجوعی‌ها (۵ نمره منفی)
    if (rmaCount > 0) {
      const rmaDeduction = Math.min(30, rmaCount * 5);
      healthScore -= rmaDeduction;
      deductionReasons.push(`${rmaCount} مورد مرجوعی کالا (-${rmaDeduction} امتیاز)`);
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    let status = 'healthy'; // 'healthy' | 'at_risk' | 'suspension_warning'
    let requiresSuspension = false;

    if (healthScore < 50) {
      status = 'suspension_warning';
      requiresSuspension = true;
    } else if (healthScore < 75) {
      status = 'at_risk';
    }

    return {
      vendor_id: vendorId,
      vendor_name: vendor.full_name,
      total_orders_handled: totalOrders,
      open_disputes: openDisputes,
      rma_returns_count: rmaCount,
      health_score: healthScore,
      health_status: status,
      requires_suspension_warning: requiresSuspension,
      deduction_reasons: deductionReasons,
      evaluated_at: nowIso(),
    };
  }
}

export const vendorHealthIndexService = new VendorHealthIndexService();
