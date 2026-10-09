/**
 * سرویس اعتبارسنجی و رهگیری کدهای رهگیری شرکت ملی پست جمهوری اسلامی ایران
 * بارکدهای پستی ۲۴ رقمی پست پیشتاز و سفارشی
 */

export class IranPostTrackingService {
  /**
   * بررسی اعتبار ساختار بارکد پستی ۲۴ رقمی شرکت پست
   * @param {string} trackingCode کد رهگیری وارد شده
   * @returns {boolean}
   */
  isValidTrackingCode(trackingCode) {
    if (!trackingCode || typeof trackingCode !== 'string') return false;
    const clean = trackingCode.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    // بارکدهای استاندارد جدید پست ایران دقیقاً ۲۴ رقم تمام‌عددی هستند
    return /^\d{24}$/.test(clean);
  }

  /**
   * تولید آدرس مستقیم رهگیری در سامانه شرکت ملی پست
   */
  getTrackingUrl(trackingCode) {
    const clean = String(trackingCode || '').trim();
    return `https://tracking.post.ir/?id=${encodeURIComponent(clean)}`;
  }

  /**
   * شبیه‌سازی وضعیت مرسوله برای پاسخ‌دهی سریع به مشتری در اپلیکیشن
   */
  mockTrackShipment(trackingCode) {
    if (!this.isValidTrackingCode(trackingCode)) {
      return {
        valid: false,
        tracking_code: trackingCode,
        message: 'کد رهگیری پستی وارد شده معتبر نیست. (باید ۲۴ رقم تمام عددی باشد)',
      };
    }

    return {
      valid: true,
      tracking_code: trackingCode,
      carrier: 'شرکت ملی پست جمهوری اسلامی ایران (پیشتاز)',
      status: 'in_transit',
      status_fa: 'در حال توزیع در باجه مقصد',
      last_update: new Date().toISOString(),
      official_tracking_url: this.getTrackingUrl(trackingCode),
      checkpoints: [
        { time: '1405/01/10 09:30', location: 'مرکز تجزیه و مبادلات پستی تهران', status: 'قبول مرسوله' },
        { time: '1405/01/11 14:15', location: 'هاب منطقه‌ای توزیع', status: 'خروج از مرکز مبادله' },
        { time: '1405/01/12 08:45', location: 'باجه پستی منطقه مقصد', status: 'آماده تحویل به نامه‌رسان' },
      ],
    };
  }
}

export const iranPostTrackingService = new IranPostTrackingService();
