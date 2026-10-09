import {
  context,
  metrics as otelMetrics,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { config } from '../config.js';

let sdk = null;
let initialized = false;
let httpRequestCounter;
let httpRequestDuration;
let paymentEventCounter;
const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE']);

export function normalizeHttpMethod(value) {
  const method = String(value || 'GET').toUpperCase();
  return HTTP_METHODS.has(method) ? method : 'OTHER';
}

/** Start an optional OpenTelemetry SDK. Standard OTEL_* environment variables configure exporters/resources. */
export function initializeObservability() {
  if (initialized) return false;
  initialized = true;

  const hasBaseEndpoint = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const traceSetting = process.env.OTEL_TRACES_EXPORTER?.toLowerCase().split(',').map((value) => value.trim());
  const metricSetting = process.env.OTEL_METRICS_EXPORTER?.toLowerCase().split(',').map((value) => value.trim());
  const traceEndpoint = Boolean(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || hasBaseEndpoint);
  const metricEndpoint = Boolean(process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || hasBaseEndpoint);
  const traceEnabled = traceSetting ? traceSetting.includes('otlp') : traceEndpoint;
  const metricEnabled = metricSetting ? metricSetting.includes('otlp') : metricEndpoint;

  if (config.observability.otelEnabled && (traceEnabled || metricEnabled)) {
    try {
      const traceExporter = traceEnabled ? new OTLPTraceExporter() : undefined;
      const metricReader = metricEnabled
        ? new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })
        : undefined;
      sdk = new NodeSDK({
        serviceName: config.observability.serviceName,
        ...(traceExporter ? { traceExporter } : { spanProcessors: [] }),
        metricReaders: metricReader ? [metricReader] : [],
      });
      sdk.start();
    } catch (error) {
      sdk = null;
      console.error('OpenTelemetry initialization failed; local Prometheus metrics remain available.', error?.message || error);
    }
  } else if (config.observability.otelEnabled) {
    console.warn('OTel is enabled but no OTLP exporter is configured; local Prometheus metrics remain available.');
  }

  const meter = otelMetrics.getMeter(config.observability.serviceName, '1.0.0');
  httpRequestCounter = meter.createCounter('http.server.request.count', {
    description: 'Completed EasyShop HTTP server requests',
    unit: '{request}',
  });
  httpRequestDuration = meter.createHistogram('http.server.request.duration', {
    description: 'EasyShop HTTP server request duration',
    unit: 'ms',
  });
  paymentEventCounter = meter.createCounter('easyshop.payment.event.count', {
    description: 'Payment lifecycle outcomes observed by EasyShop',
    unit: '{event}',
  });
  return Boolean(sdk);
}

export async function shutdownObservability() {
  if (!sdk) return;
  const current = sdk;
  sdk = null;
  try {
    await current.shutdown();
  } catch (error) {
    console.error('OpenTelemetry shutdown failed.', error?.message || error);
  }
}

function safeRoute(req, statusCode) {
  const routePath = req.route?.path;
  if (typeof routePath === 'string') {
    const mounted = `${req.baseUrl || ''}/${routePath}`.replace(/\/{2,}/g, '/');
    return mounted.length > 1 ? mounted.replace(/\/$/, '') : '/';
  }
  if (req.path === '/metrics') return '/metrics';
  if (req.path === '/api/health') return '/api/health';
  if (statusCode === 404) return 'unmatched';
  return 'unmatched';
}

/** Begin a low-cardinality server span and activate it for downstream Express work. */
export function startHttpServerSpan(req, res, next) {
  const parent = propagation.extract(context.active(), req.headers);
  const method = normalizeHttpMethod(req.method);
  const span = trace.getTracer(config.observability.serviceName, '1.0.0').startSpan(
    `HTTP ${method}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        'http.request.method': method,
        'url.scheme': req.protocol || 'http',
      },
    },
    parent,
  );
  const spanContext = trace.setSpan(parent, span);
  const traceId = span.spanContext().traceId;
  if (/^[a-f0-9]{32}$/i.test(traceId) && !/^0+$/.test(traceId)) {
    req.traceId = traceId;
    if (res && !res.headersSent) res.setHeader('x-trace-id', traceId);
  }
  context.with(spanContext, next);
  return span;
}

export function recordHttpObservation({ method, route, statusCode, durationMs }) {
  const attributes = {
    'http.request.method': normalizeHttpMethod(method),
    'http.route': route || 'unmatched',
    'http.response.status_code': Number(statusCode) || 0,
  };
  httpRequestCounter?.add(1, attributes);
  httpRequestDuration?.record(Math.max(0, Number(durationMs) || 0), attributes);
}

export function recordPaymentObservation(provider, status) {
  paymentEventCounter?.add(1, {
    'payment.provider': String(provider || 'unknown').slice(0, 40),
    'payment.outcome': String(status || 'unknown').slice(0, 40),
  });
}

export function finishHttpServerSpan(span, { method, route, statusCode, durationMs }) {
  if (!span) return;
  span.updateName(`${normalizeHttpMethod(method)} ${route || 'unmatched'}`);
  span.setAttribute('http.route', route || 'unmatched');
  span.setAttribute('http.response.status_code', Number(statusCode) || 0);
  span.setAttribute('easyshop.request.duration_ms', Math.max(0, Number(durationMs) || 0));
  if (Number(statusCode) >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
  span.end();
}

export { safeRoute };
