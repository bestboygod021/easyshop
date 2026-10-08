import { get, run, nowIso, uid } from '../db/index.js';
import { smsOtpService } from './sms-otp.js';

/**
 * سرویس ارسال پیامک خودکار کد پیگیری مرسوله پستی
 * به محض تغییر وضعیت سفارش به «ارسال شده» (Shipped/Dispatched)
 */
export class ShippingSmsNotifier {
  /**
   * تولید متن استاندارد پیامک اطلاع‌رسانی پستی
   */
  formatShippingSms(order, trackingCode, carrierName = 'پست پیشتاز') {
    const customerName = order.user_name || order.receiver_name || 'مشتری گرامی';
    const orderCode = order.code || order.id;
    return `${customerName} عزیز، سفارش شما (${orderCode}) تحویل ${carrierName} گردید.\nکد رهگیری مرسوله:\n${trackingCode}\nرهگیری در: https://tracking.post.ir\nفروشگاه EasyShop`;
  }

  /**
   * بررسی و ارسال پیامک رهگیری به شماره همراه مشتری
   */
  async notifyOrderShipped({ orderId, trackingCode, carrier = 'پست پیشتاز' }) {
    if (!orderId || !trackingCode) {
      throw new Error('شناسه سفارش و کد رهگیری مرسوله پستی الزامی است.');
    }

    const order = get(
      `SELECT o.id, o.code, o.phone, o.user_id, u.full_name AS user_name, u.phone AS user_phone
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = ?`,
      orderId,
    );

    if (!order) {
      throw new Error('سفارش مورد نظر یافت نشد.');
    }

    const phone = order.phone || order.user_phone;
    if (!phone) {
      return {
        sent: false,
        reason: 'no_phone_number',
        message_fa: 'شماره تلفنی برای این سفارش ثبت نشده است.',
      };
    }

    const smsBody = this.formatShippingSms(order, trackingCode, carrier);
    const notificationId = uid('sntf');
    const now = nowIso();

    // ارسال شبیه‌سازی‌شده یا واقعی از طریق زیرساخت پیامک
    const sendResult = await smsOtpService.sendSms(phone, smsBody);

    // ثبت لاگ پیامک ارسالی
    run(
      `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      notificationId,
      order.user_id || null,
      'سفارش شما ارسال شد 📦',
      `سفارش با کد رهگیری پستی ${trackingCode} ارسال شد.`,
      `/account/orders/${order.id}`,
      now,
    );

    return {
      sent: true,
      notification_id: notificationId,
      phone,
      tracking_code: trackingCode,
      carrier,
      sms_body: smsBody,
      provider_response: sendResult,
      dispatched_at: now,
    };
  }
}

export const shippingSmsNotifier = new ShippingSmsNotifier();
