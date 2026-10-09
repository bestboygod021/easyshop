import { get, run } from '../db/index.js';

/**
 * سرویس مدیریت و استعلام گارانتی محصولات و شماره سریال کالاها (Warranty Tracking)
 */

export class WarrantyService {
  /**
   * ثبت گارانتی برای کالای فروخته شده
   */
  registerWarranty({ serialNumber, productId, orderId, userId, customerName, phone, durationMonths = 18 }) {
    const cleanSerial = String(serialNumber || '').trim().toUpperCase();
    if (!cleanSerial) throw new Error('شماره سریال کالا الزامی است.');

    const id = `war_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMonths * 30 * 24 * 3600 * 1000).toISOString();

    run(
      `INSERT INTO product_warranties (
         id, serial_number, product_id, order_id, user_id, customer_name,
         phone, duration_months, status, starts_at, expires_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      id,
      cleanSerial,
      productId || null,
      orderId || null,
      userId || null,
      customerName,
      phone,
      durationMonths,
      now.toISOString(),
      expiresAt,
      now.toISOString()
    );

    return {
      id,
      serialNumber: cleanSerial,
      durationMonths,
      expiresAt,
      status: 'active',
    };
  }

  /**
   * استعلام وضعیت و اعتبار گارانتی با شماره سریال
   */
  checkWarranty(serialNumber) {
    const cleanSerial = String(serialNumber || '').trim().toUpperCase();
    const record = get(`SELECT * FROM product_warranties WHERE serial_number = ?`, cleanSerial);
    if (!record) {
      return { found: false, message: 'کارت گارانتی با این شماره سریال در سیستم یافت نشد.' };
    }

    const isExpired = new Date() > new Date(record.expires_at);
    return {
      found: true,
      serial_number: record.serial_number,
      customer_name: record.customer_name,
      status: isExpired ? 'expired' : record.status,
      status_fa: isExpired ? 'منقضی شده' : 'فعال و تحت پوشش ضمانت',
      starts_at: record.starts_at,
      expires_at: record.expires_at,
      is_valid: !isExpired && record.status === 'active',
    };
  }
}

export const warrantyService = new WarrantyService();
