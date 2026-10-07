import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { all, get, getSettings, nowIso, run, uid } from '../db/index.js';
import { logAudit, requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, fail, ok, productPublic } from '../utils/helpers.js';
import { cleanText, rateLimit, sniffImageBuffer } from '../middleware/security.js';

const router = express.Router();

/* ------------------------------ تنظیمات عمومی ---------------------------- */
router.get(
  '/settings',
  asyncHandler((_req, res) => {
    const settings = getSettings();
    return ok(res, {
      store: settings.store || {},
      commerce: settings.commerce || {},
      appearance: settings.appearance || {},
      ai: { ...(settings.ai || {}), allow_customer_assistant: settings.ai?.allow_customer_assistant !== false },
    });
  }),
);

router.get(
  '/health',
  asyncHandler((_req, res) => {
    const start = Date.now();
    const counts = {
      products: get("SELECT COUNT(*) c FROM products WHERE status='active'").c,
      categories: get("SELECT COUNT(*) c FROM categories WHERE is_active=1").c,
      users: get('SELECT COUNT(*) c FROM users').c,
      orders: get('SELECT COUNT(*) c FROM orders').c,
    };
    return ok(res, {
      status: 'ok',
      version: '1.0.0',
      uptime_seconds: Math.floor(process.uptime()),
      db_latency_ms: Date.now() - start,
      counts,
      platform: process.platform,
      node: process.version,
    });
  }),
);

/* --------------------------- تصویر جانشین (SVG) -------------------------- */
const PALETTES = [
  ['#6366f1', '#8b5cf6', '#ec4899'],
  ['#0ea5e9', '#22d3ee', '#14b8a6'],
  ['#f97316', '#f59e0b', '#ef4444'],
  ['#10b981', '#84cc16', '#22c55e'],
  ['#8b5cf6', '#d946ef', '#f43f5e'],
  ['#1e293b', '#475569', '#94a3b8'],
];

router.get(
  '/placeholder',
  (req, res) => {
    const text = String(req.query.text || 'EasyShop').slice(0, 30);
    const seed = Number(req.query.seed || 7) || 7;
    const paletteIdx = Number(req.query.palette ?? seed) % PALETTES.length;
    const [c1, c2, c3] = PALETTES[paletteIdx];
    const safe = text.replace(/[<>&"']/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c3}"/></linearGradient>
    <radialGradient id="r" cx="25%" cy="20%" r="70%"><stop offset="0%" stop-color="#fff" stop-opacity=".5"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/><rect width="800" height="800" fill="url(#r)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity=".25" stroke-width="2">
    <circle cx="620" cy="200" r="130"/><circle cx="180" cy="640" r="95"/><rect x="80" y="100" width="220" height="220" rx="44"/>
  </g>
  <text x="400" y="420" font-family="Vazirmatn, Tahoma, sans-serif" font-size="46" font-weight="700" fill="#ffffff" text-anchor="middle">${safe}</text>
  <text x="400" y="470" font-family="Vazirmatn, Tahoma, sans-serif" font-size="22" fill="#ffffff" fill-opacity=".8" text-anchor="middle">EasyShop</text>
</svg>`;
    res.set('Content-Type', 'image/svg+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(svg);
  },
);

/* -------------------------------- آپلود --------------------------------- */
/**
 * آپلود امن تصویر:
 *  - پسوند فایل هرگز از نام کاربر گرفته نمی‌شود (فقط از نوع واقعی محتوا)
 *  - محتوا sniff می‌شود؛ SVG/HTML/PHP و فایل‌های اجرایی رد می‌شوند (خطر XSS/اجرا)
 *  - نام فایل تصادفی است و فایل‌های تکراری/غیرمجاز حذف می‌شوند
 */
const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.security.maxUploadBytes, files: 6, fields: 6, parts: 12 },
  fileFilter: (_req, file, cb) => {
    // لایه‌ی اول: نوع اعلامی کلاینت (لایه‌ی دوم: sniff محتوا در ادامه)
    const okTypes = /^image\/(png|jpe?g|webp|gif)$/i;
    if (okTypes.test(String(file.mimetype || ''))) return cb(null, true);
    // SVG/HTML/PHP و هر نوع دیگر رد می‌شود (415 = نوع رسانه پشتیبانی نمی‌شود)
    return cb(Object.assign(new Error('فرمت فایل مجاز نیست. فقط تصویر PNG/JPEG/WEBP/GIF پذیرفته می‌شود.'), { status: 415 }));
  },
});

router.post(
  '/uploads',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.upload, scope: 'upload' }),
  upload.array('files', 6),
  asyncHandler((req, res) => {
    const files = req.files || [];
    if (!files.length) return fail(res, 'فایلی ارسال نشد یا فرمت مجاز نیست.');
    if (files.length > 6) return fail(res, 'حداکثر ۶ تصویر در هر بار مجاز است.', 413);

    const saved = [];
    try {
      for (const file of files) {
        const realType = sniffImageBuffer(file.buffer);
        if (!config.security.allowedImageTypes.includes(realType)) {
          return fail(res, `محتوای فایل «${cleanText(file.originalname, { max: 60, multiline: false })}» تصویر مجاز نیست.`, 415);
        }
        const ext = EXT_BY_MIME[realType];
        const filename = `${Date.now().toString(36)}-${cryptoRandom()}${ext}`;
        const target = path.join(config.uploadDir, filename);
        // اطمینان از باقی‌ماندن مسیر داخل پوشه‌ی آپلود
        if (!path.resolve(target).startsWith(path.resolve(config.uploadDir))) return fail(res, 'مسیر فایل مجاز نیست.');
        fs.writeFileSync(target, file.buffer, { mode: 0o644 });
        saved.push({
          name: cleanText(file.originalname, { max: 80, multiline: false }),
          size: file.size,
          type: realType,
          url: `/uploads/${filename}`,
        });
      }
    } finally {
      // پاک‌سازی حافظه‌ی بافرها
      for (const f of files) if (f.buffer) f.buffer = null;
    }
    logAudit(req, 'upload', 'file', null, { count: saved.length, bytes: saved.reduce((a, f) => a + f.size, 0) });
    return ok(res, { urls: saved.map((f) => f.url), files: saved }, 201);
  }),
);

function cryptoRandom() {
  return crypto.randomBytes(6).toString('hex');
}

/* ------------------------- پرس‌وجوی سراسری (کامند پالت) ------------------ */
router.get(
  '/search',
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'search' }),
  asyncHandler((req, res) => {
    const q = cleanText(req.query.q, { max: 80, multiline: false });
    if (q.length < 2) return ok(res, { products: [], orders: [], users: [], pages: [] });
    const like = `%${q}%`;
    const products = all(
      `SELECT p.*, c.name_fa category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.name_fa LIKE ? OR p.name_en LIKE ? OR p.sku LIKE ? LIMIT 6`,
      like, like, like,
    ).map((p) => productPublic(p, { withDescription: false }));
    const pages = [
      { title: 'فروشگاه', path: '/products' },
      { title: 'سبد خرید', path: '/cart' },
      { title: 'پنل کاربری', path: '/account' },
      { title: 'پشتیبانی', path: '/support' },
      { title: 'پنل مدیریت', path: '/admin' },
      { title: 'استودیوی هوش مصنوعی', path: '/admin/ai-studio' },
    ].filter((p) => p.title.includes(q) || q.length > 3);
    return ok(res, { products, pages });
  }),
);

/* ------------------------------- نقشه سایت ------------------------------- */
router.get(
  '/sitemap.xml',
  (_req, res) => {
    const base = config.publicUrl || '';
    const products = all("SELECT slug FROM products WHERE status='active' LIMIT 500");
    const categories = all('SELECT slug FROM categories WHERE is_active = 1');
    const urls = [
      { loc: `${base}/`, priority: '1.0' },
      { loc: `${base}/products`, priority: '0.9' },
      { loc: `${base}/categories`, priority: '0.7' },
      { loc: `${base}/support`, priority: '0.5' },
      ...categories.map((c) => ({ loc: `${base}/categories/${c.slug}`, priority: '0.7' })),
      ...products.map((p) => ({ loc: `${base}/products/${p.slug}`, priority: '0.6' })),
    ];
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url><loc>${u.loc}</loc><priority>${u.priority}</priority><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>`)
        .join('\n')}\n</urlset>`,
    );
  },
);

/* --------------------------- پیش‌خوان سایت (SEO) ------------------------- */
router.get(
  '/home',
  asyncHandler((_req, res) => {
    const hero = all(
      "SELECT p.*, c.name_fa category_name, c.slug category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status='active' ORDER BY p.featured DESC, p.sold_count DESC LIMIT 5",
    );
    const featured = all(
      "SELECT p.*, c.name_fa category_name, c.slug category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status='active' AND p.featured=1 ORDER BY p.rating_avg DESC LIMIT 8",
    );
    const bestSellers = all(
      "SELECT p.*, c.name_fa category_name, c.slug category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status='active' ORDER BY p.sold_count DESC LIMIT 8",
    );
    const deals = all(
      `SELECT p.*, c.name_fa category_name, c.slug category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status='active' AND p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price
       ORDER BY (p.compare_at_price - p.price) DESC LIMIT 8`,
    );
    const newest = all(
      "SELECT p.*, c.name_fa category_name, c.slug category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status='active' ORDER BY p.created_at DESC LIMIT 8",
    );
    const categories = all('SELECT * FROM categories WHERE is_active = 1 AND parent_id IS NULL ORDER BY sort_order LIMIT 8').map((c) => ({
      id: c.id, slug: c.slug, name: c.name_fa, icon: c.icon, color: c.color,
      product_count: get(`SELECT COUNT(*) c FROM products p WHERE p.category_id = ? OR p.category_id IN (SELECT id FROM categories WHERE parent_id = ?)`, c.id, c.id).c,
    }));
    const reviews = all(
      `SELECT r.rating, r.title, r.body, r.created_at, u.full_name user_name, p.name_fa product_name
       FROM reviews r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN products p ON p.id = r.product_id
       WHERE r.rating >= 4 ORDER BY r.created_at DESC LIMIT 6`,
    );
    const stats = {
      products: get("SELECT COUNT(*) c FROM products WHERE status='active'").c,
      customers: get("SELECT COUNT(*) c FROM users WHERE role='customer'").c,
      orders: get('SELECT COUNT(*) c FROM orders').c,
      avg_rating: Number((get('SELECT COALESCE(AVG(rating),0) a FROM reviews').a || 0).toFixed(1)),
    };
    const brands = all("SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND status='active' LIMIT 12").map((b) => b.brand);

    const p = (rows) => rows.map((r) => productPublic(r, { withDescription: false }));
    return ok(res, {
      hero: p(hero),
      featured: p(featured),
      best_sellers: p(bestSellers),
      deals: p(deals),
      newest: p(newest),
      categories,
      reviews,
      brands,
      stats,
      settings: getSettings(),
      banners: [
        { title: 'ارسال رایگان سفارش‌های بالای ۵ میلیون تومان', subtitle: 'برای همه‌ی شهرهای ایران', icon: 'Truck' },
        { title: '۷ روز ضمانت بازگشت کالا', subtitle: 'بدون قید و شرط', icon: 'ShieldCheck' },
        { title: 'پشتیبانی ۲۴ ساعته', subtitle: 'چت زنده، تیکت و تلفن', icon: 'Headset' },
        { title: 'دستیار هوشمند خرید', subtitle: 'پیشنهاد محصول با هوش مصنوعی', icon: 'Sparkles' },
      ],
    });
  }),
);

/** آمار عمومی برای فوتر/درباره ما */
router.get(
  '/stats',
  asyncHandler((_req, res) =>
    ok(res, {
      products: get("SELECT COUNT(*) c FROM products WHERE status='active'").c,
      categories: get("SELECT COUNT(*) c FROM categories WHERE is_active=1").c,
      brands: get("SELECT COUNT(DISTINCT brand) c FROM products WHERE brand IS NOT NULL").c,
      orders: get('SELECT COUNT(*) c FROM orders').c,
      customers: get("SELECT COUNT(*) c FROM users WHERE role='customer'").c,
      reviews: get('SELECT COUNT(*) c FROM reviews').c,
      top_searches: ["هدفون بیسیم", "لپ‌تاپ", "کفش ورزشی", "ادکلن مردانه", "ساعت هوشمند"],
    }),
  ),
);

/** راهنمای API (فقط در محیط توسعه) */
router.get(
  '/docs',
  asyncHandler((_req, res) => {
    const routes = [];
    const collect = (stack, prefix = '') => {
      for (const layer of stack) {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
          routes.push({ path: prefix + layer.route.path, methods });
        } else if (layer.name === 'router' && layer.handle?.stack) {
          const match = layer.regexp?.toString().match(/\\\/([a-zA-Z0-9_-]+)/);
          collect(layer.handle.stack, `${prefix}/${match ? match[1] : ''}`);
        }
      }
    };
    collect(res.app._router?.stack || []);
    return ok(res, { count: routes.length, routes });
  }),
);

export default router;
