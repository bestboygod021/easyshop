# راهنمای جامع EasyShop

> **آخرین بازبینی کد:** ۱۴۰۵/۰۷/۱۷ (۹ اکتبر ۲۰۲۶)
> این راهنما ساختار و قابلیت‌های موجود در مخزن را شرح می‌دهد. وجود یک سرویس یا مسیر API لزوماً به معنی اتصال آن به رابط کاربری، اتصال به ارائه‌دهنده‌ی واقعی یا آماده‌بودن آن برای عملیات تولیدی نیست؛ هرجا قابلیت شبیه‌سازی یا محدودیت شناخته‌شده‌ای وجود دارد، جداگانه مشخص شده است.

## ۱. معرفی

EasyShop یک فروشگاه اینترنتی فارسی و راست‌به‌چپ است که از یک بک‌اند مشترک برای چند پوسته‌ی کلاینت استفاده می‌کند:

| کلاینت | فناوری | نقش |
| --- | --- | --- |
| وب | React 18، Vite 5، Tailwind CSS، PWA | فروشگاه عمومی، حساب مشتری و پنل مدیریت |
| iOS و Android | Capacitor 6 | پوسته‌ی بومی برای اجرای وب‌اپ روی موبایل |
| دسکتاپ | Electron 33 | پنجره‌ی فروشگاه و تلاش برای اجرای سرور محلی در کنار آن |
| API و سرویس بلادرنگ | Express 4، REST، WebSocket (`ws`) | منطق کسب‌وکار مشترک میان کلاینت‌ها |
| پایگاه داده | SQLite از طریق `node:sqlite` | کاربران، کاتالوگ، سبد، سفارش، پرداخت، پشتیبانی و داده‌ی افزونه‌ها |

رابط اصلی به زبان فارسی طراحی شده است. فونت، چیدمان RTL، پوسته‌ی تیره، دارایی‌های PWA و آیکون‌های برنامه در `web/` و فایل‌های پیکربندی بومی در `mobile/` و `desktop/` قرار دارند.

## ۲. نمای معماری

```text
┌──────────────────────────────────────────────────────────────┐
│ Web/PWA        iOS/Android (Capacitor)       Desktop (Electron)│
└───────────────────────────────┬──────────────────────────────┘
                                │ REST/JSON + WebSocket
┌───────────────────────────────▼──────────────────────────────┐
│ Express: middleware → routes → services → SQLite             │
│                    realtime hub (ws)     AI gateway           │
└───────────────────────────────┬──────────────────────────────┘
                                │
                    SQLite database + uploads
```

### جریان راه‌اندازی سرور

1. `server/src/config.js` تنظیمات محیطی را از `server/.env` و متغیرهای محیط می‌خواند.
2. `server/src/db/index.js` دیتابیس SQLite را باز می‌کند و schema را اجرا می‌کند؛ migrationهای تازه با ledger نسخه‌دار/checksum در `server/src/db/migrations.js` اعمال می‌شوند و سازگاری قدیمی هنوز initializer افزایشی دارد.
3. `server/src/index.js` هدرهای امنیتی، CORS، کنترل مبدأ، پاک‌سازی ورودی، محدودیت نرخ و مسیرها را نصب می‌کند.
4. `bootstrap()` ارائه‌دهنده‌های AI را ثبت می‌کند و در صورت فعال‌بودن `SEED_DEMO_DATA` و خالی‌بودن کاتالوگ، داده‌ی دمو می‌سازد.
5. سرور HTTP روی پورت پیش‌فرض ۴۰۰۰ بالا می‌آید؛ WebSocket روی همان سرور و مسیر `/ws` نصب می‌شود.
6. پس از `npm run build`، همان سرور فایل‌های `web/dist` را هم سرو می‌کند. در توسعه، Vite روی پورت ۵۱۷۳ درخواست‌های `/api`، `/uploads` و `/ws` را به API پروکسی می‌کند.

### لایه‌های بک‌اند

| لایه | فایل/مسیر | مسئولیت |
| --- | --- | --- |
| Bootstrap و HTTP | `server/src/index.js` | میدل‌ورها، mount کردن routeها، SPA، خطاها و شروع HTTP/WebSocket |
| پیکربندی | `server/src/config.js` | پورت، میزبان، JWT، مسیر داده، CORS، محدودیت‌ها و تنظیمات AI |
| داده | `server/src/db/schema.js`, `server/src/db/index.js` | ۹۴ تعریف جدول، prepared statementها، تراکنش، seed و مهاجرت |
| احراز هویت | `server/src/middleware/auth.js` | رمز عبور، JWT، refresh، role، مالکیت و audit |
| امنیت ورودی | `server/src/middleware/security.js` | rate limit، Origin/CSRF، پاک‌سازی، اعتبارسنجی رمز، sniff فایل و CSV امن |
| منطق کمکی | `server/src/utils/helpers.js` | پاسخ استاندارد، صفحه‌بندی، شکل عمومی محصول/سفارش، محاسبات سبد |
| قابلیت‌های دامنه‌ای | `server/src/services/` | ۱۴۸ فایل سرویس، از پیشنهاد کالا تا امور مالی/انبار |
| هوش مصنوعی | `server/src/services/ai/` و `routes/ai.js` | کاتالوگ مدل، gateway/fallback، تولید تجاری و موتور داخلی |
| بلادرنگ | `server/src/realtime/hub.js` | چت، اتاق‌ها، اعلان، typing/read، اتصال مجدد و مجوز عملیات |
| HTTP API | `server/src/routes/` | ۱۱ فایل route؛ routeهای عمومی و مدیریت |

> از ۱۵۲ handler موجود در `misc.js` برای قابلیت‌های گسترده‌ی افزوده استفاده شده است. ۱۰ router اختصاصی ۱۰۶ handler دیگر دارند؛ در مجموع ۲۵۸ ثبت route در فایل‌های router وجود دارد. مسیر `GET /api` برای معرفی سرویس و static uploads روی `/uploads` جداگانه نصب شده‌اند. مسیرهای اصلی حساب، سفارش، محصول و مدیریت در routerهای اختصاصی‌اند. هنگام بررسی مجوزها باید mount شدن routerها و middlewareهای route را هم در نظر گرفت؛ صرف نام مسیر معیار احراز هویت نیست.

## ۳. ساختار مخزن

```text
easyshop/
├── package.json                 # workspaces: server و web؛ فرمان‌های ریشه
├── package-lock.json
├── README.md                    # معرفی و شروع سریع
├── docs/
│   ├── API.md                   # مستند API اصلی
│   ├── ARCHITECTURE.md          # معماری
│   ├── DEPLOYMENT.md            # استقرار وب، Docker و کلاینت‌های بومی
│   ├── SECURITY.md              # مدل امنیتی و گزارش تست‌ها
│   └── PROJECT_OVERVIEW_FA.md   # همین راهنمای جامع
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── data/                    # دیتابیس و uploads؛ خارج از گیت
│   ├── src/
│   │   ├── index.js
│   │   ├── config.js
│   │   ├── db/{index.js,schema.js,seed.js}
│   │   ├── middleware/{auth.js,security.js}
│   │   ├── realtime/hub.js
│   │   ├── routes/              # ۱۱ router
│   │   ├── services/            # ۱۴۸ سرویس
│   │   └── utils/helpers.js
│   └── test/                    # آزمون API، امنیت و بهبودهای پیاپی
├── web/
│   ├── index.html
│   ├── vite.config.js
│   ├── public/{manifest.webmanifest,sw.js,icons...}
│   └── src/
│       ├── App.jsx, main.jsx, index.css
│       ├── components/          # Layout، ProductCard، CartDrawer، ChatWidget و UI
│       ├── lib/                 # API، realtime، قالب‌بندی و ترجمه
│       ├── store/index.js       # استورهای Zustand
│       └── pages/               # فروشگاه، account و admin
├── mobile/
│   ├── capacitor.config.json
│   └── resources/               # icon و splash؛ پروژه‌ی تولیدشده‌ی Xcode/Android Studio نیست
├── desktop/
│   ├── main.cjs                 # Electron main، اجرای server و پنجره
│   ├── preload.cjs              # پل محدود IPC
│   └── package.json             # پیکربندی Electron Builder
└── tools/
    ├── pentest.mjs              # تست نفوذ زنده‌ی API
    └── render_icons.py          # ابزار آیکون
```

## ۴. قابلیت‌های رابط کاربری

### ۴.۱ فروشگاه و خرید

- صفحه‌ی خانه با بنر، پیشنهادها، محصولات ویژه و دسته‌بندی‌ها.
- جستجوی محصول، پیشنهاد سریع، مرتب‌سازی و فیلتر کاتالوگ.
- صفحه‌ی جزئیات کالا، تصاویر، واریانت‌ها، مشخصات، نظرها و پرسش‌وپاسخ.
- سبد خرید مهمان با `x-session-key`؛ ادغام سبد با حساب پس از ورود.
- کد تخفیف، محاسبه‌ی مالیات/ارسال، کیف پول و امتیاز وفاداری.
- انتخاب روش ارسال و پرداخت، checkout، مشاهده/لغو سفارش، درخواست مرجوعی و سفارش مجدد.
- PWA با manifest و Service Worker؛ کش دارایی‌ها و پاسخ fallback برای حالت آفلاین.

### ۴.۲ حساب مشتری

- داشبورد، سفارش‌ها و جزئیات سفارش.
- علاقه‌مندی‌ها، کیف پول و گردش تراکنش، امتیاز وفاداری.
- آدرس‌ها، پروفایل، اعلان‌ها و بازدیدهای اخیر.
- تیکت پشتیبانی و جزئیات/پاسخ تیکت.

### ۴.۳ پنل مدیریت

- داشبورد KPI و گزارش فروش.
- مدیریت سفارش، وضعیت، کد رهگیری، اطلاعات مشتری و فاکتور.
- ایجاد/ویرایش/آرشیو محصول، موجودی، دسته‌بندی و کوپن.
- مدیریت کاربران و نقش‌ها، مشتریان، نظرات و انبار.
- تیکت‌ها و صندوق گفتگوی زنده.
- تنظیمات فروشگاه، لاگ‌ها، گزارش‌ها و اعلان همگانی.
- استودیوی تولید AI و تنظیم ارائه‌دهنده/مدل.

### ۴.۴ مسیرهای فرانت‌اند

همه‌ی صفحه‌ها در `web/src/App.jsx` ثبت شده‌اند و عمدتاً lazy-load می‌شوند.

| بخش | مسیرها |
| --- | --- |
| فروشگاه | `/`, `/products`, `/products/:slug`, `/categories`, `/categories/:slug`, `/cart`, `/checkout`, `/support`, `/about` |
| احراز هویت | `/login`, `/register`, `/forgot-password`, `/reset-password`; alias قدیمی `/auth/login` |
| حساب | `/account`, `/account/orders`, `/account/orders/:id`, `/account/wishlist`, `/account/wallet`, `/account/profile`, `/account/addresses`, `/account/tickets`, `/account/tickets/:id`, `/account/notifications` |
| مدیریت | `/admin`, `/admin/dashboard`, `/admin/orders`, `/admin/orders/:id`, `/admin/products`, `/admin/products/new`, `/admin/products/:id`, `/admin/categories`, `/admin/inventory`, `/admin/coupons`, `/admin/customers`, `/admin/reviews`, `/admin/tickets`, `/admin/tickets/:id`, `/admin/chat`, `/admin/ai-studio`, `/admin/ai-providers`, `/admin/reports`, `/admin/logs`, `/admin/settings` |
| خطایابی | مسیر ناشناخته به صفحه‌ی NotFound می‌رود |

**محافظت UI:** `AccountLayout` ورود را بررسی می‌کند؛ `AdminLayout` نقش‌های `admin`، `support` و `seller` را برای ورود به پوسته‌ی مدیریت می‌پذیرد. مجوز نهایی هر عملیات باید در سرور کنترل شود.

## ۵. قابلیت‌های بک‌اند برحسب دامنه

### ۵.۱ احراز هویت و نشست

ثبت‌نام/ورود، JWT کوتاه‌عمر، refresh token چرخشی، خروج، پروفایل، تغییر و بازیابی رمز، نشست مهمان، ثبت تلاش ورود و ابطال نشست پس از تغییر رمز. نقش‌های تعریف‌شده در هسته: `customer`، `seller`، `support` و `admin`.

### ۵.۲ کاتالوگ و دسته‌بندی

محصول و تنوع، قیمت/تخفیف/موجودی، مشخصات JSON، جستجو، پیشنهاد سریع، برند، مرتب‌سازی، صفحه‌بندی، نظر و رأی مفید بودن، مدیریت محصول و گردش موجودی. دسته‌ها درختی هستند و مسیرهای مدیریت می‌توانند دسته را بسازند/ویرایش/حذف کنند.

### ۵.۳ سبد و سفارش

سبد مهمان/کاربر، کوپن، merge، محاسبه‌ی subtotal/discount/tax/shipping، checkout، رزرو اتمی موجودی، payment intent، وضعیت پرداخت، رخدادهای سفارش، لغو، درخواست مرجوعی، reorder و پیگیری بر اساس شناسه یا کد. نقش‌ها و مالکیت باید برای هر مسیر سفارش رعایت شوند.

### ۵.۴ پشتیبانی بلادرنگ

- تیکت: ایجاد، دسته/اولویت/وضعیت، تخصیص، پیام، یادداشت داخلی و metadata.
- چت: مکالمه‌ی مشتری/مهمان، guest token، ارسال پیام HTTP یا WebSocket، typing/read، حضور پشتیبان و پیشنهاد پاسخ AI.
- WebSocket روی `/ws` از Origin، توکن/guest token، اندازه‌ی پیام، نوع عملیات و نرخ پیام محافظت می‌کند.

### ۵.۵ AI و تولید محتوا

ارائه‌دهندگان کاتالوگ‌شده شامل OpenAI، Anthropic، Gemini، xAI، DeepSeek، Mistral، OpenRouter، Ollama و موتور داخلی است. مسیرهای AI تولید محصول، تصویر، دسته‌بندی، SEO، بازاریابی، پیشنهاد قیمت، تحلیل نظر، پاسخ پشتیبانی و دستیار مشتری را فراهم می‌کنند. تولیدها می‌توانند پیش‌نویس شوند و لاگ توکن/هزینه ثبت شود.

### ۵.۶ افزونه‌های مالی، فروش و عملیات

در routeهای افزوده و سرویس‌ها، نمونه‌هایی از این قابلیت‌ها وجود دارد: فاکتور/پیش‌فاکتور، مالیات مودیان، تبدیل ارز، BNPL، پرداخت ترکیبی، انتقال بانکی، تسویه‌ی فروشنده، بررسی کارمزد، کمپین فروش فوری، وفاداری/گیمیفیکیشن، بازاریابی معرف، موجودی چندانباره، SLA ارسال/تأمین‌کننده، ظرفیت بازه‌ی ارسال و مدیریت مرجوعی.

### ۵.۷ مرزبندی وضعیت قابلیت‌ها

| وضعیت | معنی در این مخزن | نمونه‌ها |
| --- | --- | --- |
| هسته‌ی پیاده‌سازی‌شده | مسیرهای اصلی محصول، UI و API به هم متصل‌اند؛ با این حال باگ‌های شناخته‌شده‌ی بخش ۱۴ پابرجاست. | کاتالوگ، حساب، سبد، سفارش، پنل مدیریت، تیکت و چت |
| نیازمند پیکربندی/تأیید عملیاتی | adapter یا کد اتصال وجود دارد، ولی کارکرد production به کلید، حساب پذیرنده، callback صحیح و تست محیط مقصد وابسته است. | providerهای پیاده‌سازی‌شدهٔ checkout: Zarinpal، Zibal، MrPardakht و Mellat؛ providerهای خارجی AI |
| غیرفعال تا تکمیل adapter | گزینه عمداً در فهرست درگاه‌های قابل انتخاب/فعال‌سازی منتشر نمی‌شود. | SnappPay؛ wallet/topup نیز تا اتصال verify واقعی شارژ بانکی نیست |
| دمو/شبیه‌سازی | برای نمایش یا توسعه است و به‌تنهایی تراکنش/خدمت بیرونی واقعی محسوب نمی‌شود. | درگاه `mock`، شارژ کیف پول دمو، BNPL simulator/scoring، تأیید TRC20 بدون اتصال زنجیره، شارژ سیم‌کارت و voice survey simulator؛ موتور AI داخلی نیز خروجی محلی تولید می‌کند |
| آزمایشی/مجزا | کد سرویس یا route موجود است، اما وجودش به‌تنهایی اتصال کامل در UI، job زمان‌بندی‌شده، provider واقعی یا پوشش آزمون را تضمین نمی‌کند. | بخشی از افزونه‌های `misc.js` و کاتالوگ سرویس‌های ۱۴۸تایی؛ هر مورد باید جداگانه از روی caller، تنظیمات و تست ارزیابی شود |

## ۶. API: مسیرهای routerهای اصلی

پیشوند عمومی همه‌ی این مسیرها `/api` است. مسیرهای زیر نسبت به پیشوند router نوشته شده‌اند؛ مثلاً `POST /login` در گروه auth برابر `/api/auth/login` است.

### Auth — `/api/auth` (۱۰ handler)

`POST /register`, `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`, `PATCH /me`, `POST /change-password`, `POST /forgot-password`, `POST /reset-password`, `POST /guest`.

### Products — `/api/products` (۱۱ handler)

`GET /`, `GET /suggest`, `GET /brands`, `GET /:idOrSlug`, `POST /:id/reviews`, `POST /reviews/:reviewId/helpful`, `GET /admin/all`, `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/stock`.

### Categories — `/api/categories` (۵ handler)

`GET /`, `GET /:slug`, `POST /`, `PUT /:id`, `DELETE /:id`.

### Cart — `/api/cart` (۷ handler)

`GET /`, `POST /items`, `PATCH /items/:id`, `DELETE /items/:id`, `DELETE /`, `POST /coupon`, `POST /merge`.

### Orders — `/api/orders` (۷ handler)

`POST /checkout`, `POST /:id/pay`, `GET /`, `GET /:id`, `POST /:id/cancel`, `POST /:id/return`, `POST /:id/reorder`.

### Account — `/api/account` (۱۴ handler)

`GET /addresses`, `POST /addresses`, `PUT /addresses/:id`, `DELETE /addresses/:id`, `GET /wallet`, `POST /wallet/topup`, `POST /loyalty/convert`, `GET /wishlist`, `POST /wishlist/:productId`, `GET /notifications`, `POST /notifications/read`, `GET /dashboard`, `GET /recently-viewed`, `GET /summary`.

### Admin — `/api/admin` (۲۰ handler)

`GET /dashboard`, `GET /users`, `GET /users/:id`, `POST /users`, `PATCH /users/:id`, `DELETE /users/:id`, `GET /orders`, `PATCH /orders/:id`, `GET /coupons`, `POST /coupons`, `PATCH /coupons/:id`, `GET /inventory`, `GET /reviews`, `PATCH /reviews/:id`, `GET /settings`, `PUT /settings`, `GET /export/orders.csv`, `GET /reports`, `GET /audit-logs`, `POST /broadcast`.

### Tickets — `/api/tickets` (۶ handler)

`GET /meta`, `GET /`, `POST /`, `GET /:id`, `POST /:id/messages`, `PATCH /:id`.

### Chat — `/api/chat` (۷ handler)

`GET /conversations`, `POST /conversations`, `GET /conversations/:id`, `POST /conversations/:id/messages`, `PATCH /conversations/:id`, `POST /ai-suggest`, `GET /agents`.

### AI — `/api/ai` (۱۹ handler)

`GET /models`, `GET /providers`, `PUT /providers/:slug`, `POST /providers/:slug/test`, `PUT /settings`, `POST /generate/product`, `POST /generate/image`, `POST /generate/categories`, `POST /generate/seo`, `POST /marketing`, `POST /pricing/:productId`, `POST /analyze-reviews/:productId`, `POST /support-reply`, `POST /assistant`, `GET /generations`, `POST /generations/:id/publish`, `DELETE /generations/:id`, `GET /logs`, `GET /health`.

## ۷. API افزوده در `misc.js`

این handlerها روی ریشه‌ی `/api` نصب شده‌اند. فهرست زیر از ثبت routeها استخراج شده است؛ مجوز، نیاز به ورود و دامنه‌ی داده را برای هر مسیر جداگانه از روی handler بررسی کنید.

### خانه، سلامت، جستجو و فایل

- `GET /settings`, `GET /health`, `GET /qr/invoice`, `GET /flash-sales/active`, `GET /placeholder`, `GET /theme/holiday`
- `POST /uploads`, `GET /search`, `GET /sitemap.xml`, `GET /home`, `GET /stats`, `GET /docs`
- `POST /telemetry/errors`, `POST /search/log`, `GET /search/trends`, `GET /admin/search/zero-results`

### هویت، آدرس و اعتبارسنجی

- `POST /auth/otp/send`, `POST /auth/otp/verify`, `GET /postal/validate`, `POST /verify/shahkar`, `POST /verify/national-card`
- `POST /address/verify-postal`, `POST /shipping/analyze-address`, `POST /account/addresses/:id/pinpoint`
- `POST /b2b/corporate-profile`, `POST /b2b/tax-breakdown`

### کاتالوگ، پیشنهاد، SEO و محتوا

- `GET /products/:id/recommendations`, `GET /products/:id/spec-sheet`, `POST /products/:id/photo-review`
- `GET /products/:id/qna`, `POST /products/:id/qna`, `GET /products/:id/ai-tags`
- `POST /products/compare`, `POST /products/compare-matrix`, `GET /products/:id/volume-pricing`
- `GET /products/:id/lifecycle-accessories`, `GET /products/:id/bnpl-schedule`, `GET /products/:id/opengraph`, `GET /products/:id/warehouse-stocks`
- `POST /products/:id/price-alert`, `POST /admin/products/:id/notify-price-drop`, `POST /admin/products/authenticity/generate`, `POST /products/authenticity/verify`
- `GET /b2b/price-list`, `GET /inventory/open-box/available`, `POST /admin/inventory/open-box/grade`

### سبد، تخفیف و وفاداری

- `POST /checkout/split-calculation`, `GET /cart/tiered-discount`, `POST /cart/sanitize`, `GET /cart/gift-wrap/options`
- `POST /cart/reserve`, `GET /cart/:id/reservation-status`, `GET /cart/suggested-bundles`, `POST /cart/exit-survey`
- `POST /feedback/nps`, `GET /admin/feedback/nps-summary`, `GET /customer/tier`
- `GET /account/loyalty-quests`, `POST /account/loyalty-quests/:id/complete`, `GET /gamification/wheel/config`, `GET /gamification/wheel/eligibility`, `POST /gamification/wheel/spin`
- `POST /account/replenishment/subscribe`, `POST /account/replenishment/:id/reorder`, `POST /newsletter/subscribe`, `POST /checkout/cross-sell-bumpers`, `POST /account/wallet/topup-airtime`
- `GET /account/affiliate`, `POST /affiliate/short-links`, `GET /go/:slug`, `POST /admin/customers/:id/birthday-gift`
- `POST /admin/marketing/abandoned-carts/dispatch-coupons`, `POST /admin/marketing/social-banner`

### سفارش، مرجوعی و فاکتور

- `GET /tracking/post`, `GET /warranty/check`, `POST /proforma/create`, `POST /disputes/create`
- `GET /orders/:id/watermarked-invoice`, `GET /orders/:id/return-eligibility`, `GET /orders/:id/gift-receipt`
- `POST /rma/apply`, `GET /admin/rma`, `POST /admin/rma/:id/inspect`, `POST /admin/rma/screen-request`
- `POST /checkout/orders/:id/gift-options`, `GET /checkout/gift-wrap/themes`
- `POST /invoice/verify-signature`, `POST /tax/moadian/invoice`, `GET /admin/orders/:id/moadian-invoice-html`
- `POST /checkout/crypto/trc20/intent`, `POST /checkout/crypto/trc20/verify`, `POST /checkout/bank-transfer`
- `POST /pre-orders/reserve`, `GET /account/pre-orders`, `POST /admin/pre-orders/configure`
- `GET /account/orders/consolidation-eligibility`, `POST /account/orders/consolidate`
- `POST /checkout/orders/:id/pickup-reservation`

### ارسال و انبار

- `POST /delivery/feedback`, `GET /shipping/estimate-delivery`, `GET /shipping/optimal-warehouse`, `POST /shipping/allocate-warehouse`
- `POST /shipping/calculate-fare`, `GET /shipping/delivery-slots`, `POST /shipping/optimize-packaging`, `GET /shipping/pickup-hubs`
- `GET /products/:id/warehouse-stocks`, `GET /admin/inventory/demand-forecast`, `GET /admin/inventory/depletion-forecast`, `GET /admin/products/:id/depletion-forecast`
- `POST /admin/inventory/cycle-count`, `GET /admin/inventory/discrepancies`, `POST /admin/warehouse/pickup/verify-handover`
- `POST /admin/orders/:id/delivery-sla`, `POST /admin/shipping/send-tracking-sms`
- `POST /admin/warranty/registry/register`, `GET /warranty/registry/inquiry`, `GET /admin/warranties/expiring`

### مدیریت، مالی و فروشنده

- `GET /admin/abandoned-carts`, `POST /admin/coupons/cleanup`, `GET /admin/reports/sales`
- `GET /admin/security/anomalies`, `POST /admin/security/stolen-card/check`, `POST /admin/security/stolen-card/blacklist`
- `GET /admin/finance/gateway-commissions`, `POST /admin/finance/vendor-tax-split`, `POST /admin/finance/paya/generate-batch`
- `POST /admin/finance/bank-transfers/:id/verify-accountant`, `POST /admin/finance/bank-transfers/:id/approve-auditor`, `GET /admin/finance/orders/:id/profit-margin`
- `GET /admin/vendors/sla-scoreboard`, `GET /admin/vendors/:id/health-index`, `POST /admin/vendors/:id/evaluate-tier`
- `GET /account/bnpl/credit-score`, `GET /currency/convert`, `POST /admin/pricing/currency-peg/configure`, `POST /admin/pricing/currency-peg/recalculate`
- `POST /admin/pricing/volume-tiers`, `POST /pricing/volume-calculate`
- `POST /vendors/apply`, `GET /admin/vendors/applications`, `POST /admin/vendors/applications/:id/review`
- `POST /vendors/commission/calculate`, `GET /vendors/contract/terms`, `POST /vendors/contract/sign`, `GET /vendors/contract/:id/verify`
- `GET /admin/rma`, `POST /admin/voice-survey/initiate`, `POST /voice-survey/feedback`, `GET /admin/voice-survey/metrics`
- `POST /admin/sms/dispatch-pattern`, `GET /account/predictive/next-order`
- `GET /admin/features/toggles`, `POST /admin/features/toggles/set`

## ۸. کاتالوگ ۱۴۸ سرویس

نام هر ماژول برابر نام فایل است؛ برای نمونه `return-window` یعنی `server/src/services/return-window.js`. این فهرست کاتالوگ قابلیت‌های کد است، نه تضمین اتصال همه‌ی ماژول‌ها به UI یا یک سرویس واقعی بیرونی.

### AI، شخصی‌سازی و توصیه‌گر

| ماژول | کارکرد |
| --- | --- |
| `ai/builtin` | تولید داخلی محصول/متن/تصویر SVG بدون کلید خارجی |
| `ai/commerce` | کارهای تجاری AI: محصول، SEO، بازاریابی، پشتیبانی و تحلیل |
| `ai/gateway` | انتخاب provider، فراخوانی، fallback و ثبت مصرف |
| `ai/providers` | فهرست providerها، مدل‌ها و تخمین هزینه |
| `ai-auto-tagging` | استخراج تگ/کلیدواژه از اطلاعات کالا |
| `ai-next-order-predictor` | تخمین زمان و سبد سفارش بعدی مشتری |
| `device-lifecycle-recommender` | پیشنهاد لوازم جانبی و کالاهای سازگار |
| `recommendation` | پیشنهاد کالاهای هم‌خرید بر اساس سفارش‌ها |
| `recommendations` | cross-sell و upsell کاتالوگ |
| `smart-checkout-cross-sell` | پیشنهاد خرید تکمیلی در مرحله‌ی checkout |
| `smart-bundle` | پیشنهاد بسته‌های کالایی و صرفه‌جویی ترکیبی |
| `multi-product-spec-matrix` | ماتریس مقایسه‌ی مشخصات چند کالا |
| `product-comparison` | مقایسه‌ی محصول‌ها بر اساس داده‌ی کاتالوگ |

### کاتالوگ، محتوا، SEO و کشف محصول

| ماژول | کارکرد |
| --- | --- |
| `barcode` | تولید SVG بارکد GS1/IranCode |
| `fuzzy-search` | جستجوی تقریبی و اصلاح غلط املایی فارسی |
| `search-cache` | cache نتایج جستجوی پرتکرار |
| `search-trend-analytics` | ثبت عبارت‌ها، ترند و جستجوهای بی‌نتیجه |
| `opengraph-meta` | metadata برای پیش‌نمایش شبکه‌های اجتماعی |
| `schema-ld` | ساخت JSON-LD / Schema.org برای SEO |
| `spec-sheet` | تولید برگه‌ی مشخصات چاپی کالا |
| `product-qna` | پرسش مشتری و پاسخ کارشناسی درباره‌ی کالا |
| `photo-review` | ثبت/مدیریت نظر تصویری کالا |
| `image-optimizer` | بررسی نوع/ابعاد تصویر و headerهای تحویل |
| `scratch-authenticity` | کد خراشیدنی اصالت کالای فیزیکی |
| `open-box-grading` | درجه‌بندی کالای مرجوعی/جعبه‌باز و قیمت فروش مجدد |
| `url-prober` | بررسی سلامت لینک تصویر/محتوای کاتالوگ |
| `social-banner-svg` | ساخت SVG بنر پست/استوری شبکه‌ی اجتماعی |
| `qr-code` | تولید QR Code به شکل SVG |
| `holiday-theme` | بنر، رنگ و پیام مناسبتی تقویم |
| `multi-currency` | تبدیل مبلغ تومان/ریال/ارزهای دیگر |
| `currency-pegged-pricing` | قیمت‌گذاری متصل به نرخ مرجع ارز |

### سبد، فروش، تخفیف و وفاداری

| ماژول | کارکرد |
| --- | --- |
| `abandoned-cart` | شناسایی سبد رهاشده و پیشنهاد بازیابی |
| `abandoned-cart-timed-coupon` | یادآوری سبد با کوپن زمان‌دار |
| `cart-reservation` | رزرو موقت کالا در سبد و شمارش معکوس |
| `cart-sanitizer` | بررسی دوباره‌ی قیمت/موجودی سبد پیش از checkout |
| `coupon-cleanup` | بررسی سلامت و پاک‌سازی کوپن منقضی |
| `first-time-buyer` | کنترل محدودیت تخفیف اولین خرید |
| `flash-sale` | کمپین فروش شگفت‌انگیز و زمان‌بندی |
| `tiered-discounts` | تخفیف پلکانی بر اساس مبلغ سبد |
| `volume-pricing` | قیمت/تخفیف پلکانی بر اساس تعداد |
| `wholesale-volume-pricing` | قیمت عمده‌ی پلکانی |
| `bundles` | مدیریت bundle/kitting |
| `gift-wrap` | گزینه‌های عمومی بسته‌بندی و متن هدیه |
| `personalized-gift-wrap` | کادوپیچی شخصی‌سازی‌شده و رسید بدون قیمت |
| `price-alert` | اشتراک هشدار هدف قیمت کالا |
| `price-drop-sms` | هشدار افت قیمت با تمرکز بر SMS |
| `exit-intent-survey` | ثبت علت ترک سبد/checkout |
| `loyalty-quests` | مأموریت و جایزه‌ی امتیازی مشتری |
| `spin-the-wheel` | گردونه‌ی جایزه با محدودیت دوره‌ای |
| `smart-replenishment` | یادآوری و reorder مصرف مجدد کالا |
| `consumable-replenishment` | تشخیص زمان شارژ مجدد کالای مصرفی |
| `newsletter-capture` | ثبت عضو خبرنامه و کوپن خوشامد |
| `birthday-gift-campaign` | کوپن/هدیه‌ی مناسبتی تولد |
| `affiliate` | لینک معرف و ثبت کمیسیون فروش |
| `affiliate-shortlink-tracker` | لینک کوتاه معرف و تحلیل کلیک/فروش |
| `customer-clv` | Customer Lifetime Value و سطح‌بندی مشتری |
| `rfm` | بخش‌بندی Recency/Frequency/Monetary |
| `nps-engine` | ثبت امتیاز رضایت و محاسبه‌ی NPS |
| `delivery-feedback` | دریافت امتیاز ارسال/بسته‌بندی |

### پرداخت، فاکتور، مالی و مالیات

| ماژول | کارکرد |
| --- | --- |
| `payment-gateway` | شناسایی/تنظیم providerها و جریان درگاه؛ برخی مسیرها mock هستند |
| `gateway-circuit-breaker` | تشخیص خطای مکرر درگاه و failover |
| `gateway-commission` | محاسبه/گزارش کارمزد provider |
| `split-payment` | تقسیم مبلغ میان کیف پول و پرداخت درگاه |
| `bnpl-scoring` | امتیاز اعتباری خرید اقساطی |
| `bnpl-simulator` | شبیه‌سازی اقساط BNPL |
| `crypto-trc20-checkout` | شبیه‌ساز intent/تأیید پرداخت USDT TRC20؛ اتصال واقعی زنجیره نیست |
| `high-value-bank-transfer` | گردش بررسی چندمرحله‌ای پرداخت انتقالی با مبلغ بالا |
| `bank-reversal` | dispatcher برگشت/ابطال بانکی |
| `reconciliation` | تطبیق فایل/داده‌ی گردش بانکی با تراکنش داخلی |
| `proforma-invoice` | پیش‌فاکتور و تبدیل به سفارش |
| `invoice-pdf` | HTML چاپی فارسی فاکتور |
| `invoice-signer` | امضا و بررسی اصالت فاکتور |
| `watermarked-invoice` | فاکتور/پیش‌فاکتور با watermark وضعیت پرداخت |
| `moadian-tax` | محاسبه/ساخت payload مالیات الکترونیکی مودیان |
| `moadian-pdf-invoice` | قالب فاکتور تصویری مودیان و QR |
| `b2b-tax-validator` | کنترل شناسه/کدهای حقوقی برای B2B |
| `b2b-price-list-generator` | تولید فهرست/کاتالوگ قیمت عمده با SKU، قیمت پلکانی و موجودی |
| `excel-export` | CSV/خروجی سازگار با Excel و امن‌سازی formula |
| `sales-export` | گزارش تجمیعی فروش و CSV |
| `vendor-payout` | محاسبه‌ی تسویه‌ی فروشنده و کمیسیون |
| `vendor-settlement-tax` | تفکیک مالیات/کسورات تسویه‌ی فروشنده |
| `tiered-vendor-commission` | نرخ کمیسیون پلکانی بر اساس سطح/دسته |
| `paya-batch-payout` | ساخت قالب batch پرداخت پایا |
| `gross-profit-analyzer` | تحلیل حاشیه سود سفارش و هزینه‌ها |
| `mobile-airtime-topup` | شارژ سیم‌کارت از کیف پول؛ منطق سرویس/شبیه‌ساز |

### کالا، سفارش، مرجوعی و ضمانت

| ماژول | کارکرد |
| --- | --- |
| `order-lifecycle` | تغییر وضعیت و اعمال قواعد چرخه‌ی سفارش |
| `order-consolidation` | ادغام سفارش‌های واجد شرایط یک مشتری |
| `pre-order-deposit` | پیش‌فروش و دریافت بیعانه |
| `return-window` | بررسی مهلت مرجوعی |
| `rma-return-pipeline` | گردش درخواست مرجوعی تا کنترل کیفیت/بازپرداخت |
| `rma-return-fraud-shield` | امتیازدهی ریسک درخواست‌های مرجوعی |
| `disputes` | ثبت شکایت و مهلت پاسخ‌گویی |
| `warranty` | ثبت/استعلام ضمانت و شماره سریال |
| `warranty-expiry` | هشدار پایان ضمانت |
| `third-party-warranty` | registry ضمانت ارائه‌دهندگان ثالث |

### آدرس، ارسال، انبار و تأمین‌کننده

| ماژول | کارکرد |
| --- | --- |
| `address-normalizer` | نرمال‌سازی نشانی و کدپستی ایران |
| `postal-code` | اعتبارسنجی کدپستی ۱۰ رقمی و حدس استان |
| `postal-address-matcher` | تطبیق پیشوند کدپستی با استان/نشانی |
| `reverse-geocoding-matcher` | تعیین منطقه‌ی ارسال از اطلاعات جغرافیایی |
| `delivery-geolocation` | مختصات جغرافیایی آدرس تحویل |
| `delivery-estimator` | تخمین روز تحویل با توجه به روش ارسال/تعطیلی |
| `delivery-sla` | پایش تأخیر و جبران سرویس |
| `courier-tracking` | یکپارچه‌سازی/نرمال‌سازی رهگیری مرسوله |
| `post-tracking` | اعتبارسنجی و ساخت checkpoint رهگیری پست |
| `post-fare-tariff` | تخمین هزینه‌ی پست براساس وزن/منطقه |
| `time-slot-delivery` | بازه‌های زمانی تحویل با ظرفیت ناوگان |
| `click-and-collect-pickup` | رزرو و تحویل حضوری با token/کد تأیید |
| `volumetric-packaging-optimizer` | محاسبه وزن حجمی و پیشنهاد بسته‌بندی |
| `multi-warehouse` | انتخاب انبار منطقه‌ای براساس مقصد |
| `warehouse-stock-allocator` | تخصیص موجودی سفارش از انبار مناسب |
| `inventory-discrepancy` | شمارش ادواری و ثبت اختلاف موجودی |
| `inventory-reservation` | آزادسازی رزرو سفارش منقضی |
| `demand-forecast` | پیش‌بینی تقاضا و پیشنهاد شارژ مجدد |
| `stock-depletion-forecaster` | برآورد سرعت فروش و زمان اتمام موجودی |
| `stock-alerts` | اشتراک اعلان بازگشت کالا به انبار |
| `supplier-sla-scoring` | امتیازدهی عملکرد و SLA تأمین‌کننده |
| `vendor-onboarding` | درخواست/صف پذیرش فروشنده |
| `vendor-health-index` | شاخص سلامت و هشدار فروشنده |
| `vendor-digital-contract` | امضای دیجیتال/اثر انگشت قرارداد فروشنده |

### احراز هویت، امنیت، پیام و عملیات

| ماژول | کارکرد |
| --- | --- |
| `anti-fraud` | قواعد سرعت/الگوی ریسک تراکنش |
| `auth-anomaly` | شناسایی نوسان/الگوی غیرعادی ورود |
| `card-verification` | ماسک و کنترل کارت/انتقال |
| `stolen-card-blacklist` | blacklist کارت با hash و بررسی وضعیت |
| `iran-validators` | الگوریتم اعتبارسنجی کد ملی/شبا |
| `national-card-verifier` | کنترل قالب/اعتبار کارت ملی/بانکی ایرانی |
| `shahkar-verification` | تطبیق کد ملی و شماره موبایل |
| `sms-otp` | ساخت و بررسی OTP با محدودیت تلاش |
| `pattern-transactional-sms` | پیامک تراکنشی pattern-based |
| `shipping-sms-notifier` | پیام رهگیری پس از ارسال سفارش |
| `alert-dispatcher` | صف هشدار/SMS و تلاش مجدد |
| `login-history` | ثبت نشست/دستگاه و تاریخچه ورود |
| `passkeys` | credentialهای WebAuthn/Passkey |
| `secret-manager` | خواندن secret از محیط یا فایل mount شده |
| `feature-toggles` | کلید روشن/خاموش قابلیت‌ها در جدول تنظیمات |
| `client-error-aggregator` | fingerprint و تجمیع خطاهای مرورگر |
| `system-metrics` | منابع سیستم و event loop |
| `metrics` | registry متریک Prometheus ساده |
| `ops-alerts` | تاریخچه و ارسال هشدار عملیاتی |
| `db-maintenance` | integrity check و آمار/بهینه‌سازی SQLite |
| `memory-cache` | cache کوچک درون‌حافظه‌ای |
| `cache` | cache چندسطحی/event-driven |
| `outbox` | صف outbox برای webhook/event delivery |
| `storage` | adapter ذخیره‌سازی محلی/S3-compatible |

### پشتیبانی، گزارش و ابزارهای تکمیلی

| ماژول | کارکرد |
| --- | --- |
| `ticket-urgency` | تحلیل واژه‌ها و اولویت/زمان پاسخ تیکت |
| `voice-survey-simulator` | شبیه‌سازی تماس رضایت‌سنجی پس از تحویل |
| `price-stock-audit` | تاریخچه و audit قیمت/موجودی |
| `waiting-room` | صف/توکن ورود در فروش پرترافیک |
| `commerce` | قواعد و گزینه‌های تجارت/checkout و روش‌های پرداخت/ارسال |

> برخی موارد در گروه‌های بالا هم‌پوشانی دارند، چون کدها مسئولیت‌های متفاوت اما مرتبط دارند. شمار ۱۴۸ شامل هر فایل یک‌بار است؛ موارد هم‌پوشان صرفاً توضیح دامنه‌اند.
## ۹. مدل داده‌ی SQLite

### جداول اصلی کاتالوگ و خرید

`categories`, `products`, `product_variants`, `inventory_movements`, `carts`, `cart_items`, `coupons`, `coupon_redemptions`, `orders`, `order_items`, `order_events`, `payments`, `payment_callback_events`, `checkout_intents`, `wallet_topups`, `wallet_transactions`, `volume_discounts`, `product_bundles`, `product_bundle_items`, `product_warehouse_stocks`, `product_volume_tiers`, `product_currency_pegs`, `flash_sales`, `flash_sale_items`, `back_in_stock_subscriptions`, `stock_alert_subscriptions`, `price_alerts`, `cart_reservations`, `pre_order_configs`, `pre_orders`, `order_consolidations`, `order_gift_options`, `order_pickup_reservations`, `open_box_inventory`.

### حساب، ارتباط و امنیت

`users`, `refresh_tokens`, `addresses`, `login_attempts`, `user_login_history`, `passkey_credentials`, `sms_otps`, `notifications`, `wishlist`, `review_helpful`, `client_telemetry_errors`, `aggregated_client_errors`, `system_feature_toggles`, `settings`, `audit_logs`.

### محتوا، پشتیبانی و وفاداری

`reviews`, `product_qna`, `tickets`, `ticket_messages`, `conversations`, `messages`, `nps_responses`, `exit_intent_surveys`, `newsletter_subscribers`, `user_quest_progress`, `user_spins`, `voice_surveys`, `holiday_themes`, `product_warranties`, `third_party_warranties`, `authenticity_codes`, `rma_returns`, `disputes`.

### مالی، فروشنده و یکپارچه‌سازی

`ai_providers`, `ai_logs`, `ai_generations`, `webhook_outbox`, `bank_reconciliations`, `payment_reversals`, `crypto_payments`, `high_value_bank_transfers`, `transactional_sms_logs`, `mobile_topups`, `vendor_applications`, `vendor_contracts`, `vendor_payouts`, `affiliate_partners`, `affiliate_links`, `affiliate_transactions`, `proforma_invoices`, `search_query_logs`, `delivery_feedbacks`, `delivery_slot_bookings`, `abandoned_cart_reminders`, `shahkar_logs`, `stolen_card_blacklist`, `inventory_cycle_counts`, `price_stock_audit_logs`, `replenishment_schedules`, `b2b_corporate_profiles`.

> تعداد بالا برابر با ۹۴ جدول تعریف‌شده در `schema.js` و مهاجرت‌های legacy است. فهرست دقیق DDL همان مرجع نهایی است. هسته از ORM استفاده نمی‌کند؛ queryها با `DatabaseSync` و prepared statement اجرا می‌شوند. `migrations.js` اکنون ledger نسخه‌دار، checksum و تراکنش برای migrationهای جدید دارد؛ تبدیل کل schema موجود به migrationهای نسخه‌دار هنوز کامل نشده است.

## ۱۰. WebSocket و پیام‌ها

آدرس اتصال: `ws(s)://<host>/ws`. در پیاده‌سازی، token در جریان اتصال/پیام احراز هویت استفاده می‌شود؛ چت مهمان توکن اختصاصی دارد.

رویدادهای کلیدی: `ready`, `ping`, `pong`, `auth`, `join_conversation`, `chat:send`, `chat:typing`, `chat:read`, `chat:message`, `chat:sent`, `notification`, `order:update`, `ticket:new`, `ticket:reply`, `ticket:message`, `conversation:update`.

هاب، اتاق‌های عمومی، `user:<id>`، `admin` و `conv:<id>` را مدیریت می‌کند؛ اتصال مرده با heartbeat بسته می‌شود. کلاینت `web/src/lib/realtime.js` reconnect با backoff و صف پیام دارد.

## ۱۱. تنظیمات و متغیرهای محیطی

نمونه‌ی کامل در `server/.env.example` است. مهم‌ترین تنظیمات:

| گروه | کلیدها |
| --- | --- |
| سرور | `PORT`, `HOST`, `NODE_ENV`, `LOG_LEVEL`, `PUBLIC_URL` |
| امنیت/نشست | `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_EXPIRES_DAYS`, `PASSWORD_MIN_LENGTH`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES`, `ENFORCE_ORIGIN` |
| Origin/Proxy | `TRUSTED_ORIGINS`, `CORS_ORIGINS`, `CORS_CREDENTIALS`, `TRUST_PROXY`, `ALLOW_PREVIEW_ORIGINS` |
| منابع | `DATA_DIR`, `UPLOAD_DIR`, `BODY_LIMIT`, `MAX_UPLOAD_BYTES` |
| rate limit | `RATE_GLOBAL`, `RATE_AUTH`, `RATE_AI`, `RATE_UPLOAD`, `RATE_WRITE`, `RATE_SEARCH`, `RATE_TRACK`, `RATE_CHAT` |
| کیف پول | `MAX_WALLET_TOPUP`, `MAX_WALLET_TOPUP_DAILY` |
| پرداخت | `PAYMENT_PROVIDER`, `PAYMENT_PROVIDERS`, `PAYMENT_ALLOW_MOCK`, `PAYMENT_TIMEOUT_MS`, credentialهای Zarinpal/Zibal/MrPardakht/Mellat، `PUBLIC_URL` |
| Observability/SLO | `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_*`, `METRICS_BEARER_TOKEN`, `SLO_*`, `OPS_ALERT_WEBHOOK_URL` |
| پشتیبان | `BACKUP_DIR` (دستور snapshot: `npm run db:backup`) |
| داده | `SEED_DEMO_DATA` |
| AI | `AI_TIMEOUT_MS`, `AI_MAX_TOKENS`, `AI_KEY_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_API_KEY` |

### نکته‌های تولیدی

- محیط production هنگام راه‌اندازی `JWT_SECRET` یکتا با حداقل ۳۲ بایت را لازم دارد؛ مقدار پیش‌فرض توسعه پذیرفته نمی‌شود. `ALLOW_SELF_PROMOTION` باید خاموش و `SEED_DEMO_DATA` غیرفعال بماند.
- `SEED_DEMO_DATA` پیش‌فرض در production خاموش و در توسعه روشن است؛ حساب‌ها/محصولات نمونه را در محیط واقعی نگه ندارید.
- checkout به adapterهای Zarinpal، Zibal، MrPardakht و Mellat، callback سمت سرور و verify وصل است؛ mock در production بسته و SnappPay غیرفعال است. قبل از دریافت وجه واقعی، secret/allowlist/`PUBLIC_URL` را تنظیم، callback را در sandbox پذیرنده آزمایش و قرارداد reconcile را تأیید کنید. `wallet/topup` هنوز شارژ واقعی درگاه نیست.
- OTLP، `/metrics` محافظت‌شده، SLOها و هشدارهای Prometheus مستند در `docs/OBSERVABILITY.md` هستند. SQLite snapshot/restore و طرح صادقانهٔ PostgreSQL/PITR در `docs/DATABASE_MIGRATION_AND_RECOVERY.md` قرار دارد؛ PostgreSQL cutover هنوز انجام نشده.
- محدودیت نرخ درون‌حافظه‌ای است؛ برای چند replica باید store توزیع‌شده در نظر گرفته شود.
- کلیدهای AI پنل با AES-256-GCM در `ai_providers.api_key` ذخیره می‌شوند. `AI_KEY_ENCRYPTION_KEY` باید حداقل ۳۲ بایت و بیرون از مخزن نگهداری شود؛ کلیدهای قدیمی در زمان bootstrap مهاجرت می‌شوند و تنظیمات عمومی AI فقط فیلدهای allowlist شده را می‌پذیرد.
- Node.js حداقل 22.13 لازم است تا `node:sqlite` بدون فلگ آزمایشی کار کند؛ حداقل نسخه در engines و CI تعریف شده است.
- Electron از نسخه‌ای استفاده می‌کند که Node داخلی آن `node:sqlite` را پشتیبانی می‌کند. بسته‌بندی، نصب مستقل وابستگی‌های production سرور و حضور `server`, `web/dist` و runtime در smoke check تأیید می‌شوند.

## ۱۲. دستورات توسعه و ساخت

```bash
npm install                 # نصب workspaceهای server و web
npm run dev                 # API + Vite
npm run dev:api              # API تنها
npm run dev:web              # Vite تنها
npm run build                # web/dist
npm start                    # Express و در صورت وجود web/dist، SPA
npm run seed                 # seed با گزینه‌ی force؛ داده‌ی محیط را بازنویسی می‌کند
npm test                     # تمام server/test/*.test.js
npm run test:security        # آزمون امنیتی خودکار
npm run pentest              # تست نفوذ روی سرور فعال (پیش‌فرض localhost:4000)
```

### موبایل و دسکتاپ

```bash
npm run mobile:install
npm run mobile:add:android    # فقط بار اول؛ نیازمند Android Studio/JDK
npm run mobile:add:ios        # فقط بار اول؛ نیازمند macOS/Xcode
npm run mobile:sync

npm run desktop:install
npm run desktop:dev
npm run desktop:build         # ابتدا web را build می‌کند
```

Capacitor به `web/dist` نیاز دارد؛ برای اپ بومی باید API URL سرور تنظیم شود (`VITE_API_URL` هنگام build یا `window.EASYSHOP_API_URL`/`easyshop.apiBase` در زمان اجرا). Electron در dev از Vite استفاده می‌کند؛ در حالت بسته‌بندی‌شده برای اجرای server محلی تنظیم شده است.

## ۱۳. آزمون‌ها و وضعیت بازبینی

- `npm run build`: موفق در بازبینی فعلی.
- `node --test server/test/api.test.js server/test/security.test.js`: **۱۴۰/۱۴۰ موفق**.
- تست نفوذ زنده‌ی `tools/pentest.mjs`: **۹۱/۹۱ موفق** روی محیط موقت.
- `npm test`: شامل آزمون‌های API، امنیت و roundهای سرویس است. اجرای کامل این بازبینی **۲۷۶/۲۸۶ موفق** بود؛ اجرای دیگر ۹ شکست داشت. شکست‌ها عمدتاً در فایل‌های `continuous-improvement-round*.test.js` هستند و به fixture/setup و سازگاری قرارداد سرویس‌ها نیاز به بررسی دارند.
- `npm audit`: در lockfile فعلی ۱۳ finding گزارش شد: ۲ بحرانی، ۶ بالا و ۵ متوسط؛ بخشی از درخت وابستگی dev است.
- برای UI در `web/package.json` تست/لینت واقعی تنظیم نشده؛ فرمان lint فقط پیام «no linter configured» چاپ می‌کند.

> پاس‌شدن core suite یا تست نفوذ موجود، پوشش کامل همه‌ی ۲۵۸ route و ۱۴۸ سرویس را تضمین نمی‌کند. به‌عنوان نمونه، route فاکتور واترمارک‌دار در تست نفوذ موجود نبود.

## ۱۴. یافته‌های مهم کد در بازبینی فعلی

این موارد برای آگاهی از وضعیت فعلی درج شده‌اند و در این تغییر اصلاح نشده‌اند:

1. `GET /api/orders/:id/watermarked-invoice` در `misc.js` بدون auth/مالکیت، HTML فاکتور دارای اطلاعات مشتری از جمله تلفن و کد ملی برمی‌گرداند؛ با درخواست بدون توکن پاسخ ۲۰۰ بازتولید شد.
2. `POST /api/auth/refresh` مقدار refresh token را به‌عنوان access token هم برمی‌گرداند؛ access token تازه امضای JWT معتبر ندارد و درخواست بعدی ۴۰۱ می‌گیرد.
3. checkout تنوع، `variant_id` را در `order_items` ذخیره نمی‌کند؛ لغو سفارش موجودی محصول مادر را زیاد می‌کند ولی موجودی تنوع را برنمی‌گرداند.
4. فرانت‌اند پروفایل `PUT /auth/me` می‌فرستد، ولی سرور فقط `PATCH /auth/me` دارد؛ درخواست UI پاسخ ۴۰۴ می‌گیرد.
5. Service Worker همه‌ی پاسخ‌های GET `/api/` را در cache می‌گذارد؛ پاسخ‌های خصوصی باید از cache آفلاین عمومی جدا شوند یا cache پاک‌سازی/شناسه‌گذاری کاربرمحور شود.
6. مستندات می‌گویند کلید AI رمزگذاری می‌شود، ولی مسیر تنظیم provider مقدار خام را مستقیم ذخیره می‌کند.

## ۱۵. راهنماهای مرتبط

- [README پروژه](../README.md)
- [مستند API](API.md)
- [معماری](ARCHITECTURE.md)
- [امنیت](SECURITY.md)
- [استقرار](DEPLOYMENT.md)
