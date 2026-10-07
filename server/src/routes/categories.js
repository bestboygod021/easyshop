import express from 'express';
import { all, get, nowIso, run, uid } from '../db/index.js';
import { requireAuth, requireRole, logAudit } from '../middleware/auth.js';
import { asyncHandler, fail, ok } from '../utils/helpers.js';

const router = express.Router();

function countProducts(categoryId) {
  const kids = all('SELECT id FROM categories WHERE parent_id = ?', categoryId).map((c) => c.id);
  const list = [categoryId, ...kids];
  return get(`SELECT COUNT(*) c FROM products WHERE status='active' AND category_id IN (${list.map(() => '?').join(',')})`, ...list).c;
}

/** GET /api/categories — درخت دسته‌بندی‌ها */
router.get(
  '/',
  asyncHandler((req, res) => {
    const includeInactive = req.query.include_inactive === '1';
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
  asyncHandler((req, res) => {
    const { name, name_en, slug: rawSlug, parent_id, icon, color, description, sort_order, image } = req.body || {};
    if (!name) return fail(res, 'نام دسته‌بندی الزامی است.');
    const slug = String(rawSlug || name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');
    if (get('SELECT id FROM categories WHERE slug = ?', slug)) return fail(res, 'این نامک تکراری است.');
    const id = uid('cat');
    run(
      `INSERT INTO categories (id,parent_id,slug,name_fa,name_en,icon,color,image,description_fa,sort_order,is_active,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
      id, parent_id ?? null, slug, name, name_en ?? null, icon ?? 'Tag', color ?? '#6366f1', image ?? null,
      description ?? null, Number(sort_order) || 99, nowIso(),
    );
    logAudit(req, 'category_create', 'category', id, { name });
    return ok(res, { category: get('SELECT * FROM categories WHERE id = ?', id) }, 201);
  }),
);

router.put(
  '/:id',
  requireAuth,
  requireRole('admin', 'seller'),
  asyncHandler((req, res) => {
    const cat = get('SELECT * FROM categories WHERE id = ? OR slug = ?', req.params.id, req.params.id);
    if (!cat) return fail(res, 'دسته‌بندی یافت نشد.', 404);
    const b = req.body || {};
    run(
      `UPDATE categories SET name_fa = COALESCE(?, name_fa), name_en = COALESCE(?, name_en), icon = COALESCE(?, icon),
        color = COALESCE(?, color), image = COALESCE(?, image), description_fa = COALESCE(?, description_fa),
        sort_order = COALESCE(?, sort_order), is_active = COALESCE(?, is_active), parent_id = ? WHERE id = ?`,
      b.name ?? null, b.name_en ?? null, b.icon ?? null, b.color ?? null, b.image ?? null, b.description ?? null,
      b.sort_order !== undefined ? Number(b.sort_order) : null,
      b.is_active !== undefined ? (b.is_active ? 1 : 0) : null,
      b.parent_id !== undefined ? b.parent_id : cat.parent_id,
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
