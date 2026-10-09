import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSecretManager } from './services/secret-manager.js';

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
if (!defaultSecretManager.secretsDir && process.env.SECRETS_DIR) {
  defaultSecretManager.secretsDir = process.env.SECRETS_DIR;
}

const bool = (v, d = false) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(String(v)));
const secret = (key, fallback = '') => defaultSecretManager.getSecret(key, fallback);
const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const auditLogHmacKeyVersion = process.env.AUDIT_LOG_HMAC_KEY_VERSION || 'v1';
const aiKeyEncryptionKeyVersion = process.env.AI_KEY_ENCRYPTION_KEY_VERSION || 'v1';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  publicUrl: process.env.PUBLIC_URL || '',
  jwtSecret: secret('JWT_SECRET') || 'easyshop-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  refreshExpiresDays: Number(process.env.REFRESH_EXPIRES_DAYS || 30),
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'data', 'uploads'),
  backup: {
    encryptionEnabled: bool(process.env.BACKUP_ENCRYPTION_ENABLED, isProduction || Boolean(secret('BACKUP_ENCRYPTION_KEY'))),
    encryptionKey: secret('BACKUP_ENCRYPTION_KEY'),
    directory: process.env.BACKUP_DIR || path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'backups'),
  },
  dataRetention: {
    enabled: bool(process.env.DATA_RETENTION_ENABLED, false),
    intervalMs: Number(process.env.DATA_RETENTION_INTERVAL_MS || 24 * 60 * 60_000),
    loginAttemptsDays: Number(process.env.RETENTION_LOGIN_ATTEMPTS_DAYS || 90),
    smsOtpsDays: Number(process.env.RETENTION_SMS_OTPS_DAYS || 30),
    refreshTokensDays: Number(process.env.RETENTION_REFRESH_TOKENS_DAYS || 7),
    paymentCallbacksDays: Number(process.env.RETENTION_PAYMENT_CALLBACKS_DAYS || 180),
    telemetryErrorsDays: Number(process.env.RETENTION_TELEMETRY_ERRORS_DAYS || 30),
    aggregatedErrorsDays: Number(process.env.RETENTION_AGGREGATED_ERRORS_DAYS || 180),
    aiLogsDays: Number(process.env.RETENTION_AI_LOGS_DAYS || 90),
    notificationsDays: Number(process.env.RETENTION_NOTIFICATIONS_DAYS || 180),
    loginHistoryDays: Number(process.env.RETENTION_LOGIN_HISTORY_DAYS || 180),
  },
  // فهرست صریح مبدأهای CORS. خالی ⇒ فقط same-origin، localhost، اپ بومی و پیش‌نمایش‌ها.
  // مقدار '*' فقط با اعلام صریح اپراتور و برای سازگاری با نسخه‌های قدیمی پشتیبانی می‌شود.
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  corsCredentials: bool(process.env.CORS_CREDENTIALS, false),
  // پشت پروکسی معتبر (Nginx/Traefik) مقدار ۱ بگذارید تا X-Forwarded-For معتبر شود.
  // در غیر این صورت هدر جعلی می‌تواند محدودیت نرخ را دور بزند.
  trustProxy: /^(1|true|yes|on)$/i.test(process.env.TRUST_PROXY || ''),
  // Promotion and demo seeding default to development-only behavior.
  allowSelfPromotion: bool(process.env.ALLOW_SELF_PROMOTION, !isProduction),
  seedDemoData: bool(process.env.SEED_DEMO_DATA, !isProduction),
  logLevel: process.env.LOG_LEVEL || 'info',
  isProd: isProduction,
  // --- امنیت -------------------------------------------------------------
  security: {
    bodyLimit: process.env.BODY_LIMIT || '2mb',
    auditLogHmacKeyVersion,
    auditLogHmacKey: secret(`AUDIT_LOG_HMAC_KEY_${auditLogHmacKeyVersion.toUpperCase()}`),
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
  observability: {
    otelEnabled: bool(process.env.OTEL_ENABLED,
      Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
        || process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
        || process.env.OTEL_TRACES_EXPORTER
        || process.env.OTEL_METRICS_EXPORTER)),
    serviceName: process.env.OTEL_SERVICE_NAME || 'easyshop-api',
    metricsBearerToken: secret('METRICS_BEARER_TOKEN'),
    sloWindowMs: Number(process.env.SLO_WINDOW_MS || 5 * 60_000),
    sloEvaluationIntervalMs: Number(process.env.SLO_EVALUATION_INTERVAL_MS || 60_000),
    sloAlertCooldownMs: Number(process.env.SLO_ALERT_COOLDOWN_MS || 15 * 60_000),
    availabilityTarget: Number(process.env.SLO_AVAILABILITY_TARGET || 0.999),
    minHttpRequests: Number(process.env.SLO_MIN_HTTP_REQUESTS || 20),
    httpP95TargetMs: Number(process.env.SLO_HTTP_P95_TARGET_MS || 750),
    paymentSuccessTarget: Number(process.env.SLO_PAYMENT_SUCCESS_TARGET || 0.98),
    minPaymentVerifications: Number(process.env.SLO_MIN_PAYMENT_VERIFICATIONS || 10),
  },
  // درگاه‌ها با deny-by-default فعال می‌شوند؛ اعتبارنامه‌ها از env یا فایل Secret خوانده می‌شوند.
  payment: {
    provider: process.env.PAYMENT_PROVIDER || (isProduction ? 'disabled' : 'mock'),
    providers: (process.env.PAYMENT_PROVIDERS ?? (isProduction ? '' : 'mock'))
      .split(',').map((value) => value.trim()).filter(Boolean),
    allowMock: bool(process.env.PAYMENT_ALLOW_MOCK, !isProduction),
    requestTimeoutMs: Number(process.env.PAYMENT_TIMEOUT_MS || 15000),
    tomanToRial: Number(process.env.TOMAN_TO_RIAL || 10),
    zarinpalMerchantId: secret('ZARINPAL_MERCHANT_ID'),
    zarinpalSandbox: bool(process.env.ZARINPAL_SANDBOX, !isProduction),
    zibalMerchantId: secret('ZIBAL_MERCHANT_ID'),
    zibalSandbox: bool(process.env.ZIBAL_SANDBOX, !isProduction),
    mrpardakhtPin: secret('MRPARDAKHT_PIN'),
    mrpardakhtSandbox: bool(process.env.MRPARDAKHT_SANDBOX, !isProduction),
    bankDirectBank: process.env.BANK_DIRECT_BANK || '',
    bankDirectMellatTerminalId: secret('BANK_DIRECT_MELLAT_TERMINAL_ID'),
    bankDirectMellatUsername: secret('BANK_DIRECT_MELLAT_USERNAME'),
    bankDirectMellatPassword: secret('BANK_DIRECT_MELLAT_PASSWORD'),
    bankDirectMellatApiUrl: process.env.BANK_DIRECT_MELLAT_API_URL || '',
    bankDirectMellatStartUrl: process.env.BANK_DIRECT_MELLAT_START_URL || '',
    bankDirectApiAllowedHosts: (process.env.BANK_DIRECT_API_ALLOWED_HOSTS || 'bpm.shaparak.ir')
      .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean),
    bankDirectStartAllowedHosts: (process.env.BANK_DIRECT_START_ALLOWED_HOSTS || 'bpm.shaparak.ir')
      .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean),
    bankDirectSandbox: bool(process.env.BANK_DIRECT_SANDBOX, !isProduction),
    snapppayClientId: secret('SNAPPAY_CLIENT_ID'),
    snapppayClientSecret: secret('SNAPPAY_CLIENT_SECRET'),
    snapppaySandbox: bool(process.env.SNAPPAY_SANDBOX, !isProduction),
  },
  // AI provider credentials are supplied through env/secrets or encrypted at rest in SQLite.
  ai: {
    keyEncryptionKeyVersion: aiKeyEncryptionKeyVersion,
    requestTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
    defaultTemperature: 0.7,
    maxTokens: Number(process.env.AI_MAX_TOKENS || 4096),
    envKeys: {
      openai: secret('OPENAI_API_KEY'),
      anthropic: secret('ANTHROPIC_API_KEY'),
      gemini: secret('GEMINI_API_KEY') || secret('GOOGLE_API_KEY'),
      xai: secret('XAI_API_KEY') || secret('GROK_API_KEY'),
      deepseek: secret('DEEPSEEK_API_KEY'),
      mistral: secret('MISTRAL_API_KEY'),
      openrouter: secret('OPENROUTER_API_KEY'),
      ollama: secret('OLLAMA_API_KEY', 'local'),
    },
  },
};

export function validateProductionConfig() {
  if (!config.isProd) return true;
  const jwtSecret = config.jwtSecret || '';
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32 || jwtSecret === 'easyshop-dev-secret-change-me') {
    throw new Error('Production requires a unique JWT_SECRET with at least 32 bytes.');
  }
  if (!/^v[1-9][0-9]*$/.test(config.security.auditLogHmacKeyVersion)
    || Buffer.byteLength(config.security.auditLogHmacKey || '', 'utf8') < 32) {
    throw new Error('Production requires AUDIT_LOG_HMAC_KEY_<VERSION> with at least 32 bytes and a valid AUDIT_LOG_HMAC_KEY_VERSION.');
  }
  if (process.env.BACKUP_ENCRYPTION_ENABLED !== '1' || !config.backup.encryptionEnabled
    || Buffer.byteLength(config.backup.encryptionKey || '', 'utf8') < 32) {
    throw new Error('Production requires BACKUP_ENCRYPTION_ENABLED=1 and BACKUP_ENCRYPTION_KEY with at least 32 bytes.');
  }
  if (!/^v[1-9][0-9]*$/.test(config.ai.keyEncryptionKeyVersion)) {
    throw new Error('AI_KEY_ENCRYPTION_KEY_VERSION must use the form v1, v2, etc.');
  }
  if (config.allowSelfPromotion) {
    throw new Error('ALLOW_SELF_PROMOTION must be disabled in production.');
  }
  if (config.seedDemoData) {
    throw new Error('SEED_DEMO_DATA must be disabled in production.');
  }
  if (config.corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS=* is not allowed in production.');
  }
  if (config.payment.allowMock || config.payment.providers.includes('mock')) {
    throw new Error('The mock payment provider must not be enabled in production.');
  }
  return true;
}

for (const dir of [config.dataDir, config.uploadDir]) {
  fs.mkdirSync(dir, { recursive: true });
}
