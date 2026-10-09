# دروازه‌های آمادگی production و تمرین staging

## هدف و مرز اجرا

این runbook پنج gate را در یک محل جمع می‌کند: کیفیت CI، آمادگی مهاجرت PostgreSQL، secret mount مبتنی بر Vault/KMS، sandbox واقعی پرداخت، و recovery/canary در محیط staging. صرف تأیید پیشنهادها یا سبز بودن تست محلی مجوز cutover، دریافت وجه واقعی، انتشار production یا تأیید reviewer نیست.

برای snapshot محلی از وضعیت تنظیمات اجرا کنید:

```bash
npm run --silent ops:preflight
```

فرمان فقط فایل‌ها، source code و متغیرهای محیطی را می‌خواند؛ **هیچ اتصال شبکه‌ای به PostgreSQL، Vault/KMS، درگاه، object storage، staging یا traffic router نمی‌زند**. گزارش JSON مقادیر secret/DSN را چاپ نمی‌کند. Exit code برابر ۲ یعنی دست‌کم یک gate blocked یا unverified است؛ این فرمان عمداً به‌تنهایی نمی‌تواند وضعیت production را `ready` اعلام کند.

## ۱) کیفیت و CI

Workflow اصلی در `.github/workflows/ci.yml` اکنون ESLint، preflight regression tests، تست بک‌اند و build وب را اجرا می‌کند. اجرای محلی:

```bash
npm run lint
npm run test:ops-preflight
npm run test:container-image
npm run test:release-evidence
npm run test:db-isolation
npm run test:vault-contract
npm run test:shadow-read
npm run test:postgres-staging
npm run test:postgres-import
npm test
npm run build
```

قواعد ESLint هسته روی فایل‌های first-party فعال‌اند؛ `no-unused-vars` برای `server/src` و قواعد `rules-of-hooks`/`exhaustive-deps` برای وب نیز در CI اجرا می‌شوند. اکنون `npm run lint` با صفر warning الزام CI است؛ این gate جای code review، type checking یا امنیت‌سنجی نیست.

## ۲) PostgreSQL

در این مرحله driver `pg`، repository ناهمگام اختیاری، facade سازگاری SQLite، runner نسخه‌دار/checksumدار و bootstrap DDL کامل ۹۵ جدول وجود دارند. ابزار snapshot importer نیز plan آفلاین، batch/resume، redaction credentialها، payment backfill، digest ردیفی و reconciliation جمع مالی را پیاده می‌کند. تست‌های fixture مصنوعی با PGlite محلی و CI run [37970262910](https://github.com/bestboygod021/easyshop/actions/runs/37970262910) روی PostgreSQL 16 موقت سبز شده‌اند؛ fixture/CI staging واقعی نیستند. API همچنان helperهای sync و `DatabaseSync` دارد و هیچ domain به repository PostgreSQL وصل نشده، پس gate **مسدود** می‌ماند. `ShadowReadHarness` یک قرارداد مقایسهٔ اختیاری/پس‌زمینه‌ای است که به domain وصل نشده و خاموش می‌ماند؛ تستش فقط fake repository را می‌آزماید و preflight اجرای parity را تأیید نمی‌کند. مقصد staging را فقط پس از تأیید mapping، snapshot پاک‌سازی‌شده و مسیر بازگشت آماده کنید:

```dotenv
PG_REHEARSAL_DATABASE_URL=postgresql://<role>:<secret>@<staging-host>/<db>?sslmode=verify-full
PG_REHEARSAL_CONFIRM_STAGING=1
PG_REHEARSAL_CONFIRM_SANITIZED_SNAPSHOT=1
```

URL را فقط از secret store در محیط runner تزریق کنید؛ در `.env` commitشده، CI log، issue، گزارش preflight یا چت ثبت نکنید. `PG_REHEARSAL_CONFIRM_STAGING=1` و `--confirm-staging` self-attestation هستند، نه تشخیص خودکار production/non-production. `npm run db:postgres:prepare -- --apply --confirm-staging` فقط schema را روی هدف خالی/ثبت‌شده ایجاد می‌کند. `npm run db:postgres:import -- --source <sanitized-snapshot>` فقط plan محلی می‌دهد؛ Apply به `--apply --confirm-staging --confirm-sanitized-snapshot` نیز نیاز دارد. Importer مقصد را از پیش به PostgreSQL سوییچ نمی‌کند، و snapshot را خودکار از PII متن آزاد پاک‌سازی نمی‌کند؛ مالک داده باید آن را پیش از rehearsal مستقل بررسی کند. Preflight هیچ اتصال PostgreSQL نمی‌زند.

جزئیات policy، commandها و نقاط cutover در [`DATABASE_MIGRATION_AND_RECOVERY.md`](./DATABASE_MIGRATION_AND_RECOVERY.md) است.

## ۳) Vault/KMS و secret mount

الگوی provider انتخاب‌شده **Vault KV v2 + Vault Agent sidecar** با Kubernetes service-account workload identity است؛ projected JWT فقط در sidecar mount می‌شود، Agent فایل‌ها را در volume حافظه‌ای می‌نویسد و اپلیکیشن فقط `SECRETS_DIR` را read-only می‌بیند. policy، Agent config و templateها در `ops/vault/` هستند، اما Vault endpoint/CA، Kubernetes auth role، namespace/service account، Agent image و secret mount واقعی هنوز provision یا وصل نشده‌اند. `SECRET_STORE_PROVIDER=vault-agent` صرفاً برچسب preflight است. فایل‌ها باید readable برای process، خارج از repo، غیرقابل‌نوشتن برای group/world و غیرقابل‌خواندن برای world باشند؛ mode پیشنهادی `0400` یا `0440` با group محدود است.

`npm run test:vault-contract` در CI فقط policy، templateها و مرزبندی mountها را به‌صورت ایستا بررسی می‌کند؛ هیچ Vault واقعی را فراخوانی نمی‌کند. Preflight فایل‌های versioned زیر را بررسی می‌کند، اما اتصال upstream را تأیید نمی‌کند:

- `JWT_SECRET`
- `AUDIT_LOG_HMAC_KEY_<VERSION>`
- `BACKUP_ENCRYPTION_KEY`
- `AI_KEY_ENCRYPTION_KEY_<VERSION>` (برای v1 نام سازگار قدیمی `AI_KEY_ENCRYPTION_KEY` نیز پذیرفته می‌شود)

`JWT_SECRET` اکنون نیز از SecretManager قابل دریافت است. در staging باید claimهای workload identity، policy read-only، audit Vault، expiry/failover و rotation دو نسخه‌ای را با مالک سرویس آزمود. `server/test/secret-manager.test.js` فقط فایل renderشده، cache و rotation consumer را آزمایش می‌کند؛ اتصال Vault یا HSM را ثابت نمی‌کند. Runbook: [`SECRET_LIFECYCLE.md`](./SECRET_LIFECYCLE.md).

## ۴) Sandbox پرداخت و reviewer مستقل

برای آماده‌سازی تنظیمات، یک provider را صریح انتخاب کنید. نمونهٔ زرین‌پال (مقادیر واقعی فقط در secret store):

```dotenv
PAYMENT_SANDBOX_PROVIDER=zarinpal
PAYMENT_PROVIDER=zarinpal
PAYMENT_PROVIDERS=zarinpal
PAYMENT_ALLOW_MOCK=0
ZARINPAL_SANDBOX=1
PUBLIC_URL=https://<staging-domain>
ZARINPAL_MERCHANT_ID=<sandbox-secret>
```

برای سایر providerها از نام متغیرها در `server/.env.example` استفاده کنید. `npm run ops:preflight` provider/allowlist، sandbox flag، HTTPS و وجود credential را بررسی می‌کند، اما callback عمومی را probe نمی‌کند، تراکنش sandbox انجام نمی‌دهد و statement واقعی را تطبیق نمی‌دهد. اجرای E2E واقعی نیازمند merchant sandbox، staging قابل‌دسترسی از provider و آزمون برگشت callback/verify/idempotency/refund است.

Reviewer مستقل باید گزارش پروتکل provider، یافته‌ها، severity، remediation و sign-off را به release evidence پیوست کند. هیچ reviewer مستقل یا sandbox provider به این workspace متصل نیست. جزئیات: [`PAYMENT_SECURITY_REVIEW.md`](./PAYMENT_SECURITY_REVIEW.md).

## ۵) Recovery، Object Lock و canary

پیش از تمرین کنترل‌شده، اپراتور باید در staging مقادیر را از secret/config store تأمین کند:

```dotenv
RECOVERY_DRILL_BACKUP_MANIFEST=/secure/path/<verified-manifest>.json
BACKUP_REMOTE=<configured-rclone-remote>
BACKUP_OBJECT_LOCK_CONFIRMED=1
RECOVERY_DRILL_TARGET=staging
STAGING_BASE_URL=https://<isolated-staging-domain>
RECOVERY_RTO_TARGET_SECONDS=<approved-number>
RECOVERY_RPO_TARGET_SECONDS=<approved-number>
DEPLOYMENT_ORCHESTRATOR=<selected-platform>
DEPLOYMENT_TRAFFIC_ROUTER=<selected-router>
```

تصمیم این repository **Kubernetes + Argo Rollouts + ingress-nginx** است؛ AnalysisTemplate برای حداقل حجم canary، 5xx <1% و p95 <750ms دارد. فایل‌های `ops/kubernetes/` و `ops/argo-rollouts/` فقط template هستند و `DO NOT APPLY` دارند. CI Dockerfile را در job جداگانه با `push: false` می‌سازد؛ job در run [37973825978](https://github.com/bestboygod021/easyshop/actions/runs/37973825978) موفق شد، اما image را منتشر نکرد. فایل workflow انتشار فقط در branch حاضر است و GitHub آن را در فهرست workflowهای فعال نشان نمی‌دهد. انتشار digest-pinned و امضاشده، PostgreSQL cutover، کنترلرهای cluster، ServiceMonitor/Prometheus، NGINX plugin و staging واقعی هنوز فراهم/تأیید نشده‌اند. SQLite فایل‌محلی فعلی با چند pod امن نیست.

OCI workflow این branch، stable tag و ancestry را در job بدون publish بررسی می‌کند؛ publish جداگانه فقط با `OCI_RELEASE_ENABLED=1`، base image با digest، و environment `oci-release` دارای reviewer مستقل/self-review prevention و policy صریح `v*` قابل اجراست. environment و repository tag ruleset هنوز ساخته نشده‌اند؛ درخواست‌های تنظیم GitHub با HTTP 403 رد شدند. manifest release فقط image/source/build-input digestها را متصل می‌کند و پنج مدرک staging/Vault/payment/recovery/canary را `not_verified` علامت می‌زند؛ این artifact rehearsal واقعی نیست.

اگر بعداً staging آماده شد، با تأیید مالک platform مقادیر زیر را از deployment secret/config store تنظیم کنید؛ این flagها فقط self-attestation هستند و probe یا rollout اجرا نمی‌کنند:

```dotenv
DEPLOYMENT_ORCHESTRATOR=kubernetes
DEPLOYMENT_TRAFFIC_ROUTER=argo-rollouts-nginx
DEPLOYMENT_STAGING_CONFIRM=1
KUBERNETES_METRICS_SECRET_CONFIRMED=1
KUBERNETES_IMAGE_PULL_SECRET_CONFIRMED=1
KUBERNETES_CLUSTER_CONFIRMED=1
ARGO_ROLLOUTS_CONTROLLER_CONFIRMED=1
NGINX_INGRESS_CONFIRMED=1
PROMETHEUS_ROLLOUT_ANALYSIS_CONFIRMED=1
STAGING_BASE_URL=https://<isolated-staging-domain>
```

Preflight وجود فایل‌ها/مقادیر را می‌سنجد اما bucket policy، WORM retention، restore staging، controller/traffic split، health check، RTO/RPO واقعی یا rollback را اجرا/تأیید نمی‌کند. قالب timeline و اندازه‌گیری RTO/RPO در [`evidence/CANARY_RECOVERY_DRILL_TEMPLATE.md`](./evidence/CANARY_RECOVERY_DRILL_TEMPLATE.md) است.

برای restore محلی SQLite از فرمان‌های [`BACKUP_AND_RECOVERY.md`](./BACKUP_AND_RECOVERY.md) استفاده کنید. آن را به‌عنوان staging/production recovery drill ثبت نکنید.

## Evidence package لازم برای sign-off واقعی

برای هر rehearsal، گزارش قابل‌ردیابی شامل موارد زیر نگه‌داری شود: شناسهٔ release/commit، نسخهٔ schema، محیط/region بدون credential، زمان UTC، operator و approver، manifest hash، Object Lock policy evidence، هدف‌های RTO/RPO و زمان اندازه‌گیری‌شده، نتیجهٔ integrity/reconcile مالی، callback/payment referenceهای sandbox فاقد دادهٔ کارت، SLO/خطاها، rollout percentage، rollback نتیجه و یافته‌های reviewer. Secret، DSN، token، PII یا دادهٔ کارت را در evidence قرار ندهید.

## وضعیت فعلی این workspace

- ESLint و CI gate: run پیشین [37973825978](https://github.com/bestboygod021/easyshop/actions/runs/37973825978) روی commit `e7c9eab` سبز است و Dockerfile را بدون publish build کرده؛ در این branch نیز lint محلی و `npm test` با 341/341 آزمون موفق شده‌اند. اجرای remote همین branch هنوز پس از push لازم است؛ release یا deployment production انجام نشده. اجرای پیشین [37973308936](https://github.com/bestboygod021/easyshop/actions/runs/37973308936) دو آزمون پایگاه‌دادهٔ round-8 را ناموفق نشان داد؛ این تغییرها fixture مستقل و audit ایزوله‌سازی افزوده‌اند.
- قراردادهای ارتقای جدید: تست‌های محلی OCI، release evidence، DB isolation، Vault و shadow-read سبز شده‌اند؛ YAML workflowها parse شده و frontend build/npm audit هم موفق‌اند. این‌ها کد و CI guardrail هستند، نه تست GitHub setting زنده یا سامانهٔ external.
- PostgreSQL: **blocked**؛ driver، async pilot، schema 95-table، importer/resume، fixture مصنوعی و reconciliation در PostgreSQL 16 موقت CI run [37973825978](https://github.com/bestboygod021/easyshop/actions/runs/37973825978) موفق‌اند؛ staging endpoint/TLS، sanitized production snapshot، domain wiring/cutover و restore evidence فراهم نیستند.
- Vault: provider/pattern، policy read-only، Kubernetes workload-identity/Agent templates و file-rotation tests آماده‌اند؛ endpoint، auth role، cluster و live mount متصل نشده‌اند.
- Payment: local mocked callback tests و evidence template موجودند؛ sandbox E2E، callback reachability، statement و independent review انجام نشده‌اند.
- Recovery/canary: Kubernetes + Argo Rollouts + ingress-nginx انتخاب و templates/proposed SLO thresholds آماده‌اند؛ CI image build بدون publish تعریف شده، اما OCI digest/signature release، PostgreSQL cutover، cluster/router/Prometheus، off-site Object Lock، staging restore و measured RTO/RPO نداریم.

هیچ‌یک از external gateها را با unit test، local load test، self-attestation یا مستندات به‌تنهایی سبز علامت‌گذاری نکنید.
