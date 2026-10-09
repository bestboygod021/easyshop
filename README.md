<div align="center">

# 🛍️ EasyShop — فروشگاه هوشمند چندسکویی

**یک فروشگاه اینترنتی کامل با بک‌اند اختصاصی، پنل مدیریت، پنل کاربری، پشتیبانی زنده و موتور هوش مصنوعی چندمدلی**

[![Platforms](https://img.shields.io/badge/platforms-Web%20%7C%20iOS%20%7C%20Android%20%7C%20Windows-6366f1)](#-پلتفرمها)
[![Node](https://img.shields.io/badge/node-%3E%3D22.13-22c55e)](#-پیشنیازها)
[![Tests](https://img.shields.io/badge/tests-321%20passed-22c55e)](#-تستها)

</div>

---

## فهرست

- [نمای کلی](#-نمای-کلی)
- [قابلیت‌ها](#-قابلیتها)
- [پشته فناوری](#-پشته-فناوری)
- [شروع سریع](#-شروع-سریع)
- [حساب‌های دمو](#-حسابهای-دمو)
- [ساختار پروژه](#-ساختار-پروژه)
- [پلتفرم‌ها](#-پلتفرمها)
- [هوش مصنوعی](#-هوش-مصنوعی)
- [API](#-api)
- [تست‌ها](#-تستها)
- [امنیت](#-امنیت)
- [تنظیمات محیطی](#-تنظیمات-محیطی)
- [استقرار](#-استقرار)

---

## 🎯 نمای کلی

EasyShop یک فروشگاه آنلاین حرفه‌ای و **کاملاً فارسی (RTL)** است که از چهار پلتفرم پشتیبانی می‌کند:

| پلتفرم | فناوری | خروجی |
| --- | --- | --- |
| 🌐 وب | React 18 + Vite + Tailwind (PWA) | نصب‌شدنی در مرورگر |
| 🍎 iOS | Capacitor 6 | Xcode / App Store |
| 🤖 Android | Capacitor 6 | APK / Google Play |
| 🪟 Windows | Electron 33 | نصب‌کننده NSIS / Portable |

همه‌ی پلتفرم‌ها روی **یک بک‌اند واحد** (Express + SQLite + WebSocket) کار می‌کنند؛ بنابراین سفارش‌ها، چت‌ها و موجودی انبار در همه‌ی دستگاه‌ها هم‌زمان دیده می‌شوند.

---

## ✨ قابلیت‌ها

### 🛒 فروشگاه و خرید
- صفحه اصلی با بنر، پیشنهاد ویژه، پرفروش‌ها و دسته‌بندی‌ها
- فهرست محصولات با فیلتر (قیمت، برند، دسته، موجودی، امتیاز)، مرتب‌سازی، جستجوی زنده و نمای شبکه‌ای/فهرستی
- صفحه محصول: گالری تصاویر، واریانت‌ها، مشخصات فنی، نظرات و پرسش‌های متداول
- سبد خرید مهمان (بدون ثبت‌نام) + **ادغام خودکار با سبد کاربر پس از ورود**
- کد تخفیف، مالیات، هزینه ارسال هوشمند (رایگان بالای ۵ میلیون تومان)
- پرداخت درگاه (شبیه‌سازی‌شده)، کیف پول، پرداخت در محل، امتیاز وفاداری و کش‌بک
- پیگیری سفارش، لغو، درخواست مرجوعی و خرید مجدد
- باشگاه مشتریان: کیف پول، امتیاز، علاقه‌مندی‌ها

### 👤 پنل کاربری
داشبورد، سفارش‌ها، جزئیات سفارش، علاقه‌مندی‌ها، کیف پول، آدرس‌ها، تیکت‌های پشتیبانی، اعلان‌ها و پروفایل — همه با آمار زنده.

### 🛠️ پنل مدیریت
- داشبورد KPI با نمودار فروش (۷/۳۰/۹۰ روز)
- مدیریت سفارش‌ها (وضعیت، کد رهگیری، شرکت حمل، یادداشت، چاپ فاکتور)
- مدیریت محصولات (ایجاد/ویرایش/آرشیو، واریانت، تصاویر، سئو) + **استودیوی هوش مصنوعی**
- دسته‌بندی‌ها، انبار (گردش موجودی و ارزش انبار)، کدهای تخفیف
- مشتریان و کارمندان (نقش‌ها، مسدودسازی، ویرایش کیف پول/امتیاز)
- نظرات (تأیید/رد/پاسخ)، تیکت‌ها، **صندوق گفتگوی زنده**
- گزارش‌ها، لاگ سیستم، تنظیمات فروشگاه و اعلان همگانی

### 🤖 هوش مصنوعی (۵ مدل برتر + بیشتر)
| مدل | کاربرد |
| --- | --- |
| **OpenAI GPT** (GPT-4o / 4.1 / o4-mini) | تولید متن، تصویر و تحلیل |
| **Anthropic Claude** (Sonnet 4.5 / Opus 4.1) | نگارش توصیفی باکیفیت |
| **Google Gemini** (2.5 Pro/Flash) | سرعت و تحلیل تصویر |
| **xAI Grok** (Grok 4 / 3) | خلاقیت و متن‌های تبلیغاتی |
| **DeepSeek** (V3) | ارزان‌ترین گزینه برای تولید انبوه |

به‌علاوه: Mistral، OpenRouter، Ollama (مدل محلی) و **موتور داخلی «EasyShop Composer»** که بدون هیچ کلید API کار می‌کند.

قابلیت‌های AI: تولید محصول کامل (نام، توضیح، مشخصات، قیمت، برچسب، سئو، تبلیغات)، تولید تصویر، بسته سئو، کمپین بازاریابی، پیشنهاد دسته‌بندی، تحلیل قیمت‌گذاری، تحلیل نظرات، پیشنهاد پاسخ پشتیبانی و دستیار خرید مشتری.

### 💬 ارتباط مشتری و مدیر
- **تیکت‌ها**: اولویت، دسته، تخصیص به کارشناس، یادداشت داخلی، امتیاز رضایت، کد پیگیری `TK-#####`
- **گفتگوی زنده (WebSocket)**: پیام لحظه‌ای، وضعیت تایپ، خوانده‌شدن، اعلان فوری برای کارشناسان
- **دستیار هوشمند**: پاسخ خودکار AI در ویجت چت با پیشنهاد محصول
- اعلان‌های درون‌برنامه‌ای + اعلان همگانی مدیریت

---

## 🧱 پشته فناوری

**بک‌اند:** Node.js ≥ 22.13 (ماژول داخلی `node:sqlite` بدون فلگ آزمایشی) · Express 4 · JWT (bcrypt + refresh token) · WebSocket (`ws`) · Multer · Helmet · SQLite (بدون نصب سرور دیتابیس)

**فرانت‌اند:** React 18 · Vite 5 · React Router 6 · Zustand · Tailwind CSS 3 · Recharts · Lucide · PWA (Service Worker + Manifest)

**بومی:** Capacitor 6 (iOS/Android) · Electron 33 (Windows/macOS/Linux)

---

## 🚀 شروع سریع

```bash
# ۱) نصب وابستگی‌ها (npm workspaces)
npm install

# ۲) اجرای هم‌زمان بک‌اند و فرانت‌اند توسعه
npm run dev
#    API  → http://localhost:4000/api
#    WS   → ws://localhost:4000/ws
#    وب   → http://localhost:5173

# ۳) ساخت نسخه تولیدی و اجرای یکپارچه (همه‌چیز روی پورت ۴۰۰۰)
npm run build
npm start
```

پس از `npm run build`، سرور همان SPA را سرو می‌کند: **http://localhost:4000**

دستورهای دیگر:

```bash
npm test                 # اجرای کامل تست‌های بک‌اند
npm run seed             # بازنشانی و ساخت داده‌های دمو
npm run preview          # build + اجرای سرور
npm run lint             # ESLint با quality gate در CI
npm run --silent ops:preflight # کنترل آمادگی محلی؛ بدون اتصال بیرونی
npm run load:test        # آزمون بار محلی با SQLite موقت
npm run db:backup        # snapshot SQLite (در production رمزگذاری‌شده)
npm run db:retention:preview # پیش‌نمایش حذف داده‌های منقضی
```

Runbookهای production: [آمادگی و تمرین staging](docs/PRODUCTION_READINESS_REHEARSAL.md)، [بازیابی/پشتیبان](docs/BACKUP_AND_RECOVERY.md)، [مهاجرت PostgreSQL](docs/DATABASE_MIGRATION_AND_RECOVERY.md)، [چرخش کلید AI](docs/AI_KEY_ROTATION.md)، [چرخهٔ عمر secretها](docs/SECRET_LIFECYCLE.md)، [پرداخت](docs/PAYMENT_SECURITY_REVIEW.md)، [retention/audit](docs/RETENTION_AND_AUDIT.md)، و [load/SLO](docs/LOAD_TESTING_AND_AUTOSCALING.md). آزمون محلی یا preflight به‌تنهایی تأیید سرویس بیرونی/production نیست.

---

## 🔑 حساب‌های دمو

| نقش | ایمیل | رمز عبور |
| --- | --- | --- |
| 👑 مدیر کل | `admin@easyshop.ir` | `ShopMaster#2026` |
| 🎧 کارشناس پشتیبانی | `support@easyshop.ir` | `HelpDesk#2026` |
| 🏪 فروشنده | `seller@easyshop.ir` | `Trader#2026` |
| 👤 مشتری | `user@easyshop.ir` | `Shopper#2026` |
| 👤 مشتری دوم | `reza@easyshop.ir` / `mina@easyshop.ir` | `Shopper#2026` |

> صفحه ورود، دکمه‌ی «تکمیل سریع» برای هر حساب دارد تا آزمایش همه‌ی بخش‌ها آسان باشد.

کدهای تخفیف آماده: `WELCOME10` (۱۰٪)، `EASY200` (۲۰۰ هزار تومان)، `FREESHIP` (ارسال رایگان)، `VIP25` (۲۵٪ تا سقف ۲ میلیون)

---

## 📁 ساختار پروژه

```
easyshop/
├── server/                     # بک‌اند Express + SQLite + WebSocket
│   ├── src/
│   │   ├── index.js            # راه‌انداز، میدل‌ورها، سرو استاتیک SPA
│   │   ├── config.js           # پیکربندی (پورت، JWT، مسیر داده، کلیدهای AI)
│   │   ├── db/                 # schema.js، index.js (wrapper)، seed.js
│   │   ├── middleware/auth.js  # JWT، نقش‌ها، لاگ حسابرسی
│   │   ├── services/ai/        # providers، gateway، builtin، commerce
│   │   ├── realtime/hub.js     # هاب WebSocket (چت، اعلان، رخداد سفارش)
│   │   ├── routes/             # auth، products، categories، cart، orders،
│   │   │                       # account، admin، tickets، chat، ai، misc
│   │   └── utils/helpers.js    # پاسخ‌ها، صفحه‌بندی، محاسبات سبد/سفارش
│   ├── test/api.test.js        # ۵۰ تست یکپارچه (node:test)
│   ├── test/security.test.js   # ۹۹ تست امنیتی (احراز هویت، IDOR، تزریق، WS…)
│   └── data/                   # easyshop.db + uploads (خارج از گیت)
├── web/                        # اپ وب/موبایل‌وب (React + Vite + Tailwind)
│   └── src/
│       ├── lib/                # api.js، realtime.js، format.js، i18n.js
│       ├── store/              # zustand: auth، cart، wishlist، notifications، UI
│       ├── components/         # Layout، ProductCard، ChatWidget، AiProductStudio…
│       └── pages/              # فروشگاه + account/* + admin/*
├── mobile/                     # Capacitor (iOS/Android)
│   ├── capacitor.config.json
│   └── resources/              # آیکون و اسپلش
├── desktop/                    # Electron (Windows/macOS/Linux)
│   ├── main.cjs                # اجرای سرور داخلی + پنجره اپ + منو + tray
│   └── preload.cjs
├── tools/render_icons.py       # تولید آیکون‌ها بدون وابستگی بیرونی
├── tools/pentest.mjs           # تست نفوذ زنده (۹۱ سناریو + گزارش فارسی)
└── docs/                       # مستندات API، معماری، استقرار و امنیت (SECURITY.md)
```

---

## 📱 پلتفرم‌ها

### 🌐 وب (PWA)
```bash
npm run build && npm start     # http://localhost:4000
```
در مرورگر موبایل می‌توانید «افزودن به صفحه اصلی» را بزنید؛ Service Worker کش آفلاین دارد.

### 🤖 Android
```bash
npm run build
npm run mobile:install
npm run mobile:add:android
npm run mobile:sync
cd mobile && npx cap open android     # سپس Run در Android Studio
```
پیش‌نیاز: Android Studio + JDK 17.

### 🍎 iOS
```bash
npm run build && npm run mobile:install
npm run mobile:add:ios
npm run mobile:sync
cd mobile && npx cap open ios         # سپس Run در Xcode
```
پیش‌نیاز: macOS + Xcode 15+.

> در حالت بومی، آدرس سرور را می‌توانید بدون build دوباره تغییر دهید:
> ```js
> window.EASYSHOP_API_URL = 'https://api.example.com';           // در زمان اجرا
> localStorage.setItem('easyshop.apiBase', 'https://api.example.com'); // ماندگار
> ```
> یا هنگام build: `VITE_API_URL=https://api.example.com npm run build`

### 🪟 ویندوز
```bash
npm run desktop:install
npm run desktop:build      # خروجی در desktop/release/ (نصب‌کننده NSIS + Portable)
```
برنامه‌ی دسکتاپ سرور داخلی را خودش اجرا می‌کند (بدون نیاز به نصب Node روی سیستم کاربر).
برای توسعه: `npm run dev` را در یک ترمینال و `npm run desktop:dev` را در ترمینال دیگر اجرا کنید.

---

## 🤖 هوش مصنوعی

کلیدها را می‌توانید از دو راه تنظیم کنید:

**۱) پنل مدیریت → «مدل‌ها و کلیدهای API»** → انتخاب ارائه‌دهنده، درج کلید، تست اتصال، تعیین مدل پیش‌فرض و اولویت. برای ذخیره‌ی امن کلید پنل، `AI_KEY_ENCRYPTION_KEY` با حداقل ۳۲ بایت را از Secret Manager یا محیط اجرا تنظیم کنید؛ این کلید را همراه پایگاه داده پشتیبان‌گیری کنید و بدون مهاجرت کلیدهای ذخیره‌شده عوض نکنید.

**۲) متغیرهای محیطی** در `server/.env`:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
XAI_API_KEY=...
DEEPSEEK_API_KEY=...
MISTRAL_API_KEY=...
OPENROUTER_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
```

رفتار موتور: درخواست به مدل انتخابی → در صورت خطا (نبود کلید، انقضای سهمیه، قطعی شبکه) به‌صورت خودکار به مدل بعدی و در نهایت به **موتور داخلی** سقوط می‌کند؛ بنابراین فروشگاه هرگز متوقف نمی‌شود. مصرف توکن و هزینه در «لاگ فراخوانی‌ها» ثبت می‌شود.

> checkout اکنون callback امن، idempotency و verify سمت سرور دارد و برای Zarinpal، Zibal، MrPardakht و Mellat adapter ارائه می‌کند؛ پیش از پذیرش وجه واقعی باید credentials/allowlist/`PUBLIC_URL` و قرارداد callback در sandbox پذیرنده تأیید شوند. Mock فقط development/test است؛ SnappPay و `wallet/topup` فعلاً پرداخت واقعی نیستند. راهنمای مشاهده‌پذیری، backup/PITR و زنجیرهٔ تأمین در `docs/OBSERVABILITY.md`, `docs/DATABASE_MIGRATION_AND_RECOVERY.md` و `docs/SUPPLY_CHAIN.md` است.

---

## 🔌 API

مستندات کامل: [`docs/API.md`](docs/API.md) — آدرس زنده هم `GET /api/docs` است.

| گروه | مسیر پایه | نمونه |
| --- | --- | --- |
| احراز هویت | `/api/auth` | `POST /login`, `POST /register`, `GET /me` |
| محصولات | `/api/products` | `GET /?sort=cheapest&page=1`, `POST /:id/reviews` |
| دسته‌بندی | `/api/categories` | `GET /`, `GET /?flat=1` |
| سبد خرید | `/api/cart` | `POST /items`, `POST /coupon`, `POST /merge` |
| سفارش | `/api/orders` | `POST /checkout`, `POST /:id/pay` (با `authority`/`intent_token`), `POST /:id/cancel` |
| پنل کاربری | `/api/account` | `/dashboard`, `/wallet/topup`, `/addresses`, `/notifications` |
| پشتیبانی | `/api/tickets`, `/api/chat` | `POST /tickets`, `GET /chat/conversations` |
| هوش مصنوعی | `/api/ai` | `/generate/product`, `/generate/image`, `/assistant`, `/pricing/:id` |
| مدیریت | `/api/admin` | `/dashboard`, `/orders`, `/users`, `/coupons`, `/inventory`, `/reports`, `/export/orders.csv` |
| زمان‌واقعی | `ws://host/ws?token=JWT` | `chat:send`, `join_conversation`, `notification` |

---

## ✅ تست‌ها

```bash
npm test              # ۳۲۱ تست بک‌اند: API، امنیت و suiteهای تخصصی
npm run lint          # ESLint با quality gate
npm run test:ops-preflight # تست‌های preflight بدون اتصال خارجی
npm run test:security # فقط تست‌های امنیتی
npm run pentest       # تست نفوذ زنده روی سرور در حال اجرا (۹۱ سناریو)
npm run security      # هر دو مورد بالا
```

> اجرای پیاپی تست نفوذ: پیش از هر اجرا سهمیه‌ی محدودیت نرخ و قفل ورود را می‌توان بدون ری‌استارت پاک کرد:
> `kill -USR2 $(pgrep -f 'node src/index.js')`

* **۵۰ تست یکپارچهٔ API** در ۱۰ گروه: سلامت سرویس، احراز هویت، محصولات و دسته‌بندی، سبد و سفارش، رزرو موجودی، تخفیف و کیف پول، تیکت و چت، هوش مصنوعی چندمدلی، پنل مدیریت و استاتیک/SPA.
* **۹۹ تست امنیتی** در ۱۱ گروه: احراز هویت/نشست، IDOR و کنترل دسترسی، سیاست رمز و brute-force، محدودیت نرخ، تزریق/XSS/Prototype Pollution، آپلود فایل، هدرها و CSRF، منطق کسب‌وکار، WebSocket، توابع هسته و اعتبارسنجی نوشتن کاتالوگ/سفارش مجدد.
* **۱۷۲ تست تکمیلی** برای رگرسیون‌ها و سرویس‌های تخصصی، از جمله backup/recovery، retention، audit، observability، پرداخت، privacy و تنظیمات production (در مجموع ۳۲۱ تست).
* **۹۱ سناریوی تست نفوذ زنده** (`tools/pentest.mjs`) با گزارش فارسی و خروجی JSON.

تست‌ها در یک پوشه‌ی موقت اجرا می‌شوند و **دیتابیس فروشگاه را دست نمی‌زنند**.

---

## 🔐 امنیت

لایه‌ی امنیتی روی همه‌ی بخش‌های سیستم پیاده شده است (سرور، وب، زمان‌واقعی و منطق کسب‌وکار):

* **احراز هویت**: JWT با نسخه‌ی نشست، توکن تازه‌سازی هش‌شده با تشخیص بازاستفاده‌ی خانواده، قفل حساب پس از ۵ تلاش ناموفق، سیاست رمز عبور (حداقل ۸ کاراکتر + حرف و رقم + رد رمزهای رایج)، توکن بازیابی یک‌بارمصرف.
* **کنترل دسترسی**: بررسی مالکیت در همه‌ی منابع (سفارش، آدرس، تیکت، گفتگو، علاقه‌مندی)، فهرست سفید فیلدها در به‌روزرسانی پروفایل، نقش‌های `customer/seller/support/admin`.
* **ضد تزریق**: کوئری‌های پارامتری، پاک‌سازی تمام بدنه‌ها و فیلدهای متنی، محدودسازی عمق/طول/تعداد کلیدها، سقف بدنه ۲ مگابایت.
* **محدودیت نرخ**: ۹ سطل اختصاصی (ورود، ثبت‌نام، بازیابی رمز، AI، آپلود، نوشتن، جستجو، پیگیری سفارش و چت) + سقف سراسری، به‌همراه محدودیت اختصاصی روی ۲۲ مسیر نوشتنی (آدرس، ادمین، AI، تیکت، چت، مرجوعی و…).
* **اعتبارسنجی دامنه‌ای**: قیمت/موجودی/وضعیت محصول، کد رنگ و درخت بدون حلقه‌ی دسته‌بندی، سقف ۲۰ قلم سبد در سفارش مجدد، و اصلاح موجودی تنها با عدد صحیح کراندار.
* **آپلود امن**: تشخیص نوع واقعی فایل، رد SVG/HTML/PHP، نام فایل تصادفی، سرو با `nosniff` و `CSP: sandbox`.
* **پرداخت**: توکن امضاشده‌ی «قصد پرداخت» + تطبیق `authority`، رزرو اتمی موجودی و آزادسازی در پرداخت ناموفق.
* **زمان‌واقعی**: بررسی Origin (ضد CSWSH)، سقف اندازه و نرخ پیام، مجوزدهی هر عملیات و توکن اختصاصی گفتگوی مهمان.
* **هدرها**: CSP سخت‌گیرانه، بدون `x-powered-by`، `Referrer-Policy`، `Permissions-Policy`، CORS با فهرست مجاز و `no-store` روی داده‌ی خصوصی.

مستندات کامل، فهرست آسیب‌پذیری‌های رفع‌شده و نتایج تست نفوذ: [`docs/SECURITY.md`](docs/SECURITY.md)

---

---

## ⚙️ تنظیمات محیطی

فایل `server/.env` (اختیاری — همه‌ی گزینه‌ها پیش‌فرض دارند):

```env
PORT=4000
HOST=0.0.0.0
JWT_SECRET=یک-کلید-تصادفی-قوی
JWT_EXPIRES_IN=2h
DATA_DIR=./data
UPLOAD_DIR=./data/uploads
TRUSTED_ORIGINS=
CORS_ORIGINS=
TRUST_PROXY=0
SEED_DEMO_DATA=1
LOG_LEVEL=info
AI_TIMEOUT_MS=60000
# سیاست امنیتی (پیش‌فرض‌ها امن هستند)
PASSWORD_MIN_LENGTH=8
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15
BODY_LIMIT=2mb
ENFORCE_ORIGIN=1
EXPOSE_RESET_TOKEN=0
```

فهرست کامل گزینه‌ها در [`server/.env.example`](server/.env.example) آمده است.

---

## 🚢 استقرار

راهنمای گام‌به‌گام (VPS، Docker، Nginx، HTTPS، بیلد بومی و انتشار در استورها): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

خلاصه‌ی سریع:

```bash
# روی سرور
git clone <repo> && cd easyshop
npm ci
npm run build
PORT=4000 JWT_SECRET=... npm start
```

پشت Nginx هم مسیر `/` و هم مسیر ارتقای `/ws` را به پورت ۴۰۰۰ پروکسی کنید.

---

<div align="center">

ساخته‌شده با ❤️ برای فروشگاه‌های ایرانی — **EasyShop**

</div>
