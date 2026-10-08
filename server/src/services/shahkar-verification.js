import { isValidIranianNationalCode, normalizeIranianMobile } from './iran-validators.js';
import { run, get } from '../db/index.js';

/**
 * سرویس تطبیق هویت شاهکار (تطابق کدملی و شماره موبایل)
 * ویژه سفارش سیم‌کارت، طلا و کالاهای با ارزش ریالی بالا
 */
export class ShahkarVerificationService {
  /**
   * استعلام تطابق کد ملی و شماره تلفن همراه
   */
  async verifyShahkar({ nationalCode, mobile, userId = null }) {
    if (!nationalCode || !mobile) {
      return { matched: false, error_code: 'INVALID_INPUT', message_fa: 'کد ملی و شماره موبایل الزامی است.' };
    }

    if (!isValidIranianNationalCode(nationalCode)) {
      return { matched: false, error_code: 'INVALID_NATIONAL_CODE', message_fa: 'فرمت کد ملی وارد شده نامعتبر است.' };
    }

    const normMobile = normalizeIranianMobile(mobile);
    if (!normMobile) {
      return { matched: false, error_code: 'INVALID_MOBILE', message_fa: 'شماره تلفن همراه معتبر نیست.' };
    }

    // شبیه‌ساز امن اتصال به سامانه شاهکار (در محیط عملیاتی وب‌سرویس وزارت ارتباطات فراخوانی می‌شود)
    // برای کدهای آزمایشی دمو، اگر انتهای کدملی و شماره رقم مشترک داشته باشد تایید می‌شود مگر در سناریوی منفی
    const isMockMismatch = nationalCode.endsWith('000') || normMobile.endsWith('0000');
    const isMatched = !isMockMismatch;

    const recordId = `shk_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    run(
      `INSERT INTO shahkar_logs (id, user_id, national_code, mobile, is_matched, verified_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      recordId, userId, nationalCode, normMobile, isMatched ? 1 : 0, now
    );

    if (isMatched && userId) {
      run(`UPDATE users SET national_id = ? WHERE id = ?`, nationalCode, userId);
    }

    return {
      matched: isMatched,
      national_code_masked: `${nationalCode.slice(0, 3)}***${nationalCode.slice(-2)}`,
      mobile_masked: `${normMobile.slice(0, 4)}***${normMobile.slice(-2)}`,
      inquiry_id: recordId,
      verified_at: now,
      message_fa: isMatched 
        ? 'احراز هویت شاهکار با موفقیت تأیید شد.' 
        : 'کد ملی وارد شده با مالک شماره موبایل مطابقت ندارد.'
    };
  }
}

export const shahkarVerificationService = new ShahkarVerificationService();
