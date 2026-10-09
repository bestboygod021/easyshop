# بستهٔ بررسی امنیت پرداخت و callback

## هدف و محدوده

این بسته برای بررسی مستقل توسط متخصص پرداخت/امنیت آماده شده است. محدودهٔ کد شامل آغاز checkout، ذخیرهٔ مبلغ/authority، callbackهای provider، verify سمت سرور، replay/idempotency، settle سفارش/کیف پول، حالت manual review، reconciliation و refund است. بررسی مستقل هنوز انجام نشده و این سند گواهی PCI، penetration test شخص ثالث یا approval بانک نیست.

## کنترل‌های موجود در کد

- callback مرورگر به‌تنهایی مدرک پرداخت نیست؛ برای authority ناشناخته سفارش settle نمی‌شود و فقط callback event ثبت می‌شود.
- نتیجهٔ OK از callback تنها آغازگر server-to-server verification است؛ provider و amount با payment ثبت‌شده مقایسه می‌شوند.
- کلید callback از provider و پارامترهای canonical ساخته می‌شود؛ delivery تکراری همان ردیف را با counter به‌روزرسانی می‌کند.
- checkout از idempotency key ذخیره‌شده و unique index استفاده می‌کند؛ درخواست تکراری برای همان کاربر/مهمان پاسخ قبلی را برمی‌گرداند.
- settlement و update سفارش/پرداخت در transaction انجام می‌شود. پرداخت دیرهنگام، capture دوم، mismatch یا سفارش غیرقابل‌پرداخت به بررسی دستی می‌رود؛ callback ناشناس سفارش جدید نمی‌سازد.
- بازپرداخت capture تکراری از مسیر بررسی مدیریتی انجام می‌شود و idempotency در wallet transaction مانع شارژ کیف پول دوباره است.
- reconciliation نتیجه‌های `matched`، `amount_mismatch` و `missing_locally` را جدا می‌کند؛ دادهٔ فایل بانک باید فقط از مسیر مجاز و کنترل‌شده وارد شود.

## آزمون‌های regression

```bash
node --test server/test/payments.test.js
```

این suite از gateway fetch mock درون‌فرایندی استفاده می‌کند و موارد زیر را بررسی می‌کند: callback یتیم/authority ناشناخته، عدم verify یا credit ناشی از آن، verify سمت سرور، checkout replay، callback تکراری پس از capture، amount mismatch، reconciliation با orphan و mismatch، بازپرداخت capture تکراری و جلوگیری از credit تکراری کیف پول. این شواهد، رفتار mock را نشان می‌دهند؛ اتصال واقعی به sandbox provider را اثبات نمی‌کنند.

## Preflight پیکربندی sandbox

برای بررسی fail-closed مقادیر غیرمحرمانهٔ provider، `PUBLIC_URL`، allowlist و فایل/متغیر credential از این فرمان استفاده کنید:

```bash
npm run --silent ops:preflight
```

این ابزار هیچ درخواست شبکه‌ای به درگاه نمی‌فرستد و credential/DSN را در JSON چاپ نمی‌کند. اگر پیکربندی کامل باشد، نتیجه فقط `configured_unverified` است؛ آغاز تراکنش sandbox، دسترسی عمومی callback، تطبیق statement یا sign-off reviewer را تأیید نمی‌کند. provider باید صریح انتخاب شود (`PAYMENT_SANDBOX_PROVIDER`)، sandbox آن `1` باشد، mock خاموش باشد و `PUBLIC_URL` روی HTTPS staging تنظیم شود.

## Checklist برای reviewer مستقل

- مقایسهٔ protocol رسمی هر provider با `gatewayCallbackParameters` و `verifyGatewayPayment`، خصوصاً currency/unit، rounding، status code و ref ID.
- بررسی امضای callback، TLS و allowlist مقصدهای خروجی؛ برای هر provider مشخص شود امضای قابل‌اعتبارسنجی هست یا صرفاً verify API مرجع است.
- raceهای هم‌زمان callback در چند process، replay با authority/status مختلف، invoice/order mismatch، verify timeout و retry پس از قطعی DB را روی staging واقعی اجرا کنید.
- بررسی nonce/idempotency retention، clock skew، late payment بعد از cancellation/stock release و capture دوم، و رویهٔ refund انسانی.
- threat-model کردن abuse از طریق redirect/callback، SSRF/host allowlist، افشای provider error/PII در logs، rate limits و secret rotation.
- تطبیق دفتر پرداخت، bank settlement و ledger کیف پول با statement واقعی؛ هر اختلاف باید قابل‌ردیابی و قابل‌توقف باشد.
- انجام security code review و آزمون sandbox با merchant آزمایشی مستقل؛ گزارش یافته‌ها، severity، remediation و sign-off به مخزن/فرایند release پیوست شود.

## وضعیت evidence و محدودیت‌های فعلی

هیچ credential یا endpoint sandbox واقعی به این workspace ارائه نشده است؛ environment/staging عمومی و reviewer مستقل هم متصل نیستند. محیط فعلی فقط unit/integration mock را اجرا می‌کند. بنابراین sandbox transaction، callback reachability، statement واقعی، تطبیق PCI scope و reviewer sign-off انجام نشده و gate **باز** است. قالب ثبت evidence و reviewer decision در [`evidence/PAYMENT_SANDBOX_REVIEW_TEMPLATE.md`](./evidence/PAYMENT_SANDBOX_REVIEW_TEMPLATE.md) با وضعیت صریح `NOT_RUN` قرار دارد. اطلاعات کارت خام نباید وارد EasyShop یا این تست‌ها شود؛ محدودهٔ PCI را با acquirer و متخصص واجدصلاحیت تعیین کنید.
