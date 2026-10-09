import express from 'express';
import {
  all, get, getSettings, notify, nowIso, run, setSetting, tx, uid,
  verifyAuditLogIntegrity,
} from '../db/index.js';
import {
  createUser, hashPassword, logAudit, publicUser, requireAuth, requireRole,
} from '../middleware/auth.js';
import { asyncHandler, fail, HttpError, ok, paginate } from '../utils/helpers.js';
import { config } from '../config.js';
import { checkPasswordPolicy, cleanText, csvSafe, rateLimit } from '../middleware/security.js';
import { revokeAllSessions } from '../middleware/auth.js';
import { disconnectUser } from '../realtime/hub.js';
import { broadcast, onlineStats } from '../realtime/hub.js';
import { metricsRegistry } from '../services/metrics.js';
import { getActiveSloAlerts } from '../services/slo-monitor.js';
import { opsAlerts } from '../services/ops-alerts.js';
import { hydrateOrder, STATUS_FLOW, STATUS_LABELS } from './orders.js';

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'seller', 'support'));

/* ------------------------------- داشبورد -------------------------------- */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const range = Number(req.query.days) || 30;
    const since = `datetime('now','-${range} days')`;
    const kpis = {
      revenue: get(`SELECT COALESCE(SUM(total),0) v FROM orders WHERE payment_status='paid' AND placed_at >= ${since}`).v,
      revenue_total: get("SELECT COALESCE(SUM(total),0) v FROM orders WHERE payment_status='paid'").v,
      orders: get(`SELECT COUNT(*) c FROM orders WHERE placed_at >= ${since}`).c,
      orders_pending: get("SELECT COUNT(*) c FROM orders WHERE status IN ('pending','paid','processing','packed')").c,
      customers: get("SELECT COUNT(*) c FROM users WHERE role='customer'").c,
      new_customers: get(`SELECT COUNT(*) c FROM users WHERE role='customer' AND created_at >= ${since}`).c,
      products: get("SELECT COUNT(*) c FROM products WHERE status='active'").c,
      low_stock: get('SELECT COUNT(*) c FROM products WHERE stock <= low_stock_threshold AND status = \'active\'').c,
      out_of_stock: get("SELECT COUNT(*) c FROM products WHERE stock = 0 AND status='active'").c,
      tickets_open: get("SELECT COUNT(*) c FROM tickets WHERE status NOT IN ('closed','resolved')").c,
      chats_open: get("SELECT COUNT(*) c FROM conversations WHERE status != 'closed'").c,
      reviews: get('SELECT COUNT(*) c FROM reviews').c,
      avg_rating: Number((get('SELECT COALESCE(AVG(rating),0) a FROM reviews').a || 0).toFixed(2)),
      aov: 0,
      ai_calls: get(`SELECT COUNT(*) c FROM ai_logs WHERE created_at >= ${since}`).c,
      ai_cost: Number((get(`SELECT COALESCE(SUM(cost),0) s FROM ai_logs WHERE created_at >= ${since}`).s || 0).toFixed(4)),
      ...onlineStats(),
    };
    kpis.aov = kpis.orders ? Math.round(kpis.revenue / kpis.orders) : 0;

    const salesSeries = all(
      `SELECT DATE(placed_at) date, COALESCE(SUM(total),0) revenue, COUNT(*) orders
       FROM orders WHERE payment_status='paid' AND placed_at >= ${since} GROUP BY DATE(placed_at) ORDER BY date`,
    );
    const statusBreakdown = all('SELECT status, COUNT(*) c FROM orders GROUP BY status');
    const topProducts = all(
      `SELECT p.id, p.name_fa name, p.price, p.sold_count, p.stock, p.thumbnail, c.name_fa category
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.sold_count DESC LIMIT 8`,
    );
    const topCategories = all(
      `SELECT c.name_fa name, COUNT(oi.id) sold, COALESCE(SUM(oi.total),0) revenue
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id GROUP BY c.id ORDER BY revenue DESC LIMIT 6`,
    );
    const lowStock = all(
      "SELECT id, name_fa name, stock, low_stock_threshold, thumbnail FROM products WHERE stock <= low_stock_threshold AND status='active' ORDER BY stock ASC LIMIT 10",
    );
    const recentOrders = all(
      `SELECT o.*, u.full_name customer_name FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.placed_at DESC LIMIT 8`,
    );
    const recentTickets = all(
      `SELECT t.*, u.full_name customer_name FROM tickets t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC LIMIT 6`,
    );
    const recentReviews = all(
      `SELECT r.*, p.name_fa product_name, u.full_name user_name FROM reviews r
       LEFT JOIN products p ON p.id = r.product_id LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC LIMIT 6`,
    );
    const aiUsage = all(
      `SELECT provider, COUNT(*) calls, COALESCE(SUM(tokens_in+tokens_out),0) tokens, COALESCE(SUM(cost),0) cost
       FROM ai_logs WHERE created_at >= ${since} GROUP BY provider ORDER BY calls DESC`,
    );
    const traffic = all('SELECT DATE(created_at) date, COUNT(*) views FROM products GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 14');

    return ok(res, {
      kpis,
      sales_series: salesSeries,
      status_breakdown: statusBreakdown.map((s) => ({ ...s, label: STATUS_LABELS[s.status] || s.status })),
      top_products: topProducts,
      top_categories: topCategories,
      low_stock: lowStock,
      recent_orders: recentOrders.map((o) => ({
        id: o.id, code: o.code, status: o.status, status_label: STATUS_LABELS[o.status], total: o.total,
        placed_at: o.placed_at, customer_name: o.customer_name || 'مهمان',
        item_count: get('SELECT COUNT(*) c FROM order_items WHERE order_id = ?', o.id).c,
      })),
      recent_tickets: recentTickets,
      recent_reviews: recentReviews,
      ai_usage: aiUsage,
      traffic,
    });
  }),
);

router.get(
  '/observability',
  requireRole('admin'),
  asyncHandler((_req, res) => ok(res, {
    slo: metricsRegistry.getSloSnapshot({ windowMs: config.observability.sloWindowMs }),
    targets: {
      availability: config.observability.availabilityTarget,
      http_p95_latency_ms: config.observability.httpP95TargetMs,
      payment_verification_success: config.observability.paymentSuccessTarget,
    },
    active_alerts: getActiveSloAlerts(),
    recent_alerts: opsAlerts.getRecentAlerts(50),
  })),
);

/* -------------------------------- کاربران ------------------------------- */
router.get(
  '/users',
  requireRole('admin', 'support'),
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 20, 100);
    const where = [];
    const params = [];
    if (req.query.role) {
      where.push('role = ?');
      params.push(req.query.role);
    }
    if (req.query.status) {
      where.push('status = ?');
      params.push(req.query.status);
    }
    if (req.query.q) {
      where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      const term = `%${String(req.query.q).slice(0, 80)}%`;
      params.push(term, term, term);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = all(`SELECT * FROM users ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
    const total = get(`SELECT COUNT(*) c FROM users ${clause}`, ...params).c;
    return ok(res, {
      items: rows.map((u) => ({
        ...publicUser(u),
        orders: get('SELECT COUNT(*) c FROM orders WHERE user_id = ?', u.id).c,
        total_spent: get("SELECT COALESCE(SUM(total),0) s FROM orders WHERE user_id = ? AND payment_status='paid'", u.id).s,
        tickets: get('SELECT COUNT(*) c FROM tickets WHERE user_id = ?', u.id).c,
      })),
      total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
      summary: {
        customers: get("SELECT COUNT(*) c FROM users WHERE role='customer'").c,
        staff: get("SELECT COUNT(*) c FROM users WHERE role != 'customer'").c,
        blocked: get("SELECT COUNT(*) c FROM users WHERE status='blocked'").c,
      },
    });
  }),
);

router.get(
  '/users/:id',
  requireRole('admin', 'support'),
  asyncHandler((req, res) => {
    const user = get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) return fail(res, 'کاربر یافت نشد.', 404);
    return ok(res, {
      user: publicUser(user),
      orders: all('SELECT id, code, status, total, placed_at FROM orders WHERE user_id = ? ORDER BY placed_at DESC LIMIT 20', user.id),
      tickets: all('SELECT id, code, subject, status, priority, created_at FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', user.id),
      addresses: all('SELECT * FROM addresses WHERE user_id = ?', user.id),
      wallet_transactions: all('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', user.id),
    });
  }),
);

router.post(
  '/users',
  rateLimit({ ...config.security.rateLimits.write, scope: 'admin-user-create' }),
  requireRole('admin'),
  asyncHandler((req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 160);
    const full_name = cleanText(req.body?.full_name, { max: 120, multiline: false });
    const password = String(req.body?.password || '');
    const role = req.body?.role || 'customer';
    const status = req.body?.status || 'active';
    if (!email || !password || !full_name) return fail(res, 'ایمیل، رمز و نام الزامی است.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 'ایمیل معتبر وارد کنید.');
    if (!['admin', 'seller', 'support', 'customer'].includes(role)) return fail(res, 'نقش نامعتبر است.');
    if (!['active', 'blocked', 'pending'].includes(status)) return fail(res, 'وضعیت نامعتبر است.');
    const policyError = checkPasswordPolicy(password, { email });
    if (policyError) return fail(res, policyError);
    if (get('SELECT id FROM users WHERE lower(email) = lower(?)', email)) return fail(res, 'این ایمیل تکراری است.');
    const user = createUser({ email, password, full_name, phone: req.body?.phone, role, status });
    logAudit(req, 'user_create', 'user', user.id, { role });
    return ok(res, { user: publicUser(user) }, 201);
  }),
);

router.patch(
  '/users/:id',
  rateLimit({ ...config.security.rateLimits.write, scope: 'admin-user-update' }),
  requireRole('admin'),
  asyncHandler((req, res) => {
    const user = get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) return fail(res, 'کاربر یافت نشد.', 404);
    const b = req.body || {};
    // فقط فیلدهای شناخته‌شده پذیرفته می‌شوند (بدون Mass Assignment)
    const ROLES = ['admin', 'seller', 'support', 'customer'];
    const STATUSES = ['active', 'blocked', 'pending'];
    if (b.role !== undefined && !ROLES.includes(b.role)) return fail(res, 'نقش نامعتبر است.');
    if (b.status !== undefined && !STATUSES.includes(b.status)) return fail(res, 'وضعیت نامعتبر است.');
    if (req.params.id === req.user.id && (b.role !== undefined && b.role !== 'admin')) {
      return fail(res, 'نمی‌توانید نقش حساب خودتان را تغییر دهید.');
    }
    if (req.params.id === req.user.id && b.status === 'blocked') {
      return fail(res, 'نمی‌توانید حساب خودتان را مسدود کنید.');
    }

    let nextHash = null;
    if (b.password) {
      const policyError = checkPasswordPolicy(b.password, { email: user.email });
      if (policyError) return fail(res, policyError);
      nextHash = hashPassword(b.password);
    }

    const walletValue = b.wallet !== undefined ? Math.round(Number(b.wallet)) : null;
    if (walletValue !== null && (!Number.isFinite(walletValue) || walletValue < 0)) {
      return fail(res, 'مقدار کیف پول نامعتبر است.');
    }
    const pointsValue = b.loyalty_points !== undefined ? Math.round(Number(b.loyalty_points)) : null;
    if (pointsValue !== null && (!Number.isFinite(pointsValue) || pointsValue < 0)) {
      return fail(res, 'مقدار امتیاز نامعتبر است.');
    }

    run(
      `UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), role = COALESCE(?, role),
        status = COALESCE(?, status), notes = COALESCE(?, notes), wallet = COALESCE(?, wallet),
        loyalty_points = COALESCE(?, loyalty_points), password_hash = COALESCE(?, password_hash), updated_at = ?
       WHERE id = ?`,
      b.full_name !== undefined ? cleanText(b.full_name, { max: 120, multiline: false }) : null,
      b.phone !== undefined ? String(b.phone).replace(/[^0-9+\-\s]/g, '').slice(0, 20) : null,
      b.role ?? null, b.status ?? null,
      b.notes !== undefined ? cleanText(b.notes, { max: 600 }) : null,
      walletValue, pointsValue, nextHash,
      nowIso(), user.id,
    );

    // تغییر دستی کیف پول باید در دفتر تراکنش‌ها ثبت شود (قابلیت ردیابی مالی)
    if (walletValue !== null && walletValue !== user.wallet) {
      run(
        'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
        uid('wtx'), user.id, Math.abs(walletValue - user.wallet),
        walletValue > user.wallet ? 'credit' : 'debit',
        'تعدیل دستی توسط مدیر', `ADMIN-${req.user.id}`, walletValue, nowIso(),
      );
      logAudit(req, 'wallet_adjust', 'user', user.id, { from: user.wallet, to: walletValue });
    }
    if (b.status === 'blocked' || nextHash) {
      // ابطال کامل نشست‌ها (توکن دسترسی + توکن تازه‌سازی + اتصال‌های زنده)
      revokeAllSessions(user.id);
      disconnectUser(user.id, b.status === 'blocked' ? 'حساب کاربری مسدود شد.' : 'اطلاعات ورود تغییر کرد.');
    }
    logAudit(req, 'user_update', 'user', user.id, { fields: Object.keys(b) });
    return ok(res, { user: publicUser(get('SELECT * FROM users WHERE id = ?', user.id)) });
  }),
);

router.delete(
  '/users/:id',
  rateLimit({ ...config.security.rateLimits.write, scope: 'admin-user-delete' }),
  requireRole('admin'),
  asyncHandler((req, res) => {
    if (req.params.id === req.user.id) return fail(res, 'نمی‌توانید حساب خودتان را حذف کنید.');
    const user = get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) return fail(res, 'کاربر یافت نشد.', 404);
    run("UPDATE users SET status='blocked' WHERE id = ?", user.id);
    logAudit(req, 'user_block', 'user', user.id);
    return ok(res, { message: 'کاربر مسدود شد.' });
  }),
);

/* -------------------------------- سفارش‌ها ------------------------------ */
router.get(
  '/orders',
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 20, 100);
    const where = [];
    const params = [];
    if (req.query.status) {
      where.push('o.status = ?');
      params.push(req.query.status);
    }
    if (req.query.payment_status) {
      where.push('o.payment_status = ?');
      params.push(req.query.payment_status);
    }
    if (req.query.q) {
      where.push('(o.code LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
      const term = `%${String(req.query.q).slice(0, 80)}%`;
      params.push(term, term, term);
    }
    if (req.query.from) {
      where.push('o.placed_at >= ?');
      params.push(req.query.from);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = all(
      `SELECT o.*, u.full_name AS customer_name, u.email AS customer_email FROM orders o
       LEFT JOIN users u ON u.id = o.user_id ${clause} ORDER BY o.placed_at DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset,
    );
    const total = get(`SELECT COUNT(*) c FROM orders o LEFT JOIN users u ON u.id = o.user_id ${clause}`, ...params).c;
    return ok(res, {
      items: rows.map((o) => hydrateOrder(o, { withCustomer: true })),
      total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
      statuses: STATUS_LABELS, flow: STATUS_FLOW,
      counts: all('SELECT status, COUNT(*) c FROM orders GROUP BY status'),
      revenue: get("SELECT COALESCE(SUM(total),0) v FROM orders WHERE payment_status='paid'").v,
    });
  }),
);

router.patch(
  '/orders/:id',
  rateLimit({ ...config.security.rateLimits.write, scope: 'admin-order-action' }),
  asyncHandler((req, res) => {
    const order = get('SELECT * FROM orders WHERE id = ? OR code = ?', req.params.id, req.params.id);
    if (!order) return fail(res, 'سفارش یافت نشد.', 404);
    const b = req.body || {};
    const ts = nowIso();
    const sets = [];
    const params = [];
    if (b.status && b.status !== order.status) {
      sets.push('status = ?');
      params.push(b.status);
      if (b.status === 'shipped') {
        sets.push('shipped_at = ?');
        params.push(ts);
      }
      if (b.status === 'delivered') {
        sets.push('delivered_at = ?');
        params.push(ts);
      }
      run(
        'INSERT INTO order_events (id,order_id,status,note,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?)',
        uid('oev'), order.id, b.status, b.note || `تغییر وضعیت به ${STATUS_LABELS[b.status] || b.status}`, req.user.id, req.user.full_name, ts,
      );
      if (order.user_id) {
        notify({
          userId: order.user_id,
          title: `سفارش ${order.code} به‌روزرسانی شد`,
          body: `وضعیت جدید: ${STATUS_LABELS[b.status] || b.status}`,
          type: 'order',
          link: `/account/orders/${order.id}`,
        });
        broadcast(`user:${order.user_id}`, { type: 'order:update', order: { id: order.id, code: order.code, status: b.status } });
      }
    }
    const map = { tracking_code: b.tracking_code, shipping_carrier: b.shipping_carrier, admin_note: b.admin_note, payment_status: b.payment_status, shipping_method: b.shipping_method };
    for (const [key, value] of Object.entries(map)) {
      if (value !== undefined) {
        sets.push(`${key} = ?`);
        params.push(value);
      }
    }
    if (sets.length) run(`UPDATE orders SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...params, ts, order.id);
    logAudit(req, 'order_update', 'order', order.id, b);
    return ok(res, { order: hydrateOrder(get('SELECT * FROM orders WHERE id = ?', order.id), { withCustomer: true }) });
  }),
);

/* ------------------------------ کدهای تخفیف ----------------------------- */
router.get(
  '/coupons',
  asyncHandler(async (_req, res) =>
    ok(res, {
      items: all(
        `SELECT c.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) redemptions FROM coupons c ORDER BY c.created_at DESC`,
      ),
    }),
  ),
);

router.post(
  '/coupons',
  rateLimit({ ...config.security.rateLimits.write, scope: 'admin-coupon-create' }),
  requireRole('admin'),
  asyncHandler((req, res) => {
    const { code, type = 'percent', value = 0, min_subtotal = 0, max_discount, usage_limit, per_user_limit = 1, starts_at, ends_at, description } = req.body || {};
    if (!code) return fail(res, 'کد تخفیف الزامی است.');
    if (get('SELECT id FROM coupons WHERE upper(code) = upper(?)', code)) return fail(res, 'این کد قبلاً ثبت شده است.');
    const id = uid('cpn');
    run(
      `INSERT INTO coupons (id,code,type,value,min_subtotal,max_discount,starts_at,ends_at,usage_limit,per_user_limit,is_active,description,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      id, String(code).toUpperCase(), type, Math.round(Number(value) || 0), Math.round(Number(min_subtotal) || 0),
      max_discount ? Math.round(Number(max_discount)) : null, starts_at ?? null, ends_at ?? null,
      usage_limit ? Number(usage_limit) : null, Number(per_user_limit) || 1, description ?? null, nowIso(),
    );
    logAudit(req, 'coupon_create', 'coupon', id, { code });
    return ok(res, { coupon: get('SELECT * FROM coupons WHERE id = ?', id) }, 201);
  }),
);

router.patch(
  '/coupons/:id',
  rateLimit({ ...config.security.rateLimits.write, scope: 'admin-coupon-update' }),
  requireRole('admin'),
  asyncHandler((req, res) => {
    const coupon = get('SELECT * FROM coupons WHERE id = ?', req.params.id);
    if (!coupon) return fail(res, 'کد تخفیف یافت نشد.', 404);
    const b = req.body || {};
    run(
      `UPDATE coupons SET value = COALESCE(?, value), min_subtotal = COALESCE(?, min_subtotal), max_discount = COALESCE(?, max_discount),
        ends_at = COALESCE(?, ends_at), usage_limit = COALESCE(?, usage_limit), is_active = COALESCE(?, is_active), description = COALESCE(?, description)
       WHERE id = ?`,
      b.value !== undefined ? Math.round(Number(b.value)) : null,
      b.min_subtotal !== undefined ? Math.round(Number(b.min_subtotal)) : null,
      b.max_discount !== undefined ? Math.round(Number(b.max_discount)) : null,
      b.ends_at ?? null, b.usage_limit !== undefined ? Number(b.usage_limit) : null,
      b.is_active !== undefined ? (b.is_active ? 1 : 0) : null, b.description ?? null, coupon.id,
    );
    return ok(res, { coupon: get('SELECT * FROM coupons WHERE id = ?', coupon.id) });
  }),
);

/* --------------------------------- انبار --------------------------------- */
router.get(
  '/inventory',
  asyncHandler((req, res) => {
    const items = all(
      `SELECT p.id, p.name_fa name, p.sku, p.stock, p.low_stock_threshold, p.price, p.thumbnail, c.name_fa category
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status != 'archived' ORDER BY p.stock ASC`,
    );
    const movements = all(
      `SELECT m.*, p.name_fa product_name, u.full_name user_name FROM inventory_movements m
       LEFT JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.user_id
       ORDER BY m.created_at DESC LIMIT 50`,
    );
    return ok(res, {
      items,
      movements,
      summary: {
        total_units: items.reduce((s, i) => s + i.stock, 0),
        stock_value: items.reduce((s, i) => s + i.stock * i.price, 0),
        low: items.filter((i) => i.stock > 0 && i.stock <= i.low_stock_threshold).length,
        out: items.filter((i) => i.stock === 0).length,
      },
    });
  }),
);

/* ------------------------------- نظرات ---------------------------------- */
router.get(
  '/reviews',
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 20, 100);
    const where = req.query.status ? 'WHERE r.status = ?' : '';
    const items = all(
      `SELECT r.*, p.name_fa product_name, p.slug product_slug, u.full_name user_name FROM reviews r
       LEFT JOIN products p ON p.id = r.product_id LEFT JOIN users u ON u.id = r.user_id
       ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      ...(req.query.status ? [req.query.status] : []), limit, offset,
    );
    const total = get(`SELECT COUNT(*) c FROM reviews r ${where}`, ...(req.query.status ? [req.query.status] : [])).c;
    return ok(res, { items, total, page, limit });
  }),
);

router.patch(
  '/reviews/:id',
  rateLimit({ ...config.security.rateLimits.write, scope: 'admin-review-action' }),
  asyncHandler((req, res) => {
    const review = get('SELECT * FROM reviews WHERE id = ?', req.params.id);
    if (!review) return fail(res, 'نظر یافت نشد.', 404);
    const b = req.body || {};
    run(
      'UPDATE reviews SET status = COALESCE(?, status), reply = COALESCE(?, reply), replied_at = ? WHERE id = ?',
      b.status ?? null, b.reply ?? null, b.reply ? nowIso() : review.replied_at, review.id,
    );
    const agg = get('SELECT AVG(rating) a, COUNT(*) c FROM reviews WHERE product_id = ? AND status = ?', review.product_id, 'approved');
    run('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?', Number(Number(agg.a || 0).toFixed(2)), agg.c, review.product_id);
    logAudit(req, 'review_update', 'review', review.id, { status: b.status });
    return ok(res, { message: 'نظر به‌روزرسانی شد.' });
  }),
);

/* ------------------------------ تنظیمات --------------------------------- */
router.get(
  '/settings',
  requireRole('admin'),
  asyncHandler((_req, res) => ok(res, { settings: getSettings() })),
);

router.put(
  '/settings',
  rateLimit({ ...config.security.rateLimits.write, scope: 'admin-settings' }),
  requireRole('admin'),
  asyncHandler((req, res) => {
    const payload = req.body?.settings || req.body || {};
    const allowed = ['store', 'commerce', 'appearance', 'ai', 'integrations'];
    const updated = {};
    for (const [key, value] of Object.entries(payload)) {
      if (!allowed.includes(key)) continue;
      setSetting(key, value);
      updated[key] = key === 'ai' ? getSettings().ai : value;
    }
    logAudit(req, 'settings_update', 'settings', null, { keys: Object.keys(updated) });
    return ok(res, { message: 'تنظیمات ذخیره شد.', settings: getSettings() });
  }),
);

/* --------------------------- گزارش‌ها و لاگ‌ها ---------------------------- */
/**
 * GET /api/admin/export/orders.csv — خروجی CSV سفارش‌ها
 * تمام مقادیر با csvSafe پاک‌سازی می‌شوند تا فرمول‌های Excel (=, +, -, @) اجرا نشوند.
 */
router.get(
  '/export/orders.csv',
  requireRole('admin', 'support'),
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'admin-export' }),
  asyncHandler((req, res) => {
    const status = String(req.query.status || '').slice(0, 40);
    const rows = all(
      `SELECT o.id, o.code, o.status, o.payment_status, o.total, o.placed_at,
              u.full_name customer_name, u.email customer_email
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
       ${status ? 'WHERE o.status = ?' : ''}
       ORDER BY o.placed_at DESC LIMIT 5000`,
      ...(status ? [status] : []),
    );
    const header = ['کد سفارش', 'وضعیت', 'وضعیت پرداخت', 'مبلغ (تومان)', 'مشتری', 'ایمیل', 'تاریخ'];
    const lines = [header, ...rows.map((o) => [
      o.code, o.status, o.payment_status, o.total,
      o.customer_name || 'مهمان', o.customer_email || '-', o.placed_at,
    ])];
    const csv = `\uFEFF${lines.map((line) => line.map(csvSafe).join(',')).join('\r\n')}`;
    logAudit(req, 'export_orders', 'order', null, { rows: rows.length });
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="easyshop-orders-${Date.now()}.csv"`);
    return res.send(csv);
  }),
);

router.get(
  '/reports',
  asyncHandler((req, res) => {
    const days = Math.min(365, Math.max(1, Math.round(Number(req.query.days) || 30)));
    const salesByDay = all(
      `SELECT DATE(placed_at) date, COUNT(*) orders, COALESCE(SUM(total),0) revenue
       FROM orders WHERE payment_status='paid' AND placed_at >= datetime('now','-${days} days') GROUP BY DATE(placed_at) ORDER BY date`,
    );
    const salesByCategory = all(
      `SELECT c.name_fa name, COALESCE(SUM(oi.total),0) revenue, SUM(oi.qty) units
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       JOIN orders o ON o.id = oi.order_id WHERE o.payment_status='paid' GROUP BY c.id ORDER BY revenue DESC`,
    );
    const topCustomers = all(
      `SELECT u.id, u.full_name name, u.email, COUNT(o.id) orders, COALESCE(SUM(o.total),0) total
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.payment_status='paid'
       GROUP BY u.id ORDER BY total DESC LIMIT 10`,
    );
    const paymentMethods = all(
      "SELECT provider, COUNT(*) c, COALESCE(SUM(amount),0) amount FROM payments WHERE status='paid' GROUP BY provider",
    );
    const statusFunnel = all('SELECT status, COUNT(*) c FROM orders GROUP BY status');
    const reviewsByRating = all('SELECT rating, COUNT(*) c FROM reviews GROUP BY rating ORDER BY rating DESC');
    const daily = {
      orders_today: get("SELECT COUNT(*) c FROM orders WHERE DATE(placed_at) = DATE('now')").c,
      revenue_today: get("SELECT COALESCE(SUM(total),0) v FROM orders WHERE payment_status='paid' AND DATE(placed_at) = DATE('now')").v,
      new_customers_today: get("SELECT COUNT(*) c FROM users WHERE DATE(created_at) = DATE('now')").c,
      conversion: (() => {
        const views = get('SELECT COALESCE(SUM(view_count),0) v FROM products').v || 1;
        const orders = get("SELECT COUNT(*) c FROM orders WHERE payment_status='paid'").c;
        return Number(((orders / views) * 100).toFixed(2));
      })(),
    };
    return ok(res, { sales_by_day: salesByDay, sales_by_category: salesByCategory, top_customers: topCustomers, payment_methods: paymentMethods, status_funnel: statusFunnel, reviews_by_rating: reviewsByRating, daily });
  }),
);

router.get(
  '/audit-logs/integrity',
  requireRole('admin'),
  asyncHandler((_req, res) => ok(res, { integrity: verifyAuditLogIntegrity() })),
);

router.get(
  '/audit-logs',
  requireRole('admin'),
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 50, 200);
    return ok(res, {
      items: all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', limit, offset),
      total: get('SELECT COUNT(*) c FROM audit_logs').c,
      page,
      limit,
    });
  }),
);

/* ----------------------------- درخواست‌های حریم خصوصی ----------------------------- */
router.get(
  '/privacy-requests',
  requireRole('admin'),
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 50, 200);
    return ok(res, {
      items: all(`SELECT r.*, u.full_name AS requester_name, u.email AS requester_email
        FROM privacy_requests r LEFT JOIN users u ON u.id = r.user_id
        ORDER BY r.requested_at DESC LIMIT ? OFFSET ?`, limit, offset),
      total: get('SELECT COUNT(*) c FROM privacy_requests').c,
      page,
      limit,
    });
  }),
);

router.patch(
  '/privacy-requests/:id',
  requireRole('admin'),
  rateLimit({ ...config.security.rateLimits.write, scope: 'privacy-request-review' }),
  asyncHandler((req, res) => {
    const request = get('SELECT * FROM privacy_requests WHERE id = ?', req.params.id);
    if (!request) return fail(res, 'درخواست حریم خصوصی یافت نشد.', 404);
    const status = String(req.body?.status || '');
    const transitions = {
      pending: ['approved', 'rejected'],
      approved: ['fulfilled'],
    };
    if (!transitions[request.status]?.includes(status)) {
      return fail(res, 'تغییر وضعیت درخواست مجاز نیست؛ تکمیل حذف داده باید پس از اجرای فرایند مصوب ثبت شود.', 409);
    }
    const notes = cleanText(req.body?.review_notes, { max: 600 }) || null;
    const reviewedAt = nowIso();
    tx(() => {
      const changed = run('UPDATE privacy_requests SET status=?, reviewed_at=?, reviewed_by=?, review_notes=? WHERE id=? AND status=?',
        status, reviewedAt, req.user.id, notes, request.id, request.status);
      if (Number(changed.changes) !== 1) throw new HttpError('وضعیت درخواست هم‌زمان تغییر کرده است؛ دوباره بارگذاری کنید.', 409);
      logAudit(req, 'privacy_request_review', 'privacy_request', request.id, {
        request_type: request.request_type,
        from: request.status,
        to: status,
      });
    });
    return ok(res, { request: get('SELECT * FROM privacy_requests WHERE id = ?', request.id) });
  }),
);

/* --------------------------- اعلان همگانی/پیامک -------------------------- */
router.post(
  '/broadcast',
  rateLimit({ ...config.security.rateLimits.write, scope: 'admin-broadcast' }),
  requireRole('admin'),
  asyncHandler((req, res) => {
    const { title, body, role = 'customer', link } = req.body || {};
    if (!title) return fail(res, 'عنوان پیام الزامی است.');
    const users = all('SELECT id FROM users WHERE role = ? AND status = \'active\'', role);
    for (const u of users) {
      notify({ userId: u.id, title, body, type: 'admin', link });
      broadcast(`user:${u.id}`, { type: 'notification', notification: { title, body, link, type: 'admin' } });
    }
    logAudit(req, 'broadcast', 'notification', null, { count: users.length, role });
    return ok(res, { message: `پیام برای ${users.length} کاربر ارسال شد.`, count: users.length });
  }),
);

export default router;
