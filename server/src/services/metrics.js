import {
  finishHttpServerSpan,
  normalizeHttpMethod,
  recordHttpObservation,
  recordPaymentObservation,
  safeRoute,
  startHttpServerSpan,
} from './observability.js';

const HTTP_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 750, 1000, 2500, 5000, 10000];
const MAX_WINDOW_SAMPLES = 100_000;
const PAYMENT_VERIFICATION_EVENTS = new Set([
  'verified_paid', 'verification_error', 'settlement_pending', 'manual_review',
]);
const PAYMENT_VERIFICATION_FAILURES = new Set([
  'verification_error', 'settlement_pending', 'manual_review',
]);
const PAYMENT_INITIATION_EVENTS = new Set(['initiated', 'init_failed']);

function escapeLabel(value) {
  return String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function labelsText(labels) {
  return `{${Object.entries(labels).map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`;
}

function quantile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function appendBounded(list, entry) {
  list.push(entry);
  if (list.length > MAX_WINDOW_SAMPLES) list.splice(0, list.length - MAX_WINDOW_SAMPLES);
}

/**
 * In-process Prometheus registry, rolling SLI window, and OpenTelemetry bridge.
 * Counters reset on process restart; use Prometheus rate() for durable multi-instance SLOs.
 */
export class MetricsRegistry {
  constructor() {
    this.httpRequestsTotal = new Map();
    this.httpDurationBySeries = new Map();
    this.httpRequestDurationMs = [];
    this.httpSamples = [];
    this.paymentAttemptsTotal = new Map();
    this.paymentSamples = [];
    this.startTime = Date.now();
  }

  recordHttp(method, route, statusCode, durationMs, timestamp = Date.now()) {
    const normalizedMethod = normalizeHttpMethod(method);
    const normalizedRoute = String(route || 'unmatched').slice(0, 240);
    const status = Number(statusCode) || 0;
    const duration = Math.max(0, Number(durationMs) || 0);
    const labels = { method: normalizedMethod, path: normalizedRoute, status: String(status) };
    const key = JSON.stringify([normalizedMethod, normalizedRoute, status]);
    this.httpRequestsTotal.set(key, (this.httpRequestsTotal.get(key) || 0) + 1);

    let histogram = this.httpDurationBySeries.get(key);
    if (!histogram) {
      histogram = { labels, count: 0, sum: 0, buckets: new Array(HTTP_BUCKETS_MS.length).fill(0) };
      this.httpDurationBySeries.set(key, histogram);
    }
    histogram.count += 1;
    histogram.sum += duration;
    for (let i = 0; i < HTTP_BUCKETS_MS.length; i += 1) {
      if (duration <= HTTP_BUCKETS_MS[i]) histogram.buckets[i] += 1;
    }

    if (this.httpRequestDurationMs.length >= 1000) this.httpRequestDurationMs.shift();
    this.httpRequestDurationMs.push(duration);
    appendBounded(this.httpSamples, {
      timestamp,
      method: normalizedMethod,
      route: normalizedRoute,
      status,
      durationMs: duration,
    });
    recordHttpObservation({ method: normalizedMethod, route: normalizedRoute, statusCode: status, durationMs: duration });
  }

  recordPayment(provider, status, timestamp = Date.now()) {
    const normalizedProvider = String(provider || 'unknown').slice(0, 40);
    const normalizedStatus = String(status || 'unknown').slice(0, 40);
    const key = JSON.stringify([normalizedProvider, normalizedStatus]);
    this.paymentAttemptsTotal.set(key, (this.paymentAttemptsTotal.get(key) || 0) + 1);
    appendBounded(this.paymentSamples, { timestamp, provider: normalizedProvider, status: normalizedStatus });
    recordPaymentObservation(normalizedProvider, normalizedStatus);
  }

  getQuantiles() {
    return {
      p50: quantile(this.httpRequestDurationMs, 0.5),
      p90: quantile(this.httpRequestDurationMs, 0.9),
      p95: quantile(this.httpRequestDurationMs, 0.95),
      p99: quantile(this.httpRequestDurationMs, 0.99),
    };
  }

  getSloSnapshot({ windowMs = 5 * 60_000, now = Date.now() } = {}) {
    const cutoff = now - windowMs;
    const requests = this.httpSamples.filter((sample) => sample.timestamp >= cutoff
      && sample.route !== '/metrics'
      && sample.route !== '/api/health'
      && sample.route !== '/health');
    const failures = requests.filter((sample) => sample.status >= 500).length;
    const latencies = requests.map((sample) => sample.durationMs);
    const verificationEvents = this.paymentSamples.filter((sample) => sample.timestamp >= cutoff
      && PAYMENT_VERIFICATION_EVENTS.has(sample.status));
    const verificationFailures = verificationEvents.filter((sample) => PAYMENT_VERIFICATION_FAILURES.has(sample.status)).length;
    const initiationEvents = this.paymentSamples.filter((sample) => sample.timestamp >= cutoff
      && PAYMENT_INITIATION_EVENTS.has(sample.status));
    const initiationFailures = initiationEvents.filter((sample) => sample.status === 'init_failed').length;
    const manualReviews = this.paymentSamples.filter((sample) => sample.timestamp >= cutoff && sample.status === 'manual_review');

    return {
      window_ms: windowMs,
      sampled_at: new Date(now).toISOString(),
      requests: requests.length,
      server_errors: failures,
      availability: requests.length ? (requests.length - failures) / requests.length : null,
      p95_latency_ms: latencies.length ? quantile(latencies, 0.95) : null,
      payment_verifications: verificationEvents.length,
      payment_verification_failures: verificationFailures,
      payment_verification_success_rate: verificationEvents.length
        ? (verificationEvents.length - verificationFailures) / verificationEvents.length : null,
      payment_initiations: initiationEvents.length,
      payment_initiation_failures: initiationFailures,
      payment_initiation_success_rate: initiationEvents.length
        ? (initiationEvents.length - initiationFailures) / initiationEvents.length : null,
      manual_payment_reviews: manualReviews.length,
      sample_capacity: MAX_WINDOW_SAMPLES,
    };
  }

  toPrometheusText() {
    const lines = [];
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
    lines.push('# HELP easyshop_uptime_seconds Application uptime in seconds');
    lines.push('# TYPE easyshop_uptime_seconds gauge');
    lines.push(`easyshop_uptime_seconds ${uptimeSec}`);

    const mem = process.memoryUsage();
    lines.push('# HELP process_resident_memory_bytes Process resident memory size in bytes');
    lines.push('# TYPE process_resident_memory_bytes gauge');
    lines.push(`process_resident_memory_bytes ${mem.rss}`);
    lines.push('# HELP process_heap_used_bytes Process heap used in bytes');
    lines.push('# TYPE process_heap_used_bytes gauge');
    lines.push(`process_heap_used_bytes ${mem.heapUsed}`);

    lines.push('# HELP easyshop_http_requests_total Total number of HTTP requests processed');
    lines.push('# TYPE easyshop_http_requests_total counter');
    for (const [key, count] of this.httpRequestsTotal.entries()) {
      const [method, route, status] = JSON.parse(key);
      lines.push(`easyshop_http_requests_total${labelsText({ method, path: route, status })} ${count}`);
    }

    lines.push('# HELP easyshop_http_request_duration_ms HTTP request duration histogram in milliseconds');
    lines.push('# TYPE easyshop_http_request_duration_ms histogram');
    for (const histogram of this.httpDurationBySeries.values()) {
      for (let i = 0; i < HTTP_BUCKETS_MS.length; i += 1) {
        lines.push(`easyshop_http_request_duration_ms_bucket${labelsText({ ...histogram.labels, le: HTTP_BUCKETS_MS[i] })} ${histogram.buckets[i]}`);
      }
      lines.push(`easyshop_http_request_duration_ms_bucket${labelsText({ ...histogram.labels, le: '+Inf' })} ${histogram.count}`);
      lines.push(`easyshop_http_request_duration_ms_sum${labelsText(histogram.labels)} ${histogram.sum}`);
      lines.push(`easyshop_http_request_duration_ms_count${labelsText(histogram.labels)} ${histogram.count}`);
    }

    const quantiles = this.getQuantiles();
    lines.push('# HELP easyshop_http_request_duration_quantile_ms Recent in-process request latency quantiles (not aggregatable across instances)');
    lines.push('# TYPE easyshop_http_request_duration_quantile_ms gauge');
    for (const [label, value] of Object.entries(quantiles)) {
      lines.push(`easyshop_http_request_duration_quantile_ms${labelsText({ quantile: label.slice(1) })} ${value}`);
    }

    lines.push('# HELP easyshop_payment_attempts_total Payment lifecycle outcome counters');
    lines.push('# TYPE easyshop_payment_attempts_total counter');
    for (const [key, count] of this.paymentAttemptsTotal.entries()) {
      const [provider, status] = JSON.parse(key);
      lines.push(`easyshop_payment_attempts_total${labelsText({ provider, status })} ${count}`);
    }
    return `${lines.join('\n')}\n`;
  }
}

export const metricsRegistry = new MetricsRegistry();

export function metricsMiddleware(req, res, next) {
  const start = performance.now();
  let span;
  res.on('finish', () => {
    const duration = performance.now() - start;
    const route = safeRoute(req, res.statusCode);
    metricsRegistry.recordHttp(req.method, route, res.statusCode, duration);
    finishHttpServerSpan(span, {
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });
  span = startHttpServerSpan(req, res, next);
}
