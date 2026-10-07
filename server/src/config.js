import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// --- minimal .env loader (no external dependency required) -------------------
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv(path.join(ROOT, '.env'));

const bool = (v, d = false) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(String(v)));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  publicUrl: process.env.PUBLIC_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'easyshop-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  refreshExpiresDays: Number(process.env.REFRESH_EXPIRES_DAYS || 30),
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'data', 'uploads'),
  // فهرست صریح مبدأهای CORS. خالی ⇒ فقط same-origin، localhost، اپ بومی و پیش‌نمایش‌ها.
  // مقدار '*' فقط با اعلام صریح اپراتور و برای سازگاری با نسخه‌های قدیمی پشتیبانی می‌شود.
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  corsCredentials: bool(process.env.CORS_CREDENTIALS, false),
  // پشت پروکسی معتبر (Nginx/Traefik) مقدار ۱ بگذارید تا X-Forwarded-For معتبر شود.
  // در غیر این صورت هدر جعلی می‌تواند محدودیت نرخ را دور بزند.
  trustProxy: /^(1|true|yes|on)$/i.test(process.env.TRUST_PROXY || ''),
  allowSelfPromotion: bool(process.env.ALLOW_SELF_PROMOTION, true),
  seedDemoData: bool(process.env.SEED_DEMO_DATA, true),
  logLevel: process.env.LOG_LEVEL || 'info',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  // --- امنیت -------------------------------------------------------------
  security: {
    bodyLimit: process.env.BODY_LIMIT || '2mb',
    passwordMinLength: Number(process.env.PASSWORD_MIN_LENGTH || 8),
    maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS || 5),
    lockoutMinutes: Number(process.env.LOCKOUT_MINUTES || 15),
    maxStringLength: Number(process.env.MAX_STRING_LENGTH || 20000),
    maxBodyDepth: Number(process.env.MAX_BODY_DEPTH || 8),
    maxArrayLength: Number(process.env.MAX_ARRAY_LENGTH || 200),
    maxObjectKeys: Number(process.env.MAX_OBJECT_KEYS || 100),
    // بررسی Origin روی درخواست‌های تغییردهنده (CSRF)
    enforceOrigin: bool(process.env.ENFORCE_ORIGIN, true),
    // اجازه‌ی قاب‌گرفتن صفحه توسط پیش‌نمایش‌های ابری sandbox
    allowPreviewOrigins: bool(process.env.ALLOW_PREVIEW_ORIGINS, true),
    frameAncestors: (process.env.FRAME_ANCESTORS || "'self' https://*.e2b.app https://*.arena.ai http://localhost:*")
      .split(' ').map((s) => s.trim()).filter(Boolean),
    // فهرست صریح مبدأهای مجاز. خالی/نامشخص ⇒ فقط same-origin، localhost (غیرتولیدی)،
    // اپ‌های بومی (capacitor/app/file) و پیش‌نمایش‌های ابری مجاز هستند.
    trustedOrigins: (process.env.TRUSTED_ORIGINS || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
    // پنجره‌های محدودیت نرخ
    rateLimits: {
      global: { windowMs: 60_000, max: Number(process.env.RATE_GLOBAL || 300) },
      auth: { windowMs: 15 * 60_000, max: Number(process.env.RATE_AUTH || 20) },
      ai: { windowMs: 60_000, max: Number(process.env.RATE_AI || 20) },
      upload: { windowMs: 10 * 60_000, max: Number(process.env.RATE_UPLOAD || 30) },
      write: { windowMs: 60_000, max: Number(process.env.RATE_WRITE || 40) },
      readSearch: { windowMs: 60_000, max: Number(process.env.RATE_SEARCH || 60) },
      track: { windowMs: 10 * 60_000, max: Number(process.env.RATE_TRACK || 20) },
      chat: { windowMs: 60_000, max: Number(process.env.RATE_CHAT || 30) },
    },
    // تنها در محیط غیرتولیدی، توکن بازیابی رمز در پاسخ برگردانده می‌شود (برای تست جریان)
    exposeResetToken: bool(process.env.EXPOSE_RESET_TOKEN, (process.env.NODE_ENV || 'development') !== 'production'),
    // سقف‌های مالی (جلوگیری از شارژ بی‌نهایت کیف پول و سوءاستفاده)
    maxWalletTopup: Number(process.env.MAX_WALLET_TOPUP || 50_000_000),
    maxWalletTopupDaily: Number(process.env.MAX_WALLET_TOPUP_DAILY || 100_000_000),
    paymentIntentTtlSeconds: Number(process.env.PAYMENT_INTENT_TTL || 1800),
    // محدودیت طول پیام چت و بدنه‌های متنی
    maxChatMessageLength: Number(process.env.MAX_CHAT_MESSAGE_LENGTH || 4000),
    // فرمت‌های مجاز آپلود تصویر (SVG عمداً مجاز نیست — خطر XSS)
    allowedImageTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024),
  },
  // AI: keys may also be supplied through the admin panel (stored in SQLite)
  ai: {
    requestTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
    defaultTemperature: 0.7,
    maxTokens: Number(process.env.AI_MAX_TOKENS || 4096),
    envKeys: {
      openai: process.env.OPENAI_API_KEY || '',
      anthropic: process.env.ANTHROPIC_API_KEY || '',
      gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
      xai: process.env.XAI_API_KEY || process.env.GROK_API_KEY || '',
      deepseek: process.env.DEEPSEEK_API_KEY || '',
      mistral: process.env.MISTRAL_API_KEY || '',
      openrouter: process.env.OPENROUTER_API_KEY || '',
      ollama: process.env.OLLAMA_API_KEY || 'local',
    },
  },
};

for (const dir of [config.dataDir, config.uploadDir]) {
  fs.mkdirSync(dir, { recursive: true });
}
