# مستندات API فروشگاه EasyShop

آدرس پایه: `http://<host>:4000/api` — نسخه زنده‌ی فهرست مسیرها: `GET /api/docs`

قرارداد پاسخ‌ها:

```json
{ "ok": true,  "…": "داده" }                       // موفق
{ "ok": false, "error": "پیام فارسی خطا" }          // خطا
```

صفحه‌بندی: `?page=1&limit=20` → پاسخ شامل `{ items, total, page, pages }`

---

## احراز هویت

| متد | مسیر | توضیح |
| --- | --- | --- |
| POST | `/auth/register` | ثبت‌نام: `{ email, password, full_name, phone }` → `{ session }` |
| POST | `/auth/login` | ورود: `{ email, password }` → `{ session }` |
| POST | `/auth/refresh` | تجدید توکن: `{ refreshToken }` |
| POST | `/auth/logout` | خروج و باطل‌کردن توکن |
| GET | `/auth/me` | کاربر جاری |
| PATCH | `/auth/me` | ویرایش پروفایل |
| POST | `/auth/change-password` | تغییر رمز (نیازمند رمز فعلی) |
| POST | `/auth/forgot-password` | ارسال کد بازیابی |
| POST | `/auth/reset-password` | تعیین رمز جدید با کد |
| POST | `/auth/guest` | ساخت نشست مهمان (سبد خرید بدون ثبت‌نام) |

> **نکات امنیتی**
> * توکن دسترسی فقط از هدر `Authorization: Bearer` خوانده می‌شود (`?token=` دیگر معتبر نیست).
> * پیام خطای ورود برای «کاربر ناموجود» و «رمز اشتباه» یکسان است و پس از ۵ تلاش ناموفق، حساب/آی‌پی برای ۱۵ دقیقه قفل می‌شود.
> * توکن تازه‌سازی فقط یک‌بار قابل استفاده است؛ استفاده‌ی مجدد، کل خانواده‌ی توکن‌ها را باطل می‌کند.
> * پس از تغییر/بازیابی رمز، همه‌ی نشست‌های قبلی باطل می‌شوند.

`session = { accessToken, refreshToken, user }`

سرصفحه‌ها:

```
Authorization: Bearer <accessToken>
x-session-key: <کلید سبد مهمان>      # برای سبد خرید بدون ورود
x-guest-token: <توکن گفتگوی مهمان>   # فقط برای گفتگوی زنده‌ی مهمان
```

نقش‌ها: `customer` · `seller` · `support` · `admin`

---

## محصولات

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/products` | فهرست + فیلتر |
| GET | `/products/suggest?q=` | جستجوی سریع (نوار جستجو) |
| GET | `/products/brands` | فهرست برندها |
| GET | `/products/:idOrSlug` | جزئیات محصول (با واریانت و نظرات) |
| POST | `/products/:id/reviews` | ثبت نظر (نیازمند ورود) |
| POST | `/products/reviews/:reviewId/helpful` | رأی مفید بودن |
| GET | `/products/admin/all` | فهرست مدیریتی (کارمند) |
| POST | `/products` | ایجاد محصول (کارمند) |
| PUT | `/products/:id` | ویرایش کامل |
| PATCH | `/products/:id` | ویرایش جزئی |
| DELETE | `/products/:id` | آرشیو محصول |
| POST | `/products/:id/stock` | اصلاح موجودی: `{ delta, reason }` |

پارامترهای فیلتر فهرست:

`q`, `category`, `brand`, `min_price`, `max_price`, `rating`, `in_stock`, `discount`, `featured`, `tag`,
`sort` = `newest` | `cheapest` | `expensive` | `popular` | `rating` | `discount`,
`page`, `limit`

---

## دسته‌بندی‌ها

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/categories` | درخت دسته‌ها |
| GET | `/categories?flat=1` | فهرست تخت (همه‌ی سطوح) |
| GET | `/categories/:slug` | یک دسته + محصولات آن |
| POST | `/categories` | ایجاد (مدیر) |
| PATCH | `/categories/:id` | ویرایش |
| DELETE | `/categories/:id` | حذف (در صورت نبود محصول) |

---

## سبد خرید

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/cart` | سبد جاری + محاسبات |
| POST | `/cart/items` | افزودن: `{ product_id, variant_id?, qty }` |
| PATCH | `/cart/items/:id` | تغییر تعداد: `{ qty }` |
| DELETE | `/cart/items/:id` | حذف قلم |
| DELETE | `/cart` | خالی‌کردن سبد |
| POST | `/cart/coupon` | اعمال کد: `{ code }` |
| POST | `/cart/merge` | ادغام سبد مهمان با کاربر واردشده |

ساختار پاسخ:

```json
{
  "items": [{ "id": "cit_1", "qty": 2, "product_id": "prd_1", "name": "…", "unit_price": 2500000, "total": 5000000, "available": true }],
  "totals": { "subtotal": 5000000, "discount": 500000, "shipping_cost": 0, "tax": 405000, "total": 4905000, "item_count": 2, "currency": "تومان" },
  "coupon_code": "WELCOME10"
}
```

## سفارش‌ها

> **پرداخت امن**: `POST /orders` که به `POST /orders/:id/pay` بازمی‌گردد، در پاسخ `checkout` دو مقدار
> `payment.authority` و `payment.intent_token` برمی‌گرداند. تأیید پرداخت **فقط** با این دو مقدار و توسط
> مالک سفارش (یا مهمان با تطبیق شماره تماس) انجام می‌شود؛ در غیر این صورت پاسخ ۴۰۰/۴۰۳ است.
> هر `authority` فقط یک‌بار و در مهلت ۳۰ دقیقه قابل تأیید است.

| متد | مسیر | توضیح |
| --- | --- | --- |
| POST | `/orders/checkout` | ثبت سفارش |
| POST | `/orders/:id/pay` | تأیید پرداخت (`{ success: true|false }`) |
| GET | `/orders` | سفارش‌های من |
| GET | `/orders/:id` | جزئیات + رخدادها + پرداخت‌ها |
| POST | `/orders/:id/cancel` | لغو (بازگشت وجه به کیف پول) |
| POST | `/orders/:id/return` | درخواست مرجوعی |
| POST | `/orders/:id/reorder` | افزودن مجدد اقلام به سبد |
| GET | `/orders/track/:code` | پیگیری با کد سفارش |

بدنه‌ی `checkout`:

```json
{
  "address": { "receiver": "…", "phone": "…", "province": "…", "city": "…", "line": "…", "postal_code": "…" },
  "address_id": "adr_1",            // یا آدرس ذخیره‌شده
  "shipping_method": "post",        // post | express | tipax | pickup
  "payment_method": "gateway",      // gateway | wallet | cod
  "coupon_code": "WELCOME10",
  "use_loyalty": 50,                // تعداد امتیاز (هر امتیاز = ۱۰۰۰ تومان)
  "note": "…"
}
```

چرخه‌ی وضعیت سفارش: `pending → paid → processing → shipped → delivered` (+ `canceled` / `returned`)

---

## پنل کاربری

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/account/dashboard` | خلاصه (سفارش، کیف پول، امتیاز، تیکت، علاقه‌مندی) |
| GET | `/account/summary` | شمارنده‌های سریع |
| GET/POST | `/account/addresses` | فهرست/افزودن آدرس |
| PATCH/DELETE | `/account/addresses/:id` | ویرایش/حذف |
| GET | `/account/wallet` | کیف پول + تراکنش‌ها |
| POST | `/account/wallet/topup` | شارژ کیف پول |
| POST | `/account/loyalty/convert` | تبدیل امتیاز به موجودی |
| GET/POST | `/account/wishlist` | علاقه‌مندی‌ها |
| DELETE | `/account/wishlist/:productId` | حذف از علاقه‌مندی |
| GET | `/account/notifications` | اعلان‌ها |
| POST | `/account/notifications/read` | علامت‌گذاری خوانده‌شده |
| GET/POST | `/account/recently-viewed` | بازدیدهای اخیر |

---

## پشتیبانی: تیکت

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/tickets` | مشتری: تیکت‌های خودش · کارمند: همه (`?status=&priority=&q=`) |
| GET | `/tickets/meta` | دسته‌ها، اولویت‌ها، کارشناسان |
| POST | `/tickets` | ایجاد: `{ subject, body, category, priority, order_id? }` |
| GET | `/tickets/:id` | جزئیات + پیام‌ها |
| POST | `/tickets/:id/messages` | پاسخ: `{ body, is_internal? }` |
| PATCH | `/tickets/:id` | کارمند: `{ status, priority, assigned_to, satisfaction }` |

## پشتیبانی: گفتگوی زنده

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/chat/conversations` | مشتری: گفتگوی خود · کارمند: همه |
| POST | `/chat/conversations` | شروع: `{ message, subject?, guest_name?, guest_email? }` |
| GET | `/chat/conversations/:id` | پیام‌ها (و صفرکردن unread) |
| POST | `/chat/conversations/:id/messages` | ارسال پیام |
| PATCH | `/chat/conversations/:id` | کارمند: تغییر وضعیت |
| POST | `/chat/ai-suggest` | پیشنهاد پاسخ هوشمند برای گفتگو |
| GET | `/chat/agents` | کارشناسان آنلاین |

### پروتکل WebSocket

```
ws://<host>/ws?token=<accessToken>
```

پیام‌های ارسالی کلاینت:

```json
{ "type": "join_conversation", "conversation_id": "cnv_1" }
{ "type": "chat:send", "conversation_id": "cnv_1", "body": "سلام" }
{ "type": "chat:typing", "conversation_id": "cnv_1" }
{ "type": "chat:read", "conversation_id": "cnv_1" }
{ "type": "pong" }
```

رخدادهای دریافتی: `ready` · `ping` · `chat:message` · `chat:typing` · `chat:read` ·
`notification` · `order:update` · `ticket:new` · `ticket:reply` · `ticket:message` · `conversation:update`

---

## هوش مصنوعی

| متد | مسیر | نقش | توضیح |
| --- | --- | --- | --- |
| GET | `/ai/models` | عمومی | کاتالوگ مدل‌ها + ۵ مدل برتر |
| GET | `/ai/health` | عمومی | آمادگی سرویس |
| POST | `/ai/assistant` | عمومی | دستیار خرید: `{ message, history }` |
| GET | `/ai/providers` | مدیر | فهرست ارائه‌دهنده‌ها با کلید ماسک‌شده |
| PUT | `/ai/providers/:slug` | مدیر | ذخیره کلید/مدل/اولویت |
| POST | `/ai/providers/:slug/test` | مدیر | تست اتصال |
| PUT | `/ai/settings` | مدیر | تنظیمات AI |
| POST | `/ai/generate/product` | مدیر/فروشنده | تولید محصول (`auto_publish` برای انتشار فوری) |
| POST | `/ai/generate/image` | مدیر/فروشنده | تولید تصویر (`product_id` برای درج خودکار) |
| POST | `/ai/generate/categories` | مدیر | پیشنهاد/ساخت دسته‌بندی (`save: true`) |
| POST | `/ai/generate/seo` | مدیر/فروشنده | بسته سئو |
| POST | `/ai/marketing` | مدیر/فروشنده | کمپین بازاریابی |
| POST | `/ai/pricing/:productId` | مدیر/فروشنده | تحلیل و پیشنهاد قیمت |
| POST | `/ai/analyze-reviews/:productId` | کارمند | تحلیل نظرات |
| POST | `/ai/support-reply` | کارمند | پیشنهاد پاسخ تیکت |
| GET | `/ai/generations` | مدیر/فروشنده | پیش‌نویس‌های تولیدشده |
| POST | `/ai/generations/:id/publish` | مدیر/فروشنده | انتشار پیش‌نویس |
| GET | `/ai/logs` | مدیر | لاگ مصرف توکن/هزینه |

نمونه:

```bash
curl -X POST http://localhost:4000/api/ai/generate/product \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"brief":"هدفون بی‌سیم نویز کنسلینگ","provider":"openai","model":"gpt-4o","auto_publish":true}'
```

---

## پنل مدیریت

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/admin/dashboard?days=30` | KPI، نمودار فروش، پرفروش‌ها، آخرین رخدادها |
| GET | `/admin/orders` | فهرست سفارش‌ها (`status`, `q`) |
| PATCH | `/admin/orders/:id` | وضعیت/رهگیری/یادداشت |
| GET | `/admin/users` | کاربران + خلاصه آماری |
| POST | `/admin/users` | ایجاد کاربر کارمند |
| PATCH | `/admin/users/:id` | نقش، وضعیت، کیف پول، امتیاز، رمز |
| DELETE | `/admin/users/:id` | حذف کاربر |
| GET | `/admin/inventory` | موجودی + ارزش انبار + گردش‌ها |
| GET/POST | `/admin/coupons` | کدهای تخفیف |
| PATCH | `/admin/coupons/:id` | ویرایش/فعال‌سازی |
| GET | `/admin/reviews` | نظرات |
| PATCH | `/admin/reviews/:id` | تأیید/رد/پاسخ |
| GET/PUT | `/admin/settings` | تنظیمات فروشگاه |
| GET | `/admin/reports?days=30` | گزارش فروش، دسته‌ها، مشتریان، پرداخت‌ها |
| GET | `/admin/audit-logs` | لاگ حسابرسی |
| POST | `/admin/broadcast` | اعلان همگانی: `{ title, body, role, link }` |

---

## سایر مسیرها

| متد | مسیر | توضیح |
| --- | --- | --- |
| GET | `/home` | داده‌های صفحه اصلی |
| GET | `/settings` | تنظیمات عمومی فروشگاه |
| GET | `/health` | سلامت سرویس + شمارش‌ها |
| GET | `/search?q=` | جستجوی سراسری (محصول + صفحه) |
| GET | `/stats` | آمار عمومی |
| GET | `/docs` | همین مستندات (خلاصه) |
| GET | `/sitemap.xml` | نقشه سایت |
| POST | `/uploads` | بارگذاری فایل (کارمند) |
| GET | `/placeholder?text=&seed=` | تصویر جانشین SVG |
