import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { all, get, getSettings, nowIso, run, uid } from '../db/index.js';
import { logAudit, requireAuth } from '../middleware/auth.js';
import { asyncHandler, fail, ok, productPublic } from '../utils/helpers.js';
import { cleanText, rateLimit, sniffImageBuffer } from '../middleware/security.js';
import { generateInvoiceQrSvg } from '../services/qr-code.js';
import { getSystemResourceMetrics, measureEventLoopLag } from '../services/system-metrics.js';
import { smsOtpService } from '../services/sms-otp.js';
import { flashSaleService } from '../services/flash-sale.js';
import { isValidIranianNationalCode } from '../services/iran-validators.js';
import { proformaInvoiceService } from '../services/proforma-invoice.js';
import { isValidIranianPostalCode, guessProvinceByPostalCode } from '../services/postal-code.js';
import { disputeService } from '../services/disputes.js';
import { splitPaymentService } from '../services/split-payment.js';
import { tieredDiscountService } from '../services/tiered-discounts.js';
import { iranPostTrackingService } from '../services/post-tracking.js';
import { warrantyService } from '../services/warranty.js';
import { deliveryFeedbackService } from '../services/delivery-feedback.js';
import { holidayThemeService } from '../services/holiday-theme.js';
import { invoiceSigner } from '../services/invoice-signer.js';
import { recommendationService } from '../services/recommendations.js';
import { multiCurrencyService } from '../services/multi-currency.js';
import { deliveryDateEstimator } from '../services/delivery-estimator.js';
import { moadianTaxService } from '../services/moadian-tax.js';
import { cartSanitizerService } from '../services/cart-sanitizer.js';
import { customerClvService } from '../services/customer-clv.js';
import { giftWrapService } from '../services/gift-wrap.js';
import { abandonedCartService } from '../services/abandoned-cart.js';
import { priceAlertService } from '../services/price-alert.js';
import { couponCleanupService } from '../services/coupon-cleanup.js';
import { photoReviewService } from '../services/photo-review.js';
import { productSpecSheetService } from '../services/spec-sheet.js';
import { cartReservationService } from '../services/cart-reservation.js';
import { shahkarVerificationService } from '../services/shahkar-verification.js';
import { salesExportService } from '../services/sales-export.js';
import { productQnAService } from '../services/product-qna.js';
import { authAnomalyAlertService } from '../services/auth-anomaly.js';
import { gatewayCommissionAnalyzer } from '../services/gateway-commission.js';
import { npsEngine } from '../services/nps-engine.js';
import { aiAutoTaggingService } from '../services/ai-auto-tagging.js';
import { postalAddressMatcher } from '../services/postal-address-matcher.js';
import { multiWarehouseService } from '../services/multi-warehouse.js';
import { watermarkedInvoiceService } from '../services/watermarked-invoice.js';
import { demandForecastService } from '../services/demand-forecast.js';
import { deliverySlaTracker } from '../services/delivery-sla.js';
import { productComparisonMatrix } from '../services/product-comparison.js';
import { returnWindowService } from '../services/return-window.js';
import { affiliateService } from '../services/affiliate.js';
import { bnplCreditScoringService } from '../services/bnpl-scoring.js';
import { warrantyExpiryService } from '../services/warranty-expiry.js';
import { deliveryGeolocationService } from '../services/delivery-geolocation.js';
import { volumePricingService } from '../services/volume-pricing.js';
import { smartBundleService } from '../services/smart-bundle.js';
import { nationalCardVerifier } from '../services/national-card-verifier.js';
import { timeSlotDeliveryService } from '../services/time-slot-delivery.js';
import { exitIntentSurveyService } from '../services/exit-intent-survey.js';
import { vendorSettlementTaxSplitter } from '../services/vendor-settlement-tax.js';

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
  asyncHandler(async (_req, res) => {
    const start = Date.now();
    const counts = {
      products: get("SELECT COUNT(*) c FROM products WHERE status='active'").c,
      categories: get("SELECT COUNT(*) c FROM categories WHERE is_active=1").c,
      users: get('SELECT COUNT(*) c FROM users').c,
      orders: get('SELECT COUNT(*) c FROM orders').c,
    };
    const eventLoopLagMs = await measureEventLoopLag();
    const systemMetrics = getSystemResourceMetrics();

    return ok(res, {
      status: 'ok',
      version: '1.0.0',
      uptime_seconds: Math.floor(process.uptime()),
      db_latency_ms: Date.now() - start,
      event_loop_lag_ms: eventLoopLagMs,
      resources: systemMetrics,
      counts,
      platform: process.platform,
      node: process.version,
    });
  }),
);

/* --------------------------- بارکد دوبعدی QR Code فاکتور -------------------------- */
router.get(
  '/qr/invoice',
  asyncHandler((req, res) => {
    const text = cleanText(req.query?.text, { max: 250 }) || 'EASYSHOP-INVOICE';
    const svg = generateInvoiceQrSvg(text, { size: 180 });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(svg);
  }),
);

/* --------------------------- ورود/تایید دو مرحله‌ای با پیامک (SMS OTP) -------------------------- */
router.post(
  '/auth/otp/send',
  rateLimit({ bucket: 'otp_send', max: 5, windowMs: 60000 }),
  asyncHandler((req, res) => {
    const phone = cleanText(req.body?.phone, { max: 15 });
    const purpose = cleanText(req.body?.purpose, { max: 20 }) || 'login';
    if (!phone || !/^09\d{9}$/.test(phone)) {
      return fail(res, 'شماره تلفن همراه نامعتبر است.');
    }
    const result = smsOtpService.generateOtp(phone, purpose);
    return ok(res, { message: 'کد تایید پیامکی ارسال شد.', expires_at: result.expiresAt, ttl: result.ttlSeconds });
  }),
);

router.post(
  '/auth/otp/verify',
  rateLimit({ bucket: 'otp_verify', max: 10, windowMs: 60000 }),
  asyncHandler((req, res) => {
    const { phone, code, purpose } = req.body || {};
    const verification = smsOtpService.verifyOtp(phone, code, purpose || 'login');
    if (!verification.success) {
      return fail(res, verification.reason);
    }
    return ok(res, verification);
  }),
);

/* --------------------------- کمپین‌های فروش شگفت‌انگیز (Flash Sales) -------------------------- */
router.get(
  '/flash-sales/active',
  asyncHandler((_req, res) => {
    const campaigns = flashSaleService.getActiveCampaigns();
    return ok(res, { count: campaigns.length, campaigns });
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
    const [c1, , c3] = PALETTES[paletteIdx];
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

/* --------------------------- تله‌متری خطاهای کلاینت -------------------------- */
router.post(
  '/telemetry/errors',
  rateLimit({ ...config.security.rateLimits.write, scope: 'telemetry-errors' }),
  asyncHandler((req, res) => {
    const { error_msg, url, user_agent } = req.body || {};
    if (!error_msg) return fail(res, 'پیام خطا الزامی است.');
    const id = uid('err');
    run(
      `INSERT INTO client_telemetry_errors (id, user_id, error_msg, url, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      req.user?.id || null,
      cleanText(error_msg, { max: 1000, multiline: true }),
      cleanText(url, { max: 300, multiline: false }) || null,
      cleanText(user_agent || req.get('user-agent'), { max: 300, multiline: false }) || null,
      nowIso(),
    );
    return ok(res, { recorded: true, id });
  }),
);

/* --------------------------- صدور پیش‌فاکتور رسمی -------------------------- */
router.post(
  '/proforma/create',
  rateLimit({ bucket: 'proforma', max: 20, windowMs: 60000 }),
  asyncHandler((req, res) => {
    const { customer_name, company_name, economic_code, national_id, phone, address, items, valid_days } = req.body || {};
    if (!customer_name || !phone || !Array.isArray(items) || items.length === 0) {
      return fail(res, 'اطلاعات مشتری و اقلام پیش‌فاکتور الزامی است.');
    }

    if (national_id && !isValidIranianNationalCode(national_id)) {
      return fail(res, 'کد ملی وارد شده نامعتبر است.');
    }

    const proforma = proformaInvoiceService.createProforma({
      userId: req.user?.id,
      customerName: cleanText(customer_name, { max: 100 }),
      companyName: cleanText(company_name, { max: 100 }),
      economicCode: cleanText(economic_code, { max: 50 }),
      nationalId: cleanText(national_id, { max: 20 }),
      phone: cleanText(phone, { max: 20 }),
      address: cleanText(address, { max: 300 }),
      items,
      validDays: Number(valid_days) || 7,
    });

    return ok(res, proforma);
  }),
);

/* --------------------------- اعتبارسنجی کدپستی و استان -------------------------- */
router.get(
  '/postal/validate',
  asyncHandler((req, res) => {
    const code = cleanText(req.query?.code, { max: 15 });
    const valid = isValidIranianPostalCode(code);
    const province = valid ? guessProvinceByPostalCode(code) : null;
    return ok(res, { valid, province });
  }),
);

/* --------------------------- ثبت شکایت رسمی (اینماد) -------------------------- */
router.post(
  '/disputes/create',
  rateLimit({ bucket: 'disputes', max: 5, windowMs: 60000 }),
  asyncHandler((req, res) => {
    const { order_id, customer_name, phone, title, description, category } = req.body || {};
    if (!customer_name || !phone || !title || !description) {
      return fail(res, 'نام، شماره تماس، عنوان و شرح شکایت الزامی است.');
    }
    const dispute = disputeService.createDispute({
      orderId: order_id,
      userId: req.user?.id,
      customerName: cleanText(customer_name, { max: 100 }),
      phone: cleanText(phone, { max: 20 }),
      title: cleanText(title, { max: 200 }),
      description: cleanText(description, { max: 2000, multiline: true }),
      category: cleanText(category, { max: 50 }) || 'delivery',
    });
    return ok(res, { message: 'شکایت شما با موفقیت ثبت شد و ظرف حداکثر ۴۸ ساعت بررسی می‌شود.', ...dispute });
  }),
);

/* --------------------------- محاسبه پرداخت ترکیبی -------------------------- */
router.post(
  '/checkout/split-calculation',
  asyncHandler((req, res) => {
    const totalAmount = Number(req.body?.total_amount) || 0;
    const walletBalance = Number(req.body?.wallet_balance) || 0;
    const useWallet = req.body?.use_wallet !== false;

    const calculation = splitPaymentService.calculateSplit(totalAmount, walletBalance, useWallet);
    return ok(res, calculation);
  }),
);

/* --------------------------- ارزیابی تخفیف پلکانی سبد -------------------------- */
router.get(
  '/cart/tiered-discount',
  asyncHandler((req, res) => {
    const subtotal = Number(req.query?.subtotal) || 0;
    const discount = tieredDiscountService.evaluateCartTier(subtotal);
    return ok(res, discount);
  }),
);

/* --------------------------- رهگیری مرسولات پستی -------------------------- */
router.get(
  '/tracking/post',
  asyncHandler((req, res) => {
    const code = cleanText(req.query?.code, { max: 30 });
    const tracking = iranPostTrackingService.mockTrackShipment(code);
    return ok(res, tracking);
  }),
);

/* --------------------------- استعلام گارانتی محصول -------------------------- */
router.get(
  '/warranty/check',
  asyncHandler((req, res) => {
    const serial = cleanText(req.query?.serial, { max: 50 });
    const result = warrantyService.checkWarranty(serial);
    return ok(res, result);
  }),
);

/* --------------------------- ثبت نظر و امتیاز به تحویل سفارش -------------------------- */
router.post(
  '/delivery/feedback',
  rateLimit({ bucket: 'delivery_fb', max: 10, windowMs: 60000 }),
  asyncHandler((req, res) => {
    const { order_id, packaging_rating, courier_rating, timeliness_rating, comment } = req.body || {};
    if (!order_id) return fail(res, 'شناسه سفارش الزامی است.');

    const result = deliveryFeedbackService.submitFeedback({
      orderId: order_id,
      userId: req.user?.id,
      packagingRating: packaging_rating,
      courierRating: courier_rating,
      timelinessRating: timeliness_rating,
      comment: cleanText(comment, { max: 500 }),
    });

    return ok(res, result);
  }),
);

/* --------------------------- تم و پیام مناسبتی فعال -------------------------- */
router.get(
  '/theme/holiday',
  asyncHandler((_req, res) => {
    const theme = holidayThemeService.getActiveTheme();
    return ok(res, theme);
  }),
);

/* --------------------------- تبدیل چندارزی -------------------------- */
router.get(
  '/currency/convert',
  asyncHandler((req, res) => {
    const amount = Number(req.query?.amount) || 0;
    const converted = multiCurrencyService.convertAmount(amount);
    return ok(res, converted);
  }),
);

/* --------------------------- تخمین تاریخ تحویل -------------------------- */
router.get(
  '/shipping/estimate-delivery',
  asyncHandler((req, res) => {
    const carrier = cleanText(req.query?.carrier, { max: 20 }) || 'post';
    const city = cleanText(req.query?.city, { max: 50 }) || 'تهران';
    const estimation = deliveryDateEstimator.estimateDelivery(carrier, city);
    return ok(res, estimation);
  }),
);

/* --------------------------- پیشنهادات کالای مکمل -------------------------- */
router.get(
  '/products/:id/recommendations',
  asyncHandler((req, res) => {
    const productId = req.params.id;
    const items = recommendationService.getFrequentlyBoughtTogether(productId, 4);
    return ok(res, { count: items.length, items });
  }),
);

/* --------------------------- تایید اصالت امضای فاکتور -------------------------- */
router.post(
  '/invoice/verify-signature',
  asyncHandler((req, res) => {
    const { order, signature } = req.body || {};
    if (!order || !signature) return fail(res, 'اطلاعات سفارش و امضا الزامی است.');
    const result = invoiceSigner.verifyInvoice(order, signature);
    return ok(res, result);
  }),
);

/* --------------------------- صدور قالب مالیاتی سامانه مودیان -------------------------- */
router.post(
  '/tax/moadian/invoice',
  asyncHandler((req, res) => {
    const { order, seller, buyer } = req.body || {};
    if (!order) return fail(res, 'اطلاعات سفارش الزامی است.');
    const payload = moadianTaxService.buildMoadianInvoicePayload(order, seller, buyer);
    return ok(res, payload);
  }),
);

/* --------------------------- اعتبارسنجی سلامت سبد خرید -------------------------- */
router.post(
  '/cart/sanitize',
  asyncHandler((req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const report = cartSanitizerService.sanitizeCart(items);
    return ok(res, report);
  }),
);

/* --------------------------- ارزش طول عمر و سطح مشتری -------------------------- */
router.get(
  '/customer/tier',
  asyncHandler((req, res) => {
    const userId = req.user?.id || req.query?.user_id;
    const tierInfo = customerClvService.calculateCustomerTier(userId);
    return ok(res, tierInfo);
  }),
);

/* --------------------------- گزینه‌های کادوپیچی -------------------------- */
router.get(
  '/cart/gift-wrap/options',
  asyncHandler((_req, res) => {
    const options = giftWrapService.getAvailableWrapOptions();
    return ok(res, { options });
  }),
);

/* --------------------------- ثبت اشتراک اطلاع‌رسانی افت قیمت -------------------------- */
router.post(
  '/products/:id/price-alert',
  asyncHandler((req, res) => {
    const productId = req.params.id;
    const { email, phone, target_price } = req.body || {};
    const alert = priceAlertService.subscribeAlert({
      productId,
      userId: req.user?.id || null,
      email,
      phone,
      targetPrice: target_price,
    });
    return ok(res, alert);
  }),
);

/* --------------------------- دریافت شناسنامه مشخصات فنی کالا -------------------------- */
router.get(
  '/products/:id/spec-sheet',
  asyncHandler((req, res) => {
    const sheet = productSpecSheetService.generateSpecSheet(req.params.id);
    if (!sheet) return fail(res, 'محصول یافت نشد.', 404);
    return ok(res, sheet);
  }),
);

/* --------------------------- ثبت نظر تصویری خریدار -------------------------- */
router.post(
  '/products/:id/photo-review',
  asyncHandler((req, res) => {
    const productId = req.params.id;
    const userId = req.user?.id;
    if (!userId) return fail(res, 'برای ثبت نظر باید وارد حساب کاربری شوید.', 401);
    const { rating, comment, photos } = req.body || {};
    const result = photoReviewService.submitReview({
      productId,
      userId,
      rating,
      comment,
      photos,
    });
    return ok(res, result);
  }),
);

/* --------------------------- بازیابی سبد خرید رهاشده (مدیر/سیستم) -------------------------- */
router.get(
  '/admin/abandoned-carts',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const hours = Number(req.query?.hours) || 2;
    const carts = abandonedCartService.getAbandonedCarts(hours);
    return ok(res, { count: carts.length, carts });
  }),
);

/* --------------------------- پایش انقضا و پاک‌سازی کدهای تخفیف -------------------------- */
router.post(
  '/admin/coupons/cleanup',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const result = couponCleanupService.cleanupExpiredCoupons();
    return ok(res, result);
  }),
);

/* --------------------------- رزرو موقت اقلام سبد خرید -------------------------- */
router.post(
  '/cart/reserve',
  asyncHandler((req, res) => {
    const { cart_id, product_id, qty } = req.body || {};
    const result = cartReservationService.reserveItem({
      cartId: cart_id,
      productId: product_id,
      qty: Number(qty) || 1,
    });
    return ok(res, result);
  }),
);

/* --------------------------- بررسی وضعیت رزرو سبد خرید -------------------------- */
router.get(
  '/cart/:id/reservation-status',
  asyncHandler((req, res) => {
    const status = cartReservationService.getCartReservationStatus(req.params.id);
    return ok(res, status);
  }),
);

/* --------------------------- احراز هویت شاهکار -------------------------- */
router.post(
  '/verify/shahkar',
  asyncHandler(async (req, res) => {
    const { national_code, mobile } = req.body || {};
    const result = await shahkarVerificationService.verifyShahkar({
      nationalCode: national_code,
      mobile,
      userId: req.user?.id || null,
    });
    return ok(res, result);
  }),
);

/* --------------------------- پرسش و پاسخ محصول -------------------------- */
router.get(
  '/products/:id/qna',
  asyncHandler((req, res) => {
    const list = productQnAService.getProductQnA(req.params.id);
    return ok(res, { count: list.length, items: list });
  }),
);

router.post(
  '/products/:id/qna',
  asyncHandler((req, res) => {
    const { question } = req.body || {};
    const result = productQnAService.askQuestion({
      productId: req.params.id,
      userId: req.user?.id || null,
      questionText: question,
    });
    return ok(res, result);
  }),
);

/* --------------------------- گزارش دوره‌ای فروش و خروجی CSV (مدیر) -------------------------- */
router.get(
  '/admin/reports/sales',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const report = salesExportService.getSalesReport({
      startDate: req.query?.start_date,
      endDate: req.query?.end_date,
      status: req.query?.status || 'paid',
    });
    if (req.query?.format === 'csv') {
      const csv = salesExportService.exportToCsv(report);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="sales-report.csv"');
      return res.send(csv);
    }
    return ok(res, report);
  }),
);

/* --------------------------- رصد نوسانات ورود و حملات بروت‌فورس (مدیر) -------------------------- */
router.get(
  '/admin/security/anomalies',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const report = authAnomalyAlertService.detectAnomalies();
    return ok(res, report);
  }),
);

/* --------------------------- تحلیل کارمزد درگاه‌های پرداخت (مدیر) -------------------------- */
router.get(
  '/admin/finance/gateway-commissions',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const report = gatewayCommissionAnalyzer.getCommissionReport();
    return ok(res, report);
  }),
);

/* --------------------------- ثبت امتیاز و نظرسنجی NPS -------------------------- */
router.post(
  '/feedback/nps',
  asyncHandler((req, res) => {
    const { order_id, score, feedback } = req.body || {};
    const result = npsEngine.submitNpsScore({
      orderId: order_id,
      userId: req.user?.id || null,
      score,
      feedbackText: feedback,
    });
    return ok(res, result);
  }),
);

/* --------------------------- شاخص خلاصه NPS (مدیر) -------------------------- */
router.get(
  '/admin/feedback/nps-summary',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const summary = npsEngine.calculateNpsSummary();
    return ok(res, summary);
  }),
);

/* --------------------------- پیشنهاد و تولید تگ‌های هوشمند کالا -------------------------- */
router.get(
  '/products/:id/ai-tags',
  asyncHandler((req, res) => {
    const product = get(`SELECT * FROM products WHERE id = ?`, req.params.id);
    if (!product) return fail(res, 'محصول یافت نشد.', 404);
    const tags = aiAutoTaggingService.generateTags(product);
    return ok(res, tags);
  }),
);

/* --------------------------- تطبیق کدپستی و استان -------------------------- */
router.post(
  '/address/verify-postal',
  asyncHandler((req, res) => {
    const { postal_code, province } = req.body || {};
    const result = postalAddressMatcher.verifyMatch(postal_code, province);
    return ok(res, result);
  }),
);

/* --------------------------- انبار بهینه برای ارسال -------------------------- */
router.get(
  '/shipping/optimal-warehouse',
  asyncHandler((req, res) => {
    const province = req.query?.province;
    const warehouse = multiWarehouseService.findOptimalWarehouse(province);
    return ok(res, warehouse);
  }),
);

/* --------------------------- پیش‌فاکتور با واترمارک -------------------------- */
router.get(
  '/orders/:id/watermarked-invoice',
  requireAuth,
  asyncHandler((req, res) => {
    const order = get('SELECT id, user_id FROM orders WHERE id = ? OR code = ?', req.params.id, req.params.id);
    if (!order) return fail(res, 'سفارش یافت نشد.', 404);
    const isOwner = Boolean(order.user_id && order.user_id === req.user.id);
    const canManageInvoices = ['admin', 'seller'].includes(req.user.role);
    if (!isOwner && !canManageInvoices) return fail(res, 'دسترسی به فاکتور این سفارش مجاز نیست.', 403);

    const invoice = watermarkedInvoiceService.generateWatermarkedInvoice(order.id);
    if (!invoice) return fail(res, 'سفارش یافت نشد.', 404);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    return ok(res, invoice);
  }),
);

/* --------------------------- پیش‌بینی تقاضا و هشدار شارژ انبار (مدیر) -------------------------- */
router.get(
  '/admin/inventory/demand-forecast',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const days = Number(req.query?.lead_time_days) || 7;
    const recommendations = demandForecastService.getReorderRecommendations(days);
    return ok(res, { count: recommendations.length, recommendations });
  }),
);

/* --------------------------- ماتریس مقایسه مشخصات کالاها -------------------------- */
router.post(
  '/products/compare',
  asyncHandler((req, res) => {
    const ids = Array.isArray(req.body?.product_ids) ? req.body.product_ids : [];
    const comparison = productComparisonMatrix.compareProducts(ids);
    return ok(res, comparison);
  }),
);

/* --------------------------- بررسی مهلت قانونی ۷ روزه مرجوعی -------------------------- */
router.get(
  '/orders/:id/return-eligibility',
  asyncHandler((req, res) => {
    const status = returnWindowService.checkReturnEligibility(req.params.id);
    return ok(res, status);
  }),
);

/* --------------------------- دریافت لینک و کد معرف کاربر -------------------------- */
router.get(
  '/account/affiliate',
  asyncHandler((req, res) => {
    const userId = req.user?.id;
    if (!userId) return fail(res, 'لطفا ابتدا وارد حساب کاربری شوید.', 401);
    const data = affiliateService.getOrCreateReferralCode(userId);
    const stats = affiliateService.getPartnerStats(userId);
    return ok(res, { ...data, stats });
  }),
);

/* --------------------------- ارزیابی تاخیر تحویل سفارش (مدیر) -------------------------- */
router.post(
  '/admin/orders/:id/delivery-sla',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const report = deliverySlaTracker.evaluateOrderDelivery(req.params.id);
    if (!report) return fail(res, 'سفارش یافت نشد.', 404);
    return ok(res, report);
  }),
);

/* --------------------------- امتیاز اعتباری و خرید اقساطی BNPL -------------------------- */
router.get(
  '/account/bnpl/credit-score',
  asyncHandler((req, res) => {
    const userId = req.user?.id || req.query?.user_id;
    const scoreInfo = bnplCreditScoringService.evaluateCreditScore(userId);
    return ok(res, scoreInfo);
  }),
);

/* --------------------------- ثبت لوکیشن و مختصات جغرافیایی آدرس -------------------------- */
router.post(
  '/account/addresses/:id/pinpoint',
  asyncHandler((req, res) => {
    const { latitude, longitude } = req.body || {};
    const result = deliveryGeolocationService.attachCoordinatesToAddress({
      addressId: req.params.id,
      latitude,
      longitude,
    });
    return ok(res, result);
  }),
);

/* --------------------------- محاسبه قیمت خرید عمده پلکانی کالا -------------------------- */
router.get(
  '/products/:id/volume-pricing',
  asyncHandler((req, res) => {
    const qty = Number(req.query?.qty) || 1;
    const product = get(`SELECT price FROM products WHERE id = ?`, req.params.id);
    if (!product) return fail(res, 'کالا یافت نشد.', 404);
    const pricing = volumePricingService.calculateTieredPrice(product.price, qty);
    return ok(res, pricing);
  }),
);

/* --------------------------- بسته‌های ترکیبی پیشنهادی سبد خرید -------------------------- */
router.get(
  '/cart/suggested-bundles',
  asyncHandler((_req, res) => {
    const bundles = smartBundleService.getSuggestedBundles();
    return ok(res, { count: bundles.length, bundles });
  }),
);

/* --------------------------- هشدارهای انقضای گارانتی (مدیر/کاربر) -------------------------- */
router.get(
  '/admin/warranties/expiring',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const days = Number(req.query?.days) || 30;
    const expiring = warrantyExpiryService.getUpcomingExpiringWarranties(days);
    return ok(res, { count: expiring.length, expiring });
  }),
);

/* --------------------------- تطابق کدملی با کارت بانکی شاپرک -------------------------- */
router.post(
  '/verify/national-card',
  asyncHandler((req, res) => {
    const { national_id, card_pan } = req.body || {};
    const result = nationalCardVerifier.verifyNationalCardMatch(national_id, card_pan);
    return ok(res, result);
  }),
);

/* --------------------------- بازه‌های زمانی تحویل سفارش -------------------------- */
router.get(
  '/shipping/delivery-slots',
  asyncHandler((req, res) => {
    const date = req.query?.date;
    const slots = timeSlotDeliveryService.getAvailableSlots(date);
    return ok(res, { slots });
  }),
);

/* --------------------------- ثبت بازخورد ترک خرید Exit Intent -------------------------- */
router.post(
  '/cart/exit-survey',
  asyncHandler((req, res) => {
    const { cart_id, reason, feedback } = req.body || {};
    const result = exitIntentSurveyService.recordAbandonmentReason({
      cartId: cart_id,
      userId: req.user?.id || null,
      reason,
      feedback,
    });
    return ok(res, result);
  }),
);

/* --------------------------- محاسبه مالیات تسویه حساب فروشنده (مدیر/فروشنده) -------------------------- */
router.post(
  '/admin/finance/vendor-tax-split',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { gross_sales, commission_pct, withholding_tax_pct } = req.body || {};
    const calculation = vendorSettlementTaxSplitter.calculateSettlementSplit({
      grossSales: gross_sales,
      commissionPct: commission_pct,
      withholdingTaxPct: withholding_tax_pct,
    });
    return ok(res, calculation);
  }),
);

export default router;

/* --------------------------- استعلام و بررسی کارت سرقتی/مسدودی (فتا و شاپرک) -------------------------- */
import { stolenCardBlacklistProber } from '../services/stolen-card-blacklist.js';
import { moadianPdfInvoiceGenerator } from '../services/moadian-pdf-invoice.js';
import { deviceLifecycleRecommender } from '../services/device-lifecycle-recommender.js';
import { supplierSlaScoringService } from '../services/supplier-sla-scoring.js';
import { cryptoTrc20CheckoutService } from '../services/crypto-trc20-checkout.js';

router.post(
  '/admin/security/stolen-card/check',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'support') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { card_pan } = req.body || {};
    const result = stolenCardBlacklistProber.probeCardStatus(card_pan);
    return ok(res, result);
  }),
);

router.post(
  '/admin/security/stolen-card/blacklist',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { card_pan, reason, reporter, notes } = req.body || {};
    try {
      const result = stolenCardBlacklistProber.addToBlacklist({
        cardPan: card_pan,
        reason,
        reporter,
        notes,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- خروجی بصری و فاکتور سامانه مودیان با کیوآر -------------------------- */
router.get(
  '/admin/orders/:id/moadian-invoice-html',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const order = get('SELECT * FROM orders WHERE id = ?', req.params.id);
    if (!order) return fail(res, 'سفارش یافت نشد.', 404);
    order.items = all('SELECT * FROM order_items WHERE order_id = ?', order.id);

    const html = moadianPdfInvoiceGenerator.generateMoadianInvoiceHtml(order);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }),
);

/* --------------------------- پیشنهادات چرخه‌عمر و لوازم جانبی -------------------------- */
router.get(
  '/products/:id/lifecycle-accessories',
  asyncHandler((req, res) => {
    const limit = Number(req.query?.limit) || 4;
    const items = deviceLifecycleRecommender.getRecommendationsForProduct(req.params.id, limit);
    return ok(res, { count: items.length, items });
  }),
);

/* --------------------------- امتیازدهی SLA و جریمه تاخیر فروشندگان -------------------------- */
router.get(
  '/admin/vendors/sla-scoreboard',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const scoreboard = supplierSlaScoringService.getAllSuppliersScoreboard();
    return ok(res, { count: scoreboard.length, scoreboard });
  }),
);

/* --------------------------- شبیه‌ساز پرداخت ارزی تتر TRC20 -------------------------- */
router.post(
  '/checkout/crypto/trc20/intent',
  asyncHandler((req, res) => {
    const { order_id, amount_toman, tether_rate } = req.body || {};
    try {
      const intent = cryptoTrc20CheckoutService.createCryptoPaymentIntent({
        orderId: order_id,
        amountInTomans: amount_toman,
        tetherRate: tether_rate,
      });
      return ok(res, intent);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/checkout/crypto/trc20/verify',
  asyncHandler((req, res) => {
    const { intent_id, tx_hash } = req.body || {};
    try {
      const result = cryptoTrc20CheckoutService.verifyCryptoPayment({
        intentId: intent_id,
        txHash: tx_hash,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- ارسال خودکار پیامک رهگیری پستی -------------------------- */
import { shippingSmsNotifier } from '../services/shipping-sms-notifier.js';
import { vendorOnboardingService } from '../services/vendor-onboarding.js';
import { searchTrendAnalyticsService } from '../services/search-trend-analytics.js';
import { bnplSimulatorService } from '../services/bnpl-simulator.js';
import { openGraphMetaService } from '../services/opengraph-meta.js';

router.post(
  '/admin/shipping/send-tracking-sms',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { order_id, tracking_code, carrier } = req.body || {};
    try {
      const result = await shippingSmsNotifier.notifyOrderShipped({
        orderId: order_id,
        trackingCode: tracking_code,
        carrier,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- ثبت‌نام و پذیرش فروشندگان (Vendor Onboarding) -------------------------- */
router.post(
  '/vendors/apply',
  asyncHandler((req, res) => {
    const {
      store_name, national_id, sheba_iban, phone, business_license_no,
      province, city, address,
    } = req.body || {};

    try {
      const application = vendorOnboardingService.submitApplication({
        userId: req.user?.id || null,
        storeName: store_name,
        nationalId: national_id,
        shebaIban: sheba_iban,
        phone,
        businessLicenseNo: business_license_no,
        province,
        city,
        address,
      });
      return ok(res, application);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/admin/vendors/applications',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const status = req.query?.status || null;
    const apps = vendorOnboardingService.listApplications(status);
    return ok(res, { count: apps.length, applications: apps });
  }),
);

router.post(
  '/admin/vendors/applications/:id/review',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { action, review_notes } = req.body || {};
    try {
      const result = vendorOnboardingService.reviewApplication(req.params.id, {
        action,
        reviewNotes: review_notes,
        reviewerId: req.user?.id || null,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- تحلیل جستجوها و ترندها -------------------------- */
router.post(
  '/search/log',
  asyncHandler((req, res) => {
    const { query, results_count } = req.body || {};
    const log = searchTrendAnalyticsService.logSearchQuery({
      query,
      resultsCount: results_count,
      userId: req.user?.id || null,
    });
    return ok(res, log);
  }),
);

router.get(
  '/search/trends',
  asyncHandler((req, res) => {
    const limit = Number(req.query?.limit) || 6;
    const trends = searchTrendAnalyticsService.getTopTrendingSearches(limit);
    return ok(res, { trends });
  }),
);

router.get(
  '/admin/search/zero-results',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const limit = Number(req.query?.limit) || 10;
    const zeroResults = searchTrendAnalyticsService.getZeroResultSearches(limit);
    return ok(res, { count: zeroResults.length, items: zeroResults });
  }),
);

/* --------------------------- شبیه‌ساز خرید اقساطی BNPL -------------------------- */
router.get(
  '/products/:id/bnpl-schedule',
  asyncHandler((req, res) => {
    const product = get('SELECT id, price FROM products WHERE id = ?', req.params.id);
    if (!product) return fail(res, 'محصول یافت نشد.', 404);
    const schedule = bnplSimulatorService.calculateInstallments(product.price);
    return ok(res, schedule);
  }),
);

/* --------------------------- تولید تگ‌های OpenGraph شبکه‌های اجتماعی -------------------------- */
router.get(
  '/products/:id/opengraph',
  asyncHandler((req, res) => {
    const product = get('SELECT * FROM products WHERE id = ?', req.params.id);
    if (!product) return fail(res, 'محصول یافت نشد.', 404);
    const tags = openGraphMetaService.generateProductMetaTags(product);
    return ok(res, { tags_html: tags });
  }),
);

/* --------------------------- هشدار افت قیمت و پیامک تخفیف -------------------------- */
import { priceDropNotificationService } from '../services/price-drop-sms.js';
import { warehouseStockAllocatorService } from '../services/warehouse-stock-allocator.js';
import { rmaReturnPipelineService } from '../services/rma-return-pipeline.js';
import { postFareTariffCalculator } from '../services/post-fare-tariff.js';
import { birthdayGiftCampaignService } from '../services/birthday-gift-campaign.js';

router.post(
  '/admin/products/:id/notify-price-drop',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { old_price, new_price } = req.body || {};
    const result = await priceDropNotificationService.notifyPriceDrop({
      productId: req.params.id,
      oldPrice: Number(old_price),
      newPrice: Number(new_price),
    });
    return ok(res, result);
  }),
);

/* --------------------------- مدیریت انبار شعب و موجودی چندانباره -------------------------- */
router.get(
  '/products/:id/warehouse-stocks',
  asyncHandler((req, res) => {
    const data = warehouseStockAllocatorService.getProductWarehouseInventory(req.params.id);
    if (!data) return fail(res, 'محصول یافت نشد.', 404);
    return ok(res, data);
  }),
);

router.post(
  '/shipping/allocate-warehouse',
  asyncHandler((req, res) => {
    const { product_id, qty, destination_province } = req.body || {};
    try {
      const allocation = warehouseStockAllocatorService.allocateOrderWarehouse({
        productId: product_id,
        qty: Number(qty) || 1,
        destinationProvince: destination_province || 'تهران',
      });
      return ok(res, allocation);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- فرآیند ثبت و بازرسی کیفی مرجوعی کالا (RMA) -------------------------- */
router.post(
  '/rma/apply',
  asyncHandler((req, res) => {
    const { order_id, order_item_id, reason, description, photo_url } = req.body || {};
    try {
      const result = rmaReturnPipelineService.createReturnRequest({
        orderId: order_id,
        orderItemId: order_item_id,
        userId: req.user?.id || null,
        reason,
        description,
        photoUrl: photo_url,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/admin/rma/:id/inspect',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'support') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { step, notes, refund_amount } = req.body || {};
    try {
      const inspection = rmaReturnPipelineService.processInspection(req.params.id, {
        step,
        notes,
        refundAmount: Number(refund_amount) || 0,
        inspectorId: req.user?.id || null,
      });
      return ok(res, inspection);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/admin/rma',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'support') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const returns = rmaReturnPipelineService.listReturns();
    return ok(res, { count: returns.length, returns });
  }),
);

/* --------------------------- محاسبه کرایه پستی بر اساس وزن و مسافت -------------------------- */
router.post(
  '/shipping/calculate-fare',
  asyncHandler((req, res) => {
    const { weight_grams, origin_province, dest_province, declared_value_toman, service_type } = req.body || {};
    const calculation = postFareTariffCalculator.calculatePostFare({
      weightGrams: weight_grams,
      originProvince: origin_province,
      destProvince: dest_province,
      declaredValueToman: declared_value_toman,
      serviceType: service_type,
    });
    return ok(res, calculation);
  }),
);

/* --------------------------- کمپین هدیه تولد مشتری -------------------------- */
router.post(
  '/admin/customers/:id/birthday-gift',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { discount_pct, max_discount } = req.body || {};
    try {
      const gift = await birthdayGiftCampaignService.grantBirthdayGiftToUser(
        req.params.id,
        Number(discount_pct) || 20,
        Number(max_discount) || 150000,
      );
      return ok(res, gift);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- پیش‌بینی اتمام موجودی انبار -------------------------- */
import { stockDepletionForecaster } from '../services/stock-depletion-forecaster.js';
import { payaBatchPayoutService } from '../services/paya-batch-payout.js';
import { newsletterCaptureService } from '../services/newsletter-capture.js';
import { loyaltyQuestsService } from '../services/loyalty-quests.js';
import { voiceSurveySimulatorService } from '../services/voice-survey-simulator.js';

router.get(
  '/admin/inventory/depletion-forecast',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const critical = stockDepletionForecaster.getCriticalStockForecast();
    return ok(res, { count: critical.length, forecasts: critical });
  }),
);

router.get(
  '/admin/products/:id/depletion-forecast',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    try {
      const forecast = stockDepletionForecaster.forecastProductDepletion(req.params.id);
      return ok(res, forecast);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- خروجی فایل گروهی پایا/ساتنا -------------------------- */
router.post(
  '/admin/finance/paya/generate-batch',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { payout_ids } = req.body || {};
    try {
      const batch = payaBatchPayoutService.generatePayaBatchFile(payout_ids);
      return ok(res, batch);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- ثبت‌نام در خبرنامه و دریافت کد تخفیف -------------------------- */
router.post(
  '/newsletter/subscribe',
  asyncHandler(async (req, res) => {
    const { email, phone, source } = req.body || {};
    try {
      const result = await newsletterCaptureService.subscribeLead({
        email,
        phone,
        source,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- ماموریت‌ها و گیمیفیکیشن وفاداری کاربر -------------------------- */
router.get(
  '/account/loyalty-quests',
  asyncHandler((req, res) => {
    const userId = req.user?.id;
    if (!userId) return fail(res, 'احراز هویت الزامی است.', 401);
    const quests = loyaltyQuestsService.getUserQuests(userId);
    return ok(res, { quests });
  }),
);

router.post(
  '/account/loyalty-quests/:id/complete',
  asyncHandler((req, res) => {
    const userId = req.user?.id;
    if (!userId) return fail(res, 'احراز هویت الزامی است.', 401);
    try {
      const result = loyaltyQuestsService.completeQuest(userId, req.params.id);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- شبیه‌ساز تماس صوتی نظرسنجی -------------------------- */
router.post(
  '/admin/voice-survey/initiate',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'support') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { order_id, phone } = req.body || {};
    try {
      const result = voiceSurveySimulatorService.initiateVoiceSurveyCall({
        orderId: order_id,
        phone,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/voice-survey/feedback',
  asyncHandler((req, res) => {
    const { call_id, score, package_intact, voice_memo } = req.body || {};
    try {
      const result = voiceSurveySimulatorService.recordCallFeedback({
        callId: call_id,
        score,
        packageIntact: package_intact,
        voiceMemoText: voice_memo,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/admin/voice-survey/metrics',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'support') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const metrics = voiceSurveySimulatorService.getVoiceSurveyMetrics();
    return ok(res, metrics);
  }),
);

/* --------------------------- ژئوکدینگ و تطبیق آدرس با ناوگان شهری -------------------------- */
import { reverseGeocodingMatcherService } from '../services/reverse-geocoding-matcher.js';
import { mobileAirtimeTopupService } from '../services/mobile-airtime-topup.js';
import { abandonedCartTimedCouponService } from '../services/abandoned-cart-timed-coupon.js';
import { vendorHealthIndexService } from '../services/vendor-health-index.js';
import { multiProductSpecMatrixService } from '../services/multi-product-spec-matrix.js';

router.post(
  '/shipping/analyze-address',
  asyncHandler((req, res) => {
    const { address, city, province } = req.body || {};
    try {
      const result = reverseGeocodingMatcherService.analyzeAddress(address, city, province);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- خرید شارژ مستقیم سیم‌کارت از کیف پول -------------------------- */
router.post(
  '/account/wallet/topup-airtime',
  asyncHandler((req, res) => {
    const userId = req.user?.id;
    if (!userId) return fail(res, 'احراز هویت الزامی است.', 401);
    const { phone, amount, charge_type } = req.body || {};
    try {
      const topup = mobileAirtimeTopupService.purchaseTopup({
        userId,
        phone,
        amountToman: amount,
        chargeType: charge_type,
      });
      return ok(res, topup);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- یادآوری سبدهای رهاشده با کوپن انگیزاننده -------------------------- */
router.post(
  '/admin/marketing/abandoned-carts/dispatch-coupons',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const hours = Number(req.body?.inactivity_hours) || 3;
    const result = await abandonedCartTimedCouponService.processAbandonedCarts(hours);
    return ok(res, result);
  }),
);

/* --------------------------- شاخص سلامت فروشندگان -------------------------- */
router.get(
  '/admin/vendors/:id/health-index',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    try {
      const index = vendorHealthIndexService.calculateHealthIndex(req.params.id);
      return ok(res, index);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- ماتریس مقایسه مشخصات فنی کالاها -------------------------- */
router.post(
  '/products/compare-matrix',
  asyncHandler((req, res) => {
    const { product_ids } = req.body || {};
    try {
      const matrix = multiProductSpecMatrixService.generateComparisonMatrix(product_ids);
      return ok(res, matrix);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- سیستم پیش‌فروش با بیعانه (Round 25) -------------------------- */
import { PreOrderDepositService } from '../services/pre-order-deposit.js';
import * as dbModule from '../db/index.js';
const preOrderDepositService = new PreOrderDepositService(dbModule);

router.post(
  '/admin/pre-orders/configure',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { product_id, is_enabled, deposit_percentage, estimated_arrival_days, quota_limit } = req.body || {};
    try {
      const result = await preOrderDepositService.configureProductPreOrder(product_id, {
        isEnabled: is_enabled,
        depositPercentage: deposit_percentage,
        estimatedArrivalDays: estimated_arrival_days,
        quotaLimit: quota_limit,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/pre-orders/reserve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { product_id, quantity, unit_price } = req.body || {};
    try {
      const result = await preOrderDepositService.createPreOrderReservation({
        userId: req.user.id,
        productId: product_id,
        quantity,
        unitPrice: unit_price,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/account/pre-orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const preOrders = await preOrderDepositService.getUserPreOrders(req.user.id);
    return ok(res, preOrders);
  }),
);

/* --------------------------- تجمیع هوشمند چند سفارش (Round 25) -------------------------- */
import { OrderConsolidationService } from '../services/order-consolidation.js';
const orderConsolidationService = new OrderConsolidationService(dbModule);

router.get(
  '/account/orders/consolidation-eligibility',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const result = await orderConsolidationService.findConsolidatableOrders(req.user.id);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/account/orders/consolidate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { order_ids } = req.body || {};
    try {
      const result = await orderConsolidationService.consolidateOrders({
        userId: req.user.id,
        orderIds: order_ids,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- سپر ضد کلاهبرداری مرجوعی کالا (Round 25) -------------------------- */
import { RmaReturnFraudShieldService } from '../services/rma-return-fraud-shield.js';
const rmaReturnFraudShieldService = new RmaReturnFraudShieldService(dbModule);

router.post(
  '/admin/rma/screen-request',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'support') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { user_id, order_id, product_id, return_reason } = req.body || {};
    try {
      const result = await rmaReturnFraudShieldService.screenReturnRequest({
        userId: user_id,
        orderId: order_id,
        productId: product_id,
        returnReason: return_reason,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- لیست قیمت عمده و کاتالوگ B2B (Round 25) -------------------------- */
import { B2BPriceListGeneratorService } from '../services/b2b-price-list-generator.js';
const b2bPriceListGeneratorService = new B2BPriceListGeneratorService(dbModule);

router.get(
  '/b2b/price-list',
  asyncHandler(async (req, res) => {
    const { category_id, wholesale_discount_percent } = req.query || {};
    try {
      const list = await b2bPriceListGeneratorService.generatePriceList({
        categoryId: category_id,
        wholesaleDiscountPercent: wholesale_discount_percent,
      });
      return ok(res, list);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- گردونه شانس و جوایز روزانه (Round 25) -------------------------- */
import { SpinTheWheelService } from '../services/spin-the-wheel.js';
const spinTheWheelService = new SpinTheWheelService(dbModule);

router.get(
  '/gamification/wheel/config',
  asyncHandler((_req, res) => {
    const config = spinTheWheelService.getWheelConfiguration();
    return ok(res, config);
  }),
);

router.get(
  '/gamification/wheel/eligibility',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const result = await spinTheWheelService.canUserSpin(req.user.id);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/gamification/wheel/spin',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const result = await spinTheWheelService.executeSpin(req.user.id);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- استعلام اصالت فیزیکی با کد اسکرچ (Round 26) -------------------------- */
import { ScratchAuthenticityService } from '../services/scratch-authenticity.js';
const scratchAuthenticityService = new ScratchAuthenticityService(dbModule);

router.post(
  '/admin/products/authenticity/generate',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { product_id, batch_number, count } = req.body || {};
    try {
      const result = await scratchAuthenticityService.generateCodesForProduct({
        productId: product_id,
        batchNumber: batch_number,
        count,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/products/authenticity/verify',
  asyncHandler(async (req, res) => {
    const { scratch_code } = req.body || {};
    try {
      const result = await scratchAuthenticityService.verifyCode(scratch_code, req.user?.id);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- یادآور هوشمند خرید کالاهای تکرارشونده و مصرفی (Round 26) -------------------------- */
import { SmartReplenishmentSubscriptionService } from '../services/smart-replenishment.js';
const smartReplenishmentService = new SmartReplenishmentSubscriptionService(dbModule);

router.post(
  '/account/replenishment/subscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { product_id, cycle_days, discount_percent } = req.body || {};
    try {
      const result = await smartReplenishmentService.scheduleReplenishment({
        userId: req.user.id,
        productId: product_id,
        cycleDays: cycle_days,
        discountPercent: discount_percent,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/account/replenishment/:id/reorder',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const result = await smartReplenishmentService.triggerOneClickReorder(req.params.id);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- ثبت گزارش مغایرت و انبارگردانی (Round 26) -------------------------- */
import { InventoryDiscrepancyService } from '../services/inventory-discrepancy.js';
const inventoryDiscrepancyService = new InventoryDiscrepancyService(dbModule);

router.post(
  '/admin/inventory/cycle-count',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'warehouse') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { product_id, counted_stock, warehouse_location, notes } = req.body || {};
    try {
      const result = await inventoryDiscrepancyService.recordCycleCount({
        productId: product_id,
        countedStock: counted_stock,
        warehouseLocation: warehouse_location,
        countedByUserId: req.user?.id,
        notes,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/admin/inventory/discrepancies',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'warehouse') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const limit = Number(req.query?.limit) || 20;
    const reports = await inventoryDiscrepancyService.getDiscrepancyReports(limit);
    return ok(res, reports);
  }),
);

/* --------------------------- فاکتور رسمی حقوقی و اعتبارسنجی شناسه ملی (Round 26) -------------------------- */
import { B2BTaxCertificateValidatorService } from '../services/b2b-tax-validator.js';
const b2bTaxCertificateValidatorService = new B2BTaxCertificateValidatorService(dbModule);

router.post(
  '/b2b/corporate-profile',
  asyncHandler(async (req, res) => {
    const {
      company_name,
      legal_national_id,
      economic_code,
      registration_number,
      vat_certificate_number,
      province,
      city,
      postal_code,
      address,
      phone,
    } = req.body || {};
    try {
      const result = await b2bTaxCertificateValidatorService.registerB2BCorporateProfile({
        userId: req.user?.id || null,
        companyName: company_name,
        legalNationalId: legal_national_id,
        economicCode: economic_code,
        registrationNumber: registration_number,
        vatCertificateNumber: vat_certificate_number,
        province,
        city,
        postalCode: postal_code,
        address,
        phone,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/b2b/tax-breakdown',
  asyncHandler((req, res) => {
    const { subtotal_toman, vat_rate_percent } = req.body || {};
    const breakdown = b2bTaxCertificateValidatorService.calculateTaxBreakdown(
      subtotal_toman,
      vat_rate_percent,
    );
    return ok(res, breakdown);
  }),
);

/* --------------------------- تولید بنر وکتور شبکه‌های اجتماعی (Round 26) -------------------------- */
import { SocialBannerSvgGeneratorService } from '../services/social-banner-svg.js';
const socialBannerSvgService = new SocialBannerSvgGeneratorService();

router.post(
  '/admin/marketing/social-banner',
  asyncHandler((req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { format, product_title, original_price, discounted_price, discount_percent, store_name, badge_text } =
      req.body || {};
    const banner = socialBannerSvgService.generateBanner({
      format,
      productTitle: product_title,
      originalPrice: original_price,
      discountedPrice: discounted_price,
      discountPercent: discount_percent,
      storeName: store_name,
      badgeText: badge_text,
    });
    return ok(res, banner);
  }),
);

/* --------------------------- قیمت‌گذاری پویا بر اساس نوسان ارز و طلا (Round 27) -------------------------- */
import { DynamicCurrencyPricingService } from '../services/currency-pegged-pricing.js';
const dynamicCurrencyPricingService = new DynamicCurrencyPricingService(dbModule);

router.post(
  '/admin/pricing/currency-peg/configure',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const {
      product_id,
      base_peg_currency,
      base_foreign_cost,
      target_margin_percent,
      min_price_toman,
      max_price_toman,
      is_enabled,
    } = req.body || {};
    try {
      const result = await dynamicCurrencyPricingService.configureProductPricing({
        productId: product_id,
        basePegCurrency: base_peg_currency,
        baseForeignCost: base_foreign_cost,
        targetMarginPercent: target_margin_percent,
        minPriceToman: min_price_toman,
        maxPriceToman: max_price_toman,
        isEnabled: is_enabled,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/admin/pricing/currency-peg/recalculate',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { product_id, current_exchange_rate_toman } = req.body || {};
    try {
      const result = await dynamicCurrencyPricingService.recalculateProductPrice(
        product_id,
        current_exchange_rate_toman,
      );
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- حواله‌های بانکی مبالغ بالا با تأیید دو مرحله‌ای (Round 27) -------------------------- */
import { HighValueBankTransferService } from '../services/high-value-bank-transfer.js';
const highValueBankTransferService = new HighValueBankTransferService(dbModule);

router.post(
  '/checkout/bank-transfer',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { order_id, amount_toman, bank_name, tracking_number, sender_iban, receipt_image_url } =
      req.body || {};
    try {
      const result = await highValueBankTransferService.submitBankTransfer({
        orderId: order_id,
        userId: req.user.id,
        amountToman: amount_toman,
        bankName: bank_name,
        trackingNumber: tracking_number,
        senderIban: sender_iban,
        receiptImageUrl: receipt_image_url,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/admin/finance/bank-transfers/:id/verify-accountant',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'finance') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { notes } = req.body || {};
    try {
      const result = await highValueBankTransferService.verifyByAccountant(
        req.params.id,
        req.user.id,
        notes,
      );
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/admin/finance/bank-transfers/:id/approve-auditor',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی فقط برای مدیر و بازرس ارشد مالی.', 403);
    }
    const { notes } = req.body || {};
    try {
      const result = await highValueBankTransferService.approveByAuditor(
        req.params.id,
        req.user.id,
        notes,
      );
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- ماتریس کمیسیون پلکانی فروشندگان (Round 27) -------------------------- */
import { TieredVendorCommissionService } from '../services/tiered-vendor-commission.js';
const tieredVendorCommissionService = new TieredVendorCommissionService(dbModule);

router.post(
  '/vendors/commission/calculate',
  asyncHandler((req, res) => {
    const { category_key, vendor_tier, sale_amount_toman } = req.body || {};
    const result = tieredVendorCommissionService.calculateCommission({
      categoryKey: category_key,
      vendorTier: vendor_tier,
      saleAmountToman: sale_amount_toman,
    });
    return ok(res, result);
  }),
);

router.post(
  '/admin/vendors/:id/evaluate-tier',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    try {
      const result = await tieredVendorCommissionService.evaluateVendorTier(req.params.id);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- بسته‌بندی کادو و فاکتور بدون قیمت هدیه (Round 27) -------------------------- */
import { PersonalizedGiftWrapService } from '../services/personalized-gift-wrap.js';
const personalizedGiftWrapService = new PersonalizedGiftWrapService(dbModule);

router.get(
  '/checkout/gift-wrap/themes',
  asyncHandler((_req, res) => {
    const themes = personalizedGiftWrapService.getWrapThemes();
    return ok(res, themes);
  }),
);

router.post(
  '/checkout/orders/:id/gift-options',
  asyncHandler(async (req, res) => {
    const { wrap_style_id, recipient_name, greeting_message, hide_price_on_invoice } = req.body || {};
    try {
      const result = await personalizedGiftWrapService.attachGiftOptionsToOrder({
        orderId: req.params.id,
        wrapStyleId: wrap_style_id,
        recipientName: recipient_name,
        greetingMessage: greeting_message,
        hidePriceOnInvoice: hide_price_on_invoice,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/orders/:id/gift-receipt',
  asyncHandler(async (req, res) => {
    try {
      const receipt = await personalizedGiftWrapService.renderGiftReceipt(req.params.id);
      return ok(res, receipt);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- استعلام و ثبت گارانتی‌های معتبر الکترونیک (Round 27) -------------------------- */
import { ThirdPartyWarrantyRegistryService } from '../services/third-party-warranty.js';
const thirdPartyWarrantyRegistryService = new ThirdPartyWarrantyRegistryService(dbModule);

router.post(
  '/admin/warranty/registry/register',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'support') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { serial_or_imei, provider_id, product_id, duration_months } = req.body || {};
    try {
      const result = await thirdPartyWarrantyRegistryService.registerWarranty({
        serialOrImei: serial_or_imei,
        providerId: provider_id,
        productId: product_id,
        durationMonths: duration_months,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/warranty/registry/inquiry',
  asyncHandler(async (req, res) => {
    const { serial_number } = req.query || {};
    try {
      const result = await thirdPartyWarrantyRegistryService.inquiryWarranty(serial_number);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- قیمت‌گذاری همکار و پله‌ای بر اساس تعداد (Round 28) -------------------------- */
import { WholesaleVolumePricingService } from '../services/wholesale-volume-pricing.js';
const wholesaleVolumePricingService = new WholesaleVolumePricingService(dbModule);

router.post(
  '/admin/pricing/volume-tiers',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { product_id, tiers } = req.body || {};
    try {
      const result = await wholesaleVolumePricingService.configureProductTiers(product_id, tiers);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/pricing/volume-calculate',
  asyncHandler(async (req, res) => {
    const { product_id, quantity, base_price_toman } = req.body || {};
    try {
      const result = await wholesaleVolumePricingService.calculateVolumePrice(
        product_id,
        quantity,
        base_price_toman,
      );
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- بهینه‌ساز بسته‌بندی و وزن حجمی پستی (Round 28) -------------------------- */
import { VolumetricPackagingOptimizerService } from '../services/volumetric-packaging-optimizer.js';
const volumetricPackagingOptimizerService = new VolumetricPackagingOptimizerService();

router.post(
  '/shipping/optimize-packaging',
  asyncHandler((req, res) => {
    const { items } = req.body || {};
    try {
      const result = volumetricPackagingOptimizerService.optimizeShipmentPackage(items);
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- گیت‌وی پیامک خدماتی مبتنی بر پترن (Round 28) -------------------------- */
import { PatternTransactionalSmsGateway } from '../services/pattern-transactional-sms.js';
const patternTransactionalSmsGateway = new PatternTransactionalSmsGateway(dbModule);

router.post(
  '/admin/sms/dispatch-pattern',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { phone, pattern_key, token_values, provider } = req.body || {};
    try {
      const result = await patternTransactionalSmsGateway.sendPatternSms({
        phone,
        patternKey: pattern_key,
        tokenValues: token_values,
        primaryProvider: provider,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- بامپر پیشنهاد باندل و کراس‌سل حین تسویه (Round 28) -------------------------- */
import { SmartCheckoutCrossSellBumperService } from '../services/smart-checkout-cross-sell.js';
const smartCheckoutCrossSellBumperService = new SmartCheckoutCrossSellBumperService(dbModule);

router.post(
  '/checkout/cross-sell-bumpers',
  asyncHandler(async (req, res) => {
    const { cart_product_ids, incentive_discount_percent } = req.body || {};
    try {
      const result = await smartCheckoutCrossSellBumperService.getCheckoutBumpOffers(
        cart_product_ids,
        incentive_discount_percent,
      );
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- بازرسی و رده‌بندی کالاهای اوپن‌باکس و استوک (Round 28) -------------------------- */
import { OpenBoxGradingInspectorService } from '../services/open-box-grading.js';
const openBoxGradingInspectorService = new OpenBoxGradingInspectorService(dbModule);

router.post(
  '/admin/inventory/open-box/grade',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'warehouse') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { original_product_id, serial_number, grade, inspection_notes } = req.body || {};
    try {
      const result = await openBoxGradingInspectorService.gradeAndListUnit({
        originalProductId: original_product_id,
        serialNumber: serial_number,
        grade,
        inspectorUserId: req.user?.id,
        inspectionNotes: inspection_notes,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/inventory/open-box/available',
  asyncHandler(async (_req, res) => {
    try {
      const items = await openBoxGradingInspectorService.getAvailableOpenBoxUnits();
      return ok(res, { count: items.length, items });
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- تحویل حضوری در انبار مرکزی (Round 29) -------------------------- */
import { ClickAndCollectPickupService } from '../services/click-and-collect-pickup.js';
const clickAndCollectPickupService = new ClickAndCollectPickupService(dbModule);

router.get(
  '/shipping/pickup-hubs',
  asyncHandler((_req, res) => {
    const hubs = clickAndCollectPickupService.getPickupHubs();
    return ok(res, hubs);
  }),
);

router.post(
  '/checkout/orders/:id/pickup-reservation',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { hub_id, recipient_name, recipient_national_id } = req.body || {};
    try {
      const result = await clickAndCollectPickupService.registerPickup({
        orderId: req.params.id,
        userId: req.user.id,
        hubId: hub_id,
        recipientName: recipient_name,
        recipientNationalId: recipient_national_id,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.post(
  '/admin/warehouse/pickup/verify-handover',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'warehouse') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { pickup_token } = req.body || {};
    try {
      const result = await clickAndCollectPickupService.verifyAndHandoverPickup(
        pickup_token,
        req.user?.id,
      );
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- آنالیزور حاشیه سود ناخالص هر سفارش (Round 29) -------------------------- */
import { GrossProfitMarginAnalyzerService } from '../services/gross-profit-analyzer.js';
const grossProfitMarginAnalyzerService = new GrossProfitMarginAnalyzerService(dbModule);

router.get(
  '/admin/finance/orders/:id/profit-margin',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    try {
      const profit = await grossProfitMarginAnalyzerService.analyzeOrderProfit(req.params.id);
      return ok(res, profit);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- موتور هوش مصنوعی پیش‌بینی سفارش بعدی (Round 29) -------------------------- */
import { AiNextOrderPredictiveEngine } from '../services/ai-next-order-predictor.js';
const aiNextOrderPredictiveEngine = new AiNextOrderPredictiveEngine(dbModule);

router.get(
  '/account/predictive/next-order',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const forecast = await aiNextOrderPredictiveEngine.predictNextOrderForUser(req.user.id);
      return ok(res, forecast);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

/* --------------------------- لینک کوتاه و بازاریابی افیلیت اینفلوئنسرها (Round 29) -------------------------- */
import { AffiliateShortLinkTrackerService } from '../services/affiliate-shortlink-tracker.js';
const affiliateShortLinkTrackerService = new AffiliateShortLinkTrackerService(dbModule);

router.post(
  '/affiliate/short-links',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slug, destination_url, commission_percent } = req.body || {};
    try {
      const result = await affiliateShortLinkTrackerService.createAffiliateLink({
        affiliateUserId: req.user.id,
        slug,
        destinationUrl: destination_url,
        commissionPercent: commission_percent,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/go/:slug',
  asyncHandler(async (req, res) => {
    const click = await affiliateShortLinkTrackerService.recordClick(req.params.slug);
    if (!click) {
      return fail(res, 'لینک کوتاه یافت نشد.', 404);
    }
    return res.redirect(click.destination_url);
  }),
);

/* --------------------------- امضای دیجیتال قرارداد فروشندگان مارکت‌پلیس (Round 29) -------------------------- */
import { VendorDigitalContractSignerService } from '../services/vendor-digital-contract.js';
const vendorDigitalContractSignerService = new VendorDigitalContractSignerService(dbModule);

router.get(
  '/vendors/contract/terms',
  asyncHandler((_req, res) => {
    const terms = vendorDigitalContractSignerService.getContractTerms();
    return ok(res, terms);
  }),
);

router.post(
  '/vendors/contract/sign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { vendor_id, national_id, signatory_full_name, signatory_mobile } = req.body || {};
    try {
      const result = await vendorDigitalContractSignerService.signContract({
        vendorId: vendor_id,
        nationalId: national_id,
        signatoryFullName: signatory_full_name,
        signatoryMobile: signatory_mobile,
        ipAddress: req.ip,
      });
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);

router.get(
  '/vendors/contract/:id/verify',
  asyncHandler(async (req, res) => {
    const result = await vendorDigitalContractSignerService.verifyContractSignature(req.params.id);
    return ok(res, result);
  }),
);

/* --------------------------- پنل سوئیچ و مدیریت روشن/خاموش ماژول‌ها (Round 29) -------------------------- */
import { FeatureTogglesService } from '../services/feature-toggles.js';
const featureTogglesService = new FeatureTogglesService(dbModule);

router.get(
  '/admin/features/toggles',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const toggles = await featureTogglesService.getAllFeatures();
    return ok(res, toggles);
  }),
);

router.post(
  '/admin/features/toggles/set',
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'admin') {
      return fail(res, 'دسترسی غیرمجاز.', 403);
    }
    const { feature_key, is_enabled } = req.body || {};
    try {
      const result = await featureTogglesService.setFeatureState(
        feature_key,
        is_enabled,
        req.user.id,
      );
      return ok(res, result);
    } catch (err) {
      return fail(res, err.message, 400);
    }
  }),
);





