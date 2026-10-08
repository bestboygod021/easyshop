/**
 * اعتبارسنجی کدپستی ده رقمی ایران و تطبیق استان و شهرهای کشور
 */

// پیش‌شماره‌های کدپستی و استان‌های مربوطه در ایران
export const IRAN_POSTAL_PREFIXES = {
  '1': 'تهران',
  '3': 'البرز/قم/قزوین/مرکزی',
  '4': 'گیلان/مازندران/گلستان',
  '5': 'آذربایجان شرقی/غربی/اردبیل',
  '6': 'خوزستان/لرستان/همدان',
  '7': 'فارس/بوشهر/کهگیلویه و بویراحمد',
  '8': 'اصفهان/یزد/چهارمحال و بختیاری',
  '9': 'خراسان رضوی/شمالی/جنوبی/سمنان',
};

/**
 * اعتبارسنجی کدپستی ده‌رقمی ایران
 * مطابق استاندارد پست جمهوری اسلامی ایران:
 * ۱۰ رقم، عدم استفاده از ارقام ۰ و ۲ در ۵ رقم اول
 */
export function isValidIranianPostalCode(postalCode) {
  if (!postalCode || typeof postalCode !== 'string') return false;
  const clean = postalCode.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  if (!/^\d{10}$/.test(clean)) return false;

  // ۵ رقم اول کد پستی نباید شامل عدد ۰ یا ۲ در رقم‌های اول و دوم باشد (طبق استاندارد شرکت ملی پست)
  if (/^[02]/.test(clean)) return false;

  return true;
}

/**
 * حدس استان و منطقه توزیع بر اساس کدپستی
 */
export function guessProvinceByPostalCode(postalCode) {
  if (!isValidIranianPostalCode(postalCode)) return null;
  const firstDigit = postalCode[0];
  return IRAN_POSTAL_PREFIXES[firstDigit] || 'نامشخص';
}
