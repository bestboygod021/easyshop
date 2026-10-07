/**
 * داده‌های اولیه‌ی EasyShop (اجرای خودکار در اولین بوت یا با `npm run seed`)
 */
import { config } from '../config.js';
import {
  all,
  db,
  get,
  isSeeded,
  nowIso,
  parseJson,
  run,
  setSetting,
  stringifyJson,
  tx,
  uid,
} from './index.js';
import { createUser, hashPassword } from '../middleware/auth.js';
import { PROVIDER_CATALOG } from '../services/ai/providers.js';
import { builtinProduct } from '../services/ai/builtin.js';

const iso = (daysAgo = 0, hoursAgo = 0) =>
  new Date(Date.now() - daysAgo * 864e5 - hoursAgo * 36e5).toISOString();
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function seedProviders() {
  const ts = nowIso();
  for (const p of PROVIDER_CATALOG) {
    const exists = get('SELECT id FROM ai_providers WHERE slug = ?', p.slug);
    if (exists) continue;
    run(
      `INSERT INTO ai_providers
       (id,slug,name_fa,name_en,kind,base_url,api_key,models,default_model,supports_image,supports_vision,enabled,priority,notes,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      uid('aip'),
      p.slug,
      p.name_fa,
      p.name_en,
      p.kind,
      p.base_url,
      config.ai.envKeys[p.slug] || null,
      stringifyJson(p.models, '[]'),
      p.default_model,
      p.supports_image,
      p.supports_vision,
      p.slug === 'builtin' ? 1 : p.slug === 'openai' || p.slug === 'gemini' ? 1 : 1,
      p.priority,
      p.badge,
      ts,
      ts,
    );
  }
  if (!get("SELECT key FROM settings WHERE key='ai'")) {
    setSetting('ai', {
      default_provider: 'builtin',
      auto_fallback: true,
      product_auto_publish: false,
      allow_customer_assistant: true,
      allow_support_ai: true,
    });
  }
}

const CATEGORY_TREE = [
  {
    name_fa: 'کالای دیجیتال', name_en: 'Digital', slug: 'digital', icon: 'Smartphone', color: '#6366f1',
    children: [
      { name_fa: 'موبایل و تبلت', name_en: 'Mobile', slug: 'mobile', icon: 'Smartphone', color: '#6366f1' },
      { name_fa: 'لپ‌تاپ و کامپیوتر', name_en: 'Computers', slug: 'computers', icon: 'Laptop', color: '#4f46e5' },
      { name_fa: 'هدفون و صوتی', name_en: 'Audio', slug: 'audio', icon: 'Headphones', color: '#8b5cf6' },
      { name_fa: 'دوربین و عکاسی', name_en: 'Cameras', slug: 'cameras', icon: 'Camera', color: '#7c3aed' },
    ],
  },
  {
    name_fa: 'خانه و آشپزخانه', name_en: 'Home & Kitchen', slug: 'home', icon: 'Home', color: '#0ea5e9',
    children: [
      { name_fa: 'لوازم آشپزخانه', name_en: 'Kitchen', slug: 'kitchen', icon: 'CookingPot', color: '#0ea5e9' },
      { name_fa: 'دکوراسیون', name_en: 'Decor', slug: 'decor', icon: 'Lamp', color: '#0d9488' },
      { name_fa: 'نظافت و بهداشت', name_en: 'Cleaning', slug: 'cleaning', icon: 'SprayCan', color: '#14b8a6' },
    ],
  },
  {
    name_fa: 'مد و پوشاک', name_en: 'Fashion', slug: 'fashion', icon: 'Shirt', color: '#ec4899',
    children: [
      { name_fa: 'پوشاک مردانه', name_en: 'Men', slug: 'men', icon: 'Shirt', color: '#ec4899' },
      { name_fa: 'پوشاک زنانه', name_en: 'Women', slug: 'women', icon: 'Dress', color: '#db2777' },
      { name_fa: 'کیف و کفش', name_en: 'Bags & Shoes', slug: 'bags-shoes', icon: 'Footprints', color: '#f43f5e' },
    ],
  },
  {
    name_fa: 'زیبایی و سلامت', name_en: 'Beauty & Health', slug: 'beauty', icon: 'Heart', color: '#f97316',
    children: [
      { name_fa: 'مراقبت پوست و مو', name_en: 'Skin & Hair', slug: 'skincare', icon: 'Droplets', color: '#f97316' },
      { name_fa: 'عطر و ادکلن', name_en: 'Fragrance', slug: 'fragrance', icon: 'Sparkles', color: '#fb923c' },
      { name_fa: 'سلامت و پزشکی', name_en: 'Health', slug: 'health', icon: 'Stethoscope', color: '#ea580c' },
    ],
  },
  {
    name_fa: 'ورزش و سفر', name_en: 'Sport & Travel', slug: 'sport', icon: 'Dumbbell', color: '#10b981',
    children: [
      { name_fa: 'تجهیزات ورزشی', name_en: 'Gear', slug: 'gear', icon: 'Dumbbell', color: '#10b981' },
      { name_fa: 'کوهنوردی و کمپینگ', name_en: 'Outdoor', slug: 'outdoor', icon: 'Tent', color: '#22c55e' },
      { name_fa: 'چمدان و کوله', name_en: 'Luggage', slug: 'luggage', icon: 'Luggage', color: '#16a34a' },
    ],
  },
  {
    name_fa: 'سوپرمارکت و خوراک', name_en: 'Grocery', slug: 'grocery', icon: 'ShoppingBasket', color: '#eab308',
    children: [
      { name_fa: 'نوشیدنی و شربت', name_en: 'Drinks', slug: 'drinks', icon: 'CupSoda', color: '#eab308' },
      { name_fa: 'خوراکی و تنقلات', name_en: 'Snacks', slug: 'snacks', icon: 'Cookie', color: '#f59e0b' },
    ],
  },
  {
    name_fa: 'اسباب‌بازی و کودک', name_en: 'Toys & Kids', slug: 'toys', icon: 'Blocks', color: '#a855f7',
    children: [
      { name_fa: 'اسباب‌بازی', name_en: 'Toys', slug: 'toys-games', icon: 'ToyBrick', color: '#a855f7' },
      { name_fa: 'لوازم نوزاد', name_en: 'Baby', slug: 'baby', icon: 'Baby', color: '#c084fc' },
    ],
  },
  {
    name_fa: 'کتاب و لوازم‌التحریر', name_en: 'Books & Stationery', slug: 'books', icon: 'BookOpen', color: '#8b5cf6',
    children: [
      { name_fa: 'کتاب و رمان', name_en: 'Books', slug: 'novels', icon: 'BookOpen', color: '#8b5cf6' },
      { name_fa: 'نوشت‌افزار', name_en: 'Stationery', slug: 'stationery', icon: 'PenTool', color: '#7c3aed' },
    ],
  },
];

const PRODUCT_SPECS = [
  { brief: 'گوشی موبایل هوشمند ۱۲۸ گیگابایت دوربین ۵۰ مگاپیکسل', cat: 'mobile', brand: 'سامسونگ', price: 24_900_000, featured: 1 },
  { brief: 'گوشی هوشمند اقتصادی باتری ۵۰۰۰ میلی‌آمپر', cat: 'mobile', brand: 'شیائومی', price: 8_400_000 },
  { brief: 'لپ‌تاپ ۱۵ اینچی پردازنده core i7 رم ۱۶ گیگابایت', cat: 'computers', brand: 'ایسوس', price: 58_000_000, featured: 1 },
  { brief: 'مانیتور ۲۷ اینچ QHD با نرخ نوسازی ۱۶۵ هرتز', cat: 'computers', brand: 'ال‌جی', price: 14_500_000 },
  { brief: 'کیبورد مکانیکال بی‌سیم با نورپردازی RGB', cat: 'computers', brand: 'لاجیتک', price: 3_250_000 },
  { brief: 'ماوس گیمینگ بی‌سیم دقت ۲۶۰۰۰ DPI', cat: 'computers', brand: 'ریزر', price: 2_400_000 },
  { brief: 'هدفون بی‌سیم با نویز کنسلینگ فعال', cat: 'audio', brand: 'سونی', price: 11_900_000, featured: 1 },
  { brief: 'اسپیکر بلوتوثی ضدآب قابل حمل', cat: 'audio', brand: 'جی‌بی‌ال', price: 4_300_000 },
  { brief: 'میکروفون استودیویی کاندنسر با پایه', cat: 'audio', brand: 'رود', price: 6_800_000 },
  { brief: 'دوربین بدون آینه ۲۴ مگاپیکسل با لنز کیت', cat: 'cameras', brand: 'کانن', price: 72_000_000, featured: 1 },
  { brief: 'پایه دوربین سه‌پایه حرفه‌ای آلومینیومی', cat: 'cameras', brand: 'مانفروتو', price: 3_900_000 },
  { brief: 'کتری برقی استیل ضدزنگ ۱.۷ لیتری', cat: 'kitchen', brand: 'پارس‌خزر', price: 1_850_000 },
  { brief: 'غذاساز چندکاره ۸ کاره با تیغه استیل', cat: 'kitchen', brand: 'فیلیپس', price: 5_600_000, featured: 1 },
  { brief: 'ست ۱۲ پارچه ظروف سرامیکی', cat: 'kitchen', brand: 'زرین‌ایران', price: 2_750_000 },
  { brief: 'چراغ مطالعه LED با نور تنظیم‌پذیر', cat: 'decor', brand: 'نوین', price: 1_250_000 },
  { brief: 'قالیچه ماشینی ۱۰۰×۱۵۰ طرح مدرن', cat: 'decor', brand: 'پرشین‌فرش', price: 4_900_000 },
  { brief: 'جاروبرقی شارژی بدون سیم ۲۲۰ وات', cat: 'cleaning', brand: 'بوش', price: 9_800_000 },
  { brief: 'دستگاه بخارشوی فرش و مبلمان', cat: 'cleaning', brand: 'کارچر', price: 12_400_000 },
  { brief: 'تی‌شرت نخی مردانه یقه گرد پک ۳ عددی', cat: 'men', brand: 'بادی‌اسپین', price: 1_290_000 },
  { brief: 'پیراهن اسپرت مردانه آستین بلند', cat: 'men', brand: 'تونیا', price: 1_850_000 },
  { brief: 'مانتو کتان زنانه مدل تابستانی', cat: 'women', brand: 'مانگو', price: 2_950_000, featured: 1 },
  { brief: 'شال و روسری ابریشمی طرح‌دار', cat: 'women', brand: 'لوکسا', price: 1_450_000 },
  { brief: 'کتانی ورزشی مردانه سبک و بادوام', cat: 'bags-shoes', brand: 'نایک', price: 4_750_000, featured: 1 },
  { brief: 'کیف چرم طبیعی دستی زنانه', cat: 'bags-shoes', brand: 'آرین', price: 3_600_000 },
  { brief: 'کرم آبرسان و ضدچین‌وچروک صورت ۵۰ میلی‌لیتر', cat: 'skincare', brand: 'سینره', price: 890_000 },
  { brief: 'سرم ویتامین C روشن‌کننده پوست', cat: 'skincare', brand: 'لورآل', price: 1_980_000 },
  { brief: 'ادکلن مردانه رایحه چوبی ۱۰۰ میلی‌لیتر', cat: 'fragrance', brand: 'دیور', price: 8_900_000, featured: 1 },
  { brief: 'دماسنج و فشارسنج دیجیتال خانگی', cat: 'health', brand: 'بیورر', price: 2_150_000 },
  { brief: 'دمبل قابل تنظیم ۲۰ کیلوگرمی', cat: 'gear', brand: 'ایزی‌فیت', price: 5_400_000 },
  { brief: 'تردمیل خانگی تاشو موتور ۲.۵ اسب', cat: 'gear', brand: 'کاررفیت', price: 32_000_000, featured: 1 },
  { brief: 'چادر مسافرتی ۴ نفره ضدآب', cat: 'outdoor', brand: 'نچرهاست', price: 6_700_000 },
  { brief: 'ساک کوهنوردی ۶۰ لیتری مقاوم', cat: 'luggage', brand: 'دیکام', price: 2_800_000 },
  { brief: 'چمدان چرخ‌دار ۲۴ اینچ بدنه پلی‌کربنات', cat: 'luggage', brand: 'سامسونت', price: 7_200_000 },
  { brief: 'قهوه اسپرسو ترک‌خورده ۵۰۰ گرمی', cat: 'drinks', brand: 'لَنیک', price: 1_150_000 },
  { brief: 'پک تنقلات و آجیل مخلوط یک کیلوگرمی', cat: 'snacks', brand: 'مهرام', price: 1_680_000 },
  { brief: 'لگو ساختنی ۵۰۰ قطعه مدل قلعه', cat: 'toys-games', brand: 'لگو', price: 3_450_000 },
  { brief: 'کالسکه کودک تاشو سبک', cat: 'baby', brand: 'چیکو', price: 11_500_000 },
  { brief: 'رمان برنده جایزه با ترجمه فارسی', cat: 'novels', brand: 'نشر چشمه', price: 420_000 },
  { brief: 'ست خودکار و دفتر یادداشت لوکس', cat: 'stationery', brand: 'پارکر', price: 980_000 },
];

const REVIEW_TEXTS = [
  { rating: 5, title: 'کیفیت عالی', body: 'کیفیت ساخت واقعاً بالاست و از خریدم راضی‌ام. ارسال هم سریع بود.' },
  { rating: 5, title: 'ارزش خرید بالا', body: 'نسبت به قیمتش خیلی خوبه. بسته‌بندی هم شکیل بود.' },
  { rating: 4, title: 'خوب ولی گران', body: 'محصول خوبیه اما قیمتش کمی بالاست. با کد تخفیف ارزش خرید داشت.' },
  { rating: 4, title: 'مناسب استفاده روزمره', body: 'برای کارهای روزمره کاملاً مناسبه، فقط کاش رنگ‌بندی بیشتری داشت.' },
  { rating: 3, title: 'متوسط', body: 'قابل قبوله ولی انتظار کیفیت بهتری داشتم. پشتیبانی پاسخگو بود.' },
  { rating: 5, title: 'پیشنهاد می‌کنم', body: 'دقیقاً همون چیزی بود که می‌خواستم. ممنون از تیم EasyShop.' },
];

function slugifyEn(text, fallback = 'product') {
  return (
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `${fallback}-${Math.random().toString(36).slice(2, 6)}`
  );
}

export function seedDemoData() {
  const ts = nowIso();
  const users = {};

  users.admin = createUser({
    email: 'admin@easyshop.ir',
    password: 'ShopMaster#2026',
    full_name: 'آرش مدیر',
    phone: '09120000001',
    role: 'admin',
  });
  users.support = createUser({
    email: 'support@easyshop.ir',
    password: 'HelpDesk#2026',
    full_name: 'نگار پشتیبان',
    phone: '09120000002',
    role: 'support',
  });
  users.seller = createUser({
    email: 'seller@easyshop.ir',
    password: 'Trader#2026',
    full_name: 'شرکت پارس‌تک',
    phone: '09120000003',
    role: 'seller',
  });
  users.customer = createUser({
    email: 'user@easyshop.ir',
    password: 'Shopper#2026',
    full_name: 'سارا محمدی',
    phone: '09120000004',
    role: 'customer',
  });
  users.customer2 = createUser({
    email: 'reza@easyshop.ir',
    password: 'Shopper#2026',
    full_name: 'رضا کریمی',
    phone: '09120000005',
    role: 'customer',
  });
  users.customer3 = createUser({
    email: 'mina@easyshop.ir',
    password: 'Shopper#2026',
    full_name: 'مینا رستمی',
    phone: '09120000006',
    role: 'customer',
  });

  run('UPDATE users SET loyalty_points = 350, wallet = 250000 WHERE id = ?', users.customer.id);
  run('UPDATE users SET loyalty_points = 120 WHERE id = ?', users.customer2.id);

  // --- دسته‌بندی‌ها ---------------------------------------------------------
  const catIds = {};
  let order = 0;
  for (const parent of CATEGORY_TREE) {
    const pid = uid('cat');
    catIds[parent.slug] = pid;
    run(
      `INSERT INTO categories (id,parent_id,slug,name_fa,name_en,icon,color,description_fa,sort_order,is_active,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
      pid, null, parent.slug, parent.name_fa, parent.name_en, parent.icon, parent.color,
      `${parent.name_fa} — انتخاب گسترده‌ای از محصولات اصل با گارانتی و ارسال سریع.`, order++, ts,
    );
    for (const child of parent.children) {
      const cid = uid('cat');
      catIds[child.slug] = cid;
      run(
        `INSERT INTO categories (id,parent_id,slug,name_fa,name_en,icon,color,description_fa,sort_order,is_active,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
        cid, pid, child.slug, child.name_fa, child.name_en, child.icon, child.color,
        `${child.name_fa} — جدیدترین محصولات با بهترین قیمت.`, order++, ts,
      );
    }
  }

  // --- محصولات -------------------------------------------------------------
  const productIds = [];
  for (const spec of PRODUCT_SPECS) {
    const gen = builtinProduct({ brief: spec.brief, category: spec.cat, price: spec.price, brand: spec.brand });
    const id = uid('prd');
    const slug = `${slugifyEn(spec.brief.split(' ').slice(0, 4).join(' '))}-${id.slice(-4)}`;
    const images = [
      `/api/placeholder?text=${encodeURIComponent(gen.name_fa.slice(0, 24))}&seed=${id.slice(-4)}&palette=${Math.abs(spec.cat.length) % 6}`,
    ];
    const stock = spec.stock ?? rnd(0, 45);
    run(
      `INSERT INTO products
       (id,sku,slug,name_fa,name_en,brand,category_id,price,compare_at_price,cost,stock,low_stock_threshold,unit,
        short_desc_fa,short_desc_en,description_fa,description_en,specs,tags,images,thumbnail,status,featured,
        rating_avg,rating_count,sold_count,view_count,warranty,shipping_days,ai_meta,created_by,created_at,updated_at,published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      `ES-${id.slice(-6).toUpperCase()}`,
      slug,
      gen.name_fa,
      gen.name_en,
      spec.brand || gen.brand,
      catIds[spec.cat] || catIds[PRODUCT_SPECS[0].cat],
      spec.price ?? gen.price,
      gen.compare_at_price,
      Math.round((spec.price ?? gen.price) * 0.62),
      stock,
      5,
      gen.unit,
      gen.short_desc_fa,
      gen.short_desc_en,
      gen.description_fa,
      gen.description_en,
      stringifyJson(gen.specs),
      stringifyJson([...(gen.tags || []), spec.cat]),
      stringifyJson(images),
      images[0],
      'active',
      spec.featured ? 1 : 0,
      0,
      0,
      rnd(3, 320),
      rnd(100, 9000),
      gen.warranty,
      gen.shipping_days,
      stringifyJson({ generator: 'builtin', model: 'easyshop-composer-v1', generated_at: ts }),
      users.admin.id,
      ts,
      ts,
      ts,
    );
    productIds.push({ id, name: gen.name_fa, price: spec.price ?? gen.price, thumb: images[0], sku: `ES-${id.slice(-6).toUpperCase()}` });

    // واریانت‌ها
    for (const v of (gen.variants || []).slice(0, 3)) {
      run(
        'INSERT INTO product_variants (id,product_id,sku,name_fa,name_en,price_delta,stock,attributes) VALUES (?,?,?,?,?,?,?,?)',
        uid('var'), id, `${id.slice(-6)}-${slugifyEn(v.name_en || 'v')}`, v.name_fa, v.name_en, v.price_delta || 0, v.stock ?? rnd(2, 12), stringifyJson({}),
      );
    }
  }

  // --- نظرات ---------------------------------------------------------------
  for (const p of productIds) {
    const count = rnd(2, 5);
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      const r = REVIEW_TEXTS[rnd(0, REVIEW_TEXTS.length - 1)];
      const reviewer = pickOne([users.customer, users.customer2, users.customer3]);
      sum += r.rating;
      run(
        `INSERT INTO reviews (id,product_id,user_id,rating,title,body,status,helpful_count,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        uid('rev'), p.id, reviewer.id, r.rating, r.title, r.body, 'approved', rnd(0, 24), iso(rnd(1, 60)),
      );
    }
    run('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?', Number((sum / count).toFixed(2)), count, p.id);
  }

  // --- آدرس‌ها --------------------------------------------------------------
  for (const u of [users.customer, users.customer2, users.customer3]) {
    run(
      `INSERT INTO addresses (id,user_id,title,receiver,phone,province,city,postal_code,line,is_default,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
      uid('adr'), u.id, 'خانه', u.full_name, u.phone, 'تهران', 'تهران', String(rnd(1111111111, 9999999999)), 'خیابان ولیعصر، کوچه شهید بهشتی، پلاک ۱۲، واحد ۳', ts,
    );
  }

  // --- کدهای تخفیف ---------------------------------------------------------
  const coupons = [
    { code: 'WELCOME10', type: 'percent', value: 10, min: 500_000, desc: '۱۰٪ تخفیف اولین خرید' },
    { code: 'EASY200', type: 'fixed', value: 200_000, min: 1_000_000, desc: '۲۰۰ هزار تومان تخفیف نقدی' },
    { code: 'FREESHIP', type: 'free_shipping', value: 0, min: 300_000, desc: 'ارسال رایگان سفارش‌ها بالای ۳۰۰ هزار تومان' },
    { code: 'VIP25', type: 'percent', value: 25, min: 5_000_000, desc: 'تخفیف ویژه مشتریان VIP', max_discount: 2_000_000 },
  ];
  for (const c of coupons) {
    run(
      `INSERT INTO coupons (id,code,type,value,min_subtotal,max_discount,starts_at,ends_at,usage_limit,per_user_limit,used_count,is_active,description,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      uid('cpn'), c.code, c.type, c.value, c.min, c.max_discount ?? null, iso(30), iso(-90), 500, 1, rnd(3, 40), c.desc, ts,
    );
  }

  // --- سفارش‌ها ------------------------------------------------------------
  const statuses = ['pending', 'paid', 'processing', 'packed', 'shipped', 'delivered', 'delivered', 'delivered', 'cancelled'];
  const customers = [users.customer, users.customer2, users.customer3];
  const orders = [];
  for (let i = 0; i < 24; i += 1) {
    const customer = pickOne(customers);
    const status = i < 3 ? 'delivered' : pickOne(statuses);
    const id = uid('ord');
    const itemCount = rnd(1, 3);
    const chosen = [];
    for (let j = 0; j < itemCount; j += 1) {
      const p = pickOne(productIds);
      if (!chosen.find((c) => c.id === p.id)) chosen.push(p);
    }
    const subtotal = chosen.reduce((s, p) => s + p.price * 1, 0);
    const discount = Math.random() > 0.6 ? Math.round(subtotal * 0.1) : 0;
    const shipping = subtotal > 5_000_000 ? 0 : 45_000;
    const tax = Math.round((subtotal - discount) * 0.09);
    const total = subtotal - discount + shipping + tax;
    const placedAt = iso(rnd(0, 120), rnd(0, 20));
    const paid = status !== 'pending' && status !== 'cancelled';
    run(
      `INSERT INTO orders (id,code,user_id,status,payment_status,subtotal,discount,tax,shipping_cost,total,coupon_code,address,
        shipping_method,shipping_carrier,tracking_code,customer_note,loyalty_used,placed_at,paid_at,shipped_at,delivered_at,cancelled_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      `ES-${String(140000 + i)}`,
      customer.id,
      status,
      paid ? 'paid' : status === 'cancelled' ? 'failed' : 'unpaid',
      subtotal, discount, tax, shipping, total,
      discount ? 'WELCOME10' : null,
      stringifyJson({ receiver: customer.full_name, phone: customer.phone, province: 'تهران', city: 'تهران', line: 'خیابان ولیعصر، پلاک ۱۲', postal_code: '1234567890' }),
      pickOne(['post', 'tipax', 'peyk']),
      pickOne(['پست پیشتاز', 'تیپاکس', 'پیک شهر']),
      status === 'shipped' || status === 'delivered' ? `TRK${rnd(100000, 999999)}` : null,
      Math.random() > 0.7 ? 'لطفاً قبل از ارسال تماس بگیرید.' : null,
      0,
      placedAt,
      paid ? placedAt : null,
      ['shipped', 'delivered'].includes(status) ? iso(rnd(0, 10)) : null,
      status === 'delivered' ? iso(rnd(0, 5)) : null,
      status === 'cancelled' ? iso(rnd(0, 10)) : null,
      placedAt,
    );
    chosen.forEach((p, idx) => {
      const qty = idx === 0 ? 1 : rnd(1, 2);
      run(
        `INSERT INTO order_items (id,order_id,product_id,name_fa,sku,thumbnail,unit_price,qty,total)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        uid('oit'), id, p.id, p.name, p.sku, p.thumb, p.price, qty, p.price * qty,
      );
      run('UPDATE products SET sold_count = sold_count + ? WHERE id = ?', qty, p.id);
    });
    run(
      `INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)`,
      uid('oev'), id, 'pending', 'سفارش ثبت شد.', customer.full_name, placedAt,
    );
    if (paid) {
      run(
        `INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)`,
        uid('oev'), id, 'paid', 'پرداخت با موفقیت انجام شد.', 'درگاه پرداخت', placedAt,
      );
      run(
        `INSERT INTO payments (id,order_id,provider,amount,status,ref_id,created_at,verified_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        uid('pay'), id, 'mock', total, 'paid', `RF${rnd(1000000, 9999999)}`, placedAt, placedAt,
      );
    }
    if (status === 'shipped' || status === 'delivered') {
      run(
        `INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)`,
        uid('oev'), id, 'shipped', 'سفارش تحویل پست شد.', 'انبار EasyShop', iso(rnd(0, 8)),
      );
    }
    if (status === 'delivered') {
      run(
        `INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)`,
        uid('wtx'), customer.id, Math.round(total * 0.02), 'credit', 'کش‌بک خرید', id, Math.round(total * 0.02), iso(rnd(0, 5)),
      );
      run('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?', Math.round(total / 100000), customer.id);
    }
    orders.push({ id, code: `ES-${String(140000 + i)}`, user: customer, status });
  }

  // --- علاقه‌مندی‌ها --------------------------------------------------------
  for (const u of customers) {
    for (let i = 0; i < 3; i += 1) {
      const p = pickOne(productIds);
      try {
        run('INSERT INTO wishlist (id,user_id,product_id,created_at) VALUES (?,?,?,?)', uid('wsh'), u.id, p.id, iso(rnd(0, 30)));
      } catch {
        /* تکراری */
      }
    }
  }

  // --- تیکت‌های پشتیبانی ---------------------------------------------------
  const ticketSeeds = [
    { subject: 'تأخیر در ارسال سفارش ES-140002', category: 'shipping', priority: 'high', status: 'answered', by: users.customer },
    { subject: 'درخواست فاکتور رسمی', category: 'billing', priority: 'normal', status: 'open', by: users.customer2 },
    { subject: 'محصول معیوب دریافت کردم', category: 'returns', priority: 'urgent', status: 'pending', by: users.customer3 },
    { subject: 'راهنمای نصب و راه‌اندازی', category: 'technical', priority: 'low', status: 'resolved', by: users.customer },
    { subject: 'کد تخفیف اعمال نشد', category: 'coupon', priority: 'normal', status: 'closed', by: users.customer2 },
  ];
  ticketSeeds.forEach((t, i) => {
    const id = uid('tkt');
    const createdAt = iso(rnd(3, 40), rnd(0, 20));
    run(
      `INSERT INTO tickets (id,code,user_id,subject,category,priority,status,assigned_to,last_message_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, `TK-${1000 + i}`, t.by.id, t.subject, t.category, t.priority, t.status, users.support.id, createdAt, createdAt, createdAt,
    );
    run(
      `INSERT INTO ticket_messages (id,ticket_id,user_id,author_name,author_role,body,created_at) VALUES (?,?,?,?,?,?,?)`,
      uid('tms'), id, t.by.id, t.by.full_name, 'customer',
      `سلام، ${t.subject}. لطفاً راهنمایی کنید. با تشکر.`, createdAt,
    );
    if (['answered', 'resolved', 'closed', 'pending'].includes(t.status)) {
      run(
        `INSERT INTO ticket_messages (id,ticket_id,user_id,author_name,author_role,body,created_at) VALUES (?,?,?,?,?,?,?)`,
        uid('tms'), id, users.support.id, users.support.full_name, 'support',
        'سلام و وقت بخیر 🌱 درخواست شما ثبت شد و در حال بررسی است. نتیجه حداکثر تا ۲۴ ساعت آینده اطلاع داده می‌شود. تیم پشتیبانی EasyShop',
        createdAt,
      );
    }
  });

  // --- گفتگوهای چت زنده ---------------------------------------------------
  const convSeeds = [
    { user: users.customer, subject: 'مشاوره خرید لپ‌تاپ', status: 'open', msgs: ['سلام، برای برنامه‌نویسی تا ۵۰ میلیون چه لپ‌تاپی پیشنهاد می‌کنید؟', 'سلام 🌱 مدل ایسوس با رم ۱۶ گیگ انتخاب خوبی است؛ موجودی داریم.', 'ممنون! گارانتی چند ساله است؟'] },
    { user: users.customer2, subject: 'پیگیری کد رهگیری', status: 'pending', msgs: ['کد رهگیری سفارش ES-140004 را می‌خواهم.', 'کد رهگیری شما TRK582913 است و امروز تحویل پست شد.'] },
    { user: users.customer3, subject: 'سؤال درباره مرجوعی', status: 'closed', msgs: ['اگر سایز مناسب نبود می‌توانم مرجوع کنم؟', 'بله، تا ۷ روز پس از تحویل امکان مرجوعی وجود دارد.'] },
  ];
  convSeeds.forEach((c) => {
    const id = uid('cnv');
    const lastAt = iso(rnd(0, 6), rnd(1, 20));
    run(
      `INSERT INTO conversations (id,user_id,subject,status,last_message,last_message_at,unread_admin,unread_user,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      id, c.user.id, c.subject, c.status, c.msgs.at(-1), lastAt, c.status === 'open' ? 1 : 0, c.status === 'pending' ? 1 : 0, lastAt,
    );
    c.msgs.forEach((body, idx) => {
      const fromUser = idx % 2 === 0;
      run(
        `INSERT INTO messages (id,conversation_id,sender_id,sender_name,sender_role,body,type,meta,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        uid('msg'), id,
        fromUser ? c.user.id : users.support.id,
        fromUser ? c.user.full_name : users.support.full_name,
        fromUser ? 'customer' : 'support',
        body, 'text', '{}', new Date(new Date(lastAt).getTime() - (c.msgs.length - idx) * 36e5).toISOString(),
      );
    });
  });

  // --- اعلان‌ها -------------------------------------------------------------
  const notifications = [
    { user: users.customer, title: 'سفارش شما ارسال شد', body: 'سفارش ES-140001 تحویل پست پیشتاز شد.', type: 'order', link: '/account/orders' },
    { user: users.customer, title: 'کد تخفیف ویژه', body: 'با کد WELCOME10 ده درصد تخفیف بگیرید.', type: 'promo', link: '/products' },
    { user: users.customer2, title: 'پاسخ پشتیبانی', body: 'تیکت TK-1001 پاسخ داده شد.', type: 'ticket', link: '/account/tickets' },
    { user: users.admin, title: 'موجودی کم', body: '۳ محصول زیر حد آستانه‌ی موجودی هستند.', type: 'inventory', link: '/admin/products' },
  ];
  notifications.forEach((n) =>
    run(
      'INSERT INTO notifications (id,user_id,title,body,type,link,created_at) VALUES (?,?,?,?,?,?,?)',
      uid('ntf'), n.user.id, n.title, n.body, n.type, n.link, iso(rnd(0, 10)),
    ),
  );

  // --- تنظیمات فروشگاه ----------------------------------------------------
  setSetting('store', {
    name: 'فروشگاه EasyShop',
    name_en: 'EasyShop',
    tagline: 'هر آنچه می‌خواهید، سریع و مطمئن',
    email: 'info@easyshop.ir',
    phone: '021-91001000',
    address: 'تهران، خیابان ولیعصر، برج تجاری نیکان، طبقه ۷',
    instagram: 'easyshop.ir',
    telegram: 'easyshop',
    whatsapp: '+982191001000',
    working_hours: 'شنبه تا پنجشنبه ۹ تا ۱۸',
  });
  setSetting('commerce', {
    currency: 'IRT',
    currency_label: 'تومان',
    tax_percent: 9,
    free_shipping_threshold: 5_000_000,
    shipping_flat: 45_000,
    cod_enabled: true,
    loyalty_rate: 1,
    cashback_percent: 2,
  });
  setSetting('appearance', {
    primary: '#6366f1',
    accent: '#f97316',
    dark_mode_default: true,
    homepage_banner: 'جشنواره پایان فصل تا ۴۰٪ تخفیف',
  });
}

export function runSeed({ force = false } = {}) {
  seedProviders();
  if (!force && isSeeded()) return { seeded: false, reason: 'داده‌ها از قبل موجود است.' };
  tx(() => {
    if (force) {
      const tables = [
        'order_events', 'order_items', 'payments', 'orders', 'cart_items', 'carts', 'wishlist', 'reviews',
        'inventory_movements', 'product_variants', 'products', 'categories', 'addresses', 'coupons',
        'coupon_redemptions', 'tickets', 'ticket_messages', 'messages', 'conversations', 'notifications',
        'wallet_transactions', 'audit_logs', 'ai_logs', 'ai_generations',
      ];
      for (const t of tables) run(`DELETE FROM ${t}`);
      run("DELETE FROM users WHERE email NOT LIKE '%@easyshop.ir'");
      run("DELETE FROM users WHERE email IN ('admin@easyshop.ir','support@easyshop.ir','seller@easyshop.ir','user@easyshop.ir','reza@easyshop.ir','mina@easyshop.ir')");
    }
    seedDemoData();
  });
  return { seeded: true };
}

// اجرای مستقیم: node src/db/seed.js
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const force = process.argv.includes('--force');
  const res = runSeed({ force });
  const counts = {
    users: get('SELECT COUNT(*) c FROM users').c,
    products: get('SELECT COUNT(*) c FROM products').c,
    categories: get('SELECT COUNT(*) c FROM categories').c,
    orders: get('SELECT COUNT(*) c FROM orders').c,
    reviews: get('SELECT COUNT(*) c FROM reviews').c,
    tickets: get('SELECT COUNT(*) c FROM tickets').c,
    conversations: get('SELECT COUNT(*) c FROM conversations').c,
    providers: get('SELECT COUNT(*) c FROM ai_providers').c,
  };
  console.log('✅ seed:', res, counts);
}

export default { runSeed, seedProviders, seedDemoData };
