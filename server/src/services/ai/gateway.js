import { config } from '../../config.js';
import { all, get, run, uid, nowIso, parseJson } from '../../db/index.js';
import { PROVIDER_CATALOG, estimateCost, normalizeUsage } from './providers.js';
import { builtinImage, builtinProduct, builtinText } from './builtin.js';
import { decryptAiKey, maskAiKey } from './key-crypto.js';

const TIMEOUT = config.ai.requestTimeoutMs;

/** تبدیل ردیف دیتابیس به تنظیمات قابل استفاده */
export function toProvider(row) {
  return {
    slug: row.slug,
    name_fa: row.name_fa,
    name_en: row.name_en,
    kind: row.kind,
    baseUrl: row.base_url,
    apiKey: row.api_key ? decryptAiKey(row.api_key) : config.ai.envKeys[row.slug] || '',
    models: parseJson(row.models, []),
    defaultModel: row.default_model || parseJson(row.models, [])[0],
    supportsImage: Boolean(row.supports_image),
    enabled: Boolean(row.enabled),
    priority: row.priority,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    configured: Boolean(row.api_key || config.ai.envKeys[row.slug]) || row.kind === 'builtin',
  };
}

export function listProviders({ includeDisabled = true } = {}) {
  const rows = all('SELECT * FROM ai_providers ORDER BY priority ASC');
  return rows
    .filter((r) => includeDisabled || r.enabled)
    .map((r) => ({
      ...toProvider(r),
      api_key_masked: r.api_key ? maskAiKey(r.api_key) : '',
      used_tokens: r.used_tokens,
      monthly_token_cap: r.monthly_token_cap,
      notes: r.notes,
      docs: PROVIDER_CATALOG.find((p) => p.slug === r.slug)?.docs || '',
      badge: PROVIDER_CATALOG.find((p) => p.slug === r.slug)?.badge || '',
    }));
}

export function getProvider(slug) {
  const row = get('SELECT * FROM ai_providers WHERE slug = ?', slug);
  return row ? { ...toProvider(row), row } : null;
}

/** زنجیره‌ی جانشین: ارائه‌دهنده‌ی درخواستی → سایر ارائه‌دهنده‌های فعال → موتور داخلی */
export function fallbackChain(preferred) {
  const enabled = listProviders().filter((p) => p.enabled && p.configured && p.slug !== 'builtin');
  enabled.sort((a, b) => (a.slug === preferred ? -1 : b.slug === preferred ? 1 : a.priority - b.priority));
  return [...enabled, listProviders().find((p) => p.slug === 'builtin')].filter(Boolean);
}

function logAi(entry) {
  run(
    `INSERT INTO ai_logs (id,provider,model,kind,prompt,response,tokens_in,tokens_out,latency_ms,cost,status,error,user_id,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    uid('ail'),
    entry.provider ?? null,
    entry.model ?? null,
    entry.kind ?? 'chat',
    (entry.prompt ?? '').slice(0, 4000),
    (entry.response ?? '').slice(0, 4000),
    entry.tokens_in ?? 0,
    entry.tokens_out ?? 0,
    entry.latency_ms ?? 0,
    entry.cost ?? 0,
    entry.status ?? 'ok',
    entry.error ?? null,
    entry.user_id ?? null,
    nowIso(),
  );
  if (entry.provider && entry.tokens_in + entry.tokens_out > 0) {
    run('UPDATE ai_providers SET used_tokens = used_tokens + ? WHERE slug = ?', entry.tokens_in + entry.tokens_out, entry.provider);
  }
}

async function fetchJson(url, options, ms = TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const message = data?.error?.message || data?.message || data?.error || `HTTP ${res.status}`;
      const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** فراخوانی یکپارچه‌ی چت روی هر ارائه‌دهنده */
async function callChat(provider, { messages, model, system, temperature, maxTokens, json }) {
  const mdl = model || provider.defaultModel;
  const temp = temperature ?? provider.temperature ?? config.ai.defaultTemperature;
  const maxTok = maxTokens ?? provider.maxTokens ?? config.ai.maxTokens;

  if (provider.kind === 'anthropic') {
    const data = await fetchJson(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: mdl,
        max_tokens: maxTok,
        temperature: temp,
        system: system || undefined,
        messages: messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }),
    });
    const text = (data.content || []).map((c) => c.text || '').join('\n').trim();
    return { text, usage: normalizeUsage(data.usage), model: mdl, raw: data };
  }

  if (provider.kind === 'gemini') {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const url = `${provider.baseUrl}/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
    const data = await fetchJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: {
          temperature: temp,
          maxOutputTokens: maxTok,
          responseMimeType: json ? 'application/json' : 'text/plain',
        },
      }),
    });
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    return { text, usage: normalizeUsage(data.usageMetadata), model: mdl, raw: data };
  }

  // openai-compatible (OpenAI, xAI, DeepSeek, Mistral, OpenRouter, Ollama)
  const payload = {
    model: mdl,
    temperature: temp,
    max_tokens: maxTok,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
  };
  if (json) payload.response_format = { type: 'json_object' };
  const data = await fetchJson(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.apiKey}`,
      ...(provider.slug === 'openrouter' ? { 'HTTP-Referer': 'https://easyshop.local', 'X-Title': 'EasyShop' } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  return { text, usage: normalizeUsage(data.usage), model: mdl, raw: data };
}

export function repairJson(text) {
  if (!text) return null;
  let cleaned = text
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      return JSON.parse(cleaned.replace(/,\s*([}\]])/g, '$1').replace(/[\u201c\u201d]/g, '"'));
    } catch {
      return null;
    }
  }
}

/**
 * اجرای درخواست روی یک ارائه‌دهنده با زنجیره‌ی جانشین خودکار.
 * خروجی همیشه یک شیء ساخت‌یافته است (حتی در حالت بدون کلید API).
 */
export async function aiComplete({
  slug = 'builtin',
  model,
  messages = [],
  system,
  temperature,
  maxTokens,
  json = false,
  kind = 'chat',
  userId = null,
  builtinResult = null, // تابعی برای تولید خروجی موتور داخلی
  fallback = true,
}) {
  const started = Date.now();
  const attempts = [];
  const chain = fallback ? fallbackChain(slug) : [getProvider(slug)].filter(Boolean);
  const ordered = [
    getProvider(slug),
    ...chain.filter((p) => p.slug !== slug),
  ].filter(Boolean);

  for (const provider of ordered) {
    if (provider.kind === 'builtin') {
      const result = typeof builtinResult === 'function' ? builtinResult() : { text: builtinText({ kind, input: messages.at(-1)?.content }) };
      const latency = Date.now() - started;
      logAi({
        provider: 'builtin',
        model: provider.defaultModel,
        kind,
        prompt: messages.at(-1)?.content?.slice(0, 1000) || system,
        response: JSON.stringify(result).slice(0, 4000),
        latency_ms: latency,
        status: 'ok',
        user_id: userId,
      });
      return {
        ok: true,
        provider: 'builtin',
        providerName: provider.name_fa,
        model: provider.defaultModel,
        text: result.text,
        data: result.data ?? result,
        usage: { tokens_in: 0, tokens_out: 0 },
        cost: 0,
        latency_ms: latency,
        attempts,
      };
    }
    try {
      const { text, usage, model: usedModel } = await callChat(provider, {
        messages,
        model,
        system,
        temperature,
        maxTokens,
        json,
      });
      const latency = Date.now() - started;
      const cost = estimateCost(usedModel, usage.tokens_in, usage.tokens_out);
      logAi({
        provider: provider.slug,
        model: usedModel,
        kind,
        prompt: messages.at(-1)?.content?.slice(0, 1000) || system,
        response: text.slice(0, 4000),
        ...usage,
        latency_ms: latency,
        cost,
        status: 'ok',
        user_id: userId,
      });
      return {
        ok: true,
        provider: provider.slug,
        providerName: provider.name_fa,
        model: usedModel,
        text,
        data: json ? repairJson(text) : null,
        usage,
        cost,
        latency_ms: latency,
        attempts,
      };
    } catch (err) {
      attempts.push({ provider: provider.slug, error: err.message, status: err.status ?? null });
      logAi({
        provider: provider.slug,
        model: model || provider.defaultModel,
        kind,
        prompt: messages.at(-1)?.content?.slice(0, 1000) || system,
        status: 'error',
        error: err.message,
        latency_ms: Date.now() - started,
        user_id: userId,
      });
      if (!fallback) break;
    }
  }
  return { ok: false, error: 'هیچ ارائه‌دهنده‌ی هوش مصنوعی موفقی پیدا نشد.', attempts };
}

/** تولید تصویر با ارائه‌دهنده‌ی انتخاب‌شده (یا موتور داخلی) */
export async function aiImage({ slug = 'builtin', model, prompt, label, userId = null, size = '1024x1024' }) {
  const provider = getProvider(slug);
  const started = Date.now();
  try {
    if (provider && provider.configured && provider.supportsImage && provider.kind !== 'builtin') {
      if (provider.kind === 'gemini') {
        const mdl = model || 'imagen-3.0-generate-002';
        const data = await fetchJson(
          `${provider.baseUrl}/models/${encodeURIComponent(mdl)}:predict?key=${encodeURIComponent(provider.apiKey)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
          },
          TIMEOUT,
        );
        const b64 = data.predictions?.[0]?.bytesBase64Encoded;
        if (b64) {
          logAi({ provider: slug, model: mdl, kind: 'image', prompt, response: '[image]', latency_ms: Date.now() - started, user_id: userId });
          return { ok: true, provider: slug, model: mdl, base64: b64, mime: 'image/png', latency_ms: Date.now() - started };
        }
      } else if (provider.kind === 'openai' || provider.slug === 'xai') {
        const mdl = model || 'gpt-image-1';
        const data = await fetchJson(
          `${provider.baseUrl}/images/generations`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` },
            body: JSON.stringify({ model: mdl, prompt, n: 1, size, response_format: 'b64_json' }),
          },
          TIMEOUT,
        );
        const item = data.data?.[0] || {};
        logAi({ provider: slug, model: mdl, kind: 'image', prompt, response: item.url || '[b64 image]', latency_ms: Date.now() - started, user_id: userId });
        return {
          ok: true,
          provider: slug,
          model: mdl,
          base64: item.b64_json,
          url: item.url,
          mime: 'image/png',
          latency_ms: Date.now() - started,
        };
      }
    }
  } catch (err) {
    logAi({ provider: slug, kind: 'image', prompt, status: 'error', error: err.message, latency_ms: Date.now() - started, user_id: userId });
  }
  // Fallback: موتور داخلی
  const svg = builtinImage({ prompt, label });
  logAi({ provider: 'builtin', model: 'easyshop-vision-sim-v1', kind: 'image', prompt, response: '[svg]', latency_ms: Date.now() - started, user_id: userId });
  return { ok: true, provider: 'builtin', model: 'easyshop-vision-sim-v1', svg, latency_ms: Date.now() - started };
}

export { builtinProduct, builtinText };
