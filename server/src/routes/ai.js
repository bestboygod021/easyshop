import express from 'express';
import { all, get, getSettings, nowIso, parseJson, run, setSetting, stringifyJson, uid } from '../db/index.js';
import { isStaff, logAudit, optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, fail, ok, paginate, productPublic } from '../utils/helpers.js';
import {
  analyzeReviews, generateCategories, generateProduct, generateProductImage, marketingCopy,
  modelOptions, seoBundle, storeAssistant, suggestPrice, supportReply,
} from '../services/ai/commerce.js';
import { aiComplete, getProvider, listProviders } from '../services/ai/gateway.js';
import { PROVIDER_CATALOG } from '../services/ai/providers.js';
import { config } from '../config.js';
import { encryptAiKey, isEncryptedAiKey } from '../services/ai/key-crypto.js';
import { cleanText, rateLimit } from '../middleware/security.js';

const router = express.Router();

const AI_LIMIT = { ...config.security.rateLimits.ai, scope: 'ai' };

/**
 * نمایش امن ارائه‌دهنده‌ها — کلید خام API هرگز در پاسخ HTTP قرار نمی‌گیرد
 * (فقط نسخه‌ی ماسک‌شده برای نمایش در پنل مدیریت).
 */
function safeProvider(p) {
  return {
    slug: p.slug,
    name: p.name_fa,
    name_en: p.name_en,
    kind: p.kind,
    badge: p.badge,
    docs: p.docs,
    models: p.models,
    default_model: p.defaultModel,
    supports_image: p.supportsImage,
    enabled: p.enabled,
    configured: p.configured,
    priority: p.priority,
    temperature: p.temperature,
    max_tokens: p.maxTokens,
    monthly_token_cap: p.monthly_token_cap,
    used_tokens: p.used_tokens,
    api_key_masked: p.api_key_masked,
    notes: p.notes,
  };
}

/** GET /api/ai/models — مدل‌های قابل انتخاب (۵ مدل برتر + بقیه) */
router.get(
  '/models',
  asyncHandler((_req, res) => {
    const providers = listProviders().map((p) => ({
      slug: p.slug, name: p.name_fa, name_en: p.name_en, kind: p.kind, models: p.models,
      default_model: p.defaultModel, configured: p.configured, enabled: p.enabled,
      supports_image: p.supportsImage, badge: p.badge, docs: p.docs, priority: p.priority,
    }));
    return ok(res, {
      providers,
      featured: modelOptions().featured,
      featured_catalog: PROVIDER_CATALOG.map(({ envKey, ...rest }) => rest),
    });
  }),
);

/** GET /api/ai/providers — مدیریت ارائه‌دهنده‌ها (مدیر) */
router.get(
  '/providers',
  requireAuth,
  requireRole('admin'),
  asyncHandler((_req, res) =>
    ok(res, {
      providers: listProviders().map((p) => ({
        slug: p.slug,
        name: p.name_fa,
        name_en: p.name_en,
        kind: p.kind,
        badge: p.badge,
        docs: p.docs,
        models: p.models,
        default_model: p.defaultModel,
        supports_image: p.supportsImage,
        enabled: p.enabled,
        configured: p.configured,
        priority: p.priority,
        temperature: p.temperature,
        max_tokens: p.maxTokens,
        monthly_token_cap: p.monthly_token_cap,
        used_tokens: p.used_tokens,
        api_key_masked: p.api_key_masked,
        notes: p.notes,
      })),
    }),
  ),
);

/** PUT /api/ai/providers/:slug — ذخیره کلید API و تنظیمات مدل */
router.put(
  '/providers/:slug',
  rateLimit({ ...config.security.rateLimits.write, scope: 'ai-provider-update' }),
  requireAuth,
  requireRole('admin'),
  asyncHandler((req, res) => {
    const provider = get('SELECT * FROM ai_providers WHERE slug = ?', req.params.slug);
    if (!provider) return fail(res, 'ارائه‌دهنده یافت نشد.', 404);
    const b = req.body || {};
    // کلید خام پیش از ذخیره با AES-256-GCM رمز می‌شود و هرگز در audit log بازتاب نمی‌یابد.
    let encryptedApiKey = null;
    if (b.api_key !== undefined && b.api_key !== null && b.api_key !== '') {
      if (typeof b.api_key !== 'string' || b.api_key.trim().length > 300) return fail(res, 'کلید API نامعتبر یا بیش از حد طولانی است.');
      const apiKey = b.api_key.trim();
      if (isEncryptedAiKey(apiKey)) return fail(res, 'کلید خام API را وارد کنید، نه مقدار رمز‌شده را.');
      try {
        encryptedApiKey = encryptAiKey(apiKey);
      } catch {
        return fail(res, 'برای ذخیرهٔ امن کلید AI، AI_KEY_ENCRYPTION_KEY با حداقل ۳۲ بایت باید تنظیم شود.', 503);
      }
    }
    if (b.base_url !== undefined && b.base_url && !/^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(String(b.base_url))) {
      return fail(res, 'آدرس پایه معتبر نیست (فقط http/https).');
    }
    const temperature = b.temperature !== undefined ? Number(b.temperature) : null;
    if (temperature !== null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
      return fail(res, 'دمای مدل باید بین ۰ تا ۲ باشد.');
    }
    const maxTokens = b.max_tokens !== undefined ? Math.round(Number(b.max_tokens)) : null;
    if (maxTokens !== null && (!Number.isFinite(maxTokens) || maxTokens < 16 || maxTokens > 200_000)) {
      return fail(res, 'حداکثر توکن نامعتبر است.');
    }
    const modelsValue = b.models !== undefined ? JSON.stringify(b.models) : null;
    if (modelsValue && modelsValue.length > 4000) return fail(res, 'فهرست مدل‌ها بیش از حد طولانی است.');
    run(
      `UPDATE ai_providers SET api_key = COALESCE(?, api_key), base_url = COALESCE(?, base_url),
        default_model = COALESCE(?, default_model), enabled = COALESCE(?, enabled), priority = COALESCE(?, priority),
        temperature = COALESCE(?, temperature), max_tokens = COALESCE(?, max_tokens),
        monthly_token_cap = COALESCE(?, monthly_token_cap), notes = COALESCE(?, notes),
        models = COALESCE(?, models), updated_at = ? WHERE slug = ?`,
      b.api_key === undefined ? null : encryptedApiKey,
      b.base_url ?? null,
      b.default_model ?? null,
      b.enabled !== undefined ? (b.enabled ? 1 : 0) : null,
      b.priority !== undefined ? Number(b.priority) : null,
      temperature,
      maxTokens,
      b.monthly_token_cap !== undefined ? Math.round(Number(b.monthly_token_cap)) : null,
      b.notes !== undefined ? cleanText(b.notes, { max: 400 }) : null,
      modelsValue,
      nowIso(),
      req.params.slug,
    );
    logAudit(req, 'ai_provider_update', 'ai_provider', provider.id, { slug: provider.slug, key_updated: Boolean(b.api_key) });
    return ok(res, { message: 'تنظیمات ذخیره شد.', providers: listProviders().map(safeProvider) });
  }),
);

/** POST /api/ai/providers/:slug/test — تست اتصال */
router.post(
  '/providers/:slug/test',
  requireAuth,
  requireRole('admin'),
  rateLimit({ ...AI_LIMIT, scope: 'ai-test' }),
  asyncHandler(async (req, res) => {
    const provider = getProvider(req.params.slug);
    if (!provider) return fail(res, 'ارائه‌دهنده یافت نشد.', 404);
    const result = await aiComplete({
      slug: provider.slug,
      model: req.body?.model || provider.defaultModel,
      kind: 'connection_test',
      userId: req.user.id,
      fallback: false,
      maxTokens: 64,
      messages: [{ role: 'user', content: 'در یک جمله کوتاه فارسی بگو EasyShop آماده است.' }],
    });
    return ok(res, {
      ok: result.ok,
      provider: provider.slug,
      model: result.model,
      latency_ms: result.latency_ms,
      reply: result.text || null,
      error: result.ok ? null : result.attempts?.[0]?.error || result.error,
    });
  }),
);

/** PUT /api/ai/settings */
router.put(
  '/settings',
  rateLimit({ ...config.security.rateLimits.write, scope: 'ai-settings' }),
  requireAuth,
  requireRole('admin'),
  asyncHandler((req, res) => {
    const body = req.body || {};
    const allowed = new Set(['default_provider', 'auto_fallback', 'product_auto_publish', 'allow_customer_assistant', 'allow_support_ai']);
    if (Object.keys(body).some((key) => !allowed.has(key))) return fail(res, 'فیلد تنظیمات نامعتبر است.');

    const next = { ...(getSettings().ai || {}) };
    for (const [key, value] of Object.entries(body)) {
      if (key === 'default_provider') {
        if (typeof value !== 'string' || value.length > 40 || !get('SELECT slug FROM ai_providers WHERE slug = ?', value)) {
          return fail(res, 'ارائه‌دهندهٔ پیش‌فرض نامعتبر است.');
        }
        next[key] = value;
      } else {
        if (typeof value !== 'boolean') return fail(res, 'مقدار تنظیمات باید true یا false باشد.');
        next[key] = value;
      }
    }
    setSetting('ai', next);
    const safeSettings = getSettings().ai || {};
    logAudit(req, 'ai_settings_update', 'settings', null, { keys: Object.keys(body) });
    return ok(res, { settings: safeSettings });
  }),
);

/** POST /api/ai/generate/product — تولید محصول (و ذخیره پیش‌نویس) */
router.post(
  '/generate/product',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...AI_LIMIT, scope: 'ai-generate-product' }),
  asyncHandler(async (req, res) => {
    const brief = cleanText(req.body?.brief, { max: 1500 });
    const brand = cleanText(req.body?.brand, { max: 80, multiline: false });
    const category = cleanText(req.body?.category, { max: 80, multiline: false });
    const provider = String(req.body?.provider || 'builtin').slice(0, 40);
    const model = req.body?.model ? String(req.body.model).slice(0, 80) : undefined;
    const count = req.body?.count;
    const auto_publish = Boolean(req.body?.auto_publish);
    const price = req.body?.price !== undefined ? Math.max(0, Math.round(Number(req.body.price) || 0)) : undefined;
    if (!brief && !category) return fail(res, 'توضیح کوتاه یا دسته‌بندی محصول را وارد کنید.');
    if (count !== undefined && (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 5)) {
      return fail(res, 'تعداد پیشنهادها باید بین ۱ تا ۵ باشد.');
    }
    const result = await generateProduct({ brief, category, price, brand, count, slug: provider, model, userId: req.user.id });

    const categoryRow = category
      ? get('SELECT id FROM categories WHERE slug = ? OR name_fa = ? OR id = ?', category, category, category)
      : null;
    const generationId = uid('gen');
    run(
      `INSERT INTO ai_generations (id,kind,provider,model,user_id,input,output,status,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      generationId, 'product', result.generator.provider, result.generator.model, req.user.id,
      stringifyJson({ brief, category, price, brand }), stringifyJson(result.product), 'draft', nowIso(),
    );

    let created = null;
    if (auto_publish) {
      const p = result.product;
      const slug = `${String(p.slug || p.name_fa).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '')}-${generationId.slice(-4)}`;
      const id = uid('prd');
      const ts = nowIso();
      const images = [`/api/placeholder?text=${encodeURIComponent(p.name_fa.slice(0, 24))}&seed=${id.slice(-4)}`];
      run(
        `INSERT INTO products (id,sku,slug,name_fa,name_en,brand,category_id,price,compare_at_price,cost,stock,unit,
          short_desc_fa,short_desc_en,description_fa,description_en,specs,tags,images,thumbnail,status,featured,warranty,
          shipping_days,ai_meta,created_by,created_at,updated_at,published_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, `ES-${id.slice(-6).toUpperCase()}`, slug, p.name_fa, p.name_en, p.brand, categoryRow?.id ?? null,
        p.price, p.compare_at_price, p.cost, p.stock, p.unit, p.short_desc_fa, p.short_desc_en, p.description_fa,
        p.description_en, stringifyJson(p.specs), stringifyJson(p.tags), stringifyJson(images), images[0],
        'active', 0, p.warranty, p.shipping_days,
        stringifyJson({ source: 'ai', provider: result.generator.provider, model: result.generator.model, generation_id: generationId, seo: p.seo, marketing: p.marketing, faq: p.faq, image_prompt: p.image_prompt }),
        req.user.id, ts, ts, ts,
      );
      for (const v of p.variants || []) {
        run(
          'INSERT INTO product_variants (id,product_id,name_fa,name_en,price_delta,stock) VALUES (?,?,?,?,?,?)',
          uid('var'), id, v.name_fa || 'استاندارد', v.name_en ?? null, Number(v.price_delta) || 0, Number(v.stock) || 0,
        );
      }
      run('UPDATE ai_generations SET status = ?, product_id = ? WHERE id = ?', 'published', id, generationId);
      created = productPublic(get('SELECT * FROM products WHERE id = ?', id));
      logAudit(req, 'ai_product_published', 'product', id, { generationId });
    }

    return ok(res, {
      generation: { id: generationId, ...result.generator },
      product: result.product,
      created_product: created,
      cost: result.cost,
      usage: result.usage,
    }, 201);
  }),
);

/** POST /api/ai/generate/image — تولید تصویر محصول */
router.post(
  '/generate/image',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...AI_LIMIT, scope: 'ai-generate-image' }),
  asyncHandler(async (req, res) => {
    const { prompt, label, provider = 'builtin', model, product_id, set_as_thumbnail } = req.body || {};
    if (!prompt && !label && !product_id) return fail(res, 'توضیح تصویر یا محصول را مشخص کنید.');
    let finalPrompt = prompt;
    let finalLabel = label;
    if (product_id) {
      const product = get('SELECT * FROM products WHERE id = ? OR slug = ?', product_id, product_id);
      if (product) {
        finalLabel = finalLabel || product.name_fa;
        finalPrompt = finalPrompt || `${product.name_fa} (${product.brand || ''}) ${product.short_desc_fa || ''} — professional product photo`;
      }
    }
    const result = await generateProductImage({ prompt: finalPrompt, label: finalLabel, slug: provider, model, userId: req.user.id });
    let url = result.url || null;
    if (!url && result.base64) url = `data:${result.mime || 'image/png'};base64,${result.base64}`;
    if (!url && result.svg) url = `data:image/svg+xml;utf8,${encodeURIComponent(result.svg)}`;

    run(
      `INSERT INTO ai_generations (id,kind,provider,model,user_id,input,output,status,product_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      uid('gen'), 'image', result.provider, result.model, req.user.id,
      stringifyJson({ prompt: result.prompt }), stringifyJson({ url: result.svg ? '[svg]' : url ? '[image]' : null }), 'published',
      product_id ?? null, nowIso(),
    );

    if (product_id && url && set_as_thumbnail !== false) {
      const product = get('SELECT * FROM products WHERE id = ?', product_id);
      if (product) {
        const images = parseJson(product.images, []);
        images.unshift(url);
        run('UPDATE products SET images = ?, thumbnail = ?, updated_at = ? WHERE id = ?', stringifyJson(images.slice(0, 8)), url, nowIso(), product.id);
      }
    }
    return ok(res, { url, provider: result.provider, model: result.model, prompt: result.prompt, latency_ms: result.latency_ms });
  }),
);

/** POST /api/ai/generate/categories */
router.post(
  '/generate/categories',
  requireAuth,
  requireRole('admin'),
  rateLimit({ ...AI_LIMIT, scope: 'ai-generate-categories' }),
  asyncHandler(async (req, res) => {
    const topic = cleanText(req.body?.topic, { max: 300, multiline: false });
    const provider = String(req.body?.provider || 'builtin').slice(0, 40);
    const model = req.body?.model ? String(req.body.model).slice(0, 80) : undefined;
    const save = Boolean(req.body?.save);
    const result = await generateCategories({ topic, slug: provider, model, userId: req.user.id, count: Number(req.body?.count) || 6 });
    const saved = [];
    if (save) {
      for (const cat of result.categories) {
        const slug = String(cat.slug || cat.name_fa).trim().toLowerCase().replace(/\s+/g, '-');
        if (get('SELECT id FROM categories WHERE slug = ?', slug)) continue;
        const id = uid('cat');
        run(
          `INSERT INTO categories (id,slug,name_fa,name_en,icon,color,description_fa,sort_order,is_active,created_at)
           VALUES (?,?,?,?,?,?,?,?,1,?)`,
          id, slug, cat.name_fa, cat.name_en ?? null, cat.icon || 'Tag', cat.color || '#6366f1',
          `دسته‌بندی هوشمند تولیدشده با هوش مصنوعی`, 50, nowIso(),
        );
        for (const sub of cat.subcategories || []) {
          const subSlug = String(sub.slug || sub.name_fa).trim().toLowerCase().replace(/\s+/g, '-');
          if (get('SELECT id FROM categories WHERE slug = ?', subSlug)) continue;
          run(
            'INSERT INTO categories (id,parent_id,slug,name_fa,icon,color,sort_order,is_active,created_at) VALUES (?,?,?,?,?,?,?,1,?)',
            uid('cat'), id, subSlug, sub.name_fa, cat.icon || 'Tag', cat.color || '#6366f1', 51, nowIso(),
          );
        }
        saved.push(slug);
      }
    }
    return ok(res, { categories: result.categories, generator: result.generator, saved });
  }),
);

/** POST /api/ai/generate/seo */
router.post(
  '/generate/seo',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...AI_LIMIT, scope: 'ai-generate-seo' }),
  asyncHandler(async (req, res) => {
    const { topic, provider = 'builtin', model } = req.body || {};
    if (!topic) return fail(res, 'موضوع را وارد کنید.');
    const result = await seoBundle({ topic, slug: provider, model, userId: req.user.id });
    return ok(res, { seo: result.seo, generator: result.generator });
  }),
);

/** POST /api/ai/marketing — تولید کمپین بازاریابی */
router.post(
  '/marketing',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...AI_LIMIT, scope: 'ai-marketing' }),
  asyncHandler(async (req, res) => {
    const { topic, channel = 'all', provider = 'builtin', model } = req.body || {};
    if (!topic) return fail(res, 'موضوع کمپین را وارد کنید.');
    const result = await marketingCopy({ topic, channel, slug: provider, model, userId: req.user.id });
    return ok(res, { content: result.content, text: result.text, generator: result.generator });
  }),
);

/** POST /api/ai/pricing/:productId */
router.post(
  '/pricing/:productId',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...AI_LIMIT, scope: 'ai-pricing' }),
  asyncHandler(async (req, res) => {
    const result = await suggestPrice({ productId: req.params.productId, slug: req.body?.provider || 'builtin', model: req.body?.model, userId: req.user.id });
    if (!result.ok) return fail(res, result.error || 'خطا در تحلیل قیمت.', 400);
    return ok(res, { pricing: result.pricing, generator: result.generator });
  }),
);

/** POST /api/ai/analyze-reviews/:productId */
router.post(
  '/analyze-reviews/:productId',
  requireAuth,
  requireRole('admin', 'seller', 'support'),
  rateLimit({ ...AI_LIMIT, scope: 'ai-analyze' }),
  asyncHandler(async (req, res) => {
    const result = await analyzeReviews({ productId: req.params.productId, slug: req.body?.provider || 'builtin', model: req.body?.model, userId: req.user.id });
    if (!result.ok) return fail(res, result.error || 'تحلیل ممکن نشد.', 400);
    return ok(res, { analysis: result.analysis, generator: result.generator });
  }),
);

/** POST /api/ai/support-reply — پیشنهاد پاسخ برای کارمندان */
router.post(
  '/support-reply',
  requireAuth,
  requireRole('support', 'admin', 'seller'),
  rateLimit({ ...AI_LIMIT, scope: 'ai-support-reply' }),
  asyncHandler(async (req, res) => {
    const message = cleanText(req.body?.message, { max: 2000 });
    const tone = cleanText(req.body?.tone, { max: 40, multiline: false });
    const provider = String(req.body?.provider || 'builtin').slice(0, 40);
    const model = req.body?.model ? String(req.body.model).slice(0, 80) : undefined;
    if (!message) return fail(res, 'متن پیام مشتری را وارد کنید.');
    const result = await supportReply({ message, tone, slug: provider, model, userId: req.user.id });
    return ok(res, { reply: result.reply, generator: result.generator });
  }),
);

/** POST /api/ai/assistant — دستیار خرید مشتری */
router.post(
  '/assistant',
  optionalAuth,
  rateLimit({ ...AI_LIMIT, scope: 'ai-assistant' }),
  asyncHandler(async (req, res) => {
    const settings = getSettings();
    if (settings.ai?.allow_customer_assistant === false && !isStaff(req.user)) {
      return fail(res, 'دستیار هوشمند فروشگاه موقتاً غیرفعال است.', 403);
    }
    const message = cleanText(req.body?.message, { max: 1200 });
    const provider = req.body?.provider ? String(req.body.provider).slice(0, 40) : undefined;
    const model = req.body?.model ? String(req.body.model).slice(0, 80) : undefined;
    // تاریخچه: حداکثر ۱۰ پیام و متن محدود (جلوگیری از مصرف بی‌رویه‌ی توکن و تزریق پرامپت)
    const history = Array.isArray(req.body?.history)
      ? req.body.history.slice(-10).map((h) => ({
        role: h?.role === 'assistant' ? 'assistant' : 'user',
        content: cleanText(h?.content, { max: 1000 }),
      }))
      : [];
    if (!message) return fail(res, 'پرسش خود را بنویسید.');
    const result = await storeAssistant({ message, history, slug: provider || settings.ai?.default_provider || 'builtin', model, userId: req.user?.id ?? null });
    return ok(res, { reply: result.reply, suggestions: result.suggestions, generator: result.generator });
  }),
);

/** GET /api/ai/generations — پیش‌نویس‌های تولیدشده */
router.get(
  '/generations',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'ai-generations' }),
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 20, 100);
    const kind = req.query.kind ? 'WHERE kind = ?' : '';
    const items = all(
      `SELECT g.*, u.full_name user_name FROM ai_generations g LEFT JOIN users u ON u.id = g.user_id
       ${kind} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`,
      ...(req.query.kind ? [req.query.kind] : []), limit, offset,
    );
    return ok(res, {
      items: items.map((g) => ({ ...g, input: parseJson(g.input, {}), output: parseJson(g.output, {}) })),
      total: get(`SELECT COUNT(*) c FROM ai_generations g ${kind}`, ...(req.query.kind ? [req.query.kind] : [])).c,
      page,
      limit,
    });
  }),
);

/** POST /api/ai/generations/:id/publish — تبدیل پیش‌نویس به محصول */
router.post(
  '/generations/:id/publish',
  rateLimit({ ...config.security.rateLimits.write, scope: 'ai-publish' }),
  requireAuth,
  requireRole('admin', 'seller'),
  asyncHandler((req, res) => {
    const gen = get('SELECT * FROM ai_generations WHERE id = ?', req.params.id);
    if (!gen) return fail(res, 'پیش‌نویس یافت نشد.', 404);
    if (gen.status === 'published' && gen.product_id) return fail(res, 'این پیش‌نویس قبلاً منتشر شده است.');
    const product = parseJson(gen.output, {});
    if (!product?.name_fa) return fail(res, 'خروجی این پیش‌نویس قابل انتشار نیست.');
    const categoryId = req.body?.category_id || null;
    const id = uid('prd');
    const slug = `${String(product.slug || product.name_fa).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '')}-${id.slice(-4)}`;
    const ts = nowIso();
    const images = [`/api/placeholder?text=${encodeURIComponent(String(product.name_fa).slice(0, 24))}&seed=${id.slice(-4)}`];
    run(
      `INSERT INTO products (id,sku,slug,name_fa,name_en,brand,category_id,price,compare_at_price,cost,stock,unit,
        short_desc_fa,short_desc_en,description_fa,description_en,specs,tags,images,thumbnail,status,warranty,shipping_days,
        ai_meta,created_by,created_at,updated_at,published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, `ES-${id.slice(-6).toUpperCase()}`, slug, product.name_fa, product.name_en ?? null, product.brand ?? null, categoryId,
      Math.round(Number(product.price) || 0), product.compare_at_price ?? null, product.cost ?? null,
      Number(product.stock) || 0, product.unit || 'عدد', product.short_desc_fa ?? null, product.short_desc_en ?? null,
      product.description_fa ?? null, product.description_en ?? null, stringifyJson(product.specs || {}),
      stringifyJson(product.tags || []), stringifyJson(images), images[0], 'active', product.warranty ?? null,
      Number(product.shipping_days) || 3,
      stringifyJson({ source: 'ai', provider: gen.provider, model: gen.model, generation_id: gen.id, seo: product.seo, marketing: product.marketing, faq: product.faq }),
      req.user.id, ts, ts, ts,
    );
    run('UPDATE ai_generations SET status = ?, product_id = ? WHERE id = ?', 'published', id, gen.id);
    logAudit(req, 'ai_generation_publish', 'product', id, { generationId: gen.id });
    return ok(res, { product: productPublic(get('SELECT * FROM products WHERE id = ?', id)) }, 201);
  }),
);

router.delete(
  '/generations/:id',
  rateLimit({ ...config.security.rateLimits.write, scope: 'ai-generation-delete' }),
  requireAuth,
  requireRole('admin', 'seller'),
  asyncHandler((req, res) => {
    run('DELETE FROM ai_generations WHERE id = ?', req.params.id);
    return ok(res, { message: 'پیش‌نویس حذف شد.' });
  }),
);

/** GET /api/ai/logs — لاگ فراخوانی‌ها */
router.get(
  '/logs',
  requireAuth,
  requireRole('admin'),
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'ai-logs' }),
  asyncHandler((req, res) => {
    const { limit, offset } = paginate(req, 50, 200);
    const where = [];
    const params = [];
    if (req.query.provider) {
      where.push('provider = ?');
      params.push(req.query.provider);
    }
    if (req.query.status) {
      where.push('status = ?');
      params.push(req.query.status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return ok(res, {
      items: all(`SELECT * FROM ai_logs ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, limit, offset),
      total: get(`SELECT COUNT(*) c FROM ai_logs ${clause}`, ...params).c,
      stats: {
        calls: get('SELECT COUNT(*) c FROM ai_logs').c,
        errors: get("SELECT COUNT(*) c FROM ai_logs WHERE status='error'").c,
        tokens: get('SELECT COALESCE(SUM(tokens_in+tokens_out),0) t FROM ai_logs').t,
        cost: Number((get('SELECT COALESCE(SUM(cost),0) c FROM ai_logs').c || 0).toFixed(4)),
        by_provider: all('SELECT provider, COUNT(*) calls, COALESCE(SUM(tokens_in+tokens_out),0) tokens, COALESCE(SUM(cost),0) cost FROM ai_logs GROUP BY provider ORDER BY calls DESC'),
      },
    });
  }),
);

/** GET /api/ai/health — وضعیت آمادگی سرویس هوش مصنوعی */
router.get(
  '/health',
  asyncHandler((_req, res) => {
    const providers = listProviders();
    return ok(res, {
      ready: providers.some((p) => p.enabled && p.configured),
      configured: providers.filter((p) => p.configured && p.enabled).map((p) => p.slug),
      providers: providers.map((p) => ({ slug: p.slug, enabled: p.enabled, configured: p.configured, default_model: p.defaultModel })),
    });
  }),
);

export default router;
