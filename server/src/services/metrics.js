/**
 * In-memory lightweight Prometheus-compatible metrics registry and APM instrumentation.
 */

class MetricsRegistry {
  constructor() {
    this.httpRequestsTotal = new Map(); // key: method,route,status -> count
    this.httpRequestDurationMs = [];    // samples for p50/p95 calculation
    this.paymentAttemptsTotal = new Map(); // provider,status -> count
    this.dbQueryCount = 0;
    this.startTime = Date.now();
  }

  recordHttp(method, route, statusCode, durationMs) {
    const key = `${method.toUpperCase()}:${route || 'unknown'}:${statusCode}`;
    this.httpRequestsTotal.set(key, (this.httpRequestsTotal.get(key) || 0) + 1);

    if (this.httpRequestDurationMs.length >= 1000) {
      this.httpRequestDurationMs.shift();
    }
    this.httpRequestDurationMs.push(durationMs);
  }

  recordPayment(provider, status) {
    const key = `${provider}:${status}`;
    this.paymentAttemptsTotal.set(key, (this.paymentAttemptsTotal.get(key) || 0) + 1);
  }

  getQuantiles() {
    if (!this.httpRequestDurationMs.length) return { p50: 0, p90: 0, p95: 0, p99: 0 };
    const sorted = [...this.httpRequestDurationMs].sort((a, b) => a - b);
    const q = (pct) => sorted[Math.floor(sorted.length * pct)] || sorted[sorted.length - 1];
    return {
      p50: Number(q(0.5).toFixed(2)),
      p90: Number(q(0.9).toFixed(2)),
      p95: Number(q(0.95).toFixed(2)),
      p99: Number(q(0.99).toFixed(2)),
    };
  }

  toPrometheusText() {
    const lines = [];
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);

    lines.push('# HELP easyshop_uptime_seconds Application uptime in seconds');
    lines.push('# TYPE easyshop_uptime_seconds counter');
    lines.push(`easyshop_uptime_seconds ${uptimeSec}`);

    const mem = process.memoryUsage();
    lines.push('# HELP easyshop_process_resident_memory_bytes Process resident memory size in bytes');
    lines.push('# TYPE easyshop_process_resident_memory_bytes gauge');
    lines.push(`easyshop_process_resident_memory_bytes ${mem.rss}`);

    lines.push('# HELP easyshop_http_requests_total Total number of HTTP requests processed');
    lines.push('# TYPE easyshop_http_requests_total counter');
    for (const [key, count] of this.httpRequestsTotal.entries()) {
      const [method, route, status] = key.split(':');
      lines.push(`easyshop_http_requests_total{method="${method}",path="${route}",status="${status}"} ${count}`);
    }

    const quantiles = this.getQuantiles();
    lines.push('# HELP easyshop_http_request_duration_ms HTTP request latency percentiles in ms');
    lines.push('# TYPE easyshop_http_request_duration_ms gauge');
    lines.push(`easyshop_http_request_duration_ms{quantile="0.5"} ${quantiles.p50}`);
    lines.push(`easyshop_http_request_duration_ms{quantile="0.9"} ${quantiles.p90}`);
    lines.push(`easyshop_http_request_duration_ms{quantile="0.95"} ${quantiles.p95}`);
    lines.push(`easyshop_http_request_duration_ms{quantile="0.99"} ${quantiles.p99}`);

    lines.push('# HELP easyshop_payment_attempts_total Payment provider outcome counters');
    lines.push('# TYPE easyshop_payment_attempts_total counter');
    for (const [key, count] of this.paymentAttemptsTotal.entries()) {
      const [provider, status] = key.split(':');
      lines.push(`easyshop_payment_attempts_total{provider="${provider}",status="${status}"} ${count}`);
    }

    return lines.join('\n') + '\n';
  }
}

export const metricsRegistry = new MetricsRegistry();

export function metricsMiddleware(req, res, next) {
  const start = performance.now();
  res.on('finish', () => {
    const duration = performance.now() - start;
    const route = req.baseUrl || req.path || req.originalUrl || 'unknown';
    // Clean route to avoid cardinality explosion with IDs
    const normalizedRoute = route.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/[0-9]+/g, '/:id');
    metricsRegistry.recordHttp(req.method, normalizedRoute, res.statusCode, duration);
  });
  next();
}
