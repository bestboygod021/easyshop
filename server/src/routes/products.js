import express from 'express';
import { all, get, run, uid, nowIso, stringifyJson, parseJson } from '../db/index.js';
import { optionalAuth, requireAuth, requireRole, isStaff, logAudit } from '../middleware/auth.js';
import { asyncHandler, buildProductFilters, fail, ok, paginate, productPublic, productsQuery } from '../utils/helpers.js';
import { config } from '../config.js';
import { cleanText, rateLimit } from '../middleware/security.js';

const router = express.Router();

const PRODUCT_STATUSES = ['active', 'draft', 'archived', 'out_of_stock'];
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const isInt = (v) => Number.isInteger(Number(v));

/** اعتبارسنجی مقادیر مالی/انبار (جلوگیری از قیمت یا موجودی منفی/نامعتبر) */
function validateProductNumbers(b) {
  if (b.price !== undefined) {
    const price = num(b.price, NaN);
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000_000) return 'قیمت محصول نامعتبر است.';
  }
  if (b.compare_at_price !== undefined && b.compare_at_price !== null && b.compare_at_price !== '') {
    const cap = num(b.compare_at_price, NaN);
    if (!Number.isFinite(cap) || cap <= 0) return 'قیمت قبل از تخفیف نامعتبر است.';
  }
  for (const field of ['stock', 'low_stock_threshold', 'shipping_days']) {
    if (b[field] !== undefined && (!isInt(b[field]) || Number(b[field]) < 0)) return `${field} نامعتبر است.`;
  }
  if (b.cost !== undefined && b.cost !== null && b.cost !== '') {
    const cost = num(b.cost, NaN);
    if (!Number.isFinite(cost) || cost < 0) return 'قیمت تمام‌شده نامعتبر است.';
  }
  if (b.status !== undefined && !PRODUCT_STATUSES.includes(b.status)) return 'وضعیت محصول نامعتبر است.';
  if (b.images !== undefined) {
    if (!Array.isArray(b.images) || b.images.length > 12) return 'حداکثر ۱۲ تصویر مجاز است.';
    if (b.images.some((u) => typeof u !== 'string' || u.length > 500)) return 'آدرس تصویر نامعتبر است.';
  }
  if (b.variants !== undefined) {
    if (!Array.isArray(b.variants) || b.variants.length > 30) return 'حداکثر ۳۰ تنوع مجاز است.';
    for (const v of b.variants) {
      if (Number(v?.stock) < 0 || Number(v?.price_delta) < -10_000_000_000) return 'مقادیر تنوع نامعتبر است.';
    }
  }
  return null;
}

/** GET /api/products — فهرست محصولات با فیلتر، جستجو، مرتب‌سازی و صفحه‌بندی */
router.get(
  '/',
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 24, 60);
    const { where, params } = buildProductFilters(req, { forceStatus: req.query.include_all === '1' ? null : 'active' });
    const rows = productsQuery({ where, params, sort: req.query.sort, limit, offset });
    const total = get(`SELECT COUNT(*) c FROM products p ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, ...params).c;
    const facets = {
      brands: all(
        `SELECT brand, COUNT(*) c FROM products WHERE status='active' AND brand IS NOT NULL GROUP BY brand ORDER BY c DESC LIMIT 20`,
      ),
      price_range: get("SELECT MIN(price) min, MAX(price) max FROM products WHERE status='active'"),
      categories: all(
        `SELECT c.id, c.slug, c.name_fa, COUNT(p.id) c FROM categories c
         LEFT JOIN products p ON p.category_id = c.id AND p.status='active'
         WHERE c.is_active = 1 GROUP BY c.id ORDER BY c.sort_order`,
      ),
    };
    return ok(res, {
      items: rows.map((r) => productPublic(r, { withDescription: false })),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      facets,
    });
  }),
);

/** GET /api/products/suggest?q= — جستجوی سریع برای نوار جستجو */
router.get(
  '/suggest',
  asyncHandler((req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return ok(res, { items: [], categories: [], brands: [] });
    const like = `%${q}%`;
    const items = all(
      `SELECT id, slug, name_fa name, price, thumbnail, stock FROM products
       WHERE status='active' AND (name_fa LIKE ? OR name_en LIKE ? OR brand LIKE ?) LIMIT 8`,
      like, like, like,
    );
    const categories = all('SELECT id, slug, name_fa name FROM categories WHERE name_fa LIKE ? OR slug LIKE ? LIMIT 5', like, like);
    const brands = all('SELECT DISTINCT brand FROM products WHERE brand LIKE ? LIMIT 5', like).map((b) => b.brand);
    return ok(res, { items, categories, brands });
  }),
);

/** GET /api/products/brands */
router.get(
  '/brands',
  asyncHandler((_req, res) =>
    ok(res, { items: all("SELECT brand, COUNT(*) c FROM products WHERE status='active' AND brand IS NOT NULL GROUP BY brand ORDER BY c DESC") }),
  ),
);

/** GET /api/products/:idOrSlug */
router.get(
  '/:idOrSlug',
  optionalAuth,
  asyncHandler((req, res) => {
    const { idOrSlug } = req.params;
    const row = get(
      `SELECT p.*, c.name_fa AS category_name, c.slug AS category_slug, c.id AS cat_id
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = ? OR p.id = ?`,
      idOrSlug, idOrSlug,
    );
    if (!row || (row.status !== 'active' && !isStaff(req.user))) return fail(res, 'محصول یافت نشد.', 404);

    run('UPDATE products SET view_count = view_count + 1 WHERE id = ?', row.id);
    const variants = all('SELECT * FROM product_variants WHERE product_id = ?', row.id).map((v) => ({
      id: v.id, name: v.name_fa, name_en: v.name_en, price_delta: v.price_delta, stock: v.stock,
      attributes: parseJson(v.attributes, {}), image: v.image,
    }));
    const reviews = all(
      `SELECT r.*, u.full_name AS user_name, u.avatar FROM reviews r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ? AND r.status = 'approved' ORDER BY r.created_at DESC LIMIT 30`,
      row.id,
    );
    const ratingBuckets = all('SELECT rating, COUNT(*) c FROM reviews WHERE product_id = ? GROUP BY rating', row.id);
    const related = all(
      `SELECT p.*, c.name_fa AS category_name, c.slug AS category_slug FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.category_id = ? AND p.id != ? AND p.status='active' ORDER BY p.sold_count DESC LIMIT 8`,
      row.category_id, row.id,
    );
    const breadcrumb = [];
    if (row.category_id) {
      const cat = get('SELECT * FROM categories WHERE id = ?', row.category_id);
      if (cat?.parent_id) {
        const parent = get('SELECT * FROM categories WHERE id = ?', cat.parent_id);
        if (parent) breadcrumb.push({ id: parent.id, slug: parent.slug, name: parent.name_fa });
      }
      if (cat) breadcrumb.push({ id: cat.id, slug: cat.slug, name: cat.name_fa });
    }

    const staff = isStaff(req.user);
    return ok(res, {
      product: productPublic(row, { withCost: staff }),
      variants,
      reviews: reviews.map((r) => ({
        id: r.id, rating: r.rating, title: r.title, body: r.body, user_name: r.user_name || 'کاربر EasyShop',
        avatar: r.avatar, created_at: r.created_at, helpful_count: r.helpful_count, reply: r.reply,
      })),
      rating_buckets: ratingBuckets,
      related: related.map((r) => productPublic(r, { withDescription: false })),
      breadcrumb,
    });
  }),
);

/** POST /api/products/:id/reviews — ثبت نظر (فقط خریداران) */
router.post(
  '/:id/reviews',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'review-create' }),
  asyncHandler((req, res) => {
    const product = get('SELECT * FROM products WHERE id = ? OR slug = ?', req.params.id, req.params.id);
    if (!product) return fail(res, 'محصول یافت نشد.', 404);
    const { rating } = req.body || {};
    const score = Math.max(1, Math.min(5, Number(rating) || 0));
    if (!score) return fail(res, 'امتیاز را انتخاب کنید.');
    // پاک‌سازی کامل ورودی‌ها (HTML مقصد با sanitizePayload حذف شده است)
    const title = cleanText(req.body?.title, { max: 120, multiline: false }) || null;
    const body = cleanText(req.body?.body, { max: 1500 });
    const pros = cleanText(req.body?.pros, { max: 600 }) || null;
    const cons = cleanText(req.body?.cons, { max: 600 }) || null;
    if (!body || body.length < 5) return fail(res, 'متن نظر را وارد کنید.');
    const dayCount = get(
      "SELECT COUNT(*) c FROM reviews WHERE user_id = ? AND created_at > datetime('now','-1 day')",
      req.user.id,
    ).c;
    if (dayCount >= 5) return fail(res, 'تعداد نظرات ثبت‌شده در ۲۴ ساعت گذشته بیش از حد مجاز است.', 429);
    const purchased = get(
      `SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = ? AND oi.product_id = ? AND o.status IN ('delivered','shipped','packed','processing','paid') LIMIT 1`,
      req.user.id, product.id,
    );
    const already = get('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?', product.id, req.user.id);
    if (already) return fail(res, 'شما قبلاً برای این محصول نظر ثبت کرده‌اید.');
    const id = uid('rev');
    run(
      `INSERT INTO reviews (id,product_id,user_id,order_id,rating,title,body,pros,cons,status,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, product.id, req.user.id, purchased?.id ?? null, score, title, body, pros, cons,
      purchased ? 'approved' : 'pending', nowIso(),
    );
    const agg = get('SELECT AVG(rating) a, COUNT(*) c FROM reviews WHERE product_id = ? AND status = ?', product.id, 'approved');
    run('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?', Number(Number(agg.a || 0).toFixed(2)), agg.c, product.id);
    return ok(res, { message: 'نظر شما ثبت شد. سپاسگزاریم!', review_id: id, verified_purchase: Boolean(purchased) }, 201);
  }),
);

/** POST /api/products/reviews/:reviewId/helpful — رأی مفید بودن (هر کاربر یک‌بار) */
router.post(
  '/reviews/:reviewId/helpful',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'review-helpful' }),
  asyncHandler((req, res) => {
    const review = get('SELECT id FROM reviews WHERE id = ?', req.params.reviewId);
    if (!review) return fail(res, 'نظر یافت نشد.', 404);
    const existing = get('SELECT review_id FROM review_helpful WHERE review_id = ? AND user_id = ?', review.id, req.user.id);
    if (existing) {
      run('DELETE FROM review_helpful WHERE review_id = ? AND user_id = ?', review.id, req.user.id);
      run('UPDATE reviews SET helpful_count = MAX(0, helpful_count - 1) WHERE id = ?', review.id);
      return ok(res, { message: 'رأی شما لغو شد.', helpful: false });
    }
    run(
      'INSERT INTO review_helpful (review_id,user_id,created_at) VALUES (?,?,?)',
      review.id, req.user.id, nowIso(),
    );
    run('UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?', review.id);
    return ok(res, { message: 'ثبت شد.', helpful: true });
  }),
);

/** --- مسیرهای مدیریتی (فروشنده/مدیر) ----------------------------------- */

router.get(
  '/admin/all',
  requireAuth,
  requireRole('admin', 'seller', 'support'),
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 20, 100);
    const { where, params } = buildProductFilters(req, { forceStatus: null });
    const rows = productsQuery({ where, params, sort: req.query.sort || 'newest', limit, offset });
    const total = get(`SELECT COUNT(*) c FROM products p ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, ...params).c;
    return ok(res, { items: rows.map((r) => productPublic(r)), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  }),
);

router.post(
  '/',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...config.security.rateLimits.write, scope: 'product-create' }),
  asyncHandler((req, res) => {
    const b = req.body || {};
    if (!cleanText(b.name, { max: 200, multiline: false })) return fail(res, 'نام و قیمت محصول الزامی است.');
    const numbersError = validateProductNumbers(b);
    if (numbersError) return fail(res, numbersError);
    const priceValue = num(b.price, 0);
    if (priceValue <= 0) return fail(res, 'قیمت محصول باید بزرگ‌تر از صفر باشد.');
    const id = uid('prd');
    const slug = String(b.slug || b.name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '') || id;
    if (get('SELECT id FROM products WHERE slug = ?', slug)) return fail(res, 'این نامک (slug) قبلاً استفاده شده است.');
    const ts = nowIso();
    const images = Array.isArray(b.images) && b.images.length ? b.images : ['/api/placeholder?text=EasyShop'];
    run(
      `INSERT INTO products (id,sku,slug,name_fa,name_en,brand,category_id,price,compare_at_price,cost,stock,low_stock_threshold,unit,
        short_desc_fa,short_desc_en,description_fa,description_en,specs,tags,images,thumbnail,status,featured,warranty,shipping_days,
        ai_meta,created_by,created_at,updated_at,published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      b.sku || `ES-${id.slice(-6).toUpperCase()}`,
      slug,
      cleanText(b.name, { max: 200, multiline: false }),
      cleanText(b.name_en, { max: 200, multiline: false }) || null,
      cleanText(b.brand, { max: 80, multiline: false }) || null,
      b.category_id ?? null,
      Math.round(Number(b.price) || 0),
      b.compare_at_price ? Math.round(Number(b.compare_at_price)) : null,
      b.cost ? Math.round(Number(b.cost)) : null,
      Math.round(Number(b.stock) || 0),
      Number(b.low_stock_threshold) || 5,
      b.unit || 'عدد',
      b.short_desc ?? null,
      b.short_desc_en ?? null,
      b.description ?? null,
      b.description_en ?? null,
      stringifyJson(b.specs || {}),
      stringifyJson(b.tags || []),
      stringifyJson(images),
      images[0],
      b.status || 'active',
      b.featured ? 1 : 0,
      b.warranty ?? null,
      Number(b.shipping_days) || 3,
      stringifyJson({ source: b.ai_generation_id ? 'ai' : 'manual', generation_id: b.ai_generation_id ?? null, ai_meta: b.ai_meta ?? null }),
      req.user.id, ts, ts, (b.status || 'active') === 'active' ? ts : null,
    );
    if (Array.isArray(b.variants)) {
      for (const v of b.variants) {
        run(
          'INSERT INTO product_variants (id,product_id,name_fa,name_en,price_delta,stock,attributes) VALUES (?,?,?,?,?,?,?)',
          uid('var'), id, v.name_fa || v.name || 'استاندارد', v.name_en ?? null, Number(v.price_delta) || 0, Number(v.stock) || 0, stringifyJson(v.attributes || {}),
        );
      }
    }
    if (Number(b.stock) > 0) {
      run('INSERT INTO inventory_movements (id,product_id,delta,reason,user_id,created_at) VALUES (?,?,?,?,?,?)', uid('inv'), id, Number(b.stock), 'موجودی اولیه', req.user.id, ts);
    }
    logAudit(req, 'product_create', 'product', id, { name: b.name });
    return ok(res, { product: productPublic(get('SELECT * FROM products WHERE id = ?', id)) }, 201);
  }),
);

router.put(
  '/:id',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...config.security.rateLimits.write, scope: 'product-update' }),
  asyncHandler((req, res) => {
    const product = get('SELECT * FROM products WHERE id = ? OR slug = ?', req.params.id, req.params.id);
    if (!product) return fail(res, 'محصول یافت نشد.', 404);
    const b = req.body || {};
    const numbersError = validateProductNumbers(b);
    if (numbersError) return fail(res, numbersError);
    const fields = {
      name_fa: b.name,
      name_en: b.name_en,
      brand: b.brand,
      category_id: b.category_id,
      price: b.price !== undefined ? Math.round(Number(b.price)) : undefined,
      compare_at_price: b.compare_at_price !== undefined ? (b.compare_at_price ? Math.round(Number(b.compare_at_price)) : null) : undefined,
      cost: b.cost !== undefined ? (b.cost ? Math.round(Number(b.cost)) : null) : undefined,
      stock: b.stock !== undefined ? Math.round(Number(b.stock)) : undefined,
      unit: b.unit,
      short_desc_fa: b.short_desc,
      short_desc_en: b.short_desc_en,
      description_fa: b.description,
      description_en: b.description_en,
      specs: b.specs !== undefined ? stringifyJson(b.specs) : undefined,
      tags: b.tags !== undefined ? stringifyJson(b.tags) : undefined,
      images: b.images !== undefined ? stringifyJson(b.images) : undefined,
      thumbnail: b.thumbnail,
      status: b.status,
      featured: b.featured !== undefined ? (b.featured ? 1 : 0) : undefined,
      warranty: b.warranty,
      shipping_days: b.shipping_days,
      low_stock_threshold: b.low_stock_threshold,
      ai_meta: b.ai_meta !== undefined ? stringifyJson(b.ai_meta) : undefined,
    };
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length) {
      const sets = entries.map(([k]) => `${k} = ?`).join(', ');
      run(`UPDATE products SET ${sets}, updated_at = ? WHERE id = ?`, ...entries.map(([, v]) => v), nowIso(), product.id);
    }
    if (b.stock !== undefined && Number(b.stock) !== product.stock) {
      run(
        'INSERT INTO inventory_movements (id,product_id,delta,reason,user_id,created_at) VALUES (?,?,?,?,?,?)',
        uid('inv'), product.id, Number(b.stock) - product.stock, 'ویرایش دستی موجودی', req.user.id, nowIso(),
      );
    }
    logAudit(req, 'product_update', 'product', product.id, { fields: entries.map(([k]) => k) });
    return ok(res, { product: productPublic(get('SELECT * FROM products WHERE id = ?', product.id)) });
  }),
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  rateLimit({ ...config.security.rateLimits.write, scope: 'product-archive' }),
  asyncHandler((req, res) => {
    const product = get('SELECT id FROM products WHERE id = ? OR slug = ?', req.params.id, req.params.id);
    if (!product) return fail(res, 'محصول یافت نشد.', 404);
    run("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?", nowIso(), product.id);
    logAudit(req, 'product_archive', 'product', product.id);
    return ok(res, { message: 'محصول به آرشیو منتقل شد.' });
  }),
);

router.post(
  '/:id/stock',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...config.security.rateLimits.write, scope: 'product-stock' }),
  asyncHandler((req, res) => {
    const product = get('SELECT * FROM products WHERE id = ? OR slug = ?', req.params.id, req.params.id);
    if (!product) return fail(res, 'محصول یافت نشد.', 404);
    const raw = req.body?.delta;
    if (!isInt(raw)) return fail(res, 'مقدار تغییر موجودی باید عدد صحیح باشد.');
    const delta = Math.trunc(Number(raw));
    if (Math.abs(delta) > 1_000_000) return fail(res, 'مقدار تغییر موجودی بیش از حد مجاز است.');
    const stock = Math.max(0, product.stock + delta);
    run('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?', stock, nowIso(), product.id);
    run(
      'INSERT INTO inventory_movements (id,product_id,delta,reason,ref,user_id,created_at) VALUES (?,?,?,?,?,?,?)',
      uid('inv'), product.id, delta, cleanText(req.body?.reason, { max: 200, multiline: false }) || 'اصلاح موجودی',
      cleanText(req.body?.ref, { max: 100, multiline: false }) || null, req.user.id, nowIso(),
    );
    return ok(res, { stock });
  }),
);

export default router;
