import express from 'express';
import crypto from 'node:crypto';
import { all, get, nowIso, run, uid } from '../db/index.js';
import { isStaff, logAudit, optionalAuth, requireAuth, requireRole, staffUsers } from '../middleware/auth.js';
import { asyncHandler, fail, ok, paginate } from '../utils/helpers.js';
import { broadcast, onlineStats, saveMessage } from '../realtime/hub.js';
import { supportReply } from '../services/ai/commerce.js';
import { config } from '../config.js';
import { cleanText, hashToken, rateLimit, safeEqual } from '../middleware/security.js';

const router = express.Router();
const MAX_MESSAGE_CHARS = 4000;

/** توکن یک‌بارمصرف گفتگوی مهمان (فقط هش آن ذخیره می‌شود) */
function issueGuestToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

/** دسترسی مهمان به گفتگو با توکن ارائه‌شده در هدر x-guest-token یا بدنه */
function guestAllowed(req, conv) {
  if (!conv || conv.user_id || !conv.guest_token_hash) return false;
  const token = String(req.headers['x-guest-token'] || req.body?.guest_token || req.query?.guest_token || '');
  if (!token) return false;
  return safeEqual(hashToken(token.slice(0, 200)), String(conv.guest_token_hash));
}

function conversationRow(c, { withMessages = false, limit = 60 } = {}) {
  const user = c.user_id ? get('SELECT id, full_name, email, phone, avatar, role FROM users WHERE id = ?', c.user_id) : null;
  const messages = withMessages
    ? all('SELECT * FROM messages WHERE conversation_id = ? AND is_internal = 0 ORDER BY created_at DESC LIMIT ?', c.id, limit).reverse()
    : [];
  return {
    id: c.id, subject: c.subject, status: c.status, user,
    guest_name: c.guest_name, guest_email: c.guest_email,
    assigned_to: c.assigned_to, last_message: c.last_message, last_message_at: c.last_message_at,
    unread_admin: c.unread_admin, unread_user: c.unread_user, created_at: c.created_at,
    messages,
  };
}

/** GET /api/chat/conversations — فهرست گفتگوها (کاربر: خودش / کارمند: همه) */
router.get(
  '/conversations',
  requireAuth,
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'chat-list' }),
  asyncHandler((req, res) => {
    const { page, limit, offset } = paginate(req, 30, 100);
    if (isStaff(req.user) && req.query.all !== '0') {
      const status = req.query.status;
      const rows = all(
        `SELECT * FROM conversations ${status ? 'WHERE status = ?' : ''} ORDER BY last_message_at DESC LIMIT ? OFFSET ?`,
        ...(status ? [status] : []), limit, offset,
      );
      const total = get(`SELECT COUNT(*) c FROM conversations ${status ? 'WHERE status = ?' : ''}`, ...(status ? [status] : [])).c;
      return ok(res, {
        items: rows.map((c) => conversationRow(c)),
        total, page, limit,
        stats: {
          open: get("SELECT COUNT(*) c FROM conversations WHERE status='open'").c,
          unread: get('SELECT COALESCE(SUM(unread_admin),0) c FROM conversations').c,
          ...onlineStats(),
        },
      });
    }
    const rows = all('SELECT * FROM conversations WHERE user_id = ? ORDER BY last_message_at DESC LIMIT ? OFFSET ?', req.user.id, limit, offset);
    return ok(res, { items: rows.map((c) => conversationRow(c)), total: rows.length, page, limit });
  }),
);

/** POST /api/chat/conversations — شروع گفتگوی جدید */
router.post(
  '/conversations',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.chat, scope: 'chat-create' }),
  asyncHandler((req, res) => {
    const subject = cleanText(req.body?.subject, { max: 120, multiline: false });
    const message = cleanText(req.body?.message, { max: MAX_MESSAGE_CHARS });
    const guest_name = cleanText(req.body?.guest_name, { max: 80, multiline: false });
    const guest_email = String(req.body?.guest_email || '').trim().toLowerCase().slice(0, 160);
    if (!req.user && (!guest_name || !guest_email)) return fail(res, 'برای گفتگو نام و ایمیل خود را وارد کنید.');
    if (!req.user && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest_email)) return fail(res, 'ایمیل معتبر وارد کنید.');
    if (!message) return fail(res, 'متن پیام الزامی است.');
    const existing = req.user
      ? get("SELECT * FROM conversations WHERE user_id = ? AND status != 'closed' ORDER BY last_message_at DESC LIMIT 1", req.user.id)
      : null;
    let conv = existing;
    let guestToken = null;
    if (!conv) {
      const id = uid('cnv');
      // برای مهمان، توکن اختصاصی گفتگو صادر می‌شود تا هیچ کاربر ناشناسی
      // نتواند در گفتگوی دیگران پیام بفرستد/بخواند.
      const issued = req.user ? null : issueGuestToken();
      guestToken = issued?.token ?? null;
      run(
        `INSERT INTO conversations (id,user_id,guest_name,guest_email,guest_token_hash,subject,status,last_message_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        id, req.user?.id ?? null, guest_name || null, guest_email || null, issued?.hash ?? null,
        subject || 'گفتگوی پشتیبانی', 'open', nowIso(), nowIso(),
      );
      conv = get('SELECT * FROM conversations WHERE id = ?', id);
    }
    const msg = saveMessage({
      conversationId: conv.id,
      sender: req.user || null,
      senderName: req.user?.full_name || guest_name,
      body: message,
    });
    logAudit(req, 'chat_start', 'conversation', conv.id);
    return ok(res, {
      conversation: conversationRow(get('SELECT * FROM conversations WHERE id = ?', conv.id), { withMessages: true }),
      message: msg,
      // فقط یک‌بار و فقط برای مهمان برگردانده می‌شود (در دیتابیس هش نگه‌داری می‌شود)
      ...(guestToken ? { guest_token: guestToken } : {}),
    }, 201);
  }),
);

/** GET /api/chat/conversations/:id — مالک، کارمند، یا مهمانِ دارنده‌ی توکن */
router.get(
  '/conversations/:id',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.chat, scope: 'chat-read' }),
  asyncHandler((req, res) => {
    const conv = get('SELECT * FROM conversations WHERE id = ?', String(req.params.id).slice(0, 80));
    if (!conv) return fail(res, 'گفتگو یافت نشد.', 404);
    const staff = isStaff(req.user);
    const owner = req.user && conv.user_id === req.user.id;
    if (!staff && !owner && !guestAllowed(req, conv)) return fail(res, 'دسترسی مجاز نیست.', 403);
    if (isStaff(req.user)) run('UPDATE conversations SET unread_admin = 0 WHERE id = ?', conv.id);
    else run('UPDATE conversations SET unread_user = 0 WHERE id = ?', conv.id);
    return ok(res, { conversation: conversationRow(conv, { withMessages: true, limit: 200 }) });
  }),
);

/** POST /api/chat/conversations/:id/messages — ارسال پیام (REST؛ WS نیز پشتیبانی می‌شود) */
router.post(
  '/conversations/:id/messages',
  optionalAuth,
  rateLimit({ ...config.security.rateLimits.chat, scope: 'chat-send' }),
  asyncHandler((req, res) => {
    const conv = get('SELECT * FROM conversations WHERE id = ?', String(req.params.id).slice(0, 80));
    if (!conv) return fail(res, 'گفتگو یافت نشد.', 404);
    const staff = isStaff(req.user);
    const owner = req.user && conv.user_id === req.user.id;
    if (!staff && !owner && !guestAllowed(req, conv)) return fail(res, 'دسترسی مجاز نیست.', 403);
    if (conv.status === 'closed') return fail(res, 'این گفتگو بسته شده است. لطفاً گفتگوی جدیدی شروع کنید.');
    const body = cleanText(req.body?.body, { max: MAX_MESSAGE_CHARS });
    if (!body) return fail(res, 'متن پیام الزامی است.');
    const type = ['text', 'image', 'file', 'product', 'order'].includes(req.body?.type) ? req.body.type : 'text';
    const meta = req.body?.meta && typeof req.body.meta === 'object' && JSON.stringify(req.body.meta).length <= 2000 ? req.body.meta : {};
    const message = saveMessage({
      conversationId: conv.id,
      sender: req.user || null,
      senderName: req.user?.full_name || conv.guest_name || 'مهمان',
      body, type, meta,
    });
    return ok(res, { message }, 201);
  }),
);

/** PATCH /api/chat/conversations/:id — وضعیت/مسئول/موضوع */
router.patch(
  '/conversations/:id',
  rateLimit({ ...config.security.rateLimits.write, scope: 'chat-update' }),
  requireAuth,
  requireRole('support', 'admin'),
  asyncHandler((req, res) => {
    const conv = get('SELECT * FROM conversations WHERE id = ?', req.params.id);
    if (!conv) return fail(res, 'گفتگو یافت نشد.', 404);
    const b = req.body || {};
    const STATUSES = ['open', 'pending', 'answered', 'closed'];
    if (b.status && !STATUSES.includes(b.status)) return fail(res, 'وضعیت نامعتبر است.');
    if (b.assigned_to && !get('SELECT id FROM users WHERE id = ?', b.assigned_to)) return fail(res, 'کارشناس یافت نشد.', 404);
    const cleanSubject = b.subject === undefined ? null : cleanText(b.subject, { max: 120, multiline: false });
    run(
      'UPDATE conversations SET status = COALESCE(?, status), assigned_to = COALESCE(?, assigned_to), subject = COALESCE(?, subject) WHERE id = ?',
      b.status ?? null, b.assigned_to ?? null, cleanSubject, conv.id,
    );
    broadcast('admin', { type: 'conversation:update', conversation_id: conv.id, status: b.status });
    if (conv.user_id) broadcast(`user:${conv.user_id}`, { type: 'conversation:update', conversation_id: conv.id, status: b.status });
    return ok(res, { conversation: conversationRow(get('SELECT * FROM conversations WHERE id = ?', conv.id)) });
  }),
);

/** POST /api/chat/ai-suggest — پیشنهاد پاسخ هوش مصنوعی به کارمند پشتیبانی */
router.post(
  '/ai-suggest',
  requireAuth,
  requireRole('support', 'admin'),
  rateLimit({ ...config.security.rateLimits.ai, scope: 'chat-ai' }),
  asyncHandler(async (req, res) => {
    const { conversation_id, provider = 'builtin', model } = req.body || {};
    const instruction = cleanText(req.body?.instruction, { max: 600 });
    const conv = get('SELECT * FROM conversations WHERE id = ?', conversation_id);
    if (!conv) return fail(res, 'گفتگو یافت نشد.', 404);
    const last = all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 6', conv.id).reverse();
    const history = last.map((m) => `${m.sender_role === 'customer' ? 'مشتری' : 'پشتیبانی'}: ${m.body}`).join('\n');
    const result = await supportReply({
      message: `${instruction ? `${instruction}\n` : ''}${history}`,
      slug: provider,
      model,
      userId: req.user.id,
      orderInfo: conv.user_id ? `مشتری: ${get('SELECT full_name FROM users WHERE id = ?', conv.user_id)?.full_name || ''}` : 'مهمان',
    });
    return ok(res, { suggestion: result.reply, generator: result.generator });
  }),
);

/** GET /api/chat/agents */
router.get(
  '/agents',
  requireAuth,
  asyncHandler((_req, res) => ok(res, { agents: staffUsers(), ...onlineStats() })),
);

export default router;
