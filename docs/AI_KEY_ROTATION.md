# چرخهٔ عمر و چرخش کلیدهای AI

## قالب و نگهداری

کلیدهای provider در SQLite با AES-256-GCM رمز می‌شوند. envelope جدید `enc:v2:<key-version>:...` نسخهٔ کلید را همراه ciphertext ثبت می‌کند؛ خواندن envelope قدیمی `enc:v1:` و migration مقدار plaintext قدیمی برای سازگاری حفظ شده است. کلید فعال از `AI_KEY_ENCRYPTION_KEY_VERSION` و secret نام‌گذاری‌شدهٔ `AI_KEY_ENCRYPTION_KEY_V1`, `AI_KEY_ENCRYPTION_KEY_V2`, ... خوانده می‌شود؛ برای `v1`، نام قدیمی `AI_KEY_ENCRYPTION_KEY` نیز fallback است. مقدار کلید باید حداقل ۳۲ بایت باشد.

SecretManager موجود فایل mountشده یا environment را با cache محدود می‌خواند؛ integration مستقیم Vault/KMS و rotation provider در این کد برقرار نیست. در production، فایل secret را با مجوز محدود به process بدهید و مقدار secret را در repo، CLI args، log، ticket یا چت ثبت نکنید.

## رویهٔ rotation

Rotation را در پنجرهٔ نگهداری اجرا کنید و همهٔ instanceهای نویسنده را متوقف/قفل کنید تا UI کلید قدیمی را هم‌زمان ذخیره نکند.

1. از دیتابیس snapshot رمز‌شده بگیرید؛ manifest آن را verify کنید. کلید backup مستقل از کلید AI است.
2. در secret manager، secretهای موقت `AI_KEY_ENCRYPTION_KEY_OLD` و `AI_KEY_ENCRYPTION_KEY_NEW` را بسازید. نسخه‌های `AI_KEY_ENCRYPTION_KEY_OLD_VERSION` و `AI_KEY_ENCRYPTION_KEY_NEW_VERSION` را تنظیم کنید؛ پیش‌فرض‌ها `v1` و `v2` هستند. `AI_KEY_ROTATION_BACKUP_MANIFEST` فقط مسیر manifest است، نه secret.
3. job را روی همان database، با write traffic متوقف، اجرا کنید:

```bash
node server/src/services/ai/rotate-keys.js
```

اسکریپت ابتدا backup را verify می‌کند، سپس تمام ciphertextها را preflight/decrypt و دوباره با نسخهٔ مقصد encrypt می‌کند. عملیات DB اتمی است؛ مقدار secret در خروجی چاپ نمی‌شود. اجرای مجدد پس از rotation موفق idempotent است؛ نسخهٔ ناشناخته یا کلید اشتباه پیش از write رد می‌شود.

4. پس از موفقیت، secret جدید را با نام `AI_KEY_ENCRYPTION_KEY_V2` mount کنید، `AI_KEY_ENCRYPTION_KEY_VERSION=v2` را فعال کنید و همهٔ instanceها را restart کنید.
5. health ارائه‌دهنده‌های AI و درخواست آزمایشی کم‌خطر را بررسی کنید؛ endpoint مدیریتی `/api/ai/health` فقط readiness را می‌سنجد و کلید را افشا نمی‌کند.
6. کلید قدیمی را تا پایان backup/rollback retention حفظ کنید. backup پیش از rotation هنوز ciphertext نسخهٔ قدیمی دارد؛ حذف زودهنگام کلید قدیمی می‌تواند restore آن snapshotها را غیرممکن کند. پس از انقضای تمام snapshotهای نیازمند آن نسخه و تصویب rollback، secret قدیمی را از secret manager حذف و audit کنید.

برای نسخهٔ بعدی، نسخهٔ مقصد جدید (`v3` و نام secret متناظر) انتخاب شود؛ نسخه را برای استفادهٔ مجدد تغییر ندهید. کلید قدیمی و جدید را به ابزار فقط از secret manager/file mount بدهید، نه از command-line arguments.

## مرزهای عملیاتی

آزمون‌های unit، چرخش transactional و retry در `server/test/ai-key-crypto.test.js` پوشش داده می‌شوند. اجرای rotation روی دیتابیس production/staging یا اتصال به Vault/KMS در این workspace رخ نداده است؛ اپراتور باید دسترسی secret store، snapshot فعلی، maintenance window و restore plan را فراهم کند.
