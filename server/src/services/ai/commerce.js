/**
 * لایه‌ی کسب‌وکار هوش مصنوعی EasyShop.
 * وظایف آماده: تولید محصول کامل، تصویر محصول، کمپین بازاریابی، پاسخ پشتیبانی،
 * دستیار فروشگاهی، تحلیل نظرات، پیشنهاد قیمت، دسته‌بندی و سئو.
 */
import { all, get, uid, nowIso } from '../../db/index.js';
import { aiComplete, aiImage } from './gateway.js';
import { builtinProduct, builtinText } from './builtin.js';
import { FEATURED_MODELS } from './providers.js';

const SYSTEM_STORE = `تو «دستیار هوشمند فروشگاه EasyShop» هستی؛ یک کارشناس فروش و کاتالوگ فارسی‌زبان.
همیشه فارسی روان، محترمانه و دقیق بنویس. هرگز قیمت یا موجودی خیالی از خودت نساز؛ اگر داده‌ای در اختیار داری از همان استفاده کن.`;

function categoriesContext() {
  const cats = all('SELECT slug, name_fa, parent_id FROM categories ORDER BY sort_order').slice(0, 60);
  return cats.map((c) => `${c.slug} (${c.name_fa})`).join('، ');
}

function productsContext(limit = 12) {
  return all(
    `SELECT p.name_fa, p.price, p.stock, c.name_fa AS cat
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.status = 'active' ORDER BY p.sold_count DESC LIMIT ?`,
    limit,
  )
    .map((p) => `- ${p.name_fa} | ${Number(p.price).toLocaleString('fa-IR')} تومان | موجودی ${p.stock} | دسته: ${p.cat || 'نامشخص'}`)
    .join('\n');
}

const PRODUCT_SCHEMA = `{
  "name_fa": "نام کامل فارسی محصول",
  "name_en": "English product name",
  "slug": "english-slug",
  "brand": "برند",
  "price": 1500000,
  "compare_at_price": 1800000,
  "cost": 900000,
  "stock": 20,
  "unit": "عدد",
  "warranty": "۲۴ ماه گارانتی",
  "shipping_days": 2,
  "short_desc_fa": "توضیح کوتاه یک‌خطی (حداکثر ۱۲۰ کاراکتر)",
  "short_desc_en": "short english description",
  "description_fa": "توضیحات کامل HTML با تگ‌های h3/p/ul",
  "description_en": "full english description with html",
  "specs": { "وزن": "۵۰۰ گرم", "جنس": "..." },
  "tags": ["تگ۱", "تگ۲"],
  "seo": { "title": "...", "description": "...", "keywords": ["..."] },
  "marketing": { "hook": "...", "bullets": ["..."], "cta": "...", "social_post": "..." },
  "image_prompt": "english prompt for product photo generation",
  "variants": [ { "name_fa": "استاندارد", "name_en": "Standard", "price_delta": 0, "stock": 10 } ],
  "faq": [ { "q": "سؤال", "a": "پاسخ" } ]
}`;

/** ۱) تولید کامل محصول (متن + ساختار کاتالوگ) */
export async function generateProduct(options = {}) {
  const { brief = '', category = '', count = 1, price, brand, slug = 'builtin', model, userId } = options;
  const prompt = `برای فروشگاه اینترنتی EasyShop یک محصول ${count > 1 ? '' : 'کامل'} در دسته‌بندی «${category || 'دلخواه'}» طراحی کن.
توضیح کاربر: ${brief || 'بدون توضیح اضافه'}
${price ? `قیمت هدف: ${price} تومان` : ''}
${brand ? `برند: ${brand}` : ''}
دسته‌بندی‌های موجود فروشگاه: ${categoriesContext()}

خروجی را فقط به شکل یک شیء JSON معتبر و مطابق این ساختار برگردان (بدون توضیح اضافه، بدون بلوک کد):
${PRODUCT_SCHEMA}

نکات: قیمت‌ها به تومان و عدد صحیح باشند. توضیحات کامل، حرفه‌ای، سئوشده و بدون ادعای غیرواقعی باشد. حداقل ۵ ویژگی در specs و ۲ واریانت ارائه بده.`;

  const result = await aiComplete({
    slug,
    model,
    kind: 'product_generation',
    userId,
    json: true,
    system: SYSTEM_STORE,
    temperature: 0.75,
    maxTokens: 4000,
    messages: [{ role: 'user', content: prompt }],
    builtinResult: () => {
      const data = builtinProduct({ brief, category, price, brand, count });
      return { text: JSON.stringify(data), data };
    },
  });

  let data = result.data;
  if (!data || typeof data !== 'object' || !data.name_fa) {
    data = builtinProduct({ brief, category, price, brand, count });
  }
  const normalized = {
    name_fa: data.name_fa || brief || 'محصول جدید',
    name_en: data.name_en || '',
    slug: data.slug || '',
    brand: data.brand || brand || '',
    price: Math.max(0, Math.round(Number(data.price) || 0)),
    compare_at_price: data.compare_at_price ? Math.round(Number(data.compare_at_price)) : null,
    cost: data.cost ? Math.round(Number(data.cost)) : null,
    stock: Number.isFinite(Number(data.stock)) ? Math.max(0, Math.round(Number(data.stock))) : 10,
    unit: data.unit || 'عدد',
    warranty: data.warranty || '',
    shipping_days: Number(data.shipping_days) || 3,
    short_desc_fa: data.short_desc_fa || '',
    short_desc_en: data.short_desc_en || '',
    description_fa: data.description_fa || '',
    description_en: data.description_en || '',
    specs: data.specs && typeof data.specs === 'object' ? data.specs : {},
    tags: Array.isArray(data.tags) ? data.tags : [],
    seo: data.seo || {},
    marketing: data.marketing || {},
    image_prompt: data.image_prompt || '',
    variants: Array.isArray(data.variants) ? data.variants : [],
    faq: Array.isArray(data.faq) ? data.faq : [],
    notes: data.notes || '',
  };

  const id = uid('gen');
  return {
    ok: result.ok !== false,
    generator: { provider: result.provider, providerName: result.providerName, model: result.model, fallback_attempts: result.attempts || [] },
    cost: result.cost ?? 0,
    usage: result.usage,
    product: normalized,
    generationId: id,
  };
}

/** ۲) تولید تصویر محصول */
export async function generateProductImage(options = {}) {
  const { prompt = '', label = '', slug = 'builtin', model, userId, size } = options;
  const finalPrompt =
    prompt ||
    `${label || 'product'}, professional e-commerce product photography, studio light, soft shadows, white seamless background, 4k, centered composition`;
  const res = await aiImage({ slug, model, prompt: finalPrompt, label: label || prompt, userId, size });
  return { ...res, prompt: finalPrompt };
}

/** ۳) کمپین بازاریابی */
export async function marketingCopy({ topic = '', channel = 'all', slug = 'builtin', model, userId }) {
  const prompt = `برای فروشگاه EasyShop یک بسته‌ی محتوای بازاریابی حرفه‌ای درباره «${topic}» آماده کن.
کانال هدف: ${channel}. محصولات پرفروش فعلی:
${productsContext(8)}

خروجی JSON با این کلیدها: {"headline":"", "subheadline":"", "body":"", "bullets":[""], "cta":"", "sms":"حداکثر ۱۴۰ کاراکتر", "push":"حداکثر ۸۰ کاراکتر", "instagram":"پست با هشتگ", "email_subject":""}`;
  const result = await aiComplete({
    slug,
    model,
    kind: 'marketing',
    userId,
    json: true,
    system: SYSTEM_STORE,
    messages: [{ role: 'user', content: prompt }],
    builtinResult: () => ({ text: builtinText({ kind: 'marketing', input: topic }) }),
  });
  return { ok: result.ok !== false, generator: { provider: result.provider, model: result.model }, content: result.data, text: result.text };
}

/** ۴) پاسخ پیشنهادی پشتیبانی */
export async function supportReply({ message = '', tone = 'صمیمی و رسمی', slug = 'builtin', model, userId, orderInfo = '' }) {
  const prompt = `یک پیام مشتری برای پشتیبانی EasyShop:
"""${message}"""
${orderInfo ? `اطلاعات سفارش: ${orderInfo}` : ''}
یک پاسخ حرفه‌ای با لحن ${tone} بنویس. پاسخ باید: عذرخواهی/تشکر مناسب، توضیح روشن، گام بعدی مشخص و امضای «تیم پشتیبانی EasyShop» داشته باشد. حداکثر ۶ خط.`;
  const result = await aiComplete({
    slug,
    model,
    kind: 'support_reply',
    userId,
    system: SYSTEM_STORE,
    messages: [{ role: 'user', content: prompt }],
    builtinResult: () => ({ text: builtinText({ kind: 'support', input: message }) }),
  });
  return { ok: result.ok !== false, generator: { provider: result.provider, model: result.model }, reply: result.text || result.data?.text };
}

/** ۵) دستیار خرید مشتری (چت هوشمند فروشگاه) */
export async function storeAssistant({ message, history = [], slug = 'builtin', model, userId }) {
  const prompt = `پرسش مشتری: ${message}

اطلاعات فروشگاه:
- دسته‌بندی‌ها: ${categoriesContext()}
- پرفروش‌ها:
${productsContext(10)}

پاسخ کوتاه (حداکثر ۵ خط)، صمیمی و راهنما بده. اگر مشتری به محصول خاصی علاقه دارد، ۲ تا ۳ گزینه از لیست بالا پیشنهاد بده و دلیل انتخاب را بگو. اگر اطلاعات کافی نیست، یک سؤال دقیق‌تر بپرس.`;
  const result = await aiComplete({
    slug,
    model,
    kind: 'assistant',
    userId,
    system: SYSTEM_STORE,
    messages: [...history.slice(-6), { role: 'user', content: prompt }],
    builtinResult: () => ({ text: builtinText({ kind: 'assistant', input: message }) }),
  });
  const suggestions = all(
    "SELECT id, slug, name_fa, price, thumbnail FROM products WHERE status='active' ORDER BY sold_count DESC LIMIT 3",
  );
  return { ok: result.ok !== false, generator: { provider: result.provider, model: result.model }, reply: result.text, suggestions };
}

/** ۶) تحلیل نظرات کاربران */
export async function analyzeReviews({ productId, slug = 'builtin', model, userId }) {
  const product = get('SELECT * FROM products WHERE id = ? OR slug = ?', productId, productId);
  if (!product) return { ok: false, error: 'محصول یافت نشد.' };
  const reviews = all('SELECT rating, title, body FROM reviews WHERE product_id = ? ORDER BY created_at DESC LIMIT 40', product.id);
  if (!reviews.length) return { ok: false, error: 'برای این محصول نظری ثبت نشده است.' };
  const digest = reviews.map((r) => `[${r.rating}/5] ${r.title || ''} ${r.body || ''}`).join('\n').slice(0, 6000);
  const result = await aiComplete({
    slug,
    model,
    kind: 'review_analysis',
    userId,
    json: true,
    system: SYSTEM_STORE,
    messages: [
      {
        role: 'user',
        content: `نظرات محصول «${product.name_fa}» را تحلیل کن و JSON با کلیدهای زیر بده:
{"summary":"خلاصه یک پاراگرافی","pros":["..."],"cons":["..."],"sentiment":0.0,"top_complaint":"","action_items":["..."]}
نظرات:
${digest}`,
      },
    ],
    builtinResult: () => {
      const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      return {
        text: 'تحلیل داخلی',
        data: {
          summary: `بر اساس ${reviews.length} نظر، میانگین امتیاز ${avg.toFixed(1)} از ۵ است.`,
          pros: ['کیفیت ساخت', 'ارسال سریع'],
          cons: ['قیمت نسبتاً بالا'],
          sentiment: Number(((avg - 3) / 2).toFixed(2)),
          top_complaint: 'قیمت',
          action_items: ['پیگیری بهبود بسته‌بندی', 'افزودن واریانت اقتصادی'],
        },
      };
    },
  });
  return { ok: result.ok !== false, generator: { provider: result.provider, model: result.model }, analysis: result.data, raw: result.text };
}

/** ۷) پیشنهاد قیمت‌گذاری */
export async function suggestPrice({ productId, slug = 'builtin', model, userId }) {
  const product = get('SELECT * FROM products WHERE id = ? OR slug = ?', productId, productId);
  if (!product) return { ok: false, error: 'محصول یافت نشد.' };
  const peers = all(
    'SELECT name_fa, price FROM products WHERE category_id = ? AND id != ? LIMIT 12',
    product.category_id,
    product.id,
  );
  const result = await aiComplete({
    slug,
    model,
    kind: 'pricing',
    userId,
    json: true,
    system: SYSTEM_STORE,
    messages: [
      {
        role: 'user',
        content: `قیمت‌گذاری محصول زیر را تحلیل کن:
${JSON.stringify({ name: product.name_fa, price: product.price, cost: product.cost, stock: product.stock, sold: product.sold_count })}
قیمت رقبا در همان دسته: ${JSON.stringify(peers)}
خروجی JSON: {"suggested_price":0,"min_price":0,"max_price":0,"reason":"...","strategy":"..."}`,
      },
    ],
    builtinResult: () => {
      const avg = peers.length ? peers.reduce((s, p) => s + p.price, 0) / peers.length : product.price;
      const suggested = Math.round(Math.max(avg * 0.97, product.price * 0.95) / 1000) * 1000;
      return {
        text: 'پیشنهاد داخلی',
        data: {
          suggested_price: suggested,
          min_price: Math.round(suggested * 0.9),
          max_price: Math.round(suggested * 1.12),
          reason: `میانگین قیمت ${peers.length} محصول مشابه ${Math.round(avg).toLocaleString('fa-IR')} تومان است.`,
          strategy: 'قیمت‌گذاری رقابتی با مارک‌آپ ۳۸٪ روی بهای تمام‌شده',
        },
      };
    },
  });
  return { ok: result.ok !== false, generator: { provider: result.provider, model: result.model }, pricing: result.data };
}

/** ۸) تولید درخت دسته‌بندی */
export async function generateCategories({ topic = '', slug = 'builtin', model, userId, count = 6 }) {
  const result = await aiComplete({
    slug,
    model,
    kind: 'category_generation',
    userId,
    json: true,
    system: SYSTEM_STORE,
    messages: [
      {
        role: 'user',
        content: `برای فروشگاهی با تمرکز روی «${topic}» تعداد ${count} دسته‌بندی اصلی پیشنهاد بده و برای هرکدام ۳ زیردسته.
خروجی JSON: {"categories":[{"name_fa":"","name_en":"","slug":"","icon":"نام آیکون lucide مثل ShoppingBag","color":"#hex","subcategories":[{"name_fa":"","slug":""}]}]}`,
      },
    ],
    builtinResult: () => ({
      text: 'دسته‌بندی داخلی',
      data: {
        categories: [
          { name_fa: 'کالای دیجیتال', name_en: 'Digital', slug: 'digital', icon: 'Smartphone', color: '#6366f1', subcategories: [{ name_fa: 'موبایل', slug: 'mobile' }, { name_fa: 'لپ‌تاپ', slug: 'laptop' }, { name_fa: 'تبلت', slug: 'tablet' }] },
          { name_fa: 'خانه و آشپزخانه', name_en: 'Home', slug: 'home', icon: 'Home', color: '#0ea5e9', subcategories: [{ name_fa: 'لوازم آشپزخانه', slug: 'kitchen' }, { name_fa: 'دکوراسیون', slug: 'decor' }, { name_fa: 'نظافت', slug: 'cleaning' }] },
          { name_fa: 'مد و پوشاک', name_en: 'Fashion', slug: 'fashion', icon: 'Shirt', color: '#ec4899', subcategories: [{ name_fa: 'مردانه', slug: 'men' }, { name_fa: 'زنانه', slug: 'women' }, { name_fa: 'کفش', slug: 'shoes' }] },
          { name_fa: 'زیبایی و سلامت', name_en: 'Beauty', slug: 'beauty', icon: 'Heart', color: '#f97316', subcategories: [{ name_fa: 'مراقبت پوست', slug: 'skincare' }, { name_fa: 'عطر', slug: 'perfume' }, { name_fa: 'مو', slug: 'hair' }] },
          { name_fa: 'ورزش و سفر', name_en: 'Sport', slug: 'sport', icon: 'Dumbbell', color: '#10b981', subcategories: [{ name_fa: 'تجهیزات ورزشی', slug: 'gear' }, { name_fa: 'کوهنوردی', slug: 'hiking' }, { name_fa: 'چمدان', slug: 'luggage' }] },
          { name_fa: 'کتاب و لوازم‌التحریر', name_en: 'Books', slug: 'books', icon: 'BookOpen', color: '#8b5cf6', subcategories: [{ name_fa: 'رمان', slug: 'novel' }, { name_fa: 'کودک', slug: 'kids' }, { name_fa: 'نوشت‌افزار', slug: 'stationery' }] },
        ].slice(0, count),
      },
    }),
  });
  return { ok: result.ok !== false, generator: { provider: result.provider, model: result.model }, categories: result.data?.categories || [] };
}

/** ۹) بسته‌ی سئو برای یک محصول/دسته */
export async function seoBundle({ topic = '', slug = 'builtin', model, userId }) {
  const result = await aiComplete({
    slug,
    model,
    kind: 'seo',
    userId,
    json: true,
    system: SYSTEM_STORE,
    messages: [
      {
        role: 'user',
        content: `برای موضوع «${topic}» بسته‌ی سئوی فارسی تولید کن.
JSON: {"title":"","meta_description":"","keywords":["",""],"h1":"","intro":"","faq":[{"q":"","a":""}],"internal_links":[""]}`,
      },
    ],
    builtinResult: () => ({
      text: 'سئو داخلی',
      data: {
        title: `خرید ${topic} با بهترین قیمت | EasyShop`,
        meta_description: `راهنمای کامل خرید ${topic}، مقایسه مدل‌ها، قیمت روز و ارسال سریع از فروشگاه EasyShop.`,
        keywords: [`خرید ${topic}`, `قیمت ${topic}`, `${topic} اصل`],
        h1: `راهنمای جامع ${topic}`,
        intro: `در این صفحه همه‌ی نکات لازم برای انتخاب ${topic} را جمع کرده‌ایم.`,
        faq: [{ q: 'ارسال چقدر طول می‌کشد؟', a: '۱ تا ۴ روز کاری.' }],
        internal_links: ['/products', '/categories'],
      },
    }),
  });
  return { ok: result.ok !== false, generator: { provider: result.provider, model: result.model }, seo: result.data };
}

/** فهرست مدل‌های آماده برای انتخاب در UI */
export function modelOptions() {
  const providers = all('SELECT slug, name_fa, models, default_model, enabled FROM ai_providers ORDER BY priority').map((r) => ({
    slug: r.slug,
    name: r.name_fa,
    models: JSON.parse(r.models || '[]'),
    defaultModel: r.default_model,
    enabled: Boolean(r.enabled),
  }));
  return { providers, featured: FEATURED_MODELS };
}
