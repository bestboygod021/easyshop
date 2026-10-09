# آزمون بار محلی و پیشنهاد آستانه‌های SLO/autoscaling

## آزمون محلی

`tools/load-test.mjs` خودش API را با یک SQLite تازه و دادهٔ demo در یک process موقت اجرا می‌کند؛ به host/credential بیرونی وصل نمی‌شود. در سناریوی checkout از یک محصول مصنوعی با stock بزرگ، session key یکتا و درگاه mock استفاده می‌کند و پرداخت mock را بلافاصله settle می‌کند؛ هیچ provider یا وجه واقعی درگیر نیست. پس از پایان، process و کل دیتابیس موقت پاک می‌شوند.

```bash
# ترکیبی: ۷۵٪ health/catalog و ۲۵٪ checkout
LOAD_SCENARIO=mixed LOAD_DURATION_SECONDS=30 LOAD_CONCURRENCY=8 npm run load:test

# فقط API عمومی
LOAD_SCENARIO=api LOAD_DURATION_SECONDS=60 LOAD_CONCURRENCY=12 npm run load:test

# فشار بیشتر به checkout mock (فقط دیتابیس موقت)
LOAD_SCENARIO=checkout LOAD_DURATION_SECONDS=20 LOAD_CONCURRENCY=6 npm run load:test
```

تنظیم‌ها: `LOAD_DURATION_SECONDS` (۱–۳۰۰)، `LOAD_CONCURRENCY` (۱–۱۰۰)، `LOAD_MAX_OPERATIONS`، و `LOAD_SLO_HTTP_P95_MS` (پیش‌فرض ۷۵۰ms). گزارش شامل RPS، p50/p95/p99، خطاها و تفکیک route group است. command در صورت خطای HTTP یا عبور p95 checkout از آستانه exit غیرصفر می‌دهد.

این harness تست baseline و regression روی همان ماشین است؛ نتایج آن ظرفیت production، latency اینترنت/provider، چند replica، failover یا مقاومت در برابر burst واقعی را تضمین نمی‌کند. بار را روی DB موقت نگه دارید؛ هیچ load scriptی را به production متصل نکنید.

## اهداف SLO فعلی و آستانهٔ پیشنهادی

تنظیمات پایه در `server/src/config.js`/`docs/OBSERVABILITY.md`:

| شاخص | هدف فعلی |
| --- | ---: |
| Availability HTTP | ۹۹٫۹٪ |
| HTTP p95 | حداکثر ۷۵۰ms |
| Payment verification success | حداقل ۹۸٪، با حداقل نمونهٔ تنظیم‌شده |

برای استقرار orchestrated آینده، این اعداد نقطهٔ شروع‌اند، نه profile نهایی:

- scale out اگر CPU بالاتر از ۶۰٪ برای ۵ دقیقه بماند، یا p95 از ۷۵۰ms برای ۵ دقیقه عبور کند **و** خطاها/SLO رو به بدترشدن باشند؛ حداقل ۲ و حداکثر ۱۲ replica، با cooldown و stabilization.
- scale in فقط پس از ۱۵ دقیقه CPU زیر ۳۵٪ و p95 زیر ۵۰۰ms؛ حداقل یک replica سالم و ظرفیت کافی برای peak بعدی حفظ شود.
- اگر worker/queue اضافه شود، backlog بالاتر از ۱۰۰ برای ۲ دقیقه یا سن قدیمی‌ترین job بالاتر از ۳۰s سیگنال scale جداگانه باشد.
- برای payment، ابتدا provider latency/error rate و manual-review alerts را بررسی کنید؛ autoscaling نباید retry storm یا callback duplication بسازد.
- CPU/latency تنها با requests/sec و p95/p99، event-loop lag، DB latency، I/O، SQLite lock waits، payment provider limits و error budget کنار هم تفسیر شوند.

## پیش‌نیازهای باز برای scale افقی

اپلیکیشن فعلی SQLite `DatabaseSync` همگام، فایل محلی DB/uploads، rate limit/metrics در حافظهٔ process و realtime process-local دارد. اجرای چند replica با فایل‌های DB مستقل باعث split state می‌شود و mount کردن یک فایل SQLite مشترک روی چند host راهکار safe نیست. برای orchestration، **Kubernetes + Argo Rollouts + ingress-nginx** و Prometheus Operator انتخاب شده‌اند و templateهای canary 10/25/50/100% در `ops/kubernetes/` و `ops/argo-rollouts/` تعریف شده‌اند؛ آن‌ها عمداً `DO NOT APPLY` هستند. bootstrap schema PostgreSQL و PGlite DDL test موجودند، اما پیش از HPA/rollout واقعی هنوز data import/reconciliation/cutover و domain wiring لازم است؛ همچنین object storage/shared assets، distributed rate limiting/session/realtime و metrics aggregation باید اضافه و با load test staging اثبات شوند. این repository اکنون Dockerfile و workflow ساخت/انتشار OCI دارد، اما workflow در GitHub اجرا نشده، digest/امضای تصویر و base-image digest تأییدشده وجود ندارد. محیط cluster/controller، traffic router، staging URL و credential نیز در دسترس نیست؛ هیچ HPA/canary/autoscaling/rollback اعمال یا تمرین نشده است.

## شواهد

Run محلی از harness در disposable DB و تست‌های SLO/unit فقط رفتار کد را نشان می‌دهند. برای تأیید capacity، اپراتور باید deployment target، replica/resource limits، staging داده‌مانند تولید، load generator بیرونی و provider sandbox کنترل‌شده را فراهم کند؛ سپس خروجی‌های p95/p99، error budget، اشباع DB/CPU/memory و payment settlement را به گزارش release ضمیمه کند. اندازه‌گیری واقعی rollback، RTO/RPO و sign-off باید در [`CANARY_RECOVERY_DRILL_TEMPLATE.md`](evidence/CANARY_RECOVERY_DRILL_TEMPLATE.md) ثبت شود.
