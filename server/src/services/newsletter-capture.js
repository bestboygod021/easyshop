import { get, run, nowIso, uid } from '../db/index.js';
import { smsOtpService } from './sms-otp.js';

/**
 * سامانه جذب لید و ثبت‌نام در خبرنامه پیامکی/ایمیلی با هدیه آنی
 * (Newsletter Lead Capture & Welcome Gift Engine)
 */
export class NewsletterCaptureService {
  /**
   * ثبت ایمیل یا موبایل جدید در خبرنامه و تخصیص کد تخفیف اختصاصی اولین خرید
   */
  async subscribeLead({ email = null, phone = null, source = 'modal_popup' }) {
    if (!email && !phone) {
      throw new Error('وارد کردن ایمیل یا شماره موبایل الزامی است.');
    }

    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanPhone = phone ? String(phone).trim() : null;

    // بررسی ثبت تکراری
    if (cleanEmail) {
      const existing = get('SELECT id FROM newsletter_subscribers WHERE email = ?', cleanEmail);
      if (existing) {
        return { already_subscribed: true, message_fa: 'این ایمیل قبلاً در خبرنامه ثبت شده است.' };
      }
    }
    if (cleanPhone) {
      const existing = get('SELECT id FROM newsletter_subscribers WHERE phone = ?', cleanPhone);
      if (existing) {
        return { already_subscribed: true, message_fa: 'این شماره تماس قبلاً در خبرنامه ثبت شده است.' };
      }
    }

    const subscriberId = uid('nsub');
    const welcomeCoupon = `WELCOME-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

    // ساخت کد تخفیف ۱۵٪ اولین خرید
    run(
      `INSERT INTO coupons (
         id, code, type, value, max_discount, starts_at, ends_at,
         usage_limit, is_active, description, created_at
       ) VALUES (?, ?, 'percent', 15, 100000, ?, ?, 1, 1, ?, ?)`,
      uid('cpn'),
      welcomeCoupon,
      now,
      expiresAt,
      `کد تخفیف ۱۵٪ اولین خرید عضویت در خبرنامه (${cleanEmail || cleanPhone})`,
      now,
    );

    // ثبت در جدول مشترکین خبرنامه
    run(
      `INSERT INTO newsletter_subscribers (
         id, email, phone, welcome_coupon, source, is_active, created_at
       ) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      subscriberId,
      cleanEmail,
      cleanPhone,
      welcomeCoupon,
      source,
      now,
    );

    // ارسال پیامک کد هدیه در صورت درج شماره تلفن
    let smsSent = false;
    if (cleanPhone) {
      const smsText = `به خانواده EasyShop خوش آمدید! 🎉\nکد تخفیف ۱۵٪ اولین خرید شما:\n${welcomeCoupon}\nاعتبار: ۱۴ روز\nخرید آنلاین: https://easyshop.ir`;
      const res = await smsOtpService.sendSms(cleanPhone, smsText);
      smsSent = res.sent;
    }

    return {
      success: true,
      subscriber_id: subscriberId,
      welcome_coupon: welcomeCoupon,
      discount_percentage: 15,
      max_discount: 100000,
      sms_sent: smsSent,
      message_fa: 'عضویت شما با موفقیت ثبت شد و کد هدیه اولین خرید صادر گردید.',
    };
  }
}

export const newsletterCaptureService = new NewsletterCaptureService();
