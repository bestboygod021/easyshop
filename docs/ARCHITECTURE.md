# معماری EasyShop

## نگاه کلی

```
┌──────────────────────────────────────────────────────────────────────┐
│                         کلاینت‌ها (۴ پلتفرم)                          │
│  Web (PWA)   iOS (Capacitor)   Android (Capacitor)   Windows (Electron)│
└───────────────────────────────┬──────────────────────────────────────┘
                                │  HTTP/REST + WebSocket
┌───────────────────────────────▼──────────────────────────────────────┐
│                     بک‌اند Express (بک‌اند واحد)                       │
│  routes ⇄ services ⇄ db   |   realtime hub (ws)   |   AI gateway      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  node:sqlite (بدون سرور دیتابیس)
                          ┌─────▼─────┐
                          │ SQLite DB │  + پوشه uploads
                          └───────────┘
```

نکته‌ی کلیدی: هر چهار پلتفرم فقط با **یک API** صحبت می‌کنند؛ هیچ منطق تجاری در کلاینت تکرار نشده است.

---

## لایه‌بندی بک‌اند

| لایه | مسیر | مسئولیت |
| --- | --- | --- |
| ورودی | `server/src/index.js` | میدل‌ورها (Helmet/CORS/JSON)، سوار کردن مسیرها، سرو SPA، راه‌اندازی WebSocket |
| پیکربندی | `server/src/config.js` | پورت، JWT، مسیر داده، کلیدهای AI از `.env` |
| داده | `server/src/db/` | `schema.js` (۲۵+ جدول)، `index.js` (wrapper نازک روی `node:sqlite` + مهاجرت خودکار + حسابرسی + اعلان)، `seed.js` |
| دسترسی | `server/src/middleware/auth.js` | bcrypt، JWT دسترسی/تازه‌سازی، نقش‌ها، `logAudit` |
| منطق | `server/src/utils/helpers.js` | `ok/fail`، صفحه‌بندی، فیلترها، محاسبات سبد و سفارش، برچسب وضعیت‌ها |
| خدمات AI | `server/src/services/ai/` | کاتالوگ ارائه‌دهنده‌ها، دروازه‌ی فراخوانی با fallback، موتور داخلی، تولیدکننده‌های تجاری |
| بلادرنگ | `server/src/realtime/hub.js` | اتاق‌های `public` / `user:<id>` / `admin` / `conv:<id>`، ذخیره پیام، اعلان |
| مسیرها | `server/src/routes/*.js` | ۱۰ روتر + `misc.js` (خانه، جستجو، آپلود، sitemap…) |

### قواعد مهم
- **بدون ORM**: SQL خام با prepared statement؛ سبک، سریع و بدون وابستگی سنگین.
- **مهاجرت خودکار**: در زمان import، ستون‌های جدید با `ALTER TABLE` اضافه می‌شوند (`COLUMN_MIGRATIONS`)، پس نسخه‌های قدیمی دیتابیس بدون reset کار می‌کنند.
- **حسابرسی**: هر عمل حساس با `logAudit()` در `audit_logs` ثبت می‌شود.
- **اعلان**: `notify()` رکورد اعلان می‌سازد و `broadcast()` رخداد WebSocket می‌فرستد.

---

## مدل داده (خلاصه)

```
users ──┬── addresses
        ├── carts ── cart_items ── products ── product_variants
        ├── orders ── order_items / payments / order_events
        ├── reviews ── products
        ├── wishlist ── products
        ├── wallet_transactions
        ├── notifications
        ├── tickets ── ticket_messages
        └── conversations ── messages

categories (درخت) ── products ── inventory_movements
coupons ── coupon_redemptions
ai_providers · ai_logs · ai_generations
settings · audit_logs
```

فیلدهای کلیدی محصول: `price`, `compare_at_price`, `cost`, `stock`, `low_stock_threshold`,
`rating_avg`, `rating_count`, `sold_count`, `view_count`, `specs` (JSON)، `tags` (JSON)، `images` (JSON)، `ai_meta` (JSON).

---

## قواعد تجاری

| قاعده | مقدار پیش‌فرض | محل تنظیم |
| --- | --- | --- |
| مالیات | ۹٪ | تنظیمات → قواعد فروش |
| ارسال ثابت | ۴۵٬۰۰۰ تومان | همان |
| ارسال رایگان | خرید بالای ۵٬۰۰۰٬۰۰۰ تومان | همان |
| کش‌بک | ۲٪ به کیف پول | همان |
| امتیاز وفاداری | هر امتیاز = ۱٬۰۰۰ تومان | همان |
| پرداخت در محل | فعال | همان |

---

## دروازه‌ی هوش مصنوعی

```
درخواست → انتخاب ارائه‌دهنده (انتخاب کاربر یا پیش‌فرض تنظیمات)
        → aiComplete()  ── موفق؟ → بازگشت پاسخ + ثبت در ai_logs
                        └─ خطا → ارائه‌دهنده‌ی بعدی بر اساس priority
                                 └─ همه ناموفق → موتور داخلی (builtin)
```

- کلیدها در جدول `ai_providers` رمزنگاری‌شده نگه‌داری می‌شوند و API فقط نسخه‌ی ماسک‌شده را برمی‌گرداند.
- هر فراخوانی در `ai_logs` با توکن ورودی/خروجی، هزینه‌ی تخمینی، تأخیر و وضعیت ثبت می‌شود.
- تولید محصول در `ai_generations` به‌صورت «پیش‌نویس» ذخیره می‌شود تا مدیر قبل از انتشار ویرایش کند.
- موتور داخلی (`services/ai/builtin.js`) با الگوهای فارسی، بدون هیچ کلید و اینترنتی، محصول/متن/SVG تولید می‌کند تا دمو همیشه کار کند.

---

## فرانت‌اند

- **مسیریابی**: React Router 6 با `lazy()` برای همه‌ی صفحه‌ها → بارگذاری تدریجی فایل‌ها.
- **وضعیت**: Zustand با استورهای `useAuth` / `useCart` / `useWishlist` / `useNotifications` / `useUI` / `useSettings`.
- **کلاینت API**: `lib/api.js` — افزودن خودکار توکن، `x-session-key`، تلاش مجدد با refresh token روی ۴۰۱، پشتیبانی از `window.EASYSHOP_API_URL` برای اپ‌های بومی.
- **بلادرنگ**: `lib/realtime.js` — اتصال WebSocket، ping/pong، صف پیام‌های آفلاین، اتصال مجدد نمایی.
- **RTL و فونت**: `<html dir="rtl" lang="fa">` + فونت Vazirmatn با fallback محلی (Tahoma) تا در شبکه‌ی بدون اینترنت هم خوانا بماند.
- **PWA**: `sw.js` کش اول برای دارایی‌ها و شبکه‌اول برای API با پاسخ آفلاین JSON؛ `manifest.webmanifest` برای نصب.

### محافظت از مسیرها
- `AccountLayout` → در نبود توکن، هدایت به `/login?next=…`
- `AdminLayout` → فقط `admin` / `support` / `seller`؛ در غیر این صورت هدایت به `/account`

---

## بومی‌سازی (Native)

| مورد | راهکار |
| --- | --- |
| مبدأ متفاوت اپ بومی (capacitor:// یا file://) | `window.EASYSHOP_API_URL` یا `localStorage['easyshop.apiBase']` |
| CORS | سرور مبدأهای `capacitor://localhost`، `app://easyshop` و `localhost` را می‌پذیرد |
| سرور آفلاین در دسکتاپ | Electron سرور را با `fork()` اجرا می‌کند و تا آمادگی `/api/health` صبر می‌کند |
| پشتیبان | آیکون‌های آداپتیو از `tools/render_icons.py` (بدون وابستگی) تولید می‌شوند |

---

## آزمون‌پذیری

- `server/test/api.test.js`: ۴۲ تست یکپارچه با `node:test` روی سرور واقعی (پورت موقت) و پوشه‌ی داده‌ی موقت.
- فرانت‌اند با jsdom و build تک‌فایلی (IIFE) در محیط توسعه آزموده شده: ۲۴ مسیر شامل پنل کاربری و پنل مدیریت بدون خطای زمان اجرا رندر می‌شوند.
