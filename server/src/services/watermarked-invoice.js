import { get, all } from '../db/index.js';

/**
 * سرویس صدور پیش‌فاکتور رسمی با واترمارک دیجیتال وضعیت پرداخت
 */
export class WatermarkedInvoiceService {
  /**
   * تولید سند رسمی با واترمارک و اطلاعات استاندارد فاکتور
   */
  generateWatermarkedInvoice(orderId) {
    const order = get(
      `SELECT o.*, u.full_name as customer_name, u.phone as customer_phone, u.national_id as customer_national_id
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`,
      orderId
    );

    if (!order) return null;

    const items = all(
      `SELECT oi.*, p.name_fa
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      orderId
    );

    const isPaid = order.payment_status === 'paid';
    const watermarkText = isPaid ? 'پرداخت شده (تسویه کامل)' : 'پیش‌فاکتور (پرداخت‌نشده)';
    const watermarkColor = isPaid ? '#16a34a' : '#dc2626';

    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>صورت‌حساب رسمی: ${order.code || order.id}</title>
  <style>
    body { font-family: Tahoma, sans-serif; margin: 40px; color: #1e293b; position: relative; }
    .watermark {
      position: absolute; top: 35%; left: 15%; right: 15%;
      font-size: 55px; font-weight: bold; color: ${watermarkColor};
      opacity: 0.12; transform: rotate(-25deg); text-align: center;
      pointer-events: none; z-index: 10; border: 8px solid ${watermarkColor};
      padding: 20px; border-radius: 12px;
    }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
    .table { width: 100%; border-collapse: collapse; margin-top: 25px; }
    .table th, .table td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; font-size: 13px; }
    .table th { background: #f1f5f9; }
    .totals { margin-top: 20px; width: 45%; margin-right: auto; }
    .totals td { padding: 6px 12px; border: none; font-size: 14px; }
  </style>
</head>
<body>
  <div class="watermark">${watermarkText}</div>
  <div class="header">
    <h2>فروشگاه زنجیره‌ای ایزی‌شاپ</h2>
    <div><strong>شماره سفارش:</strong> ${order.code || order.id}</div>
  </div>
  <div style="margin-top: 15px;">
    <strong>خریدار:</strong> ${order.customer_name || 'مشتری آزاد'} | 
    <strong>تلفن:</strong> ${order.customer_phone || '-'} | 
    <strong>کد ملی:</strong> ${order.customer_national_id || '-'}
  </div>
  <table class="table">
    <thead>
      <tr><th>ردیف</th><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد (تومان)</th><th>مبلغ کل</th></tr>
    </thead>
    <tbody>
      ${items.map((it, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${it.name_fa}</td>
          <td>${it.qty}</td>
          <td>${(it.unit_price || 0).toLocaleString('fa-IR')}</td>
          <td>${((it.unit_price || 0) * it.qty).toLocaleString('fa-IR')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <table class="totals">
    <tr><td><strong>جمع کل:</strong></td><td>${(order.subtotal || order.total || 0).toLocaleString('fa-IR')} تومان</td></tr>
    <tr><td><strong>تخفیف:</strong></td><td>${(order.discount || 0).toLocaleString('fa-IR')} تومان</td></tr>
    <tr><td><strong>مبلغ نهایی:</strong></td><td><strong>${(order.total || 0).toLocaleString('fa-IR')} تومان</strong></td></tr>
  </table>
</body>
</html>`;

    return {
      order_id: order.id,
      code: order.code,
      is_paid: isPaid,
      watermark: watermarkText,
      html_content: html,
      generated_at: new Date().toISOString()
    };
  }
}

export const watermarkedInvoiceService = new WatermarkedInvoiceService();
