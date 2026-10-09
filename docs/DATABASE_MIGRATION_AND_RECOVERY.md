# پایگاه داده: migrations، backup/restore و مسیر PostgreSQL

## وضعیت واقعی امروز

پایگاه دادهٔ عملیاتی هنوز SQLite است (`node:sqlite` و `DatabaseSync`). مسیرهای API از توابع sync و SQLهای مخصوص SQLite استفاده می‌کنند؛ بنابراین عوض‌کردن connection string یا نصب driver PostgreSQL مهاجرت واقعی نیست و می‌تواند transaction، قفل موجودی، پرداخت و صدها query را بشکند.

از این تغییر به بعد، `server/src/db/migrations.js` برای schema changeهای جدید ledger نسخه‌دار، checksum و اجرای تراکنشی دارد. ردیف `0000_legacy_schema_baseline` دیتابیس‌های قدیمی را baseline می‌کند؛ migrationهای `20261009_01_payment_callback_idempotency` و `20261009_02_audit_log_chain_and_privacy_requests` به‌ترتیب callback idempotency و audit/privacy schema را version می‌کنند. initializer قدیمی schema/columnها برای سازگاری با نسخه‌های SQLite موجود فعلاً باقی است؛ migrationهای تازه را در آن فهرست legacy اضافه نکنید.

### برنامهٔ cutover تدریجی به PostgreSQL

1. **Inventory و قرارداد داده:** فهرست تمام queryها، SQLite-specific SQLها (`INSERT OR REPLACE`, `datetime`, `json_extract`, placeholders و رفتار `RETURNING`) و transactionهای کالا/رزرو/پرداخت را بسازید؛ هر invariant مالی باید قبل از dual-write تعریف شود.
2. **مرز repository ناهمگام:** عملیات DB را از routeها جدا و interfaceهای domain-level برای catalog، cart/inventory، orders/payments و accounts بسازید. چون `DatabaseSync` blocking است، قرارداد async یک‌بار در مرز معرفی می‌شود؛ API و adapter SQLite تا پایان مهاجرت کار می‌کنند.
3. **PostgreSQL schema و ledger جدا:** bootstrap نسخه‌دارِ schema فعلی با ۹۵ جدول، migration ledger، checksum و advisory lock اضافه شده است. DDL با PGlite و نیز PostgreSQL 16 واقعی در CI سرویس‌محور بررسی شد؛ run [37964328774](https://github.com/bestboygod021/easyshop/actions/runs/37964328774) شامل schema، ledger، backfill پرداخت، idempotency و rollback موفق بود. این job موقت CI، staging/TLS واقعی یا import snapshot را اثبات نمی‌کند؛ آن‌ها جداگانه لازم‌اند.
4. **مهاجرت دامنه‌ای:** ابتدا دادهٔ مرجع کم‌ریسک مثل catalog/settings، سپس سبد و حساب؛ آخر از همه موجودی و سفارش/پرداخت. برای هر مرحله backfill قابل resume، dual-read مقایسه‌ای و reconcile شمارش/جمع مالی اجرا شود؛ آدرس کارت/توکن پرداخت وارد backfill نشود.
5. **Cutover و بازگشت:** پس از دورهٔ shadow-read و تطابق invariants، feature flag هر دامنه را جابه‌جا کنید. نقطهٔ برگشت و حفظ write-order ثبت شود؛ بعد از اولین write فقط در Postgres، بازگشت به SQLite با کپی فایل ساده امن نیست.

**وضعیت مرحله‌ای، بدون ادعای cutover:** وابستگی `pg`، قرارداد ناهمگام `all/get/run/transaction`، facade سازگاری SQLite، migration runner نسخه‌دار و bootstrap کامل ۹۵ جدول PostgreSQL اکنون در repository هستند. ابزار `tools/sqlite-to-postgres-migrate.mjs` نیز plan آفلاین، import دسته‌ای قابل resume، حذف credentialها/داده‌های کوتاه‌عمر، backfill settlement marker، digest تطبیقی هر جدول و reconciliation جمع مالی order/payment دارد. تست‌های مصنوعی PGlite شامل توقف/ادامه، redaction و FK خودارجاعی‌اند؛ workflow [37970262910](https://github.com/bestboygod021/easyshop/actions/runs/37970262910) نیز با job جداگانهٔ importer روی PostgreSQL 16 موقت سبز شد. این تست از fixture مصنوعی استفاده می‌کند و staging/TLS واقعی یا import snapshot production را اثبات نمی‌کند. facade SQLite همچنان از `DatabaseSync` استفاده می‌کند و فقط API آن Promise-shaped است؛ queryها هنوز event loop را مسدود می‌کنند. همهٔ عملیات یک connection باید از facade عبور کنند؛ ترکیب آن با helperهای legacy مستقیم امن نیست. هیچ route یا domain از repository جدید استفاده نمی‌کند و `DATABASE_DRIVER=postgres` برنامه را سوییچ نمی‌کند. `server/src/db/shadow-read.js` اکنون harness اختیاری parity دارد: مقدار SQLite را primary نگه می‌دارد، query جفت‌شده را در پس‌زمینه می‌سنجد و فقط HMAC-SHA-256 با کلید تصادفی درون‌حافظه‌ایِ همان نمونه، شمار ردیف و کد خطای redacted را به callback می‌دهد. این harness به route/domain وصل نشده، `PG_SHADOW_READ_ENABLED` پیش‌فرض خاموش است و تست‌هایش فقط fake repository را به‌کار می‌برند؛ هیچ parity واقعی PostgreSQL را ثابت نمی‌کنند.

**پیش‌نیاز مرحلهٔ staging:** PostgreSQL ایزوله با role محدود و TLS با اعتبارسنجی CA/نام میزبان، URL فقط در secret store (نه Git/chat)، snapshot مستقل و consistency-checked که مالک داده آن را پیشاپیش برای staging پاک‌سازی/ناشناس‌سازی کرده باشد، و تأیید جداگانهٔ non-production بودن مقصد. importer محتویات متن آزاد را خودکار anonymize نمی‌کند؛ پرچم sanitization صرفاً تأیید operator است. CI [37970262910](https://github.com/bestboygod021/easyshop/actions/runs/37970262910) با import و reconciliation fixture مصنوعی روی PostgreSQL 16 موقت سبز شد؛ هیچ staging واقعی را آزمایش نکرد. در این workspace endpoint/credential staging، Docker و سرویس PostgreSQL محلی فراهم نیست. بنابراین import واقعی snapshot، reconciliation staging، cutover و restore واقعی staging هنوز تأیید نشده‌اند. پیش از production همچنان dual-read/reconciliation دامنه‌ای و دو recovery drill متوالی روی محیط ایزوله لازم‌اند.

### Gate تمرین PostgreSQL در staging

`npm run --silent ops:preflight` یک گزارش محلیِ بدون اتصال شبکه می‌سازد. CI run [37970262910](https://github.com/bestboygod021/easyshop/actions/runs/37970262910) job تست روی PostgreSQL سرویس‌محورِ موقت را سبز کرد؛ این staging نیست و اجرای آن اتصال staging ندارد. فرمان `npm run db:postgres:prepare -- --apply --confirm-staging` برای schema staging، `PG_REHEARSAL_DATABASE_URL` را از secret store می‌گیرد و فقط `sslmode=verify-ca` یا ترجیحاً `verify-full` می‌پذیرد؛ علاوه بر آن `PG_REHEARSAL_CONFIRM_STAGING=1` و flag فرمان نیاز است. URL/نام کاربری/گذرواژه چاپ نمی‌شوند. این تأییدها self-attestation مقصد هستند و connection isolation را خودکار ثابت نمی‌کنند.

در وضعیت فعلی preflight عمداً PostgreSQL را **blocked** گزارش می‌کند: driver، قرارداد async، schema bootstrap و importer/reconciliation تست‌شده با دادهٔ مصنوعی موجودند؛ CI برای importer روی PostgreSQL واقعیِ موقت تنظیم شده، ولی staging target/TLS rehearsal و cutover اجرا نشده‌اند. shadow-read harness هم فقط قراردادی است؛ به domain وصل نیست، اجرای parity تأیید نشده و روشن‌کردن `PG_SHADOW_READ_ENABLED=1` بدون wiring خودش blocker است. حتی فراهم‌کردن URL به‌تنهایی مجوز cutover نیست.

`npm run db:postgres:prepare` فقط schema plan چاپ می‌کند و شبکه نمی‌زند. اجرای staging schema به هر دو تأیید دستی زیر و TLS با بررسی CA/نام میزبان نیاز دارد؛ پیش از آن مالک platform باید non-production بودن endpoint را مستقل تأیید کند:

```bash
# Runner environment must already contain PG_REHEARSAL_DATABASE_URL from the secret store.
# Do not inline the DSN in shell history, CI output, or repository files.
PG_REHEARSAL_CONFIRM_STAGING=1 npm run db:postgres:prepare -- --apply --confirm-staging
```

این فرمان فقط یک schema خالی یا schema از قبل ثبت‌شدهٔ EasyShop را می‌پذیرد؛ DSN چاپ نمی‌شود. فرمان data copy انجام نمی‌دهد و اپلیکیشن/feature flag را به PostgreSQL سوییچ نمی‌کند.

### Plan و import آفلاین/قابل resume

ابزار import به‌طور پیش‌فرض فقط plan می‌سازد و به PostgreSQL وصل نمی‌شود. برای دیدن inventory یک snapshot consistency-checked:

```bash
npm run db:postgres:import -- --source /secure/path/easyshop-sanitized.sqlite
```

Apply فقط به یک snapshot **جدا از دیتابیس فعال** و از پیش پاک‌سازی/ناشناس‌سازی‌شده، target خالی staging، role محدود، TLS با `sslmode=verify-ca` یا `verify-full`، و دو تأیید جدا نیاز دارد:

```bash
# Values are injected by the approved secret/config store; never inline the DSN.
PG_REHEARSAL_CONFIRM_STAGING=1 \
PG_REHEARSAL_CONFIRM_SANITIZED_SNAPSHOT=1 \
npm run db:postgres:import -- --source /secure/path/easyshop-sanitized.sqlite \
  --apply --confirm-staging --confirm-sanitized-snapshot
```

Snapshot به‌صورت read-only باز می‌شود؛ فایل فعال `easyshop.db`، symlink و snapshot دارای sidecarهای WAL/SHM/journal رد می‌شوند. plan فقط تعداد رکوردها، hash و نام جدول/ستون‌های policy را چاپ می‌کند، نه مقدار ردیف‌ها. Import برای هر snapshot SHA-256 یک progress ledger دارد؛ resume فقط با همان فایل/hash مجاز است و target دارای دادهٔ قبلی یا snapshot دیگری رد می‌شود. پایان کار row count و digest هر جدول، جمع مالی orders بر اساس ارز/status و payments بر اساس status را تطبیق می‌دهد و backfill marker پرداخت را اجرا می‌کند؛ **هیچ cutover یا تغییر `DATABASE_DRIVER` انجام نمی‌دهد**.

سیاست محافظه‌کارانه، `api_key`ها، password-reset/device/guest/pickup/payment tokens، شناسه/محتوای provider و card fields را حذف یا invalidate می‌کند؛ password hash حساب‌های کپی‌شده به marker نامعتبر staging تبدیل می‌شود. refresh token/OTP، checkout و callbackهای کوتاه‌عمر، passkey، settings، audit/AI logهای بررسی‌نشده، outbox وب‌هوک و چند جدول دارای credential/PII حذف می‌شوند تا credentialها دوباره provision و audit chain تازه ساخته شود. فهرست دقیق در `server/src/db/sqlite-postgres-import.js` است. این policy متن آزاد، نشانی، شماره تلفن، ایمیل و سایر PII عمومی را از snapshot پاک‌سازی نمی‌کند؛ مسئول داده باید پیش از اجرای import snapshot را مستقل sanitize و تأیید کند. flag sanitization attestation است، نه تشخیص خودکار محتوای PII.

تست محلی `npm run test:postgres-import` از دادهٔ fixture مصنوعی و PGlite استفاده می‌کند. CI run [37970262910](https://github.com/bestboygod021/easyshop/actions/runs/37970262910) هم importer/reconciliation را روی PostgreSQL 16 سرویس‌محور با موفقیت اجرا کرد. هیچ snapshot یا اتصال staging در این workspace فراهم نشده، بنابراین این ابزار تا اینجا روی staging اجرا نشده است.

## Snapshot پشتیبان SQLite

`server/src/db/backup.js` با دستور `VACUUM INTO` از وضعیت commit‌شدهٔ دیتابیس snapshot سازگار با WAL می‌سازد؛ سپس `PRAGMA integrity_check`، اندازه، نسخه‌های ledger و SHA-256 را در manifest می‌نویسد. در production خروجی با AES-256-GCM رمز می‌شود و verify/restore هر دو hash و authentication tag را بررسی می‌کنند. فرمان‌های verify/restore drill و off-site/Object Lock در [`BACKUP_AND_RECOVERY.md`](./BACKUP_AND_RECOVERY.md) آمده‌اند.

```bash
# BACKUP_DIR را روی volume/object store مستقل از DATA_DIR تنظیم کنید.
BACKUP_DIR=/mnt/easyshop-backups npm run db:backup

node server/src/db/backup.js verify /mnt/easyshop-backups/easyshop-<timestamp>-<pid>.manifest.json
node server/src/db/backup.js restore \
  /mnt/easyshop-backups/easyshop-<timestamp>-<pid>.manifest.json \
  /mnt/restore-drill/easyshop.db
```

Restore فقط به مسیر جدید انجام می‌شود و فایل موجود را overwrite نمی‌کند. ابتدا manifest/hash و integrity بررسی می‌شوند؛ پس از restore، integrity دوباره اجرا می‌شود. برای تعویض production DB، API را در maintenance mode متوقف کنید، WAL/SHM باقی‌مانده را با روش اپراتوری بررسی کنید و فایل restore‌شده را پس از تایید و backup فعلی، به‌صورت کنترل‌شده جایگزین کنید.

نمونهٔ CI با SQLite WAL، تغییر DB بعد از snapshot، restore، checksum mismatch و path traversal را در `server/test/database-recovery.test.js` می‌آزماید. `VACUUM INTO` snapshot point-in-time می‌دهد، **نه PITR/آرشیو پیوستهٔ WAL**. تا وقتی schedule و off-site replication راه‌اندازی نشده، RPO برابر فاصلهٔ آخرین snapshot موفق است؛ snapshot تنها روی همان دیسک، disaster backup محسوب نمی‌شود.

## هدف production برای PITR پس از PostgreSQL cutover

برای PostgreSQL مقصد، پیشنهاد عملیاتی: `pg_basebackup`/نسخهٔ base backup منظم، WAL archive پیوسته به object storage رمز‌شده و versioned (برای نمونه WAL-G/Barman)، retention جداگانه، checksum/immutability، و بازیابی با `recovery_target_time`. هدف اولیهٔ پیشنهادی RPO ≤ 5 دقیقه و RTO ≤ 60 دقیقه است و باید بر اساس هزینه/بار واقعی تأیید شود.

پیش از cutover، ماهانه restore کامل در شبکهٔ ایزوله انجام دهید: انتخاب timestamp، replay WAL، اجرای migration/health check، تطبیق order/payment totals و ثبت زمان واقعی RPO/RTO. production cutover تا موفقیت دو drill متوالی و تایید reconcile مالی متوقف بماند.
