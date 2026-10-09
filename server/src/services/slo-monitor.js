import { config } from '../config.js';
import { metricsRegistry } from './metrics.js';
import { opsAlerts } from './ops-alerts.js';

const activeAlerts = new Map();
let timer = null;
let checking = false;

export function evaluateSlo(snapshot, thresholds = config.observability) {
  const alerts = [];
  if (snapshot.requests >= thresholds.minHttpRequests) {
    if (snapshot.availability < thresholds.availabilityTarget) {
      alerts.push({
        key: 'http-availability',
        severity: snapshot.availability < thresholds.availabilityTarget - 0.01 ? 'critical' : 'warning',
        title: 'SLO دسترس‌پذیری HTTP نقض شده است',
        details: {
          requests: snapshot.requests,
          server_errors: snapshot.server_errors,
          availability: snapshot.availability,
          target: thresholds.availabilityTarget,
          window_ms: snapshot.window_ms,
        },
      });
    }
    if (snapshot.p95_latency_ms > thresholds.httpP95TargetMs) {
      alerts.push({
        key: 'http-p95-latency',
        severity: snapshot.p95_latency_ms > thresholds.httpP95TargetMs * 2 ? 'critical' : 'warning',
        title: 'SLO تأخیر p95 HTTP نقض شده است',
        details: {
          requests: snapshot.requests,
          p95_latency_ms: snapshot.p95_latency_ms,
          target_ms: thresholds.httpP95TargetMs,
          window_ms: snapshot.window_ms,
        },
      });
    }
  }

  if (snapshot.payment_verifications >= thresholds.minPaymentVerifications
    && snapshot.payment_verification_success_rate < thresholds.paymentSuccessTarget) {
    alerts.push({
      key: 'payment-verification',
      severity: snapshot.payment_verification_success_rate < thresholds.paymentSuccessTarget - 0.05 ? 'critical' : 'warning',
      title: 'SLO تأیید پرداخت سمت سرور نقض شده است',
      details: {
        verifications: snapshot.payment_verifications,
        failures: snapshot.payment_verification_failures,
        success_rate: snapshot.payment_verification_success_rate,
        target: thresholds.paymentSuccessTarget,
        window_ms: snapshot.window_ms,
      },
    });
  }

  if (snapshot.manual_payment_reviews > 0) {
    alerts.push({
      key: 'manual-payment-review',
      severity: 'critical',
      title: 'پرداخت در صف بررسی دستی قرار گرفته است',
      details: { count: snapshot.manual_payment_reviews, window_ms: snapshot.window_ms },
    });
  }
  return alerts;
}

export async function evaluateSloAlerts(now = Date.now()) {
  const snapshot = metricsRegistry.getSloSnapshot({ windowMs: config.observability.sloWindowMs, now });
  const current = evaluateSlo(snapshot);
  const currentKeys = new Set(current.map((alert) => alert.key));
  const cooldown = config.observability.sloAlertCooldownMs;

  for (const alert of current) {
    const previous = activeAlerts.get(alert.key);
    if (!previous || now - previous.lastSentAt >= cooldown) {
      await opsAlerts.notify(alert.severity, alert.title, { alert_key: alert.key, ...alert.details });
      activeAlerts.set(alert.key, { lastSentAt: now, severity: alert.severity });
    }
  }

  for (const [key, previous] of activeAlerts.entries()) {
    if (currentKeys.has(key)) continue;
    await opsAlerts.notify('info', 'هشدار SLO برطرف شد', { alert_key: key, previous_severity: previous.severity });
    activeAlerts.delete(key);
  }

  return { snapshot, active: current.map(({ key, severity, title, details }) => ({ key, severity, title, details })) };
}

export function startSloMonitor() {
  if (timer) return;
  const runCheck = async () => {
    if (checking) return;
    checking = true;
    try {
      await evaluateSloAlerts();
    } catch (error) {
      console.error('SLO evaluation failed.', error?.message || error);
    } finally {
      checking = false;
    }
  };
  void runCheck();
  timer = setInterval(() => { void runCheck(); }, config.observability.sloEvaluationIntervalMs);
  timer.unref?.();
}

export function stopSloMonitor() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export function getActiveSloAlerts() {
  return [...activeAlerts.entries()].map(([key, value]) => ({ key, ...value }));
}
