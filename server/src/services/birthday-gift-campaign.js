import { all, get, nowIso, run, uid } from '../db/index.js';
import { smsOtpService } from './sms-otp.js';

/**
 * کمپین خودکار هدیه و کد تخفیف اختصاصی سالروز تولد مشتری (Birthday Auto-Gift Campaign)
 * شناسایی متولدین روز جاری و صدور کوپن یکبارمصرف شگفت‌انگیز با اعتبار ۷ روزه
 */
export class BirthdayGiftCampaignService {
  /**
   * تخصیص کد تخفیف هدیه تولد به یک کاربر
   */
  async grantBirthdayGiftToUser(userId, discountPct = 20, maxDiscount = 150000) {
    const user = get('SELECT id, full_name, phone, email FROM users WHERE id = ?', userId);
    if (!user) throw new Error('کاربر یافت نشد.');

    const couponCode = `HBD-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const couponId = uid('cpn');
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    // ایجاد کد تخفیف یکبارمصرف اختصاصی در جدول کوپن‌ها
    run(
      `INSERT INTO coupons (
         id, code, type, value, max_discount, starts_at, ends_at,
         usage_limit, is_active, description, created_at
       ) VALUES (?, ?, 'percentage', ?, ?, ?, ?, 1, 1, ?, ?)`,
      couponId,
      couponCode,
      discountPct,
      maxDiscount,
      now,
      expiresAt,
      `کد تخفیف هدیه سالروز تولد کاربر ${user.full_name || user.email}`,
      now,
    );

    // ارسال پیامک شادباش تولد و کد هدیه
    let smsSent = false;
    if (user.phone) {
      const smsText = `${user.full_name || 'کاربر گرامی'} عزیز، زادروزتان خجسته باد! 🎂✨\nهدیه تولد شما از EasyShop: کد تخفیف ${discountPct}٪ تا سقف ${maxDiscount.toLocaleString('fa-IR')} تومان.\nکد شما: ${couponCode}\nمهلت استفاده: ۷ روز\nخرید در: https://easyshop.ir`;
      const res = await smsOtpService.sendSms(user.phone, smsText);
      smsSent = res.sent;
    }

    // ثبت اعلان در پنل کاربری
    run(
      `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      uid('ntf'),
      user.id,
      'تولدت مبارک! 🎂 هدیه اختصاصی برای شما',
      `کد تخفیف ${discountPct}٪ شما: ${couponCode} (معتبر تا ۷ روز آینده)`,
      '/products',
      now,
    );

    return {
      granted: true,
      user_id: user.id,
      user_name: user.full_name,
      coupon_code: couponCode,
      discount_percentage: discountPct,
      max_discount: maxDiscount,
      expires_at: expiresAt,
      sms_sent: smsSent,
    };
  }
}

export const birthdayGiftCampaignService = new BirthdayGiftCampaignService();
