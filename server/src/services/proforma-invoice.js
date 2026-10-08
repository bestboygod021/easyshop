import { all, get, run } from '../db/index.js';

/**
 * سرویس صدور پیش‌فاکتور (Proforma Invoice) و تبدیل آن به سفارش قطعی
 */

export class ProformaInvoiceService {
  /**
   * ایجاد پیش‌فاکتور رسمی با اعتبار زمانی
   */
  createProforma({ userId, customerName, companyName, economicCode, nationalId, phone, address, items, validDays = 7 }) {
    const id = `pro_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const proformaNumber = `PRF-${Date.now().toString().slice(-6)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + validDays * 24 * 3600 * 1000).toISOString();

    let subtotal = 0;
    for (const item of items) {
      subtotal += (item.unit_price * item.quantity);
    }
    const tax = Math.round(subtotal * 0.10); // ۱۰ درصد مالیات بر ارزش افزوده قانونی
    const total = subtotal + tax;

    run(
      `INSERT INTO proforma_invoices (
         id, proforma_number, user_id, customer_name, company_name, economic_code, national_id,
         phone, address, subtotal, tax, total, status, items_json, expires_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      id,
      proformaNumber,
      userId || null,
      customerName,
      companyName || null,
      economicCode || null,
      nationalId || null,
      phone,
      address,
      subtotal,
      tax,
      total,
      JSON.stringify(items),
      expiresAt,
      now.toISOString()
    );

    return {
      id,
      proformaNumber,
      subtotal,
      tax,
      total,
      expiresAt,
      status: 'draft',
    };
  }

  /**
   * دریافت جزئیات پیش‌فاکتور
   */
  getProforma(id) {
    const record = get(`SELECT * FROM proforma_invoices WHERE id = ?`, id);
    if (!record) return null;
    return {
      ...record,
      items: JSON.parse(record.items_json || '[]'),
      is_expired: new Date() > new Date(record.expires_at),
    };
  }

  /**
   * تبدیل پیش‌فاکتور به سفارش قطعی
   */
  convertToOrder(id) {
    const proforma = this.getProforma(id);
    if (!proforma) throw new Error('پیش‌فاکتور یافت نشد.');
    if (proforma.is_expired) throw new Error('مهلت زمانی این پیش‌فاکتور منقضی شده است.');
    if (proforma.status === 'converted') throw new Error('این پیش‌فاکتور قبلاً به سفارش تبدیل شده است.');

    run(`UPDATE proforma_invoices SET status = 'converted', converted_at = ? WHERE id = ?`, new Date().toISOString(), id);
    return {
      success: true,
      message: 'پیش‌فاکتور با موفقیت تایید و آماده نهایی‌سازی سفارش شد.',
      proforma_id: id,
    };
  }
}

export const proformaInvoiceService = new ProformaInvoiceService();
