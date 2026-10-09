import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

const exportedRequests = [];
let collector;
let endpoint;

before(async () => {
  collector = http.createServer((req, res) => {
    let size = 0;
    req.on('data', (chunk) => { size += chunk.length; });
    req.on('end', () => {
      exportedRequests.push({ path: req.url, size });
      res.writeHead(200, { 'content-type': 'application/x-protobuf' });
      res.end();
    });
  });
  await new Promise((resolve) => collector.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${collector.address().port}`;
});

after(async () => new Promise((resolve) => collector?.close(resolve)));

describe('OpenTelemetry OTLP exporters', () => {
  it('exports traces and metrics to the configured OTLP/HTTP collector and flushes on shutdown', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_SERVICE_NAME = 'easyshop-otel-test';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/protobuf';
    process.env.OTEL_TRACES_EXPORTER = 'otlp';
    process.env.OTEL_METRICS_EXPORTER = 'otlp';

    const { config } = await import('../src/config.js');
    const observability = await import('../src/services/observability.js');
    assert.equal(config.observability.otelEnabled, true);
    assert.equal(observability.initializeObservability(), true);

    const { trace } = await import('@opentelemetry/api');
    const span = trace.getTracer('easyshop-test').startSpan('checkout.verify');
    span.setAttribute('http.route', '/api/orders/checkout');
    span.end();
    observability.recordHttpObservation({ method: 'POST', route: '/api/orders/checkout', statusCode: 201, durationMs: 28 });
    observability.recordPaymentObservation('zarinpal', 'verified_paid');
    await observability.shutdownObservability();

    assert.ok(exportedRequests.some((request) => request.path.endsWith('/v1/traces') && request.size > 0));
    assert.ok(exportedRequests.some((request) => request.path.endsWith('/v1/metrics') && request.size > 0));
  });
});
