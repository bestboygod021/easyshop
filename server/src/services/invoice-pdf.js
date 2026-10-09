/**
 * تولید پیش‌نمایش سند چاپی فاکتور رسمی PDF/HTML با استایل راست‌به‌چپ و تایپوگرافی فارسی
 */

export function renderPersianInvoiceHtml(order) {
  const itemsHtml = (order.items || []).map((item, idx) => `
    <tr>
      <td style="text-align: center; border: 1px solid #ddd; padding: 8px;">${idx + 1}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${item.name_fa || item.name}</td>
      <td style="text-align: center; border: 1px solid #ddd; padding: 8px;">${item.qty || item.quantity}</td>
      <td style="text-align: left; border: 1px solid #ddd; padding: 8px;">${(item.unit_price || 0).toLocaleString('fa-IR')} تومان</td>
      <td style="text-align: left; border: 1px solid #ddd; padding: 8px;">${((item.unit_price || 0) * (item.qty || item.quantity || 1)).toLocaleString('fa-IR')} تومان</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>فاکتور رسمی فروش - ${order.order_number || order.code || order.id}</title>
  <style>
    body { font-family: 'Vazirmatn', Tahoma, sans-serif; direction: rtl; padding: 24px; color: #333; line-height: 1.6; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
    .title { font-size: 20px; font-weight: bold; color: #1e3a8a; }
    .details { margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-weight: bold; }
    .summary { margin-top: 24px; float: left; width: 300px; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #e2e8f0; }
    .total-row { font-weight: bold; font-size: 16px; color: #1e40af; border-top: 2px solid #1e40af; margin-top: 8px; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">فروشگاه آنلاین ایزی‌شاپ (EasyShop)</div>
      <div>صورتحساب الکترونیکی کالا و خدمات</div>
    </div>
    <div style="text-align: left;">
      <div>شماره سفارش: <strong>${order.code || order.id}</strong></div>
      <div>تاریخ: <strong>${new Date(order.placed_at || Date.now()).toLocaleDateString('fa-IR')}</strong></div>
    </div>
  </div>

  <div class="details">
    <div><strong>خریدار:</strong> ${order.customer_name || 'مشتری گرامی'} | <strong>شماره تماس:</strong> ${order.phone || '-'}</div>
    <div><strong>نشانی تحویل:</strong> ${order.address_line || 'ثبت شده در سیستم'}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 40px;">ردیف</th>
        <th>شرح کالا یا خدمت</th>
        <th style="width: 60px;">تعداد</th>
        <th style="width: 140px;">مبلغ واحد</th>
        <th style="width: 140px;">مبلغ کل</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-row">
      <span>مجموع اقلام:</span>
      <span>${(order.subtotal || 0).toLocaleString('fa-IR')} تومان</span>
    </div>
    <div class="summary-row">
      <span>تخفیف:</span>
      <span>${(order.discount || 0).toLocaleString('fa-IR')} تومان</span>
    </div>
    <div class="summary-row">
      <span>هزینه ارسال:</span>
      <span>${(order.shipping_cost || 0).toLocaleString('fa-IR')} تومان</span>
    </div>
    <div class="summary-row total-row">
      <span>مبلغ قابل پرداخت:</span>
      <span>${(order.total || 0).toLocaleString('fa-IR')} تومان</span>
    </div>
  </div>
</body>
</html>`;
}
