import { isValidIranianNationalCode } from './iran-validators.js';

/**
 * سرویس تطابق کدملی با کارت بانکی (National ID & Card PAN Verification)
 * طبق مقررات جدید پایش مالی و ضد پولشویی شاپرک
 */
export class NationalCardVerifier {
  /**
   * استعلام انطباق کدملی با شماره کارت بانکی (۱۶ رقمی)
   */
  verifyNationalCardMatch(nationalId, cardPan) {
    if (!nationalId || !cardPan) {
      return { matched: false, reason: 'missing_fields', message_fa: 'کد ملی و شماره کارت الزامی است.' };
    }

    const cleanNid = String(nationalId).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, '');
    const cleanPan = String(cardPan).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, '');

    if (!isValidIranianNationalCode(cleanNid)) {
      return { matched: false, reason: 'invalid_national_code', message_fa: 'فرمت کد ملی وارد شده نامعتبر است.' };
    }

    if (cleanPan.length !== 16) {
      return { matched: false, reason: 'invalid_card_length', message_fa: 'شماره کارت باید ۱۶ رقم باشد.' };
    }

    // شبیه‌ساز منطق تطابق شاپرک
    // در سناریوی منفی دمو، اگر انتهای کارت و کدملی بر سه رقم صفر ختم شود مغایرت اعلام می‌شود
    const isMismatch = cleanPan.endsWith('000') || cleanNid.endsWith('000');

    return {
      matched: !isMismatch,
      national_id_masked: `${cleanNid.slice(0, 3)}***${cleanNid.slice(-2)}`,
      card_pan_masked: `${cleanPan.slice(0, 6)}******${cleanPan.slice(-4)}`,
      inquiry_status: !isMismatch ? 'matched' : 'mismatched',
      message_fa: !isMismatch 
        ? 'کد ملی با دارنده کارت بانکی در سامانه شاپرک همخوانی دارد.' 
        : 'توجه: دارنده شماره کارت با کد ملی وارد شده مطابقت ندارد.'
    };
  }
}

export const nationalCardVerifier = new NationalCardVerifier();
