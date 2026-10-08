/**
 * اعتبارسنجی الگوریتمی دقیق شماره ملی و شماره شبای بانکی ایران
 * با استفاده از الگوریتم‌های استاندارد کنترل رقم (Luhn / Checksum)
 */

/**
 * اعتبارسنجی شماره ملی ایران
 * ۱۰ رقم، ارقام غیرتکراری، محاسبه رقم کنترلی باقی‌مانده بر ۱۱
 * @param {string} code کد ملی
 * @returns {boolean}
 */
export function isValidIranianNationalCode(code) {
  if (!code || typeof code !== 'string') return false;
  const clean = code.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  if (!/^\d{10}$/.test(clean)) return false;

  // کدهای با ارقام کاملاً تکراری معتبر نیستند (مانند ۱۱۱۱۱۱۱۱۱۱)
  if (/^(\d)\1{9}$/.test(clean)) return false;

  const check = parseInt(clean[9], 10);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean[i], 10) * (10 - i);
  }

  const remainder = sum % 11;
  if (remainder < 2) {
    return check === remainder;
  }
  return check === 11 - remainder;
}

/**
 * اعتبارسنجی شماره شبای بانکی ایران (IR IBAN)
 * فرمت: IR + 2 رقم کنترلی + 22 رقم شناسه حساب بانکی ایران بر اساس استاندارد ISO 13616
 * محاسبه با الگوریتم MOD 97-10
 * @param {string} iban شماره شبا با یا بدون پیشوند IR
 * @returns {boolean}
 */
export function isValidIranianIban(iban) {
  if (!iban || typeof iban !== 'string') return false;
  let clean = iban.trim().toUpperCase().replace(/\s+/g, '');

  if (!clean.startsWith('IR')) {
    clean = 'IR' + clean;
  }

  if (!/^IR\d{24}$/.test(clean)) return false;

  // جابجایی ۴ کاراکتر اول به انتهای رشته: IRxx -> انتهای رشته
  const rearranged = clean.slice(4) + clean.slice(0, 4);

  // تبدیل حروف I و R به اعداد معادل (A=10, ..., I=18, R=27)
  // I = 18, R = 27
  const numericString = rearranged
    .replace(/I/g, '18')
    .replace(/R/g, '27');

  // محاسبه MOD 97 بر روی عدد بسیار بزرگ با روش تکه‌بندی (Chunking)
  let remainder = 0;
  for (let i = 0; i < numericString.length; i += 7) {
    const chunk = remainder + numericString.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }

  return remainder === 1;
}

/**
 * نرمال‌سازی و اعتبارسنجی شماره تلفن همراه ایران (09xxxxxxxxx)
 */
export function normalizeIranianMobile(phone) {
  if (!phone || typeof phone !== 'string') return null;
  let clean = phone.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d+]/g, '');
  if (clean.startsWith('+98')) clean = '0' + clean.slice(3);
  if (clean.startsWith('0098')) clean = '0' + clean.slice(4);
  if (clean.startsWith('98')) clean = '0' + clean.slice(2);
  if (!clean.startsWith('0') && clean.length === 10) clean = '0' + clean;
  if (/^09\d{9}$/.test(clean)) return clean;
  return null;
}

