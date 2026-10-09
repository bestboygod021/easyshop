# OpenTelemetry, Prometheus و SLOهای EasyShop

EasyShop سه لایهٔ مشاهده‌پذیری دارد:

1. **OpenTelemetry** برای spanهای HTTP، اندازه‌گیری تأخیر و رخدادهای چرخهٔ پرداخت. SDK با `OTEL_*` استاندارد تنظیم می‌شود؛ داده‌ای به بیرون ارسال نمی‌شود مگر آن‌که OTel صریحاً فعال/پیکربندی شود.
2. **Prometheus** از مسیر `GET /metrics`، counter و histogram با labelهای کم‌کاردینالیتی دریافت می‌کند. داده‌ها در حافظهٔ همان process هستند و با restart صفر می‌شوند؛ Prometheus برای نگهداری تاریخی، چند replica و محاسبهٔ rate مرجع اصلی است.
3. **SLO monitor داخلی** به‌صورت دوره‌ای پنجرهٔ لغزان را می‌سنجد و breachها را با cooldown از طریق `OPS_ALERT_WEBHOOK_URL` و تاریخچهٔ هشدارها اعلام می‌کند. مدیر سامانه می‌تواند snapshot و آخرین هشدارها را از `GET /api/admin/observability` ببیند.

## راه‌اندازی OTel

در محیط اجرا (نه در مخزن) تنظیم کنید:

```dotenv
OTEL_ENABLED=true
OTEL_SERVICE_NAME=easyshop-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=production,service.namespace=commerce
```

`OTEL_EXPORTER_OTLP_ENDPOINT` باید به Collector/Backend قابل دسترس از process API اشاره کند؛ credential و TLS را طبق راهنمای backend در secret store نگه دارید. در صورت استفاده از endpoint جداگانه، `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` و `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` را تنظیم کنید. برای غیرفعال‌کردن metrics OTel می‌توان `OTEL_METRICS_EXPORTER=none` گذاشت. shutdown با `SIGTERM`، export باقیمانده را flush می‌کند.

HTTP spanها نام و مسیر templateشده دارند، نه query string. Attributeها شامل method، route، status و latency است؛ کلید پرداخت، شماره کارت، token، body و شناسهٔ مشتری به telemetry اضافه نمی‌شوند. Instrumentation از Express/HTTP به‌صورت دستی انجام شده تا SDK پیش از شروع listener ثبت شود و وابستگی‌های auto-instrumentation غیرضروری اضافه نشود.

## اسکرپ Prometheus

در production مقدار قوی `METRICS_BEARER_TOKEN` را در secret store API بگذارید. همان secret را به فایل دسترسی فقط‌خواندنی `/etc/prometheus/secrets/easyshop-metrics-token` بدهید. نمونهٔ config و alert rules در این پوشه‌اند:

- `ops/observability/prometheus.yml`
- `ops/observability/easyshop-slo.yml`
- `ops/observability/alertmanager.yml`
- `ops/observability/grafana/provisioning/datasources/prometheus.yml`
- `ops/observability/grafana/provisioning/dashboards/easyshop.yml`
- `ops/observability/grafana/dashboards/easyshop-slo.json`

Grafana datasource/dashboard provisioning فایل‌محور است؛ configهای provisioning را در مسیرهای استاندارد Grafana mount کنید و JSON داشبورد را در مسیر `/var/lib/grafana/dashboards/easyshop` قرار دهید. datasource UID ثابت `easyshop-prometheus` است تا dashboard بدون ویرایش JSON به آن متصل شود.

Alertmanager برای هشدارهای عادی هر ۴ ساعت و برای critical هر ۱۵ دقیقه تکرار می‌فرستد؛ هشدار warning متناظر در صورت وجود critical مهار می‌شود. URL webhook عمومی Alertmanager باید به فایل فقط‌خواندنی `/etc/alertmanager/secrets/easyshop-oncall-webhook-url` mount شود. این یک generic Alertmanager webhook است؛ برای Slack/Teams از relay امن استفاده کنید و endpoint/secret را در مخزن قرار ندهید.

نمونهٔ اسکرپ از ۱۵ ثانیه استفاده می‌کند. `/metrics` در production وقتی token تعیین نشده باشد عمداً 404 می‌دهد؛ وقتی token تنظیم است، Bearer token نادرست با 401 رد می‌شود. endpoint را از اینترنت عمومی منتشر نکنید و دسترسی شبکه را به Prometheus/monitoring محدود کنید.

## SLI/SLOهای پیش‌فرض

| SLI | هدف | پنجره / حداقل نمونه | رفتار هشدار |
|---|---:|---|---|
| Availability درخواست‌های HTTP (پاسخ‌های زیر 500) | 99.9% | 5 دقیقه / 20 درخواست | نقض هدف هشدار می‌دهد؛ health و scrape از SLI حذف‌اند |
| p95 تأخیر HTTP | کمتر از 750 ms | 5 دقیقه / 20 درخواست | `warning` بالای هدف، `critical` بالای دو برابر هدف |
| موفقیت verify سمت سرور پرداخت | 98% | 5 دقیقه / 10 verify | `verification_error`، `settlement_pending` و پرداخت نیازمند بررسی دستی خطای عملیاتی‌اند؛ لغو مشتری در مخرج نیست |
| پرداخت نیازمند بررسی دستی | صفر مورد بازه‌ای | پنجرهٔ 5 دقیقه | هشدار `critical`، با cooldown و اعلان recovery |

هدف‌ها قابل override با متغیرهای `SLO_*` در `.env.example` هستند. Alert rules پرومتئوس هشدار scrape down، 5xx، p95، خرابی verify، manual review و RSS بالا را نیز تعریف می‌کنند. چون counter داخلی process-local است، برای rate در پرومتئوس از `rate()`/`increase()` استفاده کنید؛ برای چند replica از یک Prometheus target/service discovery بهره ببرید و متریک‌ها را با labelهای replica تجمیع کنید.

## Runbook کوتاه

1. در alertهای 5xx یا p95، `request_id`های log را با trace ID در OTel backend تطبیق دهید؛ `/api/health` وضعیت منابع و SQLite را جداگانه نشان می‌دهد.
2. در alert پرداخت، `GET /api/admin/observability` را با حساب admin باز کنید. برای بررسی دستی، رویدادها و ledger پرداخت را از مسیرهای مدیریتی بررسی کنید؛ دوباره‌کاری تسویه نکنید.
3. اگر metrics scrape شکست خورد، token file، مجوز خواندن Prometheus و دسترسی شبکه را بررسی کنید. پاسخ 404 در production معمولاً یعنی `METRICS_BEARER_TOKEN` تنظیم نشده؛ 401 یعنی secretها همسان نیستند.
4. webhook اختیاری با `OPS_ALERT_WEBHOOK_URL` تنظیم می‌شود. URL را به HTTPS و مقصد تحت کنترل اپراتور محدود کنید.
