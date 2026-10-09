import { guessProvinceByPostalCode } from './postal-code.js';

/**
 * سرویس تطبیق هوشمند آدرس با کدپستی ۱۰ رقمی ایران
 */
export class PostalAddressMatcher {
  /**
   * بررسی همخوانی استان وارد شده با کدپستی ۱۰ رقمی
   */
  verifyMatch(postalCode, provinceName) {
    if (!postalCode || !provinceName) {
      return { is_valid: false, message_fa: 'کد پستی و استان الزامی است.' };
    }

    const cleanCode = String(postalCode).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, '');
    if (cleanCode.length !== 10) {
      return { is_valid: false, message_fa: 'کد پستی باید دقیقا ۱۰ رقم باشد.' };
    }

    const guessedProvince = guessProvinceByPostalCode(cleanCode);
    if (!guessedProvince) {
      return { is_valid: true, matched: true, detected_province: 'نامشخص', note_fa: 'پیش‌شماره در پایگاه‌داده استان‌ها ثبت نشده است.' };
    }

    const cleanInputProvince = String(provinceName).trim().replace('استان', '').trim();
    const isMatched = guessedProvince.includes(cleanInputProvince) || cleanInputProvince.includes(guessedProvince);

    return {
      is_valid: true,
      matched: isMatched,
      input_province: provinceName,
      detected_province: guessedProvince,
      postal_code: cleanCode,
      message_fa: isMatched 
        ? 'کد پستی با استان مقصد کاملا همخوانی دارد.' 
        : `هشدار: پیش‌کد پستی وارد شده مربوط به ${guessedProvince} است اما استان ${provinceName} انتخاب شده است.`
    };
  }
}

export const postalAddressMatcher = new PostalAddressMatcher();
