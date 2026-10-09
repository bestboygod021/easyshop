#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SERVER_ROOT = path.join(ROOT, 'server');

function numericEnv(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitUntilReady(baseUrl, child, getLog) {
  const deadline = Date.now() + 30_000;
  let lastError = 'API health endpoint did not respond.';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local API exited before readiness. ${getLog()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
      lastError = `health endpoint returned HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for the disposable local API (${lastError}). ${getLog()}`);
}

function summarize(samples, errors) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (fraction) => sorted.length
    ? Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)].toFixed(2))
    : null;
  return {
    count: samples.length,
    p50_ms: percentile(0.50),
    p95_ms: percentile(0.95),
    p99_ms: percentile(0.99),
    errors,
  };
}

async function main() {
  const durationSeconds = numericEnv('LOAD_DURATION_SECONDS', 10, 1, 300);
  const concurrency = numericEnv('LOAD_CONCURRENCY', 4, 1, 100);
  const maxOperations = numericEnv('LOAD_MAX_OPERATIONS', 5000, 1, 20_000);
  const scenario = String(process.env.LOAD_SCENARIO || 'mixed').toLowerCase();
  if (!['api', 'checkout', 'mixed'].includes(scenario)) throw new Error('LOAD_SCENARIO must be api, checkout, or mixed.');
  const latencyTargetMs = numericEnv('LOAD_SLO_HTTP_P95_MS', 750, 1, 60_000);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-local-load-'));
  const dataDir = path.join(tmp, 'data');
  const port = await freePort();
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DATA_DIR: dataDir,
    UPLOAD_DIR: path.join(tmp, 'uploads'),
    PORT: String(port),
    HOST: '127.0.0.1',
    LOG_LEVEL: 'error',
    SEED_DEMO_DATA: '1',
    DATA_RETENTION_ENABLED: '0',
    BACKUP_ENCRYPTION_ENABLED: '0',
    PAYMENT_PROVIDER: 'mock',
    PAYMENT_PROVIDERS: 'mock',
    PAYMENT_ALLOW_MOCK: '1',
    RATE_GLOBAL: '100000',
    RATE_WRITE: '100000',
    RATE_SEARCH: '100000',
    NODE_NO_WARNINGS: '1',
  };
  delete env.BACKUP_ENCRYPTION_KEY;
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  const collect = (chunk) => { logs = `${logs}${chunk}`.slice(-6000); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const getLog = () => logs.trim();
  const baseUrl = `http://127.0.0.1:${port}`;
  const samples = new Map();
  const errorCounts = new Map();
  const failureSamples = [];
  let operations = 0;
  let requestCount = 0;
  let checkoutCount = 0;
  let stopAt = 0;
  let productId = null;

  const record = (group, latency, error = null) => {
    if (!samples.has(group)) samples.set(group, []);
    samples.get(group).push(latency);
    if (error) errorCounts.set(group, (errorCounts.get(group) || 0) + 1);
  };

  async function send(group, route, { method = 'GET', body, sessionKey, idempotencyKey } = {}) {
    const headers = {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(sessionKey ? { 'x-session-key': sessionKey } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    };
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const latency = performance.now() - started;
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { /* errors are summarized without response bodies */ }
      requestCount += 1;
      const failed = response.status >= 400;
      record(group, latency, failed ? `${response.status}` : null);
      if (failed && failureSamples.length < 5) failureSamples.push({ group, status: response.status, error: payload?.error || payload?.message || null });
      return { ok: !failed, status: response.status, payload };
    } catch (error) {
      requestCount += 1;
      record(group, performance.now() - started, 'network');
      return { ok: false, status: 0, error: error.message };
    }
  }

  async function runApiOperation(counter) {
    const route = counter % 2 === 0 ? '/api/health' : '/api/products?limit=24&sort=popular';
    await send(route === '/api/health' ? 'health' : 'catalog', route);
  }

  async function runCheckoutOperation(workerId, counter) {
    const suffix = crypto.randomBytes(5).toString('hex');
    const sessionKey = `load_${workerId}_${counter}_${suffix}`;
    const added = await send('cart_setup', '/api/cart/items', {
      method: 'POST', sessionKey,
      body: { product_id: productId, qty: 1 },
    });
    if (!added.ok) return;

    const checkoutKey = `easyshop-load-${workerId}-${counter}-${suffix}`;
    const checkedOut = await send('checkout', '/api/orders/checkout', {
      method: 'POST', sessionKey, idempotencyKey: checkoutKey,
      body: {
        address: {
          receiver: 'Local Load Test', phone: '09120000000', province: 'تهران', city: 'تهران',
          line: 'آدرس آزمایشی - دیتابیس موقت', postal_code: '1234567890',
        },
        shipping_method: 'post',
        payment_method: 'gateway',
        payment_provider: 'mock',
      },
    });
    if (!checkedOut.ok || !checkedOut.payload?.order?.id) return;
    checkoutCount += 1;
    const payment = checkedOut.payload.payment;
    const settled = await send('payment_settlement', `/api/orders/${encodeURIComponent(checkedOut.payload.order.id)}/pay`, {
      method: 'POST', sessionKey,
      body: {
        success: true,
        authority: payment?.authority,
        intent_token: payment?.intent_token,
        phone: '09120000000',
      },
    });
    if (!settled.ok) return;
  }

  async function stopChild() {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(7000).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); }),
    ]);
  }

  try {
    await waitUntilReady(baseUrl, child, getLog);
    const dbPath = path.join(dataDir, 'easyshop.db');
    const probe = new DatabaseSync(dbPath);
    try {
      productId = probe.prepare("SELECT id FROM products WHERE status='active' AND stock > 0 ORDER BY stock DESC, id LIMIT 1").get()?.id || null;
      if (productId) probe.prepare('UPDATE products SET stock=1000000 WHERE id=?').run(productId);
    } finally {
      probe.close();
    }
    if (!productId && scenario !== 'api') throw new Error('Seed database has no in-stock product for checkout load.');

    const startedAt = performance.now();
    stopAt = Date.now() + durationSeconds * 1000;
    await Promise.all(Array.from({ length: concurrency }, async (_, workerId) => {
      let localCounter = 0;
      while (Date.now() < stopAt && operations < maxOperations) {
        const current = operations;
        operations += 1;
        localCounter += 1;
        const wantsCheckout = scenario === 'checkout'
          || (scenario === 'mixed' && current % 4 === 0);
        if (wantsCheckout) await runCheckoutOperation(workerId, localCounter);
        else await runApiOperation(current);
      }
    }));
    const elapsedSeconds = (performance.now() - startedAt) / 1000;
    const groups = {};
    for (const [name, values] of samples.entries()) groups[name] = summarize(values, errorCounts.get(name) || 0);
    const allSamples = [...samples.values()].flat();
    const allErrors = [...errorCounts.values()].reduce((sum, value) => sum + value, 0);
    const aggregate = summarize(allSamples, allErrors);
    const checkout = groups.checkout || summarize([], 0);
    const passed = allErrors === 0 && (checkout.p95_ms === null || checkout.p95_ms <= latencyTargetMs);
    const report = {
      target: 'disposable local API with a fresh temporary SQLite database',
      scenario,
      duration_seconds: Number(elapsedSeconds.toFixed(2)),
      concurrency,
      planned_operations: operations,
      completed_http_requests: requestCount,
      requests_per_second: Number((requestCount / elapsedSeconds).toFixed(2)),
      checkout_operations: checkoutCount,
      overall: aggregate,
      by_route_group: groups,
      failure_samples: failureSamples,
      slo_thresholds: { checkout_p95_ms: latencyTargetMs, zero_http_errors: true },
      passed,
      note: 'Synthetic local evidence only; not a staging/production capacity certification.',
    };
    console.log(JSON.stringify(report, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await stopChild();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Local load test failed: ${error.message}`);
  process.exitCode = 1;
});
