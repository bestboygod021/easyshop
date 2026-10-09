# راهنمای استقرار EasyShop

## ۱) پیش‌نیازها

| محیط | نسخه |
| --- | --- |
| Node.js | ۲۲.۱۳ یا بالاتر (برای `node:sqlite` بدون فلگ آزمایشی) |
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

# مقادیر تصادفی مستقل بسازید؛ در استقرار واقعی از Secret Manager استفاده کنید
umask 077
JWT_SECRET="$(openssl rand -base64 48)"
AI_KEY_ENCRYPTION_KEY="$(openssl rand -base64 48)"
AUDIT_LOG_HMAC_KEY_V1="$(openssl rand -base64 48)"
BACKUP_ENCRYPTION_KEY="$(openssl rand -base64 48)"
cat > server/.env <<ENV
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
JWT_SECRET=$JWT_SECRET
AI_KEY_ENCRYPTION_KEY_VERSION=v1
AI_KEY_ENCRYPTION_KEY=$AI_KEY_ENCRYPTION_KEY
AUDIT_LOG_HMAC_KEY_VERSION=v1
AUDIT_LOG_HMAC_KEY_V1=$AUDIT_LOG_HMAC_KEY_V1
BACKUP_ENCRYPTION_ENABLED=1
BACKUP_ENCRYPTION_KEY=$BACKUP_ENCRYPTION_KEY
BACKUP_DIR=/mnt/easyshop-backups
DATA_RETENTION_ENABLED=0
CORS_ORIGINS=https://shop.example.com
TRUSTED_ORIGINS=https://shop.example.com
ALLOW_SELF_PROMOTION=0
SEED_DEMO_DATA=0
LOG_LEVEL=info
OPENAI_API_KEY=
ENV
unset JWT_SECRET AI_KEY_ENCRYPTION_KEY AUDIT_LOG_HMAC_KEY_V1 BACKUP_ENCRYPTION_KEY

npm start                     # http://<server-ip>:4000
```

سرور هم API و هم اپ وب را از یک پورت سرو می‌کند؛ بنابراین یک دامنه کافی است.

> **کلید AI:** `AI_KEY_ENCRYPTION_KEY_VERSION` و کلید نسخه‌دار را جدا از DB و خارج از Git نگه دارید؛ از آن نسخه‌ی پشتیبان امن داشته باشید و rotation را فقط با runbook رمزگشایی/رمزگذاری مجدد انجام دهید. از دست‌رفتن کلیدهای قدیمی می‌تواند provider credentials یا restore قدیمی را غیرقابل‌بازیابی کند. جزئیات: [`AI_KEY_ROTATION.md`](./AI_KEY_ROTATION.md).
>
> **پرداخت آنلاین:** checkout از providerهای پیاده‌سازی‌شدهٔ زرین‌پال، زیبال، آقای پرداخت و بانک ملت استفاده می‌کند؛ provider را صریحاً در `PAYMENT_PROVIDERS` allowlist کنید، secretهای پذیرنده و `PUBLIC_URL=https://...` را تنظیم کنید و callback/verify سمت سرور را ابتدا در sandbox همان provider آزمایش کنید. Mock فقط برای development/test است و production startup آن را رد می‌کند؛ اسنپ‌پی تا تکمیل adapter و verify غیرفعال است. قبل از دریافت وجه واقعی، قرارداد/آزمایش پذیرنده و مسیر reconcile دستی را با provider تأیید کنید.

> **پشتیبان و بازیابی:** production برای snapshotهای AES-256-GCM به `BACKUP_ENCRYPTION_KEY` نیاز دارد. راهنمای off-site/Object Lock و restore drill در [`BACKUP_AND_RECOVERY.md`](./BACKUP_AND_RECOVERY.md) است؛ PITR پیوسته هنوز وجود ندارد و مسیر PostgreSQL در [`DATABASE_MIGRATION_AND_RECOVERY.md`](./DATABASE_MIGRATION_AND_RECOVERY.md) برنامه‌ریزی شده است.
>
> **Retention و audit:** سیاست حذف پیش‌فرض خاموش است؛ پس از بررسی حقوقی و تعیین دوره‌ها به [`RETENTION_AND_AUDIT.md`](./RETENTION_AND_AUDIT.md) و `DATA_RETENTION_ENABLED` توجه کنید.
>
> **Load/SLO:** baseline محلی و محدودیت scale افقی در [`LOAD_TESTING_AND_AUTOSCALING.md`](./LOAD_TESTING_AND_AUTOSCALING.md) مستند است.
>
> **Secret lifecycle:** وضعیت SecretManager، rotation و مرز KMS/Vault در [`SECRET_LIFECYCLE.md`](./SECRET_LIFECYCLE.md) آمده است.
>
> **Observability:** راه‌اندازی OTLP، اسکرپ محافظت‌شدهٔ Prometheus، dashboard و alert routing در [`OBSERVABILITY.md`](./OBSERVABILITY.md) توضیح داده شده است.

### Blue/green و Canary

تصمیم استقرار تدریجی **Kubernetes + Argo Rollouts + ingress-nginx** با تحلیل metrics توسط Prometheus Operator است. فایل‌های rollout، routing، ServiceMonitor و AnalysisTemplate در `ops/kubernetes/` و `ops/argo-rollouts/` نمونه‌اند؛ rollout عمدی `DO NOT APPLY` است. در repository اکنون Dockerfile چندمرحله‌ای و workflow ساخت/انتشار GHCR با SBOM، provenance و امضای digest تعریف شده، اما آن workflow در GitHub اجرا نشده و base/image digest واقعی تأیید نشده است. PostgreSQL schema bootstrap آمادهٔ staging است ولی import/cutover داده، cluster/controller/router، Prometheus، staging URL، Vault auth و TLS واقعی نداریم. برنامه همچنان SQLite همگام و فایل‌محلی دارد؛ چند pod ممکن است order/payment state را جدا کند، پس template را اجرا نکنید.

`npm run --silent ops:preflight` فقط فایل‌ها و flagهای محلی را بررسی می‌کند و به هیچ cluster/endpoint وصل نمی‌شود. وضعیت `blocked` انتظار می‌رود و sign-off عملیاتی نیست. پس از رفع blockerها، هر pool باید روی schemaهای سازگار باشد، readiness و smoke testهای read-only را بگذراند، canary با thresholds و rollback اتوماتیک در staging تمرین شود، و RTO/RPO با evidence واقعی اندازه‌گیری شوند. طرح، آستانه‌ها و مراحل در [`ops/kubernetes/README.md`](../ops/kubernetes/README.md) و گیت‌ها/evidence در [`PRODUCTION_READINESS_REHEARSAL.md`](./PRODUCTION_READINESS_REHEARSAL.md) هستند.

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

## ۳) Docker / OCI image

Root `Dockerfile` و `.dockerignore` اکنون build چندمرحله‌ای وب/API را تعریف می‌کنند: runtime فقط dependencyهای production سرور را نصب می‌کند و با UID/GID غیرریشهٔ `10001` اجرا می‌شود. Build context دادهٔ SQLite، node_modules و فایل‌های محیطی را کنار می‌گذارد. برای بررسی محلی (sandbox فعلی Docker ندارد):

```bash
docker build -t easyshop-api:local .
```

Tag محلی به‌معنی image تأییدشده نیست. CI برای pull request و pushهای شاخه‌های `arena/*` Dockerfile را با `push: false` واقعاً build می‌کند؛ این فقط validation است و به registry credential نیاز ندارد. فقط tag نسخه‌ای `v*` در workflow انتشار می‌تواند به GHCR publish کند، آن هم اگر repository variable `NODE_BASE_IMAGE` به image Node 22 Bookworm بازبینی‌شده و digest-pinned اشاره کند. مسیر انتشار SBOM/provenance می‌سازد و digest را امضا می‌کند؛ OCI publish، امضای release و staging deployment هنوز اجرا/تأیید نشده‌اند. هیچ secretی را به build context، Dockerfile، history یا command line اضافه نکنید.

این image همچنان API محلی SQLite را اجرا می‌کند؛ volume یا چند replica مشکل تقسیم وضعیت SQLite را حل نمی‌کند. برای Kubernetes rollout تا پایان PostgreSQL data import/cutover، استفاده از digest امضاشده و رفع blockerهای platform صبر کنید. جزئیات: [`SUPPLY_CHAIN.md`](./SUPPLY_CHAIN.md) و [`ops/kubernetes/README.md`](../ops/kubernetes/README.md).

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
- [ ] `npm run lint`، `npm test` و `npm run build` سبز هستند
- [ ] blockerهای `npm run --silent ops:preflight` رفع شده یا با evidence/approver ثبت شده‌اند (خروجی محلی به‌تنهایی sign-off نیست)

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
