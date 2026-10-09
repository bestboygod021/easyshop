# پشتیبان‌گیری، رمزگذاری خارج‌سرور و تمرین بازیابی

## رفتار پیاده‌شده

`server/src/db/backup.js` از SQLite با `VACUUM INTO` snapshot سازگار با WAL می‌سازد و `PRAGMA integrity_check`، SHA-256، نسخه‌های migration و اندازه را در manifest ثبت می‌کند. در حالت رمزگذاری، فایل نهایی پسوند `.db.enc` دارد و با **AES-256-GCM** و کلید مشتق‌شده از `BACKUP_ENCRYPTION_KEY` با scrypt رمز می‌شود. salt و IV تصادفی برای هر snapshot هستند؛ manifest هم hash فایل رمز‌شده و هم hash plaintext را نگه می‌دارد. صحت GCM در verify/restore بررسی می‌شود.

در production، راه‌اندازی بدون `BACKUP_ENCRYPTION_ENABLED=1` و یک `BACKUP_ENCRYPTION_KEY` حداقل ۳۲ بایتی رد می‌شود. کلید باید یکتا، تصادفی، بیرون از مخزن و جدا از فایل‌های پشتیبان باشد. کلید را به خط فرمان، ticket، چت یا log نفرستید. SecretManager فعلی کلید را از environment یا فایل mountشده می‌خواند؛ اتصال مستقیم به KMS/Vault هنوز فراهم نشده است.

```bash
# ساخت snapshot رمز‌شده؛ BACKUP_DIR باید volume مستقل از DATA_DIR باشد
npm run db:backup

# بررسی manifest، ciphertext، کلید GCM و سلامت SQLite
npm run db:backup:verify -- /mnt/easyshop-backups/<snapshot>.manifest.json

# restore drill ایزوله؛ بازیابی در scratch و پاک‌سازی پس از آزمون
npm run db:backup:drill -- /mnt/easyshop-backups/<snapshot>.manifest.json

# بازیابی عملیاتی به مسیر تازه (هرگز روی DB فعال overwrite نمی‌کند)
node server/src/db/backup.js restore \
  /mnt/easyshop-backups/<snapshot>.manifest.json \
  /mnt/restore-check/easyshop-restored.db
```

Restore drill نیازمند کلید رمزگذاری در SecretManager/environment است. عملیات restore عادی نیز فقط به مسیر جدید اجازه می‌دهد؛ پیش از جایگزینی production DB باید اپ متوقف، فایل بازیابی‌شده مستقل بررسی، migration/version سازگار و rollback برنامه‌ریزی شود.

## Replication خارج از سرور و Object Lock

اپلیکیشن خودش object-storage endpoint یا credential ندارد و در این محیط مقصد خارج‌سرور موجود نیست. ابزار اختیاری `tools/publish-backup-offsite.mjs` پس از verify محلی، فقط snapshot رمز‌شده را با `rclone copyto --immutable` می‌فرستد، مقصد را با `rclone check` مقایسه می‌کند و manifest را در پایان منتشر می‌کند:

```bash
BACKUP_MANIFEST=/mnt/easyshop-backups/<snapshot>.manifest.json \
BACKUP_REMOTE='s3:easyshop-worm/production' \
BACKUP_OBJECT_LOCK_CONFIRMED=1 \
npm run db:backup:publish
```

`rclone` و remote آن باید خارج از برنامه، با role حداقل‌دسترسی و secret file/instance identity پیکربندی شوند. پیش از اجرا، versioning و **Object Lock/WORM با بازهٔ نگهداری مصوب** را در ارائه‌دهنده فعال کنید. `--immutable` فقط از overwrite در rclone جلوگیری می‌کند و جایگزین Object Lock نیست؛ اسکریپت سیاست bucket را مستقلاً بررسی نمی‌کند و مقدار `BACKUP_OBJECT_LOCK_CONFIRMED=1` تأیید اپراتور است. خروجی موفق local test یا اجرای `rclone check` به‌تنهایی اثبات immutable بودن مقصد نیست.

## Runbook و شواهد

1. Snapshotهای رمز‌شده را به volume مستقل و سپس مقصد خارج‌سرور منتقل کنید؛ دسترسی delete/shorten-retention را از حساب برنامه جدا کنید.
2. روزانه بررسی کنید که manifest و ciphertext هر دو در remote حاضرند؛ alert برای backup age/replication lag بسازید.
3. ماهانه و پس از تغییر schema، یک snapshot را در محیط ایزوله restore کنید؛ اندازه‌گیری و ثبت RPO/RTO و نتیجهٔ آزمون به مسئولیت اپراتور است.
4. برای DR واقعی، دادهٔ restore شده را با نسخهٔ اپلیکیشن و کلیدهای متناظر اجرا و sanity check سفارش/پرداخت را انجام دهید. این drill محلی SQLite را باز می‌کند، اما جایگزین staging واقعی یا تأیید انسانی نیست.
5. قبل از rotation کلید backup، طراحی key-ring/برچسب‌گذاری و نگهداری کلیدهای قدیمی تا پایان عمر همهٔ snapshotها لازم است؛ کد فعلی یک کلید فعال را برای verify/restore می‌گیرد و rotation خودکار backup-key ندارد.

## مرز شواهد این تغییر

رمزگذاری AES-GCM، checksum، integrity check، restore به مقصد تازه، رد کلید نادرست و restore drill ایزوله با آزمون‌های محلی پوشش داده می‌شوند. **هیچ object storage، KMS/Vault، credential remote، Object Lock واقعی یا recovery target/staging به این workspace متصل نشده است**؛ بنابراین backup خارج‌سرور و immutability عملیاتی نشده و ادعای موفقیت DR production وجود ندارد.
