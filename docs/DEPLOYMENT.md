# راهنمای استقرار EasyShop

## ۱) پیش‌نیازها

| محیط | نسخه |
| --- | --- |
| Node.js | ۲۰.۱۱ یا بالاتر (ماژول `node:sqlite` لازم است) |
| npm | ۱۰+ |
| (اختیاری) Android Studio + JDK 17 | برای بیلد اندروید |
| (اختیاری) macOS + Xcode 15 | برای بیلد iOS |

---

## ۲) استقرار روی سرور (وب + API)

```bash
# روی سرور لینوکسی
git clone <repo-url> easyshop && cd easyshop
npm ci
npm run build                 # ساخت فرانت‌اند در web/dist

# متغیرهای محیطی
cat > server/.env <<'ENV'
PORT=4000
HOST=0.0.0.0
JWT_SECRET=یک-رشته-تصادفی-حداقل-۳۲-کاراکتری
CORS_ORIGINS=*
LOG_LEVEL=info
SEED_DEMO_DATA=1
OPENAI_API_KEY=sk-...
ENV

npm start                     # http://<server-ip>:4000
```

سرور هم API و هم اپ وب را از یک پورت سرو می‌کند؛ بنابراین یک دامنه کافی است.

### اجرای دائمی با systemd

```ini
# /etc/systemd/system/easyshop.service
[Unit]
Description=EasyShop
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/easyshop
Environment=NODE_ENV=production
Environment=PORT=4000
ExecStart=/usr/bin/node server/src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now easyshop
```

### pm2 (جایگزین)

```bash
npm i -g pm2
pm2 start server/src/index.js --name easyshop
pm2 save && pm2 startup
```

### Nginx + HTTPS (شامل WebSocket)

```nginx
server {
  listen 443 ssl http2;
  server_name shop.example.com;

  ssl_certificate     /etc/letsencrypt/live/shop.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/shop.example.com/privkey.pem;

  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # گفتگوی زنده و اعلان‌ها
  location /ws {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       $host;
    proxy_read_timeout 3600s;
  }
}
```

```bash
sudo certbot --nginx -d shop.example.com
```

### پشتیبان‌گیری

```bash
# هر شب: کپی دیتابیس و فایل‌ها
tar czf /backup/easyshop-$(date +%F).tgz server/data
```

> دیتابیس SQLite در `server/data/easyshop.db` و فایل‌های بارگذاری‌شده در `server/data/uploads/` قرار دارند.
> برای بازنشانی داده‌های دمو: `npm run seed`.

---

## ۳) Docker

```dockerfile
# Dockerfile
FROM node:22-slim

WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev || npm install

COPY . .
RUN npm run build

ENV PORT=4000 HOST=0.0.0.0 NODE_ENV=production
EXPOSE 4000
VOLUME ["/app/server/data"]
CMD ["node", "server/src/index.js"]
```

```bash
docker build -t easyshop .
docker run -d --name easyshop -p 4000:4000 \
  -v easyshop-data:/app/server/data \
  -e JWT_SECRET="یک-کلید-تصادفی" \
  easyshop
```

---

## ۴) اپ اندروید (Capacitor)

```bash
npm run build                # web/dist تازه شود
npm run mobile:install
npm run mobile:add:android   # فقط بار اول
npm run mobile:sync

cd mobile && npx cap open android
```

در Android Studio: `Build → Generate Signed Bundle / APK` و انتخاب keystore.

**نکته‌ی آدرس سرور:** برای اتصال اپ به سرور خودتان، یکی از این دو روش:

```bash
# الف) هنگام build
VITE_API_URL=https://shop.example.com npm run build && npm run mobile:sync
```
```js
// ب) در زمان اجرا (بدون build مجدد) — مثلاً در کنسول یا کد راه‌انداز
window.EASYSHOP_API_URL = 'https://shop.example.com';
localStorage.setItem('easyshop.apiBase', 'https://shop.example.com');
```

افزونه‌های آماده: Camera، Push Notifications، Share، Haptics، Network، Status Bar، Keyboard، Splash Screen.

---

## ۵) اپ iOS (Capacitor)

```bash
npm run build
npm run mobile:install
npm run mobile:add:ios       # فقط بار اول (نیازمند macOS)
npm run mobile:sync
cd mobile && npx cap open ios
```

در Xcode: انتخاب Team، تنظیم Bundle Identifier (`ir.easyshop.app`) و آرشیو برای App Store.
برای اعلان‌های پوش، قابلیت Push Notifications را در Signing & Capabilities فعال کنید.

---

## ۶) اپ ویندوز / مک / لینوکس (Electron)

```bash
npm run desktop:install
npm run desktop:build          # فقط ویندوز، خروجی در desktop/release/
# یا همه‌ی پلتفرم‌ها روی ماشین مناسب:
cd desktop && npm run dist:all
```

خروجی‌ها:
- `EasyShop-Setup-1.0.0.exe` → نصب‌کننده NSIS (فارسی، انتخاب مسیر نصب)
- `EasyShop-1.0.0-portable.exe` → نسخه‌ی بدون نصب
- macOS: `EasyShop-1.0.0.dmg` · Linux: `.AppImage` / `.deb`

اپ دسکتاپ سرور داخلی (Express + SQLite) را خودش اجرا می‌کند؛ بنابراین مشتری فقط یک فایل نصب نیاز دارد.
داده‌ها در پوشه‌ی داده‌ی کاربر ذخیره می‌شوند (`%APPDATA%` / `~/.config`).

### حالت شبکه (چند کاربر روی یک سرور)
اگر می‌خواهید اپ دسکتاپ به سرور مرکزی وصل شود، `window.EASYSHOP_API_URL` را در `preload.cjs` تنظیم کنید و اجرای سرور داخلی را با `EASYSHOP_DEV=1` غیرفعال نگه دارید.

---

## ۷) چک‌لیست انتشار

- [ ] `JWT_SECRET` قوی تنظیم شده (نه مقدار پیش‌فرض)
- [ ] `SEED_DEMO_DATA=0` برای فروشگاه واقعی (یا پاک‌سازی داده‌های دمو)
- [ ] رمز حساب‌های دمو تغییر کرده یا حذف شده‌اند
- [ ] کلیدهای AI در پنل مدیریت ثبت و تست شده‌اند
- [ ] تنظیمات فروشگاه (نام، تلفن، آدرس، شبکه‌های اجتماعی) ویرایش شده
- [ ] HTTPS فعال و `/ws` پروکسی شده
- [ ] پشتیبان‌گیری خودکار دیتابیس تنظیم شده
- [ ] `npm test` سبز است (۴۲ تست)

---

## ۸) عیب‌یابی

| نشانه | راه‌حل |
| --- | --- |
| صفحه سفید در وب | `npm run build` را اجرا کنید؛ سرور SPA را از `web/dist` سرو می‌کند |
| «قاب‌گرفتن صفحه در iframe مجاز نیست» | سرور از `frameguard: false` استفاده می‌کند؛ پس از تغییر `index.js` سرور را ری‌استارت کنید |
| خطای `fetch failed` در تست ارائه‌دهنده AI | کلید API اشتباه است یا سرور به اینترنت دسترسی ندارد؛ موتور داخلی به کار ادامه می‌دهد |
| داده‌های عجیب/تکراری | `npm run seed` برای بازنشانی کامل داده‌های دمو |
| اپ بومی به API وصل نمی‌شود | `EASYSHOP_API_URL` را تنظیم کنید و مطمئن شوید دامنه در CORS سرور مجاز است |
| پورت ۴۰۰۰ اشغال است | `PORT=4100 npm start` و در فرانت‌اند `VITE_API_URL` را متناسب تنظیم کنید |
