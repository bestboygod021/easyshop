# پایگاه داده: migrations، backup/restore و مسیر PostgreSQL

## وضعیت واقعی امروز

پایگاه دادهٔ عملیاتی هنوز SQLite است (`node:sqlite` و `DatabaseSync`). مسیرهای API از توابع sync و SQLهای مخصوص SQLite استفاده می‌کنند؛ بنابراین عوض‌کردن connection string یا نصب driver PostgreSQL مهاجرت واقعی نیست و می‌تواند transaction، قفل موجودی، پرداخت و صدها query را بشکند.

از این تغییر به بعد، `server/src/db/migrations.js` برای schema changeهای جدید ledger نسخه‌دار، checksum و اجرای تراکنشی دارد. ردیف `0000_legacy_schema_baseline` دیتابیس‌های قدیمی را baseline می‌کند؛ migrationهای `20261009_01_payment_callback_idempotency` و `20261009_02_audit_log_chain_and_privacy_requests` به‌ترتیب callback idempotency و audit/privacy schema را version می‌کنند. initializer قدیمی schema/columnها برای سازگاری با نسخه‌های SQLite موجود فعلاً باقی است؛ migrationهای تازه را در آن فهرست legacy اضافه نکنید.

### برنامهٔ cutover تدریجی به PostgreSQL

1. **Inventory و قرارداد داده:** فهرست تمام queryها، SQLite-specific SQLها (`INSERT OR REPLACE`, `datetime`, `json_extract`, placeholders و رفتار `RETURNING`) و transactionهای کالا/رزرو/پرداخت را بسازید؛ هر invariant مالی باید قبل از dual-write تعریف شود.
2. **مرز repository ناهمگام:** عملیات DB را از routeها جدا و interfaceهای domain-level برای catalog، cart/inventory، orders/payments و accounts بسازید. چون `DatabaseSync` blocking است، قرارداد async یک‌بار در مرز معرفی می‌شود؛ API و adapter SQLite تا پایان مهاجرت کار می‌کنند.
3. **PostgreSQL schema و ledger جدا:** bootstrap نسخه‌دارِ schema فعلی با ۹۵ جدول، migration ledger، checksum و advisory lock اضافه شده است. DDL از inventory مشترک SQLite تولید می‌شود و با PostgreSQL داخلی WASM (`PGlite`) اجرا/بررسی شده؛ این جایگزین PostgreSQL واقعی نیست. اجرای schema روی PostgreSQL واقعی در CI/staging، upgrade از snapshot و rollback-forward هنوز لازم است.
4. **مهاجرت دامنه‌ای:** ابتدا دادهٔ مرجع کم‌ریسک مثل catalog/settings، سپس سبد و حساب؛ آخر از همه موجودی و سفارش/پرداخت. برای هر مرحله backfill قابل resume، dual-read مقایسه‌ای و reconcile شمارش/جمع مالی اجرا شود؛ آدرس کارت/توکن پرداخت وارد backfill نشود.
5. **Cutover و بازگشت:** پس از دورهٔ shadow-read و تطابق invariants، feature flag هر دامنه را جابه‌جا کنید. نقطهٔ برگشت و حفظ write-order ثبت شود؛ بعد از اولین write فقط در Postgres، بازگشت به SQLite با کپی فایل ساده امن نیست.

**وضعیت مرحله‌ای، بدون ادعای cutover:** وابستگی `pg`، قرارداد ناهمگام `all/get/run/transaction`، facade سازگاری SQLite، migration runner نسخه‌دار و bootstrap کامل ۹۵ جدول PostgreSQL اکنون در repository هستند. آزمون schema از PGlite درون‌فرایندی استفاده می‌کند و adapter transactions همچنان fake-pool tests دارد؛ PostgreSQL server/network، TLS واقعی و rollback واقعی PostgreSQL در این workspace اجرا نشده‌اند. facade SQLite همچنان از `DatabaseSync` استفاده می‌کند و فقط API آن Promise-shaped است؛ queryها هنوز event loop را مسدود می‌کنند. همهٔ عملیات یک connection باید از facade عبور کنند؛ ترکیب آن با helperهای legacy مستقیم امن نیست. هیچ route یا domain از repository جدید استفاده نمی‌کند، importer/resume/reconciliation دادهٔ SQLite پیاده نشده و `DATABASE_DRIVER=postgres` برنامه را سوییچ نمی‌کند.

**پیش‌نیاز مرحلهٔ staging:** PostgreSQL قابل‌دسترسی از CI، role محدود به database/schema آزمایشی و TLS اجباری، URL فقط در secret store (نه Git/chat)، snapshot قابل‌بازیابی SQLite و تأیید جداگانهٔ non-production بودن مقصد. محیط فعلی PostgreSQL/`psql`/`initdb`/`pg_ctl` و Docker ندارد و URL/credential staging هم فراهم نیست؛ CI job با PostgreSQL سرویس‌محور تعریف شده اما هنوز اجرا/نتیجه‌اش بررسی نشده است. بنابراین migration زنده، upgrade از snapshot، reconcile، cutover یا restore واقعی تأیید نشده. پیش از production لازم است schemaهای کامل و immutable، upgrade test از snapshot واقعی، dual-read/reconciliation و دو recovery drill متوالی روی محیط ایزوله سبز شوند.

### Gate تمرین PostgreSQL در staging

`npm run --silent ops:preflight` یک گزارش محلیِ بدون اتصال شبکه می‌سازد. CI اکنون job تست روی PostgreSQL سرویس‌محورِ موقت دارد؛ این staging نیست و تا اجرای workflow نتیجه‌ای تأیید نشده است. فرمان `npm run db:postgres:prepare -- --apply --confirm-staging` برای schema staging، `PG_REHEARSAL_DATABASE_URL` را از secret store می‌گیرد و فقط `sslmode=verify-ca` یا ترجیحاً `verify-full` می‌پذیرد؛ علاوه بر آن `PG_REHEARSAL_CONFIRM_STAGING=1` و flag فرمان نیاز است. URL/نام کاربری/گذرواژه چاپ نمی‌شوند. این تأییدها self-attestation مقصد هستند و connection isolation را خودکار ثابت نمی‌کنند.

در وضعیت فعلی preflight عمداً PostgreSQL را **blocked** گزارش می‌کند: driver، قرارداد async، schema bootstrap و PGlite DDL smoke test موجودند؛ importer/resume/reconciliation داده، PostgreSQL واقعی، staging target/TLS confirmation و cutover فعال نیستند. حتی فراهم‌کردن URL به‌تنهایی مجوز cutover نیست.

`npm run db:postgres:prepare` فقط schema plan چاپ می‌کند و شبکه نمی‌زند. اجرای staging schema به هر دو تأیید دستی زیر و TLS با بررسی CA/نام میزبان نیاز دارد؛ پیش از آن مالک platform باید non-production بودن endpoint را مستقل تأیید کند:

```bash
# Runner environment must already contain PG_REHEARSAL_DATABASE_URL from the secret store.
# Do not inline the DSN in shell history, CI output, or repository files.
PG_REHEARSAL_CONFIRM_STAGING=1 npm run db:postgres:prepare -- --apply --confirm-staging
```

این فرمان فقط یک schema خالی یا schema از قبل ثبت‌شدهٔ EasyShop را می‌پذیرد؛ DSN چاپ نمی‌شود. فرمان data copy انجام نمی‌دهد و اپلیکیشن/feature flag را به PostgreSQL سوییچ نمی‌کند. تمرین staging بعدی باید importer قابل resume، مقایسهٔ شمارش/جمع مالی، سیاست داده‌های شخصی/پرداخت و rollback-forward/PITR روی PostgreSQL واقعی را پوشش دهد.

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
