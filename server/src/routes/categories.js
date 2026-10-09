import express from 'express';
import { all, get, nowIso, run, uid } from '../db/index.js';
import { optionalAuth, requireAuth, requireRole, isStaff, logAudit } from '../middleware/auth.js';
import { asyncHandler, fail, ok } from '../utils/helpers.js';
import { config } from '../config.js';
import { cleanText, rateLimit } from '../middleware/security.js';

const router = express.Router();

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** جلوگیری از حلقه در درخت دسته‌بندی (والد شدن خود یا فرزندان خود) */
function wouldCycle(categoryId, newParentId) {
  if (!newParentId) return false;
  if (newParentId === categoryId) return true;
  let cursor = newParentId;
  for (let depth = 0; cursor && depth < 32; depth += 1) {
    if (cursor === categoryId) return true;
    cursor = get('SELECT parent_id FROM categories WHERE id = ?', cursor)?.parent_id || null;
  }
  return false;
}

/** اعتبارسنجی فیلدهای دسته‌بندی؛ پیام خطا یا null */
function validateCategory(b) {
  if (b.name !== undefined && !cleanText(b.name, { max: 80, multiline: false })) return 'نام دسته‌بندی الزامی است.';
  if (b.color !== undefined && b.color !== null && !HEX_COLOR.test(String(b.color))) return 'کد رنگ نامعتبر است.';
  if (b.icon !== undefined && b.icon !== null && String(b.icon).length > 40) return 'نام آیکون نامعتبر است.';
  if (b.image !== undefined && b.image !== null && String(b.image).length > 500) return 'آدرس تصویر نامعتبر است.';
  if (b.sort_order !== undefined && (!Number.isInteger(Number(b.sort_order)) || Number(b.sort_order) < 0 || Number(b.sort_order) > 10_000)) {
    return 'ترتیب نمایش نامعتبر است.';
  }
  if (b.parent_id !== undefined && b.parent_id !== null && b.parent_id !== '' && !get('SELECT id FROM categories WHERE id = ?', b.parent_id)) {
    return 'دسته‌بندی والد یافت نشد.';
  }
  return null;
}

function countProducts(categoryId) {
  const kids = all('SELECT id FROM categories WHERE parent_id = ?', categoryId).map((c) => c.id);
  const list = [categoryId, ...kids];
  return get(`SELECT COUNT(*) c FROM products WHERE status='active' AND category_id IN (${list.map(() => '?').join(',')})`, ...list).c;
}

/** GET /api/categories — درخت دسته‌بندی‌ها */
router.get(
  '/',
  optionalAuth,
  asyncHandler((req, res) => {
    // فهرست کامل (شامل غیرفعال‌ها) فقط برای کارکنان
    const includeInactive = req.query.include_inactive === '1' && isStaff(req.user);
    const rows = all(
      `SELECT * FROM categories ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY sort_order, name_fa`,
    );
    const map = new Map();
    for (const r of rows) {
      map.set(r.id, {
        id: r.id, parent_id: r.parent_id, slug: r.slug, name: r.name_fa, name_en: r.name_en,
        icon: r.icon, color: r.color, image: r.image, description: r.description_fa,
        is_active: Boolean(r.is_active), sort_order: r.sort_order, product_count: countProducts(r.id), children: [],
      });
    }
    const tree = [];
    for (const node of map.values()) {
      if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id).children.push(node);
      else tree.push(node);
    }
    if (req.query.flat === '1') return ok(res, { items: [...map.values()] });
    return ok(res, { items: tree });
  }),
);

/** GET /api/categories/:slug */
router.get(
  '/:slug',
  asyncHandler((req, res) => {
    const cat = get('SELECT * FROM categories WHERE slug = ? OR id = ?', req.params.slug, req.params.slug);
    if (!cat) return fail(res, 'دسته‌بندی یافت نشد.', 404);
    const children = all('SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order', cat.id);
    const parent = cat.parent_id ? get('SELECT * FROM categories WHERE id = ?', cat.parent_id) : null;
    return ok(res, {
      category: {
        id: cat.id, slug: cat.slug, name: cat.name_fa, name_en: cat.name_en, icon: cat.icon,
        color: cat.color, description: cat.description_fa, product_count: countProducts(cat.id),
      },
      parent: parent ? { id: parent.id, slug: parent.slug, name: parent.name_fa } : null,
      children: children.map((c) => ({ id: c.id, slug: c.slug, name: c.name_fa, icon: c.icon, product_count: countProducts(c.id) })),
    });
  }),
);

/** --- CRUD مدیریتی ------------------------------------------------------- */

router.post(
  '/',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...config.security.rateLimits.write, scope: 'category-create' }),
  asyncHandler((req, res) => {
    const { name, name_en, slug: rawSlug, parent_id, icon, color, description, sort_order, image } = req.body || {};
    if (!cleanText(name, { max: 80, multiline: false })) return fail(res, 'نام دسته‌بندی الزامی است.');
    const invalid = validateCategory(req.body || {});
    if (invalid) return fail(res, invalid);
    const slug = String(rawSlug || name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 80);
    if (!slug) return fail(res, 'نامک (slug) نامعتبر است.');
    if (get('SELECT id FROM categories WHERE slug = ?', slug)) return fail(res, 'این نامک تکراری است.');
    const id = uid('cat');
    run(
      `INSERT INTO categories (id,parent_id,slug,name_fa,name_en,icon,color,image,description_fa,sort_order,is_active,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
      id, parent_id || null, slug, cleanText(name, { max: 80, multiline: false }),
      cleanText(name_en, { max: 80, multiline: false }) || null,
      cleanText(icon, { max: 40, multiline: false }) || 'Tag', color || '#6366f1',
      cleanText(image, { max: 500, multiline: false }) || null,
      cleanText(description, { max: 600 }) || null, Number(sort_order) || 99, nowIso(),
    );
    logAudit(req, 'category_create', 'category', id, { name });
    return ok(res, { category: get('SELECT * FROM categories WHERE id = ?', id) }, 201);
  }),
);

router.put(
  '/:id',
  requireAuth,
  requireRole('admin', 'seller'),
  rateLimit({ ...config.security.rateLimits.write, scope: 'category-update' }),
  asyncHandler((req, res) => {
    const cat = get('SELECT * FROM categories WHERE id = ? OR slug = ?', req.params.id, req.params.id);
    if (!cat) return fail(res, 'دسته‌بندی یافت نشد.', 404);
    const b = req.body || {};
    const invalid = validateCategory(b);
    if (invalid) return fail(res, invalid);
    if (b.parent_id !== undefined && wouldCycle(cat.id, b.parent_id || null)) {
      return fail(res, 'انتقال دسته به زیرمجموعه‌ی خودش مجاز نیست.');
    }
    run(
      `UPDATE categories SET name_fa = COALESCE(?, name_fa), name_en = COALESCE(?, name_en), icon = COALESCE(?, icon),
        color = COALESCE(?, color), image = COALESCE(?, image), description_fa = COALESCE(?, description_fa),
        sort_order = COALESCE(?, sort_order), is_active = COALESCE(?, is_active), parent_id = ? WHERE id = ?`,
      b.name !== undefined ? cleanText(b.name, { max: 80, multiline: false }) : null,
      b.name_en !== undefined ? cleanText(b.name_en, { max: 80, multiline: false }) : null,
      b.icon !== undefined ? cleanText(b.icon, { max: 40, multiline: false }) : null,
      b.color ?? null,
      b.image !== undefined ? cleanText(b.image, { max: 500, multiline: false }) : null,
      b.description !== undefined ? cleanText(b.description, { max: 600 }) : null,
      b.sort_order !== undefined ? Number(b.sort_order) : null,
      b.is_active !== undefined ? (b.is_active ? 1 : 0) : null,
      b.parent_id !== undefined ? (b.parent_id || null) : cat.parent_id,
      cat.id,
    );
    logAudit(req, 'category_update', 'category', cat.id);
    return ok(res, { category: get('SELECT * FROM categories WHERE id = ?', cat.id) });
  }),
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  rateLimit({ ...config.security.rateLimits.write, scope: 'category-delete' }),
  asyncHandler((req, res) => {
    const cat = get('SELECT * FROM categories WHERE id = ? OR slug = ?', req.params.id, req.params.id);
    if (!cat) return fail(res, 'دسته‌بندی یافت نشد.', 404);
    const used = get('SELECT COUNT(*) c FROM products WHERE category_id = ?', cat.id).c;
    if (used > 0) {
      run('UPDATE categories SET is_active = 0 WHERE id = ?', cat.id);
      return ok(res, { message: `این دسته ${used} محصول دارد و به حالت غیرفعال منتقل شد.` });
    }
    run('DELETE FROM categories WHERE id = ?', cat.id);
    logAudit(req, 'category_delete', 'category', cat.id);
    return ok(res, { message: 'دسته‌بندی حذف شد.' });
  }),
);

export default router;
