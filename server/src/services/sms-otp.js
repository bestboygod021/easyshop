import crypto from 'node:crypto';
import { get, run } from '../db/index.js';

/**
 * مدیریت احراز هویت دو مرحله‌ای و بازیابی حساب با پیامک رمز یکبار مصرف (SMS OTP)
 */

export class SmsOtpService {
  constructor(options = {}) {
    this.otpTtlSeconds = options.otpTtlSeconds || 120; // ۲ دقیقه اعتبار
    this.maxAttempts = options.maxAttempts || 3;       // حداکثر ۳ بار تلاش برای حدس کد
  }

  /**
   * تولید و ثبت کد تایید پیامکی
   * @param {string} phone شماره موبایل کاربر
   * @param {string} purpose نوع عملیات (login, password_reset, 2fa)
   */
  generateOtp(phone, purpose = '2fa') {
    const code = crypto.randomInt(100000, 999999).toString();
    const id = `otp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const expiresAt = new Date(Date.now() + this.otpTtlSeconds * 1000).toISOString();

    // غیرفعال کردن کدهای قبلی این شماره برای این منظور
    run(
      `UPDATE sms_otps SET is_used = 1 WHERE phone = ? AND purpose = ? AND is_used = 0`,
      phone,
      purpose
    );

    // ثبت کد جدید
    run(
      `INSERT INTO sms_otps (id, phone, code, purpose, attempts, is_used, expires_at, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      id,
      phone,
      code,
      purpose,
      expiresAt,
      new Date().toISOString()
    );

    return {
      id,
      phone,
      code, // در محیط واقعی فقط به پنل SMS ارسال می‌شود
      expiresAt,
      ttlSeconds: this.otpTtlSeconds,
    };
  }

  /**
   * اعتبارسنجی کد پیامکی وارد شده
   * @param {string} phone شماره تماس
   * @param {string} code کد ارسالی کاربر
   * @param {string} purpose نوع عملیات
   */
  verifyOtp(phone, code, purpose = '2fa') {
    const record = get(
      `SELECT * FROM sms_otps 
       WHERE phone = ? AND purpose = ? AND is_used = 0 
       ORDER BY created_at DESC LIMIT 1`,
      phone,
      purpose
    );

    if (!record) {
      return { success: false, reason: 'کد تایید یافت نشد یا منقضی شده است.' };
    }

    if (new Date() > new Date(record.expires_at)) {
      run(`UPDATE sms_otps SET is_used = 1 WHERE id = ?`, record.id);
      return { success: false, reason: 'کد تایید منقضی شده است. لطفاً مجدداً درخواست دهید.' };
    }

    if (record.attempts >= this.maxAttempts) {
      run(`UPDATE sms_otps SET is_used = 1 WHERE id = ?`, record.id);
      return { success: false, reason: 'تعداد دفعات ورود اشتباه بیش از حد مجاز است.' };
    }

    if (record.code !== String(code).trim()) {
      run(`UPDATE sms_otps SET attempts = attempts + 1 WHERE id = ?`, record.id);
      return { success: false, reason: 'کد تایید اشتباه است.' };
    }

    // مصرف موفق کد
    run(`UPDATE sms_otps SET is_used = 1, verified_at = ? WHERE id = ?`, new Date().toISOString(), record.id);
    return { success: true, message: 'کد تایید با موفقیت احراز شد.' };
  }

  /**
   * شبیه‌سازی و ارسال پیامک به شماره مقصد
   */
  async sendSms(phone, text) {
    if (!phone || !text) return { sent: false, reason: 'missing_params' };
    return {
      sent: true,
      phone,
      length: text.length,
      simulated: true,
      sent_at: new Date().toISOString(),
    };
  }
}

export const smsOtpService = new SmsOtpService();
