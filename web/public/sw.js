/* EasyShop Service Worker — کش دارایی‌های استاتیک؛ API همیشه network-only */
const CACHE = 'easyshop-v2';
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];
const API_OFFLINE_BODY = JSON.stringify({ ok: false, error: 'آفلاین هستید؛ اطلاعات حساب از کش خوانده نمی‌شود.' });

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // پاسخ API ممکن است شامل سفارش، پروفایل یا اطلاعات خصوصی باشد؛ هرگز cache نکن.
  if (/^\/api(?:\/|$)/.test(url.pathname)) {
    event.respondWith(
      fetch(request).catch(() => new Response(API_OFFLINE_BODY, {
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store, private',
        },
      })),
    );
    return;
  }

  // دارایی‌های ساخته‌شده: کش‌اول
  if (url.pathname.startsWith('/assets/') || /\.(png|jpg|jpeg|svg|webp|woff2?|css|js)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // صفحات: شبکه‌اول با بازگشت به index.html (SPA)
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('/index.html'))),
  );
});
