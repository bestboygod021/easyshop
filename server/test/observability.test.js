import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MetricsRegistry } from '../src/services/metrics.js';
import { evaluateSlo } from '../src/services/slo-monitor.js';

describe('observability metrics and service-level objectives', () => {
  it('exports escaped Prometheus counters and aggregatable request histograms', () => {
    const registry = new MetricsRegistry();
    registry.recordHttp('GET', '/api/products/:id', 200, 42, 1000);
    registry.recordHttp('GET', '/api/products/:id', 503, 1300, 2000);
    registry.recordPayment('zarinpal', 'verified_paid', 2500);
    registry.recordHttp('GET', '/route/with"quote', 200, 10, 3000);

    const output = registry.toPrometheusText();
    assert.match(output, /# TYPE easyshop_http_request_duration_ms histogram/);
    assert.match(output, /easyshop_http_request_duration_ms_bucket\{method="GET",path="\/api\/products\/:id",status="200",le="50"\} 1/);
    assert.match(output, /path="\/route\/with\\"quote"/);
    assert.match(output, /easyshop_payment_attempts_total\{provider="zarinpal",status="verified_paid"\} 1/);
  });

  it('calculates rolling SLIs while excluding health and scrape traffic', () => {
    const registry = new MetricsRegistry();
    const now = 60_000;
    registry.recordHttp('GET', '/api/products', 200, 100, now - 1000);
    registry.recordHttp('POST', '/api/orders/checkout', 503, 1200, now - 500);
    registry.recordHttp('GET', '/api/health', 500, 8000, now - 400);
    registry.recordHttp('GET', '/metrics', 500, 9000, now - 300);
    registry.recordPayment('zarinpal', 'verified_paid', now - 200);
    registry.recordPayment('zarinpal', 'verification_error', now - 100);

    const snapshot = registry.getSloSnapshot({ windowMs: 10_000, now });
    assert.equal(snapshot.requests, 2);
    assert.equal(snapshot.server_errors, 1);
    assert.equal(snapshot.availability, 0.5);
    assert.equal(snapshot.p95_latency_ms, 1200);
    assert.equal(snapshot.payment_verifications, 2);
    assert.equal(snapshot.payment_verification_failures, 1);
    assert.equal(snapshot.payment_verification_success_rate, 0.5);
  });

  it('raises availability, latency, verification, and manual-review alerts at configured sample sizes', () => {
    const alerts = evaluateSlo({
      requests: 100,
      server_errors: 5,
      availability: 0.95,
      p95_latency_ms: 1800,
      payment_verifications: 20,
      payment_verification_failures: 4,
      payment_verification_success_rate: 0.8,
      manual_payment_reviews: 1,
      window_ms: 300_000,
    }, {
      minHttpRequests: 20,
      availabilityTarget: 0.999,
      httpP95TargetMs: 750,
      minPaymentVerifications: 10,
      paymentSuccessTarget: 0.98,
    });
    assert.deepEqual(alerts.map((alert) => alert.key), [
      'http-availability', 'http-p95-latency', 'payment-verification', 'manual-payment-review',
    ]);
    assert.equal(alerts[0].severity, 'critical');
    assert.equal(alerts[1].severity, 'critical');
    assert.equal(alerts[2].severity, 'critical');
    assert.equal(alerts[3].severity, 'critical');
  });

  it('does not alert before minimum sample thresholds or when all SLOs are healthy', () => {
    const alerts = evaluateSlo({
      requests: 4,
      server_errors: 0,
      availability: 1,
      p95_latency_ms: 12,
      payment_verifications: 2,
      payment_verification_failures: 0,
      payment_verification_success_rate: 1,
      manual_payment_reviews: 0,
      window_ms: 300_000,
    }, {
      minHttpRequests: 20,
      availabilityTarget: 0.999,
      httpP95TargetMs: 750,
      minPaymentVerifications: 10,
      paymentSuccessTarget: 0.98,
    });
    assert.deepEqual(alerts, []);
  });
});
