import { all, get, run, nowIso, uid, parseJson, stringifyJson } from '../db/index.js';

export const ok = (res, data, status = 200) => res.status(status).json({ ok: true, ...data });
export const fail = (res, message, status = 400, extra = {}) => res.status(status).json({ ok: false, error: message, ...extra });

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** بسته‌بندی هندلر async برای جلوگیری از unhandled promise */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function paginate(req, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * تبدیل ردیف محصول به شکل عمومی.
 * نکته امنیتی: قیمت تمام‌شده (cost) هرگز برای کاربران عادی برگردانده نمی‌شود؛
 * فقط با withCost (مسیرهای کارمند/پنل مدیریت) قابل دریافت است.
 */
export function productPublic(row, { withDescription = true, withCost = false } = {}) {
  if (!row) return null;
  const p = {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name_fa,
    name_en: row.name_en,
    brand: row.brand,
    category_id: row.category_id,
    category_name: row.category_name ?? null,
    category_slug: row.category_slug ?? null,
    price: row.price,
    compare_at_price: row.compare_at_price,
    discount_percent:
      row.compare_at_price && row.compare_at_price > row.price
        ? Math.round(((row.compare_at_price - row.price) / row.compare_at_price) * 100)
        : 0,
    stock: row.stock,
    in_stock: row.stock > 0,
    unit: row.unit,
    rating: Number(row.rating_avg) || 0,
    rating_count: row.rating_count,
    sold_count: row.sold_count,
    featured: Boolean(row.featured),
    status: row.status,
    thumbnail: row.thumbnail,
    images: parseJson(row.images, []),
    short_desc: row.short_desc_fa,
    tags: parseJson(row.tags, []),
    warranty: row.warranty,
    shipping_days: row.shipping_days,
    created_at: row.created_at,
  };
  if (withDescription) {
    p.description = row.description_fa;
    p.description_en = row.description_en;
    p.specs = parseJson(row.specs, {});
    p.short_desc_en = row.short_desc_en;
    p.ai_meta = parseJson(row.ai_meta, null);
    if (withCost) p.cost = row.cost;
    p.margin = withCost && row.cost ? Math.round(((row.price - row.cost) / row.price) * 1000) / 10 : undefined;
  }
  return p;
}

export function productsQuery({ where = [], params = [], sort = 'newest', limit, offset }) {
  const orderBy = {
    newest: 'p.created_at DESC',
    cheapest: 'p.price ASC',
    expensive: 'p.price DESC',
    popular: 'p.sold_count DESC',
    rating: 'p.rating_avg DESC, p.rating_count DESC',
    discount: '(COALESCE(p.compare_at_price,0) - p.price) DESC',
  }[sort] || 'p.created_at DESC';

  const sql = `SELECT p.*, c.name_fa AS category_name, c.slug AS category_slug
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`;
  return all(sql, ...params, limit, offset);
}

export function buildProductFilters(req, { forceStatus = 'active' } = {}) {
  const where = [];
  const params = [];
  if (forceStatus) {
    where.push('p.status = ?');
    params.push(forceStatus);
  } else if (req.query.status) {
    where.push('p.status = ?');
    params.push(req.query.status);
  }
  if (req.query.category) {
    const cat = get('SELECT id FROM categories WHERE slug = ? OR id = ?', req.query.category, req.query.category);
    if (cat) {
      const ids = all('SELECT id FROM categories WHERE parent_id = ?', cat.id).map((c) => c.id);
      const list = [cat.id, ...ids];
      where.push(`p.category_id IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
  }
  if (req.query.q) {
    where.push('(p.name_fa LIKE ? OR p.name_en LIKE ? OR p.brand LIKE ? OR p.short_desc_fa LIKE ?)');
    const like = `%${req.query.q}%`;
    params.push(like, like, like, like);
  }
  if (req.query.brand) {
    where.push('p.brand = ?');
    params.push(req.query.brand);
  }
  if (req.query.min_price) {
    where.push('p.price >= ?');
    params.push(Number(req.query.min_price));
  }
  if (req.query.max_price) {
    where.push('p.price <= ?');
    params.push(Number(req.query.max_price));
  }
  if (req.query.in_stock === '1' || req.query.in_stock === 'true') where.push('p.stock > 0');
  if (req.query.featured === '1') where.push('p.featured = 1');
  if (req.query.on_sale === '1') where.push('p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price');
  if (req.query.rating) {
    where.push('p.rating_avg >= ?');
    params.push(Number(req.query.rating));
  }
  return { where, params };
}

export function getCart(userId, sessionKey, { create = true } = {}) {
  let cart = userId
    ? get('SELECT * FROM carts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', userId)
    : sessionKey
      ? get('SELECT * FROM carts WHERE session_key = ? ORDER BY created_at DESC LIMIT 1', sessionKey)
      : null;
  if (!cart && create) {
    const id = uid('crt');
    const ts = nowIso();
    run('INSERT INTO carts (id,user_id,session_key,created_at,updated_at) VALUES (?,?,?,?,?)', id, userId ?? null, sessionKey ?? null, ts, ts);
    cart = get('SELECT * FROM carts WHERE id = ?', id);
  }
  return cart;
}

export function cartItems(cartId) {
  const rows = all(
    `SELECT ci.*, p.name_fa, p.slug, p.thumbnail, p.price, p.stock, p.status AS product_status,
            v.name_fa AS variant_name, v.price_delta, v.stock AS variant_stock
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN product_variants v ON v.id = ci.variant_id
     WHERE ci.cart_id = ? ORDER BY ci.created_at ASC`,
    cartId,
  );
  return rows.map((r) => ({
    id: r.id,
    product_id: r.product_id,
    variant_id: r.variant_id,
    variant_name: r.variant_name,
    name: r.name_fa,
    slug: r.slug,
    thumbnail: r.thumbnail,
    qty: r.qty,
    note: r.note,
    unit_price: r.price + (r.price_delta || 0),
    total: (r.price + (r.price_delta || 0)) * r.qty,
    stock: r.variant_id ? r.variant_stock : r.stock,
    available: r.product_status === 'active' && (r.variant_id ? r.variant_stock : r.stock) > 0,
  }));
}

export function cartTotals(cart, items, settings) {
  const commerce = settings?.commerce || { tax_percent: 9, free_shipping_threshold: 5_000_000, shipping_flat: 45_000 };
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  let discount = 0;
  let coupon = null;
  if (cart?.coupon_code) {
    coupon = get('SELECT * FROM coupons WHERE code = ? AND is_active = 1', cart.coupon_code);
    if (coupon) {
      if (coupon.type === 'percent') {
        discount = Math.round((subtotal * coupon.value) / 100);
        if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount);
      } else if (coupon.type === 'fixed') {
        discount = Math.min(coupon.value, subtotal);
      } else if (coupon.type === 'free_shipping') {
        discount = 0;
      }
      if (coupon.min_subtotal && subtotal < coupon.min_subtotal) {
        discount = 0;
        coupon = { ...coupon, invalid: true, reason: `حداقل مبلغ سفارش ${coupon.min_subtotal.toLocaleString('fa-IR')} تومان است.` };
      }
    }
  }
  const afterDiscount = Math.max(0, subtotal - discount);
  const shippingFree = coupon?.type === 'free_shipping' || afterDiscount >= (commerce.free_shipping_threshold || 0) || items.length === 0;
  const shipping_cost = shippingFree ? 0 : commerce.shipping_flat || 0;
  const tax = Math.round((afterDiscount * (commerce.tax_percent || 0)) / 100);
  return {
    subtotal,
    discount,
    coupon: coupon ? { code: coupon.code, type: coupon.type, value: coupon.value, invalid: Boolean(coupon.invalid), reason: coupon.reason } : null,
    shipping_cost,
    shipping_free: shippingFree,
    tax,
    total: afterDiscount + shipping_cost + tax,
    item_count: items.reduce((s, i) => s + i.qty, 0),
    currency: commerce.currency_label || 'تومان',
  };
}

export const ORDER_STATUS_LABELS = {
  pending: 'در انتظار پرداخت',
  paid: 'پرداخت شده',
  processing: 'در حال پردازش',
  packed: 'بسته‌بندی شده',
  shipped: 'ارسال شده',
  delivered: 'تحویل داده شده',
  cancelled: 'لغو شده',
  refunded: 'بازگردانده شده',
  returned: 'مرجوع شده',
};

export const PAYMENT_STATUS_LABELS = {
  unpaid: 'پرداخت نشده',
  paid: 'پرداخت شده',
  failed: 'ناموفق',
  refunded: 'بازگردانده شده',
  pending: 'در انتظار',
};

export function orderPublic(order, { items = [], events = [], payments = [], user = null } = {}) {
  if (!order) return null;
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    status_label: ORDER_STATUS_LABELS[order.status] || order.status,
    payment_status_label: PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status,
    payment_status: order.payment_status,
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    shipping_cost: order.shipping_cost,
    total: order.total,
    coupon_code: order.coupon_code,
    address: parseJson(order.address, {}),
    shipping_method: order.shipping_method,
    shipping_carrier: order.shipping_carrier,
    tracking_code: order.tracking_code,
    customer_note: order.customer_note,
    admin_note: order.admin_note,
    placed_at: order.placed_at,
    paid_at: order.paid_at,
    shipped_at: order.shipped_at,
    delivered_at: order.delivered_at,
    cancelled_at: order.cancelled_at,
    items,
    events,
    payments,
    customer: user
      ? { id: user.id, name: user.full_name, email: user.email, phone: user.phone }
      : order.customer_name
        ? { id: order.user_id, name: order.customer_name, email: order.customer_email, phone: order.customer_phone }
        : null,
  };
}

export { uid, nowIso, stringifyJson, parseJson, all, get };
