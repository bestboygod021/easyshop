/**
 * هاب زمان‌واقعی EasyShop — چت زنده، اعلان‌ها و رخدادهای سفارش روی WebSocket.
 * مسیر: ws://<host>/ws?token=<JWT>
 *
 * لایه‌های امنیتی این هاب:
 *  ۱) محدودیت اندازه‌ی پیام (۶۴KB) و نرخ پیام به‌ازای هر اتصال
 *  ۲) بررسی مبدأ (Origin) هنگام Upgrade → جلوگیری از Cross-Site WebSocket Hijacking
 *  ۳) اعتبارسنجی توکن با بررسی نسخه‌ی نشست (توکن‌های باطل‌شده رد می‌شوند)
 *  ۴) مجوزدهی روی هر عملیات (join/send/typing/read) و برای مهمان‌ها توکن گفتگو
 *  ۵) سقف تعداد اتصال به‌ازای هر IP و پاک‌سازی اتصال‌های مرده
 */
import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { all, get, notify, nowIso, run, uid } from '../db/index.js';
import { isStaff, verifyAccessToken } from '../middleware/auth.js';
import { cleanText, hashToken, safeEqual } from '../middleware/security.js';

const clients = new Map(); // ws -> { rooms:Set, user, ip, buckets:Map, alive }
const ipCounts = new Map(); // ip -> تعداد اتصال فعال
const MAX_CONNECTIONS_PER_IP = 12;
const MAX_TOTAL_CONNECTIONS = 800;
const MAX_MESSAGE_CHARS = 4000;
const MAX_META_CHARS = 2000;
const MESSAGE_TYPES = new Set(['text', 'image', 'file', 'product', 'order']);
let wss = null;

/** سطل نرخ ساده برای هر اتصال (لغزشی) */
function allow(client, key, limit, windowMs) {
  const now = Date.now();
  const hits = (client.buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    client.buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  client.buckets.set(key, hits);
  return true;
}

/** بررسی دسترسی به گفتگو: کارمند، مالک، یا مهمانِ دارنده‌ی توکن گفتگو */
function canAccessConversation(client, conv, guestToken) {
  if (!conv) return false;
  if (client.user && isStaff(client.user)) return true;
  if (client.user && conv.user_id === client.user.id) return true;
  if (!conv.user_id && conv.guest_token_hash && guestToken) {
    return safeEqual(hashToken(String(guestToken).slice(0, 200)), String(conv.guest_token_hash));
  }
  return false;
}

export function initRealtime(server) {
  wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 64 * 1024,
    // مبدأ درخواست باید مجاز باشد (ضد CSWSH)
    verifyClient: ({ origin, req }, done) => {
      if (config.security.enforceOrigin && !isOriginAllowedLocal(origin, req?.headers?.host)) {
        return done(false, 403, 'Forbidden origin');
      }
      if (clients.size >= MAX_TOTAL_CONNECTIONS) return done(false, 503, 'Server busy');
      const ip = clientIpFromReq(req);
      if ((ipCounts.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP) return done(false, 429, 'Too many connections');
      return done(true);
    },
  });

  wss.on('connection', (ws, req) => {
    const ip = clientIpFromReq(req);
    ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);

    // احراز هویت اولیه از query (?token=) — با بررسی نسخه‌ی نشست
    let user = null;
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');
      if (token) {
        const verified = verifyAccessToken(token);
        user = verified.user || null;
      }
    } catch {
      user = null;
    }

    const client = { rooms: new Set(['public']), user, ip, buckets: new Map(), alive: true, at: Date.now() };
    if (user) {
      client.rooms.add(`user:${user.id}`);
      if (isStaff(user)) client.rooms.add('admin');
    }
    clients.set(ws, client);
    ws.send(JSON.stringify({
      type: 'ready',
      user: user ? { id: user.id, name: user.full_name, role: user.role } : null,
      rooms: [...client.rooms],
      request_id: String(req?.headers?.['x-request-id'] || '').slice(0, 64) || undefined,
    }));

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return; // پیام دودویی پشتیبانی نمی‌شود
      if (!allow(client, 'all', 90, 60_000)) return; // سقف کلی پیام در دقیقه
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      handleMessage(ws, msg);
    });

    ws.on('pong', () => { client.alive = true; });
    const cleanup = () => {
      clients.delete(ws);
      const left = (ipCounts.get(ip) || 1) - 1;
      if (left <= 0) ipCounts.delete(ip); else ipCounts.set(ip, left);
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  // Heartbeat: اتصال‌های مرده پس از دو دوره بی‌پاسخ بسته می‌شوند
  const interval = setInterval(() => {
    for (const [ws, client] of clients.entries()) {
      if (!client.alive) {
        try { ws.terminate(); } catch { /* ignore */ }
        continue;
      }
      client.alive = false;
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
    }
  }, 25000);
  wss.on('close', () => clearInterval(interval));

  return wss;
}

/** مبدأ/آی‌پی (بدون وابستگی حلقه‌ای به middleware) */
function isOriginAllowedLocal(origin, host) {
  if (!origin) return true;
  if (host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      return false;
    }
  }
  const list = config.security.trustedOrigins || [];
  if (list.includes('*') || list.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)) return true;
    if (['capacitor:', 'app:', 'file:'].includes(protocol)) return true;
    if (config.security.allowPreviewOrigins && /\.(e2b\.app|arena\.ai)$/i.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

function clientIpFromReq(req) {
  if (config.trustProxy) {
    const fwd = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req?.socket?.remoteAddress || 'unknown';
}

function handleMessage(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  const { user } = client;
  const reply = (payload) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  };

  switch (msg.type) {
    case 'auth': {
      // احراز هویت مجدد روی اتصال باز (مثلاً پس از ورود کاربر در همان نشست)
      if (!allow(client, 'auth', 5, 60_000)) return reply({ type: 'error', error: 'تعداد تلاش‌های احراز هویت بیش از حد مجاز است.' });
      const verified = verifyAccessToken(String(msg.token || ''));
      if (!verified.user) return reply({ type: 'error', error: verified.error || 'توکن نامعتبر است.' });
      client.user = verified.user;
      client.rooms.add(`user:${verified.user.id}`);
      if (isStaff(verified.user)) client.rooms.add('admin');
      return reply({
        type: 'ready',
        user: { id: verified.user.id, name: verified.user.full_name, role: verified.user.role },
        rooms: [...client.rooms],
      });
    }

    case 'join_conversation': {
      if (!allow(client, 'join', 20, 60_000)) return;
      const conv = get('SELECT * FROM conversations WHERE id = ?', String(msg.conversation_id || '').slice(0, 80));
      if (!canAccessConversation(client, conv, msg.guest_token)) {
        return reply({ type: 'error', error: 'دسترسی به این گفتگو مجاز نیست.', conversation_id: conv?.id ?? null });
      }
      client.rooms.add(`conv:${conv.id}`);
      return reply({ type: 'joined', conversation_id: conv.id });
    }

    case 'chat:send': {
      if (!allow(client, 'send', 20, 60_000)) {
        return reply({ type: 'error', error: 'تعداد پیام‌های ارسالی زیاد است. چند لحظه صبر کنید.' });
      }
      const conv = get('SELECT * FROM conversations WHERE id = ?', String(msg.conversation_id || '').slice(0, 80));
      if (!canAccessConversation(client, conv, msg.guest_token)) {
        return reply({ type: 'error', error: 'دسترسی به این گفتگو مجاز نیست.', conversation_id: conv?.id ?? null });
      }
      const body = cleanText(msg.body, { max: MAX_MESSAGE_CHARS });
      if (!body) return reply({ type: 'error', error: 'متن پیام خالی است.' });
      const type = MESSAGE_TYPES.has(String(msg.messageType)) ? String(msg.messageType) : 'text';
      let meta = {};
      try {
        const raw = JSON.stringify(msg.meta || {});
        if (raw.length <= MAX_META_CHARS) meta = JSON.parse(raw);
      } catch { meta = {}; }
      const saved = saveMessage({ conversationId: conv.id, sender: user, body, type, meta });
      return reply({ type: 'chat:sent', message: saved });
    }

    case 'chat:typing': {
      if (!allow(client, 'typing', 30, 60_000)) return;
      const conv = get('SELECT * FROM conversations WHERE id = ?', String(msg.conversation_id || '').slice(0, 80));
      if (!canAccessConversation(client, conv, msg.guest_token)) return;
      const isTyping = msg.is_typing !== false;
      broadcast(`conv:${conv.id}`, {
        type: 'chat:typing',
        conversation_id: conv.id,
        from: user ? { id: user.id, name: user.full_name, role: user.role } : { name: 'مهمان', role: 'guest' },
        is_typing: isTyping,
      }, ws);
      return undefined;
    }

    case 'chat:read': {
      if (!allow(client, 'read', 60, 60_000)) return;
      const conv = get('SELECT * FROM conversations WHERE id = ?', String(msg.conversation_id || '').slice(0, 80));
      if (!canAccessConversation(client, conv, msg.guest_token)) return;
      if (isStaff(user)) run('UPDATE conversations SET unread_admin = 0 WHERE id = ?', conv.id);
      else run('UPDATE conversations SET unread_user = 0 WHERE id = ?', conv.id);
      broadcast(`conv:${conv.id}`, { type: 'chat:read', conversation_id: conv.id, by: user?.role || 'guest' });
      return undefined;
    }

    case 'pong':
      client.alive = true;
      return undefined;

    default:
      // نوع ناشناخته نادیده گرفته می‌شود (بدون افشای اطلاعات)
      return undefined;
  }
}

export function saveMessage({ conversationId, sender, body, type = 'text', meta = {}, isInternal = false, senderName }) {
  const ts = nowIso();
  const id = uid('msg');
  const role = sender?.role || 'guest';
  const name = cleanText(senderName || sender?.full_name || 'مهمان', { max: 80, multiline: false });
  // پاک‌سازی و سقف طول پیام (ضد XSS ذخیره‌شده و ضد DoS)
  body = cleanText(body, { max: MAX_MESSAGE_CHARS });
  type = MESSAGE_TYPES.has(String(type)) ? String(type) : 'text';
  if (!body) body = '(پیام خالی)';
  run(
    `INSERT INTO messages (id,conversation_id,sender_id,sender_name,sender_role,body,type,meta,is_internal,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, conversationId, sender?.id ?? null, name, role, body, type,
    JSON.stringify(meta || {}), isInternal ? 1 : 0, ts,
  );
  run(
    `UPDATE conversations SET last_message = ?, last_message_at = ?,
      unread_admin = unread_admin + ?, unread_user = unread_user + ?, status = CASE WHEN status='closed' THEN 'open' ELSE status END
     WHERE id = ?`,
    String(body).slice(0, 120), ts,
    isStaff(sender) ? 0 : 1,
    isStaff(sender) ? 1 : 0,
    conversationId,
  );
  const message = {
    id, conversation_id: conversationId, sender_id: sender?.id ?? null, sender_name: name,
    sender_role: role, body, type, meta, created_at: ts, is_internal: Boolean(isInternal),
  };
  // پیام‌های داخلی هرگز برای مشتری منتشر نمی‌شوند
  if (!isInternal) broadcast(`conv:${conversationId}`, { type: 'chat:message', message });
  const conv = get('SELECT * FROM conversations WHERE id = ?', conversationId);
  if (conv && !isInternal) {
    if (conv.user_id) broadcast(`user:${conv.user_id}`, { type: 'chat:message', message, conversation_id: conversationId });
    broadcast('admin', { type: 'chat:message', message, conversation_id: conversationId, conversation: conv });
  }
  return message;
}

export function broadcast(room, payload, except = null) {
  const data = JSON.stringify(payload);
  for (const [ws, client] of clients.entries()) {
    if (!client.rooms.has(room)) continue;
    if (ws === except) continue;
    if (ws.readyState !== ws.OPEN) continue;
    try {
      ws.send(data);
    } catch {
      /* ignore */
    }
  }
}

export function broadcastToUser(userId, payload) {
  broadcast(`user:${userId}`, payload);
}

export function pushNotification({ userId, title, body, type = 'info', link }) {
  notify({ userId, title, body, type, link });
  const row = get('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', userId);
  broadcastToUser(userId, { type: 'notification', notification: row });
  return row;
}

export function onlineStats() {
  const staff = [...clients.values()].filter((c) => c.user && isStaff(c.user)).length;
  const customers = [...clients.values()].filter((c) => !c.user).length;
  return { connections: clients.size, staff_online: staff, guests_online: customers };
}

/** قطع همه‌ی اتصال‌های یک کاربر (هنگام مسدودسازی یا تغییر رمز) */
export function disconnectUser(userId, reason = 'نشست شما باطل شد.') {
  let closed = 0;
  for (const [ws, client] of clients.entries()) {
    if (client.user?.id !== userId) continue;
    try {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'error', error: reason }));
      ws.close(4001, reason);
    } catch { /* ignore */ }
    clients.delete(ws);
    closed += 1;
  }
  return closed;
}

export function recentConversationsForUser(userId) {
  return all('SELECT * FROM conversations WHERE user_id = ? ORDER BY last_message_at DESC LIMIT 20', userId);
}
