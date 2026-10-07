/** توابع قالب‌بندی اعداد، قیمت، تاریخ شمسی و متن‌های کمکی */
const faDigits = (input) => String(input).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export function toman(value, { withUnit = true, compact = false } = {}) {
  const n = Number(value || 0);
  let text;
  if (compact && n >= 1_000_000) {
    text = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(n / 1_000_000) + ' میلیون';
  } else {
    text = new Intl.NumberFormat('fa-IR').format(Math.round(n));
  }
  return withUnit ? `${text} تومان` : text;
}

export function number(value) {
  return new Intl.NumberFormat('fa-IR').format(Number(value || 0));
}

export const fa = faDigits;

export function date(value, { withTime = false } = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function timeAgo(value) {
  if (!value) return '';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'همین حالا';
  if (diff < 3600) return `${number(Math.floor(diff / 60))} دقیقه پیش`;
  if (diff < 86400) return `${number(Math.floor(diff / 3600))} ساعت پیش`;
  if (diff < 2592000) return `${number(Math.floor(diff / 86400))} روز پیش`;
  return date(value);
}

export const ORDER_STATUS = {
  pending: { label: 'در انتظار پرداخت', color: 'amber' },
  paid: { label: 'پرداخت شده', color: 'blue' },
  processing: { label: 'در حال پردازش', color: 'indigo' },
  packed: { label: 'بسته‌بندی شده', color: 'violet' },
  shipped: { label: 'ارسال شده', color: 'cyan' },
  delivered: { label: 'تحویل داده شده', color: 'emerald' },
  cancelled: { label: 'لغو شده', color: 'rose' },
  refunded: { label: 'بازگردانده شده', color: 'slate' },
  returned: { label: 'مرجوع شده', color: 'orange' },
};

export const TICKET_STATUS = {
  open: { label: 'باز', color: 'emerald' },
  pending: { label: 'در انتظار پاسخ', color: 'amber' },
  answered: { label: 'پاسخ داده شده', color: 'blue' },
  resolved: { label: 'حل شده', color: 'indigo' },
  closed: { label: 'بسته', color: 'slate' },
};

export const PRIORITY = {
  low: { label: 'کم', color: 'slate' },
  normal: { label: 'معمولی', color: 'blue' },
  high: { label: 'بالا', color: 'amber' },
  urgent: { label: 'فوری', color: 'rose' },
};

export const CHAT_STATUS = {
  open: { label: 'باز', color: 'emerald' },
  pending: { label: 'در انتظار', color: 'amber' },
  closed: { label: 'بسته', color: 'slate' },
};

export const AI_KIND_LABELS = {
  chat: 'گفتگو',
  product: 'تولید محصول',
  product_generation: 'تولید محصول',
  image: 'تولید تصویر',
  marketing: 'بازاریابی',
  seo: 'سئو',
  pricing: 'قیمت‌گذاری',
  review_analysis: 'تحلیل نظرات',
  support_reply: 'پاسخ پشتیبانی',
  category_generation: 'دسته‌بندی',
  assistant: 'دستیار خرید',
  connection_test: 'تست اتصال',
};

/** اعتبارسنجی ساده */
export const validators = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '')),
  phone: (v) => /^09\d{9}$/.test(String(v || '').replace(/\s/g, '')),
  required: (v) => String(v ?? '').trim().length > 0,
  min: (n) => (v) => String(v || '').length >= n,
};

/** تبدیل تاریخ شمسی ورودی به ISO تقریبی (برای ارسال به API) */
export function toIsoDate(jalaliDate) {
  if (!jalaliDate) return null;
  const d = new Date(jalaliDate);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function fileSize(bytes) {
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  let i = 0;
  let n = Number(bytes || 0);
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function initials(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}
