import { all } from '../db/index.js';

/**
 * سرویس گزارش‌گیری دوره‌ای فروش و صدور فایل CSV/اکسل
 */
export class SalesExportService {
  /**
   * گزارش تجمیعی سفارش‌ها برای بازه زمانی مشخص
   */
  getSalesReport({ startDate = null, endDate = null, status = 'paid' } = {}) {
    let query = `
      SELECT o.id, o.code, o.total, o.subtotal, o.discount, o.shipping_cost,
             o.payment_status, o.placed_at, o.shipping_method,
             u.full_name as customer_name, u.phone as customer_phone
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND o.payment_status = ?`;
      params.push(status);
    }

    if (startDate) {
      query += ` AND o.placed_at >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND o.placed_at <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY o.placed_at DESC`;

    const orders = all(query, ...params);

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalDiscounts = orders.reduce((sum, o) => sum + (o.discount || 0), 0);

    return {
      order_count: orders.length,
      total_revenue: totalRevenue,
      total_discounts: totalDiscounts,
      average_order_value: orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0,
      orders
    };
  }

  /**
   * تولید فایل استاندارد CSV با هدرهای استاندارد فارسی برای حسابداری
   */
  exportToCsv(reportData) {
    const headers = [
      'شناسه سفارش',
      'کد پیگیری',
      'نام خریدار',
      'شماره تماس',
      'مبلغ کل (تومان)',
      'تخفیف',
      'هزینه ارسال',
      'وضعیت پرداخت',
      'روش پرداخت',
      'تاریخ ثبت'
    ];

    const rows = (reportData.orders || []).map(o => [
      `"${o.id}"`,
      `"${o.code || ''}"`,
      `"${o.customer_name || 'کاربر مهمان'}"`,
      `"${o.customer_phone || ''}"`,
      o.total || 0,
      o.discount || 0,
      o.shipping_cost || 0,
      `"${o.payment_status}"`,
      `"${o.shipping_method || ''}"`,
      `"${o.placed_at || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    return csvContent;
  }
}

export const salesExportService = new SalesExportService();
