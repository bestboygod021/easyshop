# سیاست retention، درخواست حذف و audit log

## retention خودکار

پیش‌نمایش و job نگهداری در `server/src/services/data-retention.js` قرار دارد. سیاست‌های آغازین (قابل تنظیم با env) چنین‌اند:

| دادهٔ عملیاتی/تشخیصی | پیش‌فرض |
| --- | ---: |
| `login_attempts` | ۹۰ روز |
| `sms_otps` منقضی‌شده | ۳۰ روز |
| `refresh_tokens` لغوشده/منقضی | ۷ روز پس از cutoff |
| `payment_callback_events` | ۱۸۰ روز |
| `client_telemetry_errors` | ۳۰ روز |
| `aggregated_client_errors` | ۱۸۰ روز از آخرین مشاهده |
| `ai_logs` | ۹۰ روز |
| `notifications` | ۱۸۰ روز |
| `user_login_history` | ۱۸۰ روز |
| reset token منقضی | بلافاصله در اجرای job |

```bash
npm run db:retention:preview
# پس از privacy/legal review و تأیید سیاست محیط، با DATA_RETENTION_ENABLED=1:
npm run db:retention:apply
```

`DATA_RETENTION_ENABLED` پیش‌فرض **خاموش** است. با روشن‌کردنش، scheduler هنگام startup یک‌بار و سپس طبق `DATA_RETENTION_INTERVAL_MS` (حداقل یک دقیقه) اجرا می‌شود. ابتدا preview و backup/restore را انجام دهید. Job خروجی ردیفی را حذف می‌کند و summary غیرحساس را در audit chain ثبت می‌کند.

سفارش، پرداخت، refund، wallet ledger، فاکتور، `privacy_requests` و `audit_logs` عمداً در این job پاک نمی‌شوند. این فهرست retention حقوقی نهایی نیست: owner داده باید با counsel/قانون محلی و قرارداد providerها، سناریوهای legal hold، حذف account، مالیات و chargeback را تأیید و روزهای پیش‌فرض را تنظیم کند. prompt/responseهای `ai_generations` نیز عمداً خودکار حذف نمی‌شوند تا محتوای محصول بی‌اجازه از بین نرود؛ نیاز retention آن جداگانه بررسی شود.

## درخواست دسترسی/حذف کاربر

- کاربر واردشده می‌تواند `POST /api/account/privacy-requests` با `request_type: "access"` یا `"erasure"` ثبت کند؛ درخواست erasure برای re-authentication رمز فعلی می‌خواهد.
- `GET /api/account/privacy-requests` وضعیت درخواست‌های همان کاربر را نشان می‌دهد.
- مدیر از `GET /api/admin/privacy-requests` صف را می‌بیند و فقط گذار `pending → approved/rejected` و `approved → fulfilled` را ثبت می‌کند.
- approval به‌تنهایی حساب/سفارش را حذف نمی‌کند. اجرای دستی باید براساس retention/legal-hold runbook و دامنهٔ دادهٔ متصل/backup انجام شود؛ سپس مدیر وضعیت fulfilled و note ثبت می‌کند. endpoint حذف کامل account هنوز وجود ندارد و automatic erasure پیاده نشده است.

## زنجیرهٔ tamper-evident

هر `audit_logs` ورودی `chain_seq`, `previous_hash`, `entry_hash`, `key_version` دارد. payload canonical شامل actor/action/entity/meta/IP/timestamp است. در production هر entry با HMAC-SHA-256 و `AUDIT_LOG_HMAC_KEY_<VERSION>` امضا می‌شود؛ نسخه‌ها برای rotation در هر entry ذخیره می‌شوند. production بدون کلید HMAC حداقل ۳۲ بایتی رد می‌شود. رکوردهای legacy هنگام بازشدن DB به‌صورت اتمی به زنجیره وارد می‌شوند. مقدار قدیمی هر نسخه برای verify باید در SecretManager قابل‌دسترسی بماند:

```bash
# بررسی فقط‌خواندنی توسط مدیر
GET /api/admin/audit-logs/integrity
```

`audit_logs` از purge حذف نشده و endpoint عادی حذف/ویرایش برای آن اضافه نشده است. بااین‌حال، hash chain در همان SQLite **مقاومت در برابر دستکاری را تشخیص‌پذیر می‌کند، ولی WORM/immutability فیزیکی ایجاد نمی‌کند**؛ کسی که DB و HMAC key را باهم در اختیار بگیرد می‌تواند زنجیره را بازنویسی کند. برای استقلال trust domain، hash tip و log exports را دوره‌ای به SIEM/Object Lock جداگانه ارسال کنید و دسترسی حذف را از سرویس برنامه جدا نگه دارید. Exporter/WORM remote به این محیط متصل نیست.

## شواهد و محدودیت

Unit testها backfill، HMAC verification، tamper detection، rotation-version chain، preview/apply، حذف فقط دادهٔ مجاز، ثبت audit و privacy-request workflow را پوشش می‌دهند. Retention job پیش‌فرض خاموش است؛ production/legal policy، external WORM destination، key escrow و اجرای واقعی حذف حساب باید توسط owner محیط تأیید شود. تست محلی معادل audit حقوقی یا certification نیست.
