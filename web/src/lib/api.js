/**
 * کلاینت API واحد EasyShop.
 * - تشخیص خودکار base URL (وب: مسیر نسبی /api، اپ موبایل: VITE_API_URL)
 * - افزودن توکن دسترسی، تازه‌سازی خودکار توکن و مدیریت سبد مهمان
 */
function runtimeBase() {
  if (typeof window === 'undefined') return '';
  try {
    return window.EASYSHOP_API_URL || window.localStorage?.getItem('easyshop.apiBase') || '';
  } catch {
    return '';
  }
}

const RAW_BASE = runtimeBase() || import.meta.env.VITE_API_URL || '';
export const API_BASE = RAW_BASE ? `${RAW_BASE.replace(/\/$/, '')}/api` : '/api';

const TOKEN_KEY = 'easyshop.accessToken';
const REFRESH_KEY = 'easyshop.refreshToken';
const SESSION_KEY = 'easyshop.sessionKey';

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  },
  get refreshToken() {
    return localStorage.getItem(REFRESH_KEY) || '';
  },
  set(accessToken, refreshToken) {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem('easyshop.user');
  },
};

export function sessionKey() {
  let key = localStorage.getItem(SESSION_KEY);
  if (!key || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) {
    // کلید سبد مهمان با منبع تصادفی امن ساخته می‌شود (حدس‌ناپذیر در برابر سرقت سبد)
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    key = `sess_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    localStorage.setItem(SESSION_KEY, key);
  }
  return key;
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

let refreshing = null;

async function tryRefresh() {
  if (!auth.refreshToken) return false;
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        auth.set(data.session.accessToken, data.session.refreshToken);
        localStorage.setItem('easyshop.user', JSON.stringify(data.session.user));
        window.dispatchEvent(new CustomEvent('easyshop:session', { detail: data.session }));
        return true;
      })
      .catch(() => false)
      .finally(() => {
        setTimeout(() => {
          refreshing = null;
        }, 50);
      });
  }
  return refreshing;
}

export async function api(path, options = {}) {
  const { method = 'GET', body, headers = {}, raw = false, retry = true, signal } = options;
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const finalHeaders = {
    'x-session-key': sessionKey(),
    ...headers,
  };
  if (body !== undefined && !(body instanceof FormData)) finalHeaders['content-type'] = 'application/json';
  if (auth.token) finalHeaders.authorization = `Bearer ${auth.token}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new ApiError('ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.', 0, null);
  }

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return api(path, { ...options, retry: false });
    auth.clear();
    window.dispatchEvent(new CustomEvent('easyshop:unauthorized'));
  }

  if (raw) return res;

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `خطای سرور (${res.status})`, res.status, data);
  }
  return data;
}

export const get = (path, options) => api(path, { ...options, method: 'GET' });
export const post = (path, body, options) => api(path, { ...options, method: 'POST', body });
export const put = (path, body, options) => api(path, { ...options, method: 'PUT', body });
export const patch = (path, body, options) => api(path, { ...options, method: 'PATCH', body });
export const del = (path, options) => api(path, { ...options, method: 'DELETE' });

/** ساخت رشته‌ی کوئری از یک شیء */
export const qs = (params = {}) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/** آپلود فایل به سرور */
export async function upload(files) {
  const form = new FormData();
  for (const file of Array.isArray(files) ? files : [files]) form.append('files', file);
  return api('/uploads', { method: 'POST', body: form });
}

export default api;
