import express from 'express';
import { all, get, notify, nowIso, run, uid } from '../db/index.js';
import { isStaff, logAudit, requireAuth, requireRole, staffUsers } from '../middleware/auth.js';
import { asyncHandler, fail, ok, paginate } from '../utils/helpers.js';
import { broadcast } from '../realtime/hub.js';
import { config } from '../config.js';
import { cleanText, rateLimit } from '../middleware/security.js';

const router = express.Router();
const MAX_TICKET_BODY = 4000;

const CATEGORIES = [
  { value: 'general', label: 'عمومی' },
  { value: 'order', label: 'سفارش و خرید' },
  { value: 'shipping', label: 'ارسال و تحویل' },
  { value: 'billing', label: 'مالی و فاکتور' },
  { value: 'returns', label: 'مرجوعی و گارانتی' },
  { value: 'technical', label: 'پشتیبانی فنی' },
  { value: 'coupon', label: 'کد تخفیف' },
];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'pending', 'answered', 'resolved', 'closed'];

function ticketRow(t, { withMessages = false, withInternal = false } = {}) {
  // یادداشت‌های داخلی کارمندان هرگز برای مشتری برگردانده نمی‌شوند
  const messages = withMessages
    ? all(
      `SELECT * FROM ticket_messages WHERE ticket_id = ? ${withInternal ? '' : 'AND is_internal = 0'} ORDER BY created_at ASC`,
      t.id,
    )
    : [];
  const user = t.user_id ? get('SELECT id, full_name, email, phone, avatar FROM users WHERE id = ?', t.user_id) : null;
  const assignee = t.assigned_to ? get('SELECT id, full_name FROM users WHERE id = ?', t.assigned_to) : null;
  return {
    id: t.id, code: t.code, subject: t.subject, category: t.category, priority: t.priority, status: t.status,
    order_id: t.order_id, satisfaction: t.satisfaction,
    assigned_to: assignee, user, last_message_at: t.last_message_at, created_at: t.created_at, updated_at: t.updated_at,
    message_count: get('SELECT COUNT(*) c FROM ticket_messages WHERE ticket_id = ?', t.id).c,
    messages,
  };
}

/** GET /api/tickets/meta */
router.get(
  '/meta',
  requireAuth,
  asyncHandler((_req, res) => ok(res, { categories: CATEGORIES, priorities: PRIORITIES, statuses: STATUSES, agents: staffUsers() })),
);

/** GET /api/tickets */
router.get(
  '/',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'ticket-list' }),
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 20, 100);
    const where = [];
    const params = [];
    if (!isStaff(req.user) || req.query.mine === '1') {
      where.push('t.user_id = ?');
      params.push(req.user.id);
    } else if (req.query.assigned_to === 'me') {
      where.push('t.assigned_to = ?');
      params.push(req.user.id);
    }
    if (req.query.status) {
      where.push('t.status = ?');
      params.push(req.query.status);
    }
    if (req.query.priority) {
      where.push('t.priority = ?');
      params.push(req.query.priority);
    }
    if (req.query.q) {
      where.push('(t.subject LIKE ? OR t.code LIKE ?)');
      const term = `%${String(req.query.q).slice(0, 80)}%`;
      params.push(term, term);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = all(`SELECT t.* FROM tickets t ${clause} ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.last_message_at DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
    const total = get(`SELECT COUNT(*) c FROM tickets t ${clause}`, ...params).c;
    const counts = all('SELECT status, COUNT(*) c FROM tickets GROUP BY status');
    return ok(res, { items: rows.map((t) => ticketRow(t)), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), counts });
  }),
);

/** POST /api/tickets */
router.post(
  '/',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'ticket-create' }),
  asyncHandler((req, res) => {
    const subject = cleanText(req.body?.subject, { max: 120, multiline: false });
    const body = cleanText(req.body?.body, { max: MAX_TICKET_BODY });
    const category = CATEGORIES.some((c) => c.value === req.body?.category) ? req.body.category : 'general';
    const priority = PRIORITIES.includes(req.body?.priority) ? req.body.priority : 'normal';
    if (!subject || !body) return fail(res, 'موضوع و متن پیام الزامی است.');
    if (subject.length < 3) return fail(res, 'موضوع تیکت را کامل وارد کنید.');
    // سفارش پیوست‌شده باید متعلق به همان کاربر باشد (جلوگیری از ارجاع به سفارش دیگران)
    let orderId = null;
    if (req.body?.order_id) {
      const owned = get('SELECT id FROM orders WHERE (id = ? OR code = ?) AND user_id = ?', req.body.order_id, req.body.order_id, req.user.id);
      if (!owned) return fail(res, 'سفارش انتخاب‌شده یافت نشد.', 404);
      orderId = owned.id;
    }
    const openTickets = get("SELECT COUNT(*) c FROM tickets WHERE user_id = ? AND status != 'closed'", req.user.id).c;
    if (openTickets >= 15) return fail(res, 'تعداد تیکت‌های باز شما زیاد است. ابتدا پاسخ تیکت‌های قبلی را بررسی کنید.', 429);
    const id = uid('tkt');
    const ts = nowIso();
    const code = `TK-${Date.now().toString().slice(-5)}-${uid('').slice(-3)}`;
    const agent = all("SELECT id FROM users WHERE role IN ('support','admin') AND status='active' ORDER BY RANDOM() LIMIT 1")[0];
    run(
      `INSERT INTO tickets (id,code,user_id,order_id,subject,category,priority,status,assigned_to,last_message_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, code, req.user.id, orderId, subject, category, priority, 'open', agent?.id ?? null, ts, ts, ts,
    );
    run(
      'INSERT INTO ticket_messages (id,ticket_id,user_id,author_name,author_role,body,created_at) VALUES (?,?,?,?,?,?,?)',
      uid('tms'), id, req.user.id, req.user.full_name, req.user.role, body, ts,
    );
    broadcast('admin', { type: 'ticket:new', ticket: { id, code, subject, priority } });
    if (agent?.id) notify({ userId: agent.id, title: 'تیکت جدید', body: `${code}: ${subject}`, type: 'ticket', link: `/admin/tickets/${id}` });
    notify({ userId: req.user.id, title: 'تیکت شما ثبت شد', body: `${code} — ${subject}`, type: 'ticket', link: `/account/tickets/${id}` });
    logAudit(req, 'ticket_create', 'ticket', id, { subject });
    return ok(res, {
      ticket: ticketRow(get('SELECT * FROM tickets WHERE id = ?', id), { withMessages: true, withInternal: isStaff(req.user) }),
    }, 201);
  }),
);

/** GET /api/tickets/:id */
router.get(
  '/:id',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'ticket-get' }),
  asyncHandler((req, res) => {
    const t = get('SELECT * FROM tickets WHERE id = ? OR code = ?', req.params.id, req.params.id);
    if (!t) return fail(res, 'تیکت یافت نشد.', 404);
    if (!isStaff(req.user) && t.user_id !== req.user.id) return fail(res, 'دسترسی مجاز نیست.', 403);
    return ok(res, {
      ticket: ticketRow(t, { withMessages: true, withInternal: isStaff(req.user) }),
      categories: CATEGORIES,
    });
  }),
);

/** POST /api/tickets/:id/messages — پاسخ */
router.post(
  '/:id/messages',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.write, scope: 'ticket-reply' }),
  asyncHandler((req, res) => {
    const t = get('SELECT * FROM tickets WHERE id = ? OR code = ?', req.params.id, req.params.id);
    if (!t) return fail(res, 'تیکت یافت نشد.', 404);
    const staff = isStaff(req.user);
    if (!staff && t.user_id !== req.user.id) return fail(res, 'دسترسی مجاز نیست.', 403);
    const body = cleanText(req.body?.body, { max: MAX_TICKET_BODY });
    if (!body) return fail(res, 'متن پیام الزامی است.');
    // فقط کارمندان می‌توانند «یادداشت داخلی» ثبت کنند
    const isInternal = staff && Boolean(req.body?.is_internal);
    // پیوست‌ها فقط مسیر آپلود داخلی و حداکثر ۵ مورد
    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments.filter((u) => typeof u === 'string' && /^\/uploads\/[\w.-]{1,80}$/.test(u)).slice(0, 5)
      : [];
    const ts = nowIso();
    run(
      `INSERT INTO ticket_messages (id,ticket_id,user_id,author_name,author_role,body,attachments,is_internal,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      uid('tms'), t.id, req.user.id, req.user.full_name, req.user.role, body, JSON.stringify(attachments), isInternal ? 1 : 0, ts,
    );
    const requestedStatus = String(req.body?.status || '');
    const nextStatus = staff && STATUSES.includes(requestedStatus) ? requestedStatus : staff ? 'answered' : 'open';
    run('UPDATE tickets SET status = ?, last_message_at = ?, updated_at = ? WHERE id = ?', nextStatus, ts, ts, t.id);
    if (staff && t.user_id) {
      notify({ userId: t.user_id, title: 'پاسخ پشتیبانی', body: `تیکت ${t.code} پاسخ داده شد.`, type: 'ticket', link: `/account/tickets/${t.id}` });
      broadcast(`user:${t.user_id}`, { type: 'ticket:reply', ticket: { id: t.id, code: t.code } });
    }
    if (!staff && t.assigned_to) {
      notify({ userId: t.assigned_to, title: 'پیام جدید مشتری', body: `${t.code}: ${body.slice(0, 60)}`, type: 'ticket', link: `/admin/tickets/${t.id}` });
    }
    broadcast(`ticket:${t.id}`, { type: 'ticket:message', ticket_id: t.id });
    return ok(res, {
      ticket: ticketRow(get('SELECT * FROM tickets WHERE id = ?', t.id), { withMessages: true, withInternal: isStaff(req.user) }),
    }, 201);
  }),
);

/** PATCH /api/tickets/:id — تغییر وضعیت/اولویت/مسئول (کارمندان) */
router.patch(
  '/:id',
  rateLimit({ ...config.security.rateLimits.write, scope: 'ticket-update' }),
  requireAuth,
  requireRole('support', 'admin', 'seller'),
  asyncHandler((req, res) => {
    const t = get('SELECT * FROM tickets WHERE id = ?', req.params.id);
    if (!t) return fail(res, 'تیکت یافت نشد.', 404);
    const b = req.body || {};
    if (b.status !== undefined && !STATUSES.includes(b.status)) return fail(res, 'وضعیت نامعتبر است.');
    if (b.priority !== undefined && !PRIORITIES.includes(b.priority)) return fail(res, 'اولویت نامعتبر است.');
    if (b.assigned_to && !get("SELECT id FROM users WHERE id = ? AND role IN ('support','admin','seller')", b.assigned_to)) {
      return fail(res, 'کارشناس یافت نشد.', 404);
    }
    let satisfaction = null;
    if (b.satisfaction !== undefined) {
      satisfaction = Math.round(Number(b.satisfaction));
      if (!Number.isFinite(satisfaction) || satisfaction < 1 || satisfaction > 5) return fail(res, 'امتیاز رضایت باید بین ۱ تا ۵ باشد.');
    }
    run(
      `UPDATE tickets SET status = COALESCE(?, status), priority = COALESCE(?, priority),
        assigned_to = COALESCE(?, assigned_to), satisfaction = COALESCE(?, satisfaction), updated_at = ? WHERE id = ?`,
      b.status ?? null, b.priority ?? null, b.assigned_to ?? null, satisfaction, nowIso(), t.id,
    );
    if (b.status && t.user_id) {
      notify({ userId: t.user_id, title: 'وضعیت تیکت به‌روزرسانی شد', body: `تیکت ${t.code}: ${b.status}`, type: 'ticket', link: `/account/tickets/${t.id}` });
    }
    logAudit(req, 'ticket_update', 'ticket', t.id, b);
    return ok(res, { ticket: ticketRow(get('SELECT * FROM tickets WHERE id = ?', t.id)) });
  }),
);

export default router;
