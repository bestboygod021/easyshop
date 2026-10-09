/**
 * موتور داخلی EasyShop — تولید محصول بدون نیاز به کلید API.
 * وقتی هیچ کلید معتبری تنظیم نشده باشد یا اتصال به مدل ابری ممکن نباشد،
 * همین موتور داده‌های ساخت‌یافته و باکیفیت فارسی/انگلیسی تولید می‌کند.
 */
const BRAND_POOL = ['EasyShop', 'گلدیران', 'نوین', 'پارس‌تک', 'زرین', 'آرین', 'ماهان', 'کیان'];
const PERSIAN_ADJ = ['حرفه‌ای', 'پریمیوم', 'مقاوم', 'سبک', 'هوشمند', 'اقتصادی', 'لوکس', 'چندکاره'];
const FEATURES = [
  'بدنه‌ی مقاوم با روکش ضدخش',
  'طراحی ارگونومیک و سبک',
  '۲۴ ماه گارانتی معتبر شرکتی',
  'بسته‌بندی شکیل مناسب هدیه',
  'سازگار با استانداردهای بین‌المللی',
  'مصرف انرژی بهینه (A+)',
  'کنترل از طریق اپلیکیشن موبایل',
  'قطعات یدکی با تأمین دائمی',
];

const TITLE_WORDS = (brief) =>
  String(brief || 'محصول')
    .replace(/[،,.!?]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 4);

const pick = (arr, seed) => arr[Math.abs(hash(seed)) % arr.length];
const pickMany = (arr, count, seed) =>
  arr.filter((_, i) => (Math.abs(hash(`${seed}-${i}`)) % 3) === 0).slice(0, count);

function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

const slugify = (str) =>
  String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export function builtinProduct({ brief = '', category = '', price, brand, count = 1 } = {}) {
  const words = TITLE_WORDS(brief);
  const base = words.join(' ') || 'محصول جدید فروشگاه';
  const cat = category || 'عمومی';
  const seed = `${brief}-${category}-${count}`;
  const adj = pick(PERSIAN_ADJ, seed);
  const brandName = brand || pick(BRAND_POOL, seed);
  const name_fa = `${brandName} ${base} مدل ${adj}`;
  const name_en = (brand || 'EasyShop') + ' ' + slugify(base).replace(/-/g, ' ') || 'Product';
  const priceValue = Number(price) || 1_200_000 + (Math.abs(hash(seed)) % 90) * 250_000;
  const features = pickMany(FEATURES, 4, seed).length ? pickMany(FEATURES, 4, seed) : FEATURES.slice(0, 4);

  const description_fa = `<h3>معرفی ${name_fa}</h3>
<p>${name_fa} یکی از گزینه‌های منتخب دسته‌بندی «${cat}» در فروشگاه EasyShop است؛ محصولی که با تمرکز بر کیفیت ساخت، کارایی روزمره و قیمت منصفانه انتخاب شده است. اگر به دنبال گزینه‌ای مطمئن با پشتیبانی رسمی و ارسال سریع هستید، این محصول انتخاب مناسبی است.</p>
<h3>ویژگی‌های کلیدی</h3>
<p>${features.join('<br/>')}</p>
<h3>مناسب برای چه کسانی؟</h3>
<p>این محصول برای استفاده‌ی روزمره، محیط کار و هدیه‌دادن مناسب است و به دلیل طراحی ساده و کاربردی، نیاز به دانش فنی خاصی ندارد.</p>
<h3>خدمات EasyShop</h3>
<p>۷ روز ضمانت بازگشت کالا، پرداخت امن، ارسال به سراسر کشور و پشتیبانی ۲۴ ساعته از طریق چت زنده و تیکت.</p>`;

  const description_en = `<h3>About ${name_en}</h3>
<p>${name_en} is a curated pick from the "${cat}" category, selected for build quality, everyday performance and fair pricing.</p>
<h3>Key features</h3><p>${features.map((f) => `• ${f}`).join('<br/>')}</p>`;

  const output = {
    name_fa,
    name_en,
    slug: slugify(`${name_en}-${cost$fix(seed)}`),
    brand: brandName,
    category_slug_or_name: category || '',
    price: priceValue,
    compare_at_price: Math.round((priceValue * 1.18) / 10000) * 10000,
    cost: Math.round((priceValue * 0.62) / 10000) * 10000,
    stock: 5 + (Math.abs(hash(seed)) % 40),
    unit: 'عدد',
    warranty: '۲۴ ماه گارانتی شرکتی',
    shipping_days: 1 + (Math.abs(hash(seed)) % 4),
    short_desc_fa: `${base} با ${features[0]} — انتخابی مطمئن از دسته‌ی ${cat}.`,
    short_desc_en: `${name_en} with premium build quality.`,
    description_fa,
    description_en,
    specs: {
      'جنس بدنه': pick(['آلومینیوم', 'پلی‌کربنات مقاوم', 'استیل', 'شیشه‌ی سکوریت'], seed),
      'وزن': `${200 + (Math.abs(hash(seed)) % 1800)} گرم`,
      'گارانتی': '۲۴ ماه',
      'کشور سازنده': pick(['ایران', 'چین', 'آلمان', 'کره جنوبی', 'ترکیه'], seed),
      'رنگ‌بندی': 'مشکی / سفید / نقره‌ای',
    },
    tags: [...new Set([cat, 'پرفروش', adj, brandName])],
    seo: {
      title: `خرید ${name_fa} | قیمت و بررسی تخصصی | EasyShop`,
      description: `خرید اینترنتی ${name_fa} با قیمت ${priceValue.toLocaleString('fa-IR')} تومان، ارسال سریع، گارانتی رسمی و ۷ روز ضمانت بازگشت کالا.`,
      keywords: [name_fa, `خرید ${base}`, `قیمت ${base}`, cat],
    },
    marketing: {
      hook: `${name_fa}؛ همان چیزی که دنبالش بودید.`,
      bullets: features,
      cta: 'همین حالا سفارش دهید و تا ۴۸ ساعت تحویل بگیرید.',
      social_post: `🔥 ${name_fa} رسید!\n${features[0]}\nقیمت ویژه: ${priceValue.toLocaleString('fa-IR')} تومان\n#${slugify(base).replace(/-/g, '_')} #فروشگاه_آنلاین`,
    },
    image_prompt: `product photo of ${name_en}, studio lighting, white background, high detail, e-commerce style`,
    variants: [
      { name_fa: 'استاندارد', name_en: 'Standard', price_delta: 0, stock: 12 },
      { name_fa: 'نسخه‌ی حرفه‌ای', name_en: 'Pro', price_delta: Math.round(priceValue * 0.18), stock: 6 },
    ],
    faq: [
      { q: 'ارسال چند روزه انجام می‌شود؟', a: 'ارسال از تهران؛ ۱ تا ۴ روز کاری بر اساس شهر شما.' },
      { q: 'گارانتی دارد؟', a: 'بله، ۲۴ ماه گارانتی شرکتی همراه با خدمات پس از فروش.' },
      { q: 'امکان مرجوعی وجود دارد؟', a: 'تا ۷ روز پس از تحویل، در صورت سالم بودن کالا.' },
    ],
    notes: 'این خروجی با موتور داخلی EasyShop تولید شد (بدون فراخوانی مدل ابری).',
  };
  return output;
}
function cost$fix(s) {
  return Math.abs(hash(s)).toString(36).slice(0, 4);
}

export function builtinText({ kind = 'text', input = '' } = {}) {
  const text = String(input || '').slice(0, 500);
  switch (kind) {
    case 'marketing':
      return `🎯 پیشنهاد کمپین برای «${text}»\n\n۱) پیام اصلی: کیفیت قابل اعتماد با ارسال سریع.\n۲) مخاطب: خریداران آنلاین ۲۵ تا ۴۵ سال.\n۳) کانال‌ها: اینستاگرام، پیامک باشگاه مشتریان و نوتیفیکیشن اپ.\n۴) پیشنهاد تخفیف: ۱۰٪ برای اولین خرید + ارسال رایگان بالای ۵۰۰ هزار تومان.\n۵) فراخوان اقدام: «همین حالا سفارش دهید».\n\n(تولید شده با موتور داخلی EasyShop)`;
    case 'support':
      return `سلام و وقت بخیر 🌱\nاز تماس شما سپاسگزاریم. بابت موضوع «${text}» عذرخواهی می‌کنیم؛ همکاران ما در حال بررسی هستند و حداکثر تا ۲۴ ساعت آینده نتیجه را اطلاع می‌دهیم. کد پیگیری سفارش شما فعال است و می‌توانید وضعیت را از پنل کاربری دنبال کنید.`;
    case 'assistant':
      return `برای انتخابی دقیق‌تر، لطفاً بودجه، کاربرد اصلی و برند مورد علاقه‌تان را بگویید. به‌طور کلی پیشنهاد می‌کنیم ابتدا محصولات موجود در دسته‌ی مورد نظر را با فیلتر «امتیاز بالا» و «ارسال سریع» ببینید؛ من می‌توانم ۳ گزینه‌ی برتر را برایتان مقایسه کنم. (پاسخ از موتور داخلی EasyShop)`;
    default:
      return `پیش‌نویس تولیدشده توسط موتور داخلی EasyShop برای: ${text}`;
  }
}

export function builtinImage({ prompt = '', label = '' } = {}) {
  const seed = Math.abs(hash(prompt + label));
  const palettes = [
    ['#6366f1', '#8b5cf6', '#ec4899'],
    ['#0ea5e9', '#22d3ee', '#14b8a6'],
    ['#f97316', '#f59e0b', '#ef4444'],
    ['#10b981', '#84cc16', '#22c55e'],
    ['#8b5cf6', '#d946ef', '#f43f5e'],
    ['#1e293b', '#334155', '#64748b'],
  ];
  const [c1, c2, c3] = palettes[seed % palettes.length];
  const title = (label || prompt || 'محصول').toString().slice(0, 28);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/><stop offset="55%" stop-color="${c2}"/><stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="r" cx="30%" cy="25%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="900" height="900" fill="url(#g)"/>
  <rect width="900" height="900" fill="url(#r)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="2">
    <circle cx="700" cy="220" r="150"/><circle cx="180" cy="700" r="110"/>
    <rect x="90" y="120" width="240" height="240" rx="48"/>
  </g>
  <text x="450" y="470" font-family="Vazirmatn, Tahoma, sans-serif" font-size="58" font-weight="700"
        fill="#ffffff" text-anchor="middle" direction="rtl">${title.replace(/[<>&]/g, '')}</text>
  <text x="450" y="530" font-family="Vazirmatn, Tahoma, sans-serif" font-size="26" fill="#ffffff"
        fill-opacity="0.85" text-anchor="middle">EasyShop · AI Studio</text>
</svg>`;
}
