/**
 * تولید فایل گزارش مالی استاندارد به صورت CSV با ساختار راست‌به‌چپ، کدگذاری UTF-8 با BOM
 * و قالب‌بندی ریالی/تومانی استاندارد مناسب برای اکسل بدون به‌هم‌ریختگی حروف فارسی
 */

/**
 * گریز از فیلدهای متنی جهت جلوگیری از تداخل با کاما و حملات CSV / Formula Injection
 */
function sanitizeCell(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // خنثی‌سازی حملات تزریق فرمول در اکسل (=, +, -, @, tab, cr)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // فرار دادن گیومه‌ها
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * تبدیل آرایه‌ای از داده‌ها به خروجی CSV سازگار با مایکروسافت اکسل و نرم‌افزارهای حسابداری فارسی
 * @param {Array<{ key: string, label: string }>} columns ستون‌های گزارش
 * @param {Array<Object>} rows سطرهای اطلاعات
 * @returns {string} محتوای CSV با UTF-8 BOM
 */
export function generatePersianExcelCsv(columns, rows) {
  const UTF8_BOM = '\uFEFF';
  const headerLine = columns.map(col => sanitizeCell(col.label)).join(',');

  const dataLines = rows.map(row => {
    return columns.map(col => sanitizeCell(row[col.key])).join(',');
  });

  return UTF8_BOM + [headerLine, ...dataLines].join('\r\n');
}

/**
 * ساخت گزارش تسویه‌حساب فروشندگان مناسب برای اکسل
 * @param {Array<Object>} payouts لیست تسویه‌حساب‌ها
 * @returns {string}
 */
export function buildVendorPayoutsExcelReport(payouts) {
  const columns = [
    { key: 'id', label: 'شناسه تسویه' },
    { key: 'vendor_id', label: 'شناسه فروشنده' },
    { key: 'period_start', label: 'شروع دوره' },
    { key: 'period_end', label: 'پایان دوره' },
    { key: 'total_sales', label: 'مجموع فروش (تومان)' },
    { key: 'commission_rate', label: 'درصد کمیسیون' },
    { key: 'commission_amount', label: 'مبلغ کمیسیون (تومان)' },
    { key: 'net_payout', label: 'خالص پرداختی (تومان)' },
    { key: 'sheba_number', label: 'شماره شبا' },
    { key: 'status', label: 'وضعیت پرداخت' },
    { key: 'created_at', label: 'تاریخ صدور' },
  ];

  return generatePersianExcelCsv(columns, payouts);
}
