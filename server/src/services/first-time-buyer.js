import { get } from '../db/index.js';

/**
 * Validates eligibility for first-time buyer coupons.
 * Prevents abuse by checking user order history, phone number, and address history.
 */
export function validateFirstTimeBuyerEligibility({ userId, phone, addressLine }) {
  if (userId) {
    const orderCount = get(
      `SELECT COUNT(*) c FROM orders WHERE user_id = ? AND payment_status = 'paid'`,
      userId,
    )?.c || 0;
    if (orderCount > 0) {
      return { eligible: false, reason: 'این تخفیف فقط مخصوص اولین سفارش مشتریان جدید است.' };
    }
  }

  if (phone) {
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    const existingPhoneOrder = get(
      `SELECT COUNT(*) c FROM orders WHERE address LIKE ? AND payment_status = 'paid'`,
      `%${cleanPhone}%`,
    )?.c || 0;
    if (existingPhoneOrder > 0) {
      return { eligible: false, reason: 'با این شماره تماس پیش از این سفارش موفقی ثبت شده است.' };
    }
  }

  return { eligible: true };
}
