import http from 'node:http';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, ROOT, validateProductionConfig } from './config.js';
import { db, get, isSeeded } from './db/index.js';
import { runSeed, seedProviders } from './db/seed.js';
import { initRealtime, onlineStats, pushNotification } from './realtime/hub.js';
import { HttpError } from './utils/helpers.js';
import { migrateStoredAiProviderKeys } from './services/ai/key-crypto.js';
import { initializeObservability, shutdownObservability } from './services/observability.js';
import { metricsMiddleware, metricsRegistry } from './services/metrics.js';
import { startSloMonitor, stopSloMonitor } from './services/slo-monitor.js';
import { startDataRetentionScheduler } from './services/data-retention.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin.js';
import ticketRoutes from './routes/tickets.js';
import chatRoutes from './routes/chat.js';
import aiRoutes from './routes/ai.js';
import miscRoutes from './routes/misc.js';
import {
  clientIp, originGuard, rateLimit, requestId, resetRateLimits, sanitizePayload, sanitizeQuery,
} from './middleware/security.js';

export const app = express();

// فقط اگر صریحاً اعلام شده باشد به X-Forwarded-For اعتماد می‌کنیم
// (در غیر این صورت مهاجم می‌تواند محدودیت نرخ را با هدر جعلی دور بزند)
app.set('trust proxy', config.trustProxy ? 1 : false);
app.disable('x-powered-by');

app.use(requestId);
app.use(metricsMiddleware);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'media-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'", 'ws:', 'wss:'],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': [
          "'self'",
          ...config.payment.bankDirectStartAllowedHosts
            .filter((host) => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host))
            .map((host) => `https://${host}`),
        ],
        'frame-ancestors': config.security.frameAncestors,
        ...(config.isProd ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
    // CSP با frame-ancestors کنترل قاب‌گرفتن را به‌عهده دارد؛
    // X-Frame-Options برای سازگاری با پیش‌نمایش ابری غیرفعال است.
    frameguard: false,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  }),
);
app.use((_req, res, next) => {
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('x-content-type-options', 'nosniff');
  next();
});
/**
 * CORS: فقط مبدأهای شناخته‌شده پاسخ می‌گیرند.
 * دامنه‌ی ناشناس هیچ هدر CORS نمی‌گیرد ⇒ مرورگر پاسخ را در اختیار اسکریپت مهاجم نمی‌گذارد.
 */
const PREVIEW_ORIGIN_RE = /^https?:\/\/([\w-]+\.)*(e2b\.app|arena\.ai|localhost|127\.0\.0\.1)(:\d+)?$/;
const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'http://localhost', 'https://localhost', 'app://easyshop', 'file://']);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // اپ بومی/ابزار بدون Origin
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return cb(null, true);
      if (PREVIEW_ORIGIN_RE.test(origin) || NATIVE_ORIGINS.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    // API با توکن Bearer کار می‌کند و کوکی ندارد ⇒ نیازی به ارسال اعتبارنامه‌ی مرورگر نیست
    credentials: config.corsCredentials,
    maxAge: 600,
  }),
);
app.use(originGuard);
app.use(sanitizeQuery);
app.use(express.json({ limit: config.security.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.security.bodyLimit }));
app.use(sanitizePayload);

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (config.logLevel === 'debug' || res.statusCode >= 400) {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms) [${req.id}] [trace:${req.traceId || '-'}] ${clientIp(req)}`);
    }
  });
  next();
});

app.use(
  '/uploads',
  rateLimit({ ...config.security.rateLimits.readSearch, scope: 'uploads-read' }),
  express.static(config.uploadDir, {
    maxAge: '7d',
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('cross-origin-resource-policy', 'cross-origin');
    },
  }),
);

// --- API ---------------------------------------------------------------------
const api = express.Router();
api.use(rateLimit({ ...config.security.rateLimits.global, scope: 'api' }));
api.use(['/auth', '/account', '/orders', '/cart', '/tickets', '/chat', '/admin', '/ai'], (req, res, next) => {
  res.setHeader('cache-control', 'no-store, private');
  next();
});
api.use('/auth', authRoutes);
api.use('/products', productRoutes);
api.use('/categories', categoryRoutes);
api.use('/cart', cartRoutes);
api.use('/orders', orderRoutes);
api.use('/payments', paymentRoutes);
api.use('/account', accountRoutes);
api.use('/admin', adminRoutes);
api.use('/tickets', ticketRoutes);
api.use('/chat', chatRoutes);
api.use('/ai', aiRoutes);
api.use('/', miscRoutes); // /settings /health /home /placeholder /uploads /search /sitemap.xml /stats
app.use('/api', api);

app.get('/api', (_req, res) =>
  res.json({
    ok: true,
    name: 'EasyShop API',
    version: '1.0.0',
    docs: '/api/docs',
    endpoints: [
      '/api/auth', '/api/products', '/api/categories', '/api/cart', '/api/orders', '/api/payments',
      '/api/account', '/api/admin', '/api/tickets', '/api/chat', '/api/ai', '/api/settings',
    ],
    realtime: '/ws',
  }),
);

app.get('/metrics', (req, res) => {
  const token = config.observability.metricsBearerToken;
  if (config.isProd && !token) return res.sendStatus(404);
  if (token) {
    const authorization = String(req.get('authorization') || '');
    const provided = authorization.replace(/^Bearer\s+/i, '');
    const expectedBuffer = Buffer.from(token);
    const providedBuffer = Buffer.from(provided);
    const valid = expectedBuffer.length === providedBuffer.length
      && timingSafeEqual(expectedBuffer, providedBuffer);
    if (!valid) {
      res.setHeader('www-authenticate', 'Bearer');
      return res.sendStatus(401);
    }
  }
  res.setHeader('cache-control', 'no-store, private');
  res.type('text/plain; version=0.0.4; charset=utf-8');
  return res.status(200).send(metricsRegistry.toPrometheusText());
});

// --- پیش‌نمایش وب (PWA build) -------------------------------------------------
const webDist = path.resolve(ROOT, '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api|uploads|ws).*/, (req, res, next) => {
    if (req.path.includes('.')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res
      .status(200)
      .type('html')
      .send(
        `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>EasyShop API</title>
        <body style="font-family:Tahoma;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0">
        <div style="text-align:center;max-width:560px">
          <h1>🛍️ EasyShop API فعال است</h1>
          <p>نسخه‌ی توسعه‌ی وب هنوز ساخته نشده است. برای استفاده از رابط کاربری:</p>
          <pre style="background:#1e293b;padding:12px;border-radius:8px;text-align:left">npm run dev      # اجرای همزمان API و Vite
npm run build    # ساخت نسخه‌ی نهایی وب
npm start        # اجرای API + وب ساخته‌شده</pre>
          <p><a style="color:#818cf8" href="/api">فهرست API</a> · <a style="color:#818cf8" href="/api/health">سلامت سرویس</a></p>
        </div></body></html>`,
      ),
  );
}

// --- مدیریت خطا ---------------------------------------------------------------
app.use((req, res) => res.status(404).json({ ok: false, error: 'مسیر یافت نشد.', path: req.originalUrl }));

app.use((err, req, res, _next) => {
  const status = err instanceof HttpError ? err.status : err.status || 500;
  if (status >= 500) {
    console.error(`❌ [${req.id || '-'}] ${req.method} ${req.originalUrl}`, err);
  }
  // درخواست‌های بزرگ/نامعتبر بدنه پیام واضح می‌گیرند
  if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE' || err?.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ ok: false, error: 'حجم یا تعداد فایل/درخواست بیش از حد مجاز است.' });
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE' || err?.code === 'LIMIT_PART_COUNT') {
    return res.status(400).json({ ok: false, error: 'ساختار آپلود نامعتبر است.' });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ ok: false, error: 'آپلود نامعتبر است.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ ok: false, error: 'بدنه‌ی JSON نامعتبر است.' });
  }
  res.status(status).json({
    ok: false,
    error: status >= 500 ? 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' : err.message,
    ...(config.isProd || status < 500 ? {} : { detail: err.message, request_id: req.id }),
  });
});

// --- راه‌اندازی ----------------------------------------------------------------
export function bootstrap() {
  validateProductionConfig();
  if (config.isProd && config.corsOrigins.includes('*')) {
    console.warn('⚠️  CORS_ORIGINS=* در محیط تولید ناامن است؛ فهرست دامنه‌های مجاز را تعیین کنید.');
  }
  if (config.isProd && !config.security.trustedOrigins.length) {
    console.warn('⚠️  TRUSTED_ORIGINS تنظیم نشده است؛ فقط same-origin و دامنه‌های پیش‌نمایش مجاز خواهند بود.');
  }
  seedProviders();
  const aiKeyMigration = migrateStoredAiProviderKeys();
  if (aiKeyMigration.migrated) console.info(`🔐 کلیدهای AI در پایگاه داده رمز شدند: ${aiKeyMigration.migrated}`);
  if (config.seedDemoData && !isSeeded()) {
    const res = runSeed();
    console.log('🌱 داده‌های دمو ایجاد شد:', res);
  }
  const counts = {
    products: get("SELECT COUNT(*) c FROM products WHERE status='active'").c,
    users: get('SELECT COUNT(*) c FROM users').c,
    providers: get('SELECT COUNT(*) c FROM ai_providers').c,
  };
  return counts;
}

const isMain = process.argv[1] && (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('server'));
if (isMain) {
  initializeObservability();
  const counts = bootstrap();
  startSloMonitor();
  const stopDataRetention = startDataRetentionScheduler();
  const server = http.createServer(app);
  initRealtime(server);

  server.listen(config.port, config.host, () => {
    console.log(`
🛍️  EasyShop API آماده است
    http://${config.host}:${config.port}/api        (REST)
    ws://${config.host}:${config.port}/ws           (زمان‌واقعی)
    ${fs.existsSync(webDist) ? `http://${config.host}:${config.port}/            (وب اپ)` : 'رابط وب ساخته نشده (npm run build)'}
    محصولات فعال: ${counts.products} | کاربران: ${counts.users} | ارائه‌دهنده‌های AI: ${counts.providers}
`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal}: خاموش‌سازی تدریجی…`, onlineStats());
    stopSloMonitor();
    stopDataRetention();
    server.close(async () => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      await shutdownObservability();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000);
  };
  ['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));

  // نگهداری محلی: بازنشانی محدودیت نرخ/قفل ورود بدون ری‌استارت سرور.
  // این کنترل فقط از طریق سیگنال سیستمی (دسترسی محلی) ممکن است، نه شبکه.
  // نمونه: kill -USR2 $(pgrep -f 'node src/index.js')
  process.on('SIGUSR2', () => {
    const cleared = resetRateLimits();
    console.log(`♻️  وضعیت محدودیت نرخ و قفل ورود بازنشانی شد (${cleared} سطل).`);
  });
}

export { pushNotification, onlineStats };
export default app;
