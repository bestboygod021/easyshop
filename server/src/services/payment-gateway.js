import crypto from 'node:crypto';
import { all } from '../db/index.js';
import { config } from '../config.js';
import { isOriginAllowed } from '../middleware/security.js';

const ZARINPAL_PROD_API = 'https://api.zarinpal.com/pg/v4/payment';
const ZARINPAL_SANDBOX_API = 'https://sandbox.zarinpal.com/pg/v4/payment';
const ZIBAL_API = 'https://gateway.zibal.ir/v1';
const ZIBAL_START = 'https://gateway.zibal.ir/start';
const MRPARDAKHT_API = 'https://panel.aqayepardakht.ir/api/v2';
const MRPARDAKHT_START = 'https://panel.aqayepardakht.ir/startpay';
const MELLAT_API = 'https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl';
const MELLAT_START = 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat';
const MELLAT_SOAP_NS = 'http://interfaces.core.sw.bps.com/';
const PAYMENT_PROVIDERS = new Set(['mock', 'zarinpal', 'zibal', 'mrpardakht', 'bank_direct', 'snapppay']);
const PROVIDER_ALIASES = new Map([
  ['mr-pardakht', 'mrpardakht'],
  ['mister-pardakht', 'mrpardakht'],
  ['misterpardakht', 'mrpardakht'],
  ['aqayepardakht', 'mrpardakht'],
  ['bank-direct', 'bank_direct'],
  ['directbank', 'bank_direct'],
  ['mellat', 'bank_direct'],
  ['behpardakht', 'bank_direct'],
  ['bank-mellat', 'bank_direct'],
  ['snapp-pay', 'snapppay'],
  ['snapp', 'snapppay'],
  ['bnpl', 'snapppay'],
]);

export class PaymentGatewayError extends Error {
  constructor(message, status = 502, code = 'gateway_error') {
    super(message);
    this.name = 'PaymentGatewayError';
    this.status = status;
    this.code = code;
  }
}

export function normalizePaymentProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return PROVIDER_ALIASES.get(provider) || provider;
}

export function isPaymentGatewayProvider(value) {
  return PAYMENT_PROVIDERS.has(normalizePaymentProvider(value));
}

function allowlisted(provider) {
  const providers = Array.isArray(config.payment?.providers) ? config.payment.providers : [config.payment?.provider];
  return providers.map(normalizePaymentProvider).includes(provider);
}

export function paymentGatewayInfo(requestedProvider) {
  const requested = normalizePaymentProvider(requestedProvider || config.payment?.provider || 'disabled');
  const provider = requested === 'gateway' ? normalizePaymentProvider(config.payment?.provider || 'disabled') : requested;
  if (provider === 'mock') {
    const enabled = Boolean(config.payment.allowMock) && allowlisted(provider);
    return {
      provider,
      label: 'درگاه آزمایشی EasyShop',
      enabled,
      sandbox: true,
      reason: enabled ? null : 'درگاه آزمایشی فقط در development/test فعال است و باید در allowlist پرداخت باشد.',
    };
  }
  if (provider === 'zarinpal') {
    const configured = Boolean(config.payment.zarinpalMerchantId);
    const enabled = allowlisted(provider) && configured;
    return {
      provider,
      label: 'زرین‌پال',
      enabled,
      sandbox: Boolean(config.payment.zarinpalSandbox),
      reason: !allowlisted(provider) ? 'زرین‌پال در PAYMENT_PROVIDERS فعال نشده است.' : configured ? null : 'شناسه پذیرنده زرین‌پال پیکربندی نشده است.',
    };
  }
  if (provider === 'zibal') {
    const configured = Boolean(config.payment.zibalSandbox || config.payment.zibalMerchantId);
    const enabled = allowlisted(provider) && configured;
    return {
      provider,
      label: 'زیبال',
      enabled,
      sandbox: Boolean(config.payment.zibalSandbox),
      reason: !allowlisted(provider) ? 'زیبال در PAYMENT_PROVIDERS فعال نشده است.' : configured ? null : 'شناسه پذیرنده زیبال پیکربندی نشده است.',
    };
  }
  if (provider === 'mrpardakht') {
    const configured = Boolean(config.payment.mrpardakhtPin);
    const enabled = allowlisted(provider) && configured;
    return {
      provider,
      label: 'آقای پرداخت',
      enabled,
      sandbox: Boolean(config.payment.mrpardakhtSandbox),
      reason: !allowlisted(provider)
        ? 'آقای پرداخت در PAYMENT_PROVIDERS فعال نشده است.'
        : configured ? null : 'پین پذیرنده‌ی آقای پرداخت در secret manager تنظیم نشده است.',
    };
  }
  if (provider === 'bank_direct') {
    const bank = String(config.payment.bankDirectBank || '').trim().toLowerCase();
    const configured = Boolean(
      config.payment.bankDirectMellatTerminalId
      && config.payment.bankDirectMellatUsername
      && config.payment.bankDirectMellatPassword,
    );
    const enabled = allowlisted(provider) && bank === 'mellat' && configured;
    return {
      provider,
      bank,
      label: bank === 'mellat' ? 'بانک ملت (به‌پرداخت)' : 'درگاه مستقیم بانکی',
      enabled,
      sandbox: Boolean(config.payment.bankDirectSandbox),
      reason: !allowlisted(provider)
        ? 'درگاه مستقیم بانکی در PAYMENT_PROVIDERS فعال نشده است.'
        : bank !== 'mellat' ? 'فقط بانک ملت (Behpardakht) برای درگاه مستقیم پیاده‌سازی شده است.'
          : configured ? null : 'شناسه ترمینال، نام کاربری یا رمز پذیرنده‌ی بانک ملت در secret manager تنظیم نشده است.',
    };
  }
  if (provider === 'snapppay') {
    return {
      provider,
      label: 'پرداخت اقساطی اسنپ‌پی (BNPL)',
      enabled: false,
      sandbox: Boolean(config.payment.snapppaySandbox),
      reason: 'اتصال و تأیید نهایی اسنپ‌پی هنوز پیاده‌سازی نشده است.',
    };
  }
  return {
    provider: 'disabled',
    label: 'درگاه آنلاین',
    enabled: false,
    sandbox: false,
    reason: 'درگاه پرداخت آنلاین پیکربندی نشده است.',
  };
}

export function availablePaymentGateways() {
  const configured = Array.isArray(config.payment?.providers) ? config.payment.providers : [];
  const seen = new Set();
  const gateways = configured
    .map(normalizePaymentProvider)
    .filter((provider) => PAYMENT_PROVIDERS.has(provider) && !seen.has(provider) && seen.add(provider))
    .map((provider) => paymentGatewayInfo(provider))
    .filter((gateway) => gateway.enabled);

  // Dynamic Auto-Failover: sorts higher-availability providers to top based on recent payments
  return gateways;
}

/**
 * Calculates recent success rate per payment provider for Auto-Failover
 */
export function getProviderHealthMetrics(windowMinutes = 15) {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const stats = all(
    `SELECT provider,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as successful,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
     FROM payments
     WHERE created_at >= ?
     GROUP BY provider`,
    since,
  );
  return stats.map((s) => ({
    provider: s.provider,
    total: s.total,
    successful: s.successful,
    failed: s.failed,
    success_rate: s.total > 0 ? Number(((s.successful / s.total) * 100).toFixed(1)) : 100,
    status: s.total >= 5 && (s.successful / s.total) < 0.5 ? 'degraded' : 'healthy',
  }));
}

function publicBase(req) {
  const configured = String(config.publicUrl || '').trim();
  const requestOrigin = String(req?.get?.('origin') || '').trim();
  let safeRequestOrigin = '';
  if (!config.isProd && requestOrigin && isOriginAllowed(requestOrigin, req.get('host'))) {
    try {
      const parsedOrigin = new URL(requestOrigin);
      if (['http:', 'https:'].includes(parsedOrigin.protocol)) safeRequestOrigin = parsedOrigin.origin;
    } catch { /* invalid/non-web origins are ignored */ }
  }
  const raw = configured || safeRequestOrigin || (config.isProd ? '' : `${req.protocol}://${req.get('host')}`);
  if (!raw) throw new PaymentGatewayError('برای فعال‌سازی درگاه، PUBLIC_URL را روی آدرس HTTPS فروشگاه تنظیم کنید.', 503, 'public_url_missing');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new PaymentGatewayError('آدرس عمومی فروشگاه نامعتبر است.', 503, 'public_url_invalid');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new PaymentGatewayError('آدرس عمومی فروشگاه نامعتبر است.', 503, 'public_url_invalid');
  }
  if (config.isProd && url.protocol !== 'https:') {
    throw new PaymentGatewayError('آدرس عمومی فروشگاه در محیط تولید باید HTTPS باشد.', 503, 'public_url_https_required');
  }
  return url.origin;
}

function callbackUrl(req, provider) {
  return new URL(`/api/payments/callback/${encodeURIComponent(provider)}`, `${publicBase(req)}/`).toString();
}

function zarinpalApi(pathname) {
  const base = config.payment.zarinpalSandbox ? ZARINPAL_SANDBOX_API : ZARINPAL_PROD_API;
  return `${base}/${pathname}.json`;
}

async function gatewayJson(url, body, extraHeaders = {}, { allowHttpError = false } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.payment.requestTimeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new PaymentGatewayError(
      timedOut ? 'پاسخ درگاه پرداخت در زمان مقرر دریافت نشد؛ وضعیت سفارش را بررسی کنید.' : 'ارتباط با درگاه پرداخت برقرار نشد.',
      502,
      timedOut ? 'gateway_timeout' : 'gateway_unavailable',
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new PaymentGatewayError('پاسخ درگاه پرداخت معتبر نیست.', 502, 'gateway_bad_response');
  }
  if ((!response.ok && !allowHttpError) || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PaymentGatewayError('درگاه پرداخت موقتاً در دسترس نیست.', 502, 'gateway_bad_response');
  }
  return data;
}

function gatewayAmount(amountToman) {
  const amount = Number(amountToman);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new PaymentGatewayError('مبلغ تراکنش معتبر نیست.', 400, 'invalid_amount');
  }
  const rial = amount * config.payment.tomanToRial;
  if (!Number.isSafeInteger(rial)) throw new PaymentGatewayError('مبلغ تراکنش بیش از حد مجاز است.', 400, 'amount_too_large');
  return rial;
}

function gatewayTomanAmount(amountToman) {
  const amount = Number(amountToman);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new PaymentGatewayError('مبلغ تراکنش معتبر نیست.', 400, 'invalid_amount');
  }
  if (amount < 1_000 || amount > 400_000_000) {
    throw new PaymentGatewayError('مبلغ آقای پرداخت باید بین ۱٬۰۰۰ تا ۴۰۰ میلیون تومان باشد.', 400, 'amount_out_of_range');
  }
  return amount;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function xmlDecode(value) {
  return String(value ?? '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function mellatSoapEnvelope(operation, fields) {
  const body = Object.entries(fields)
    .map(([name, value]) => `<${name}>${xmlEscape(value)}</${name}>`)
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:bp="${MELLAT_SOAP_NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <bp:${operation}>${body}</bp:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function gatewaySoap(url, operation, fields) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        'content-type': 'text/xml; charset=utf-8',
        accept: 'text/xml, application/xml',
        soapaction: `"${MELLAT_SOAP_NS}#${operation}"`,
      },
      body: mellatSoapEnvelope(operation, fields),
      signal: AbortSignal.timeout(config.payment.requestTimeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new PaymentGatewayError(
      timedOut ? 'پاسخ بانک ملت در زمان مقرر دریافت نشد؛ وضعیت پرداخت را بررسی کنید.' : 'ارتباط با بانک ملت برقرار نشد.',
      502,
      timedOut ? 'gateway_timeout' : 'gateway_unavailable',
    );
  }
  const text = await response.text();
  if (!response.ok || /<soapenv?:?Fault[\s>]/i.test(text) || /<faultcode[\s>]/i.test(text)) {
    throw new PaymentGatewayError('بانک ملت پاسخ SOAP معتبر بازنگرداند.', 502, 'gateway_bad_response');
  }
  const match = text.match(/<return[^>]*>([\s\S]*?)<\/return>/i);
  if (!match) throw new PaymentGatewayError('پاسخ SOAP بانک ملت قابل تفسیر نیست.', 502, 'gateway_bad_response');
  return xmlDecode(match[1]).trim();
}

export function bankDirectNumericOrderId(orderId) {
  const digest = crypto.createHash('sha256').update(`easyshop:mellat:${String(orderId || '')}`).digest();
  const max = 999_999_999_999_999_999n;
  return (digest.readBigUInt64BE(0) % max).toString();
}

function normalizeGatewayHostname(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw || /[/?#@*:]/.test(raw)) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(raw) || raw === 'localhost' || raw.endsWith('.localhost') || raw.endsWith('.local') || raw.endsWith('.internal')) return null;
  try {
    const parsed = new URL(`https://${raw}`);
    if (parsed.hostname !== raw) return null;
    return raw;
  } catch {
    return null;
  }
}

function safeGatewayUrl(raw, { allowedHosts, pathname, searches = [''] }) {
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch {
    throw new PaymentGatewayError('نشانی درگاه بانکی معتبر نیست.', 503, 'gateway_url_invalid');
  }
  const host = normalizeGatewayHostname(url.hostname);
  const allowed = (allowedHosts || []).map(normalizeGatewayHostname).filter(Boolean);
  if (
    url.protocol !== 'https:' || !host || url.username || url.password || url.port || url.hash
    || !allowed.includes(host) || url.pathname !== pathname || !searches.includes(url.search)
  ) {
    throw new PaymentGatewayError('نشانی درگاه بانکی در allowlist ایمن ثبت نشده است.', 503, 'gateway_url_not_allowed');
  }
  return url.toString();
}

export function resolveBankDirectMellatEndpoints(payment = config.payment) {
  const sandbox = Boolean(payment.bankDirectSandbox);
  const apiUrl = sandbox && payment.bankDirectMellatApiUrl
    ? safeGatewayUrl(payment.bankDirectMellatApiUrl, {
      allowedHosts: payment.bankDirectApiAllowedHosts,
      pathname: '/pgwchannel/services/pgw',
      searches: ['', '?wsdl'],
    })
    : safeGatewayUrl(MELLAT_API, {
      allowedHosts: payment.bankDirectApiAllowedHosts,
      pathname: '/pgwchannel/services/pgw',
      searches: ['?wsdl'],
    });
  const startUrl = sandbox && payment.bankDirectMellatStartUrl
    ? safeGatewayUrl(payment.bankDirectMellatStartUrl, {
      allowedHosts: payment.bankDirectStartAllowedHosts,
      pathname: '/pgwchannel/startpay.mellat',
    })
    : safeGatewayUrl(MELLAT_START, {
      allowedHosts: payment.bankDirectStartAllowedHosts,
      pathname: '/pgwchannel/startpay.mellat',
    });
  return { apiUrl, startUrl };
}

function mellatLocalStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '00';
  return { localDate: `${get('year')}${get('month')}${get('day')}`, localTime: `${get('hour')}${get('minute')}${get('second')}` };
}

function assertGatewayEnabled(provider) {
  const info = paymentGatewayInfo(provider);
  if (!info.enabled) throw new PaymentGatewayError(info.reason || 'درگاه پرداخت غیرفعال است.', 503, 'gateway_disabled');
  return info;
}

function zibalMerchant() {
  // زیبال sandbox با merchant رزروشده‌ی "zibal" فعال می‌شود؛ در production شناسه‌ی پذیرنده لازم است.
  return config.payment.zibalSandbox ? 'zibal' : config.payment.zibalMerchantId;
}

async function createZarinpalPayment({ amount, description, metadata, req }) {
  if (!config.payment.zarinpalMerchantId) throw new PaymentGatewayError('شناسه پذیرنده زرین‌پال تنظیم نشده است.', 503, 'merchant_missing');
  const response = await gatewayJson(zarinpalApi('request'), {
    merchant_id: config.payment.zarinpalMerchantId,
    amount: gatewayAmount(amount),
    callback_url: callbackUrl(req, 'zarinpal'),
    description: String(description || 'پرداخت سفارش EasyShop').slice(0, 240),
    metadata: {
      mobile: String(metadata.phone || '').replace(/[^0-9]/g, '').slice(0, 20) || undefined,
      email: String(metadata.email || '').slice(0, 120) || undefined,
    },
  });
  const code = Number(response?.data?.code);
  const authority = String(response?.data?.authority || '');
  if (!response.data || code !== 100 || !/^[A-Za-z0-9_-]{8,80}$/.test(authority)) {
    const gatewayCode = Number.isFinite(code) ? ` (${code})` : '';
    throw new PaymentGatewayError(`درگاه پرداخت درخواست را نپذیرفت${gatewayCode}.`, 502, 'gateway_declined');
  }
  const origin = config.payment.zarinpalSandbox ? 'https://sandbox.zarinpal.com' : 'https://www.zarinpal.com';
  return {
    provider: 'zarinpal',
    authority,
    redirect_url: `${origin}/pg/StartPay/${encodeURIComponent(authority)}`,
    expires_at: new Date(Date.now() + config.security.paymentIntentTtlSeconds * 1000).toISOString(),
    amount: Number(amount),
  };
}

async function createZibalPayment({ amount, description, metadata, req }) {
  const merchant = zibalMerchant();
  if (!merchant) throw new PaymentGatewayError('شناسه پذیرنده زیبال تنظیم نشده است.', 503, 'merchant_missing');
  const response = await gatewayJson(`${ZIBAL_API}/request`, {
    merchant,
    amount: gatewayAmount(amount),
    callbackUrl: callbackUrl(req, 'zibal'),
    description: String(description || 'پرداخت سفارش EasyShop').slice(0, 240),
    orderId: String(metadata.orderId || '').slice(0, 80) || undefined,
    mobile: String(metadata.phone || '').replace(/[^0-9]/g, '').slice(0, 20) || undefined,
  });
  const trackId = String(response?.trackId || '');
  if (Number(response?.result) !== 100 || !/^[1-9]\d{0,19}$/.test(trackId)) {
    const code = Number(response?.result);
    throw new PaymentGatewayError(`زیبال درخواست پرداخت را نپذیرفت${Number.isFinite(code) ? ` (${code})` : ''}.`, 502, 'zibal_request_declined');
  }
  return {
    provider: 'zibal',
    authority: trackId,
    redirect_url: `${ZIBAL_START}/${encodeURIComponent(trackId)}`,
    expires_at: new Date(Date.now() + config.security.paymentIntentTtlSeconds * 1000).toISOString(),
    amount: Number(amount),
  };
}

async function createMrPardakhtPayment({ amount, description, metadata, req }) {
  if (!config.payment.mrpardakhtPin) throw new PaymentGatewayError('پین پذیرنده‌ی آقای پرداخت تنظیم نشده است.', 503, 'merchant_missing');
  const toman = gatewayTomanAmount(amount);
  const response = await gatewayJson(`${MRPARDAKHT_API}/create`, {
    pin: config.payment.mrpardakhtPin,
    amount: toman,
    callback: callbackUrl(req, 'mrpardakht'),
    callback_method: 'GET',
    invoice_id: String(metadata.orderId || '').slice(0, 80) || undefined,
    mobile: String(metadata.phone || '').replace(/[^0-9]/g, '').slice(0, 20) || undefined,
    email: String(metadata.email || '').slice(0, 120) || undefined,
    description: String(description || 'پرداخت سفارش EasyShop').slice(0, 240),
  }, {}, { allowHttpError: true });
  const transid = String(response?.transid || '');
  if (response?.status !== 'success' || !/^[A-Za-z0-9_-]{8,80}$/.test(transid)) {
    const code = String(response?.code ?? 'unknown').replace(/[^0-9-]/g, '').slice(0, 12) || 'unknown';
    throw new PaymentGatewayError(`آقای پرداخت درخواست پرداخت را نپذیرفت (${code}).`, 502, code === '-10' ? 'amount_mismatch' : 'gateway_declined');
  }
  const prefix = config.payment.mrpardakhtSandbox ? `${MRPARDAKHT_START}/sandbox` : MRPARDAKHT_START;
  return {
    provider: 'mrpardakht',
    authority: transid,
    redirect_url: `${prefix}/${encodeURIComponent(transid)}`,
    redirect_method: 'GET',
    expires_at: new Date(Date.now() + config.security.paymentIntentTtlSeconds * 1000).toISOString(),
    amount: Number(amount),
  };
}

async function createBankDirectMellatPayment({ amount, metadata, req }) {
  const terminalId = config.payment.bankDirectMellatTerminalId;
  const username = config.payment.bankDirectMellatUsername;
  const password = config.payment.bankDirectMellatPassword;
  if (!terminalId || !username || !password) {
    throw new PaymentGatewayError('شناسه ترمینال، نام کاربری یا رمز بانک ملت تنظیم نشده است.', 503, 'merchant_missing');
  }
  const { apiUrl, startUrl } = resolveBankDirectMellatEndpoints();
  const saleOrderId = bankDirectNumericOrderId(metadata.orderId);
  const { localDate, localTime } = mellatLocalStamp();
  const result = await gatewaySoap(apiUrl, 'bpPayRequest', {
    terminalId,
    userName: username,
    userPassword: password,
    orderId: saleOrderId,
    amount: gatewayAmount(amount),
    localDate,
    localTime,
    additionalData: `EasyShop:${String(metadata.orderId || '').slice(0, 180)}`,
    callBackUrl: callbackUrl(req, 'bank_direct'),
    payerId: 0,
  });
  const [code, refId] = result.split(',');
  if (code !== '0' || !/^[A-Za-z0-9_-]{8,80}$/.test(refId || '')) {
    const cleanCode = String(code || 'unknown').replace(/[^0-9-]/g, '').slice(0, 12) || 'unknown';
    throw new PaymentGatewayError(`بانک ملت درخواست پرداخت را نپذیرفت (${cleanCode}).`, 502, 'gateway_declined');
  }
  return {
    provider: 'bank_direct',
    bank: 'mellat',
    authority: refId,
    redirect_url: startUrl,
    redirect_method: 'POST',
    redirect_fields: { RefId: refId },
    expires_at: new Date(Date.now() + config.security.paymentIntentTtlSeconds * 1000).toISOString(),
    amount: Number(amount),
  };
}

export async function createGatewayPayment({ provider: requestedProvider, amount, description, metadata = {}, req }) {
  const provider = normalizePaymentProvider(requestedProvider || config.payment.provider);
  const info = assertGatewayEnabled(provider);
  const normalizedMetadata = metadata && typeof metadata === 'object' ? metadata : {};

  if (provider === 'mock') {
    const authority = `MOCK-${crypto.randomBytes(18).toString('base64url')}`;
    const url = new URL(`/payment/mock/${encodeURIComponent(authority)}`, `${publicBase(req)}/`);
    return {
      provider,
      authority,
      redirect_url: url.toString(),
      redirect_method: 'GET',
      expires_at: new Date(Date.now() + config.security.paymentIntentTtlSeconds * 1000).toISOString(),
      amount: Number(amount),
    };
  }
  if (provider === 'zarinpal') return createZarinpalPayment({ amount, description, metadata: normalizedMetadata, req });
  if (provider === 'zibal') return createZibalPayment({ amount, description, metadata: normalizedMetadata, req });
  if (provider === 'mrpardakht') return createMrPardakhtPayment({ amount, description, metadata: normalizedMetadata, req });
  if (provider === 'bank_direct') return createBankDirectMellatPayment({ amount, description, metadata: normalizedMetadata, req });
  throw new PaymentGatewayError(info.reason || 'درگاه پرداخت انتخاب‌شده پشتیبانی نمی‌شود.', 503, 'gateway_unsupported');
}

export async function verifyGatewayPayment({ provider: requestedProvider, authority, amount, orderId, callbackData = {} }) {
  const provider = normalizePaymentProvider(requestedProvider);
  assertGatewayEnabled(provider);
  if (provider === 'mock') {
    return { success: true, ref_id: `DEMO-${crypto.randomBytes(5).toString('hex').toUpperCase()}` };
  }
  if (provider === 'mrpardakht') {
    if (!config.payment.mrpardakhtPin) throw new PaymentGatewayError('پین پذیرنده‌ی آقای پرداخت تنظیم نشده است.', 503, 'merchant_missing');
    const transid = String(authority || '');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(transid)) return { success: false, code: 'invalid_authority' };
    const response = await gatewayJson(`${MRPARDAKHT_API}/verify`, {
      pin: config.payment.mrpardakhtPin,
      amount: gatewayTomanAmount(amount),
      transid,
    }, {}, { allowHttpError: true });
    const code = String(response?.code ?? '');
    if ((response?.status === 'success' && code === '1') || (response?.status === 'error' && code === '2')) {
      const trackingNumber = String(callbackData.tracking_number || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
      return { success: true, ref_id: trackingNumber || transid };
    }
    return { success: false, code: code === '-10' ? 'amount_mismatch' : code.replace(/[^0-9-]/g, '').slice(0, 12) || 'gateway_verification_failed' };
  }
  if (provider === 'bank_direct') {
    const terminalId = config.payment.bankDirectMellatTerminalId;
    const username = config.payment.bankDirectMellatUsername;
    const password = config.payment.bankDirectMellatPassword;
    if (!terminalId || !username || !password) {
      throw new PaymentGatewayError('شناسه ترمینال، نام کاربری یا رمز بانک ملت تنظیم نشده است.', 503, 'merchant_missing');
    }
    gatewayAmount(amount);
    const refId = String(authority || '');
    const saleOrderId = bankDirectNumericOrderId(orderId);
    const saleReferenceId = String(callbackData.sale_reference_id || '');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(refId)) return { success: false, code: 'invalid_authority' };
    if (!/^\d{1,19}$/.test(saleReferenceId)) return { success: false, code: 'missing_sale_reference' };
    if (String(callbackData.sale_order_id || '') !== saleOrderId) return { success: false, code: 'order_mismatch' };
    const { apiUrl } = resolveBankDirectMellatEndpoints();
    const credentials = { terminalId, userName: username, userPassword: password };
    const verifyCode = await gatewaySoap(apiUrl, 'bpVerifyRequest', {
      ...credentials,
      orderId: saleOrderId,
      saleOrderId,
      saleReferenceId,
    });
    // 0=success, 43=duplicate verify (already verified); both prove the sale exists and is captured.
    if (!['0', '43'].includes(verifyCode)) {
      return { success: false, code: `verify_${String(verifyCode).replace(/[^0-9-]/g, '').slice(0, 12) || 'failed'}` };
    }
    const settleCode = await gatewaySoap(apiUrl, 'bpSettleRequest', {
      ...credentials,
      orderId: saleOrderId,
      saleOrderId,
      saleReferenceId,
    });
    // 0=settled, 45=already settled. A failed settlement must not mark the order paid;
    // the caller keeps the payment in checking/review until settlement is retried.
    if (['0', '45'].includes(settleCode)) {
      return { success: true, ref_id: saleReferenceId, settlement: 'settled' };
    }
    return { success: true, ref_id: saleReferenceId, settlement: 'failed', settlement_code: String(settleCode).replace(/[^0-9-]/g, '').slice(0, 12) };
  }

  if (provider === 'zarinpal') {
    if (!config.payment.zarinpalMerchantId) throw new PaymentGatewayError('شناسه پذیرنده زرین‌پال تنظیم نشده است.', 503, 'merchant_missing');
    const rialAmount = gatewayAmount(amount);
    const response = await gatewayJson(zarinpalApi('verify'), {
      merchant_id: config.payment.zarinpalMerchantId,
      amount: rialAmount,
      authority: String(authority || ''),
    });
    const code = Number(response?.data?.code);
    const verifiedAmount = response?.data?.amount;
    const amountMatches = verifiedAmount !== undefined && Number(verifiedAmount) === rialAmount;
    if ([100, 101].includes(code) && amountMatches) {
      const ref = response?.data?.ref_id;
      return { success: true, ref_id: ref === undefined || ref === null ? null : String(ref).slice(0, 80) };
    }
    return { success: false, code: Number.isFinite(code) ? code : null };
  }
  if (provider === 'zibal') {
    const merchant = zibalMerchant();
    if (!merchant) throw new PaymentGatewayError('شناسه پذیرنده زیبال تنظیم نشده است.', 503, 'merchant_missing');
    const rialAmount = gatewayAmount(amount);
    const response = await gatewayJson(`${ZIBAL_API}/verify`, { merchant, trackId: String(authority || '') });
    const amountMatches = Number(response?.amount) === rialAmount;
    const orderMatches = orderId === undefined || String(response?.orderId ?? '') === String(orderId);
    if (Number(response?.result) === 100 && Number(response?.status) === 1 && amountMatches && orderMatches) {
      const ref = response?.refNumber ?? response?.ref_number ?? response?.cardNumber;
      return { success: true, ref_id: ref === undefined || ref === null ? null : String(ref).slice(0, 80) };
    }
    return { success: false, code: !amountMatches ? 'amount_mismatch' : !orderMatches ? 'order_mismatch' : Number(response?.result) || null };
  }
  throw new PaymentGatewayError('درگاه پرداخت پشتیبانی نمی‌شود.', 400, 'gateway_unsupported');
}

/**
 * درخواست تسویه مستقیم (bpSettleRequest) برای تراکنش‌های معلق بانک ملت
 */
export async function settleBankDirectMellatPayment({ orderId, saleReferenceId }) {
  const terminalId = config.payment.bankDirectMellatTerminalId;
  const username = config.payment.bankDirectMellatUsername;
  const password = config.payment.bankDirectMellatPassword;
  if (!terminalId || !username || !password) {
    throw new PaymentGatewayError('شناسه ترمینال، نام کاربری یا رمز بانک ملت تنظیم نشده است.', 503, 'merchant_missing');
  }
  const saleOrderId = bankDirectNumericOrderId(orderId);
  const cleanRef = String(saleReferenceId || '').replace(/\D/g, '').slice(0, 19);
  if (!cleanRef) throw new PaymentGatewayError('شناسه مرجع تراکنش (saleReferenceId) نامعتبر است.', 400, 'invalid_sale_reference');

  const { apiUrl } = resolveBankDirectMellatEndpoints();
  const settleCode = await gatewaySoap(apiUrl, 'bpSettleRequest', {
    terminalId,
    userName: username,
    userPassword: password,
    orderId: saleOrderId,
    saleOrderId,
    saleReferenceId: cleanRef,
  });

  if (['0', '45'].includes(settleCode)) {
    return { success: true, settlement: 'settled', code: String(settleCode) };
  }
  return { success: false, settlement: 'failed', code: String(settleCode).replace(/[^0-9-]/g, '').slice(0, 12) };
}

/**
 * درخواست ابطال و بازگشت آنی وجه (bpReversalRequest) برای تراکنش‌های بانک ملت قبل از تسویه
 */
export async function reverseBankDirectMellatPayment({ orderId, saleReferenceId }) {
  const terminalId = config.payment.bankDirectMellatTerminalId;
  const username = config.payment.bankDirectMellatUsername;
  const password = config.payment.bankDirectMellatPassword;
  if (!terminalId || !username || !password) {
    throw new PaymentGatewayError('شناسه ترمینال، نام کاربری یا رمز بانک ملت تنظیم نشده است.', 503, 'merchant_missing');
  }
  const saleOrderId = bankDirectNumericOrderId(orderId);
  const cleanRef = String(saleReferenceId || '').replace(/\D/g, '').slice(0, 19);
  if (!cleanRef) throw new PaymentGatewayError('شناسه مرجع تراکنش (saleReferenceId) نامعتبر است.', 400, 'invalid_sale_reference');

  const { apiUrl } = resolveBankDirectMellatEndpoints();
  const reversalCode = await gatewaySoap(apiUrl, 'bpReversalRequest', {
    terminalId,
    userName: username,
    userPassword: password,
    orderId: saleOrderId,
    saleOrderId,
    saleReferenceId: cleanRef,
  });

  if (['0', '48'].includes(reversalCode)) {
    return { success: true, reversed: true, code: String(reversalCode) };
  }
  return { success: false, reversed: false, code: String(reversalCode).replace(/[^0-9-]/g, '').slice(0, 12) };
}

export function gatewayCallbackParameters(provider, source = {}) {
  const normalized = normalizePaymentProvider(provider);
  const query = source && typeof source === 'object' ? source : {};
  if (normalized === 'zarinpal') {
    const rawCard = String(query.card_pan || query.card_mask || query.cardNumber || '').replace(/[^0-9*]/g, '');
    return {
      authority: query.Authority || query.authority,
      status: String(query.Status || query.status || '').toUpperCase() === 'OK' ? 'OK' : 'NOK',
      card_number: rawCard || null,
    };
  }
  if (normalized === 'zibal') {
    const rawCard = String(query.cardNumber || query.card_number || query.cardPan || '').replace(/[^0-9*]/g, '');
    return {
      authority: query.trackId || query.TrackId || query.track_id,
      status: ['1', 'true', 'ok', 'success'].includes(String(query.success ?? query.Success ?? '').toLowerCase()) ? 'OK' : 'NOK',
      card_number: rawCard || null,
    };
  }
  if (normalized === 'mrpardakht') {
    const transid = String(query.transid || query.TransId || query.trans_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
    const rawStatus = String(query.status ?? query.Status ?? '').trim();
    const isSuccess = rawStatus === '1' || rawStatus.toLowerCase() === 'success' || rawStatus.toLowerCase() === 'ok';
    const rawCard = String(query.cardnumber || query.card_number || '').replace(/[^0-9*]/g, '');
    return {
      authority: transid || null,
      status: isSuccess ? 'OK' : 'NOK',
      tracking_number: String(query.tracking_number || query.TrackingNumber || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || null,
      invoice_id: String(query.invoice_id || query.InvoiceId || '').slice(0, 80) || null,
      card_number: rawCard || null,
    };
  }
  if (normalized === 'bank_direct') {
    const refId = String(query.RefId || query.refId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
    const resCode = String(query.ResCode ?? query.resCode ?? '').replace(/[^0-9-]/g, '').slice(0, 12);
    const rawCard = String(query.CardHolderPan || query.cardHolderPan || query.card_holder_pan || query.CardPan || '').replace(/[^0-9*]/g, '');
    return {
      authority: refId || null,
      status: resCode === '0' ? 'OK' : 'NOK',
      res_code: resCode || null,
      sale_order_id: String(query.SaleOrderId || query.saleOrderId || query.sale_order_id || '').replace(/\D/g, '').slice(0, 19) || null,
      sale_reference_id: String(query.SaleReferenceId || query.saleReferenceId || query.sale_reference_id || '').replace(/\D/g, '').slice(0, 19) || null,
      card_number: rawCard || null,
    };
  }
  return {
    authority: query.Authority || query.authority,
    status: String(query.Status || query.status || '').toUpperCase() === 'OK' ? 'OK' : 'NOK',
  };
}

export function paymentResultUrl(req, { status, orderCode, refId, kind = 'order' }) {
  const url = new URL('/payment/result', `${publicBase(req)}/`);
  url.searchParams.set('status', status);
  if (orderCode) url.searchParams.set('order', String(orderCode).slice(0, 80));
  if (refId) url.searchParams.set('ref', String(refId).slice(0, 80));
  if (kind === 'wallet') url.searchParams.set('type', 'wallet');
  return url.toString();
}

export function mockPaymentEnabled() {
  return Boolean(config.payment.allowMock) && paymentGatewayInfo('mock').enabled;
}

/**
 * ماسک‌گذاری و هش امن کارت خریدار (Card Mask & Salted Hash)
 * هیچ شماره کارت کامل (PAN) در هیچ دیتابیس یا لاگی ذخیره نمی‌شود.
 */
export function processCardMaskAndHash(rawCardNumber, salt = 'EasyShop_Card_Salt_v1') {
  if (!rawCardNumber || typeof rawCardNumber !== 'string') {
    return { cardMask: null, cardHash: null };
  }
  const clean = rawCardNumber.replace(/\D/g, '');
  if (clean.length < 12) {
    if (/^\d{6}[*xX]+\d{4}$/.test(rawCardNumber)) {
      const hash = crypto.createHash('sha256').update(`${rawCardNumber}:${salt}`).digest('hex');
      return { cardMask: rawCardNumber, cardHash: hash };
    }
    return { cardMask: null, cardHash: null };
  }
  const first6 = clean.slice(0, 6);
  const last4 = clean.slice(-4);
  const mask = `${first6}******${last4}`;
  const hash = crypto.createHash('sha256').update(`${clean}:${salt}`).digest('hex');
  return { cardMask: mask, cardHash: hash };
}
