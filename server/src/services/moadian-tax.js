import crypto from 'node:crypto';

/**
 * شبیه‌ساز و تولیدکننده ساختار فاکتور الکترونیکی سامانه مودیان و سازمان امور مالیاتی ایران
 * با تولید شناسه یکتای صورتحساب مالیاتی (Tax Invoice Unique ID)
 */

export class MoadianTaxService {
  constructor(memoryId = 'A1234') {
    this.memoryId = memoryId; // شناسه یکتای حافظه مالیاتی مودی
  }

  /**
   * تولید شماره مالیاتی ۲۲ کاراکتری بر اساس استاندارد سامانه مودیان
   * ساختار: شناسه حافظه (۵ کاراکتر) + تاریخ جولین روز (۵ کاراکتر) + شماره سریال (۱۰ کاراکتر) + رقم کنترلی
   */
  generateTaxId(orderId, orderDate = new Date()) {
    const cleanMemory = (this.memoryId + 'XXXXX').slice(0, 5).toUpperCase();
    const daysSinceEpoch = Math.floor(orderDate.getTime() / (24 * 3600 * 1000));
    const dayHex = daysSinceEpoch.toString(16).padStart(5, '0').toUpperCase();
    const serialHex = crypto.createHash('md5').update(String(orderId)).digest('hex').slice(0, 10).toUpperCase();

    const partialTaxId = `${cleanMemory}${dayHex}${serialHex}`;
    const controlDigit = (partialTaxId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 10).toString();

    return `${partialTaxId}${controlDigit}`;
  }

  /**
   * ساخت صورتحساب استاندارد مالیاتی نوع اول سامانه مودیان
   */
  buildMoadianInvoicePayload(order, sellerInfo = {}, buyerInfo = {}) {
    const taxId = this.generateTaxId(order.id, new Date(order.placed_at || Date.now()));
    const items = (order.items || []).map((item, idx) => {
      const unitPrice = item.unit_price || 0;
      const qty = item.qty || item.quantity || 1;
      const totalAmount = unitPrice * qty;
      const discount = Math.round(totalAmount * ((order.discount || 0) / (order.subtotal || 1)));
      const netAmount = totalAmount - discount;
      const vatRate = 0.10; // ۱۰ درصد نرخ مالیات بر ارزش افزوده
      const vatAmount = Math.round(netAmount * vatRate);

      return {
        item_seq: idx + 1,
        item_id: item.product_id || item.id,
        item_title: item.name_fa || item.name,
        quantity: qty,
        unit_price: unitPrice,
        total_amount: totalAmount,
        discount_amount: discount,
        net_amount: netAmount,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        final_item_total: netAmount + vatAmount,
      };
    });

    const totalNetAmount = items.reduce((sum, it) => sum + it.net_amount, 0);
    const totalVat = items.reduce((sum, it) => sum + it.vat_amount, 0);

    return {
      tax_id: taxId,
      issue_date: new Date(order.placed_at || Date.now()).toISOString(),
      invoice_type: 1, // نوع ۱: فاکتور با اطلاعات کامل خریدار و فروشنده
      invoice_pattern: 1, // الگوی اول: فروش کالا و خدمات
      seller: {
        tin: sellerInfo.tin || '14000000000', // شناسه ملی فروشنده
        economic_code: sellerInfo.economic_code || '411111111111',
        name: sellerInfo.name || 'فروشگاه آنلاین ایزی‌شاپ',
      },
      buyer: {
        type: buyerInfo.type || (buyerInfo.national_id?.length === 10 ? 'individual' : 'business'),
        national_id: buyerInfo.national_id || order.customer_national_id || null,
        phone: buyerInfo.phone || order.phone || null,
      },
      items,
      totals: {
        subtotal: totalNetAmount,
        total_vat: totalVat,
        grand_total: totalNetAmount + totalVat,
      },
    };
  }
}

export const moadianTaxService = new MoadianTaxService();
