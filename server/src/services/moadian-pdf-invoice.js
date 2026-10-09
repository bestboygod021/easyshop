import { moadianTaxService } from './moadian-tax.js';
import { generateInvoiceQrSvg } from './qr-code.js';

/**
 * سرویس تولید قالب HTML/PDF صورتحساب رسمی مالیاتی سامانه مودیان
 * شامل شناسه یکتای ۲۲ رقمی، کیوآر کد استعلام و جدول اقلام مالیاتی
 */
export class MoadianPdfInvoiceGenerator {
  /**
   * تولید سند کامل HTML صورتحساب رسمی مودیان با استایل استاندارد
   */
  generateMoadianInvoiceHtml(order, sellerInfo = {}, buyerInfo = {}) {
    const payload = moadianTaxService.buildMoadianInvoicePayload(order, sellerInfo, buyerInfo);
    
    // لینک استعلام مالیاتی با کد ۲۲ رقمی مودیان
    const verifyUrl = `https://moadian.tax.gov.ir/inquiry?tax_id=${encodeURIComponent(payload.tax_id)}`;
    const qrSvg = generateInvoiceQrSvg({
      orderId: order.id,
      code: order.code || payload.tax_id,
      amount: payload.totals.grand_total,
      placedAt: payload.issue_date,
    });

    const formatNum = (n) => Number(n || 0).toLocaleString('fa-IR');

    const itemsRowsHtml = payload.items.map((it) => `
      <tr style="border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 11px;">
        <td style="padding: 8px 4px;">${it.item_seq}</td>
        <td style="padding: 8px 4px; font-family: monospace; font-size: 10px;">${it.item_id}</td>
        <td style="padding: 8px 6px; text-align: right; font-weight: bold;">${it.item_title}</td>
        <td style="padding: 8px 4px;">${formatNum(it.quantity)}</td>
        <td style="padding: 8px 4px;">${formatNum(it.unit_price)}</td>
        <td style="padding: 8px 4px;">${formatNum(it.discount_amount)}</td>
        <td style="padding: 8px 4px;">${formatNum(it.net_amount)}</td>
        <td style="padding: 8px 4px;">${formatNum(it.vat_amount)} (${it.vat_rate * 100}٪)</td>
        <td style="padding: 8px 6px; font-weight: bold; color: #1e293b;">${formatNum(it.final_item_total)}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>صورتحساب الکترونیکی سامانه مودیان - ${payload.tax_id}</title>
  <style>
    body {
      font-family: 'Vazirmatn', Tahoma, sans-serif;
      margin: 0;
      padding: 24px;
      background: #ffffff;
      color: #0f172a;
      direction: rtl;
    }
    .invoice-card {
      max-width: 820px;
      margin: 0 auto;
      border: 2px solid #0f172a;
      padding: 20px;
      border-radius: 8px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
    }
    .tax-id-box {
      background: #f8fafc;
      border: 1px dashed #64748b;
      padding: 8px 12px;
      text-align: center;
      margin: 12px 0;
      font-family: monospace;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 2px;
    }
    .grid-party {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }
    .party-box {
      flex: 1;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 11px;
      line-height: 1.8;
      background: #fafafa;
    }
    .party-title {
      font-weight: bold;
      font-size: 12px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 6px;
      color: #334155;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    table.items-table th {
      background: #f1f5f9;
      border-top: 1px solid #cbd5e1;
      border-bottom: 2px solid #0f172a;
      padding: 8px 4px;
      font-size: 10.5px;
      font-weight: 700;
    }
    .totals-box {
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 2px solid #0f172a;
      padding-top: 12px;
    }
    .grand-total {
      font-size: 15px;
      font-weight: 900;
      color: #047857;
    }
    .qr-container svg {
      width: 90px;
      height: 90px;
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <table class="header-table">
      <tr>
        <td style="width: 25%; vertical-align: top;">
          <div class="qr-container">${qrSvg}</div>
          <div style="font-size: 9px; color: #64748b; margin-top: 4px;">اسکن جهت اعتبارسنجی آنلاین</div>
          <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 9px;">مشاهده استعلام مالیاتی</a>
        </td>
        <td style="text-align: center; vertical-align: middle;">
          <h2 style="margin: 0; font-size: 17px; font-weight: 900;">صورتحساب الکترونیکی سامانه مودیان</h2>
          <div style="font-size: 12px; color: #475569; margin-top: 4px;">الگوی اول: فروش کالا و خدمات (نوع ۱)</div>
          <div class="tax-id-box">
            شماره منحصر به‌فرد مالیاتی: <span dir="ltr">${payload.tax_id}</span>
          </div>
        </td>
        <td style="width: 25%; text-align: left; vertical-align: top; font-size: 11px; line-height: 1.8;">
          <div><strong>تاریخ صدور:</strong> ${payload.issue_date.split('T')[0]}</div>
          <div><strong>شماره سفارش:</strong> ${order.code || order.id}</div>
          <div><span class="badge">وضعیت: تایید سامانه</span></div>
        </td>
      </tr>
    </table>

    <div class="grid-party">
      <div class="party-box">
        <div class="party-title">مشخصات فروشنده</div>
        <div><strong>نام:</strong> ${payload.seller.name}</div>
        <div><strong>شناسه / کد ملی:</strong> <span dir="ltr">${payload.seller.tin}</span></div>
        <div><strong>کد اقتصادی:</strong> <span dir="ltr">${payload.seller.economic_code}</span></div>
      </div>
      <div class="party-box">
        <div class="party-title">مشخصات خریدار</div>
        <div><strong>نوع خریدار:</strong> ${payload.buyer.type === 'business' ? 'حقوقی / شرکتی' : 'حقیقی / مصرف‌کننده نهایی'}</div>
        <div><strong>کد ملی / شناسه:</strong> <span dir="ltr">${payload.buyer.national_id || 'ثبت نشده'}</span></div>
        <div><strong>شماره تماس:</strong> <span dir="ltr">${payload.buyer.phone || 'ثبت نشده'}</span></div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>ردیف</th>
          <th>شناسه کالا</th>
          <th>شرح کالا یا خدمت</th>
          <th>تعداد</th>
          <th>مبلغ واحد (تومان)</th>
          <th>تخفیف</th>
          <th>مبلغ پس از تخفیف</th>
          <th>مالیات ارزش افزوده</th>
          <th>مبلغ کل نهایی</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRowsHtml}
      </tbody>
    </table>

    <div class="totals-box">
      <div style="font-size: 11px; color: #475569;">
        * این صورتحساب مطابق با مقررات اجرایی ماده (۱۴) مکرر قانون پایانه‌های فروشگاهی و سامانه مودیان صادر شده است.
      </div>
      <div style="text-align: left; font-size: 12px; line-height: 1.8;">
        <div>مجموع ناخالص: <strong>${formatNum(payload.totals.subtotal)} تومان</strong></div>
        <div>مجموع مالیات و عوارض (۱۰٪): <strong>${formatNum(payload.totals.total_vat)} تومان</strong></div>
        <div class="grand-total">مبلغ قابل پرداخت: ${formatNum(payload.totals.grand_total)} تومان</div>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

export const moadianPdfInvoiceGenerator = new MoadianPdfInvoiceGenerator();
