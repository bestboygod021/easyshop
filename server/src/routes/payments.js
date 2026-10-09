import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { get, nowIso, notify, run, tx, uid } from '../db/index.js';
import { rateLimit } from '../middleware/security.js';
import { asyncHandler, fail, ok } from '../utils/helpers.js';
import { broadcast } from '../realtime/hub.js';
import { metricsRegistry } from '../services/metrics.js';
import { opsAlerts } from '../services/ops-alerts.js';
import {
  availablePaymentGateways,
  gatewayCallbackParameters,
  isPaymentGatewayProvider,
  normalizePaymentProvider,
  paymentResultUrl,
  verifyGatewayPayment,
} from '../services/payment-gateway.js';
import { releaseOrderReservations } from './orders.js';

const router = express.Router();
const CALLBACK_AUTHORITY_RE = /^[A-Za-z0-9_-]{8,80}$/;

function callbackKey(provider, callback) {
  const canonical = JSON.stringify({
    provider,
    authority: String(callback.authority || ''),
    status: String(callback.status || ''),
    sale_order_id: String(callback.sale_order_id || ''),
    sale_reference_id: String(callback.sale_reference_id || ''),
    tracking_number: String(callback.tracking_number || ''),
    invoice_id: String(callback.invoice_id || ''),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function recordCallback({ key, provider, callback, result, payment, errorCode, durationMs }) {
  const now = nowIso();
  const safeError = String(errorCode || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || null;
  run(
    `INSERT INTO payment_callback_events
       (id,provider,callback_status,result,target_type,target_id,error_code,duration_ms,callback_key,deliveries,last_seen_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,1,?,?)
     ON CONFLICT(callback_key) DO UPDATE SET
       callback_status=excluded.callback_status,
       result=excluded.result,
       target_type=excluded.target_type,
       target_id=excluded.target_id,
       error_code=excluded.error_code,
       duration_ms=excluded.duration_ms,
       deliveries=payment_callback_events.deliveries+1,
       last_seen_at=excluded.last_seen_at`,
    uid('pce'), provider, callback.status || null, result,
    payment ? 'order' : null, payment?.order_id || null, safeError,
    Math.max(0, Math.min(120_000, Math.round(Number(durationMs) || 0))), key, now, now,
  );
}

function redirectResult(req, res, status, order, refId) {
  res.setHeader('cache-control', 'no-store, private');
  res.setHeader('referrer-policy', 'no-referrer');
  return res.redirect(303, paymentResultUrl(req, {
    status,
    orderCode: order?.code,
    refId,
  }));
}

router.get('/providers', (_req, res) => {
  const providers = availablePaymentGateways()
    .filter((provider) => provider.provider !== 'mock' || !config.isProd)
    .map(({ provider, label, sandbox }) => ({ provider, label, sandbox }));
  res.setHeader('cache-control', 'no-store, private');
  return ok(res, { providers });
});

async function handleGatewayCallback(req, res) {
  const started = performance.now();
  const provider = normalizePaymentProvider(req.params.provider);
  if (!isPaymentGatewayProvider(provider) || provider === 'mock' || provider === 'snapppay') {
    return fail(res, 'درگاه پرداخت ناشناخته یا غیرفعال است.', 404);
  }

  const source = { ...(req.query || {}), ...(req.body || {}) };
  const callback = gatewayCallbackParameters(provider, source);
  const key = callbackKey(provider, callback);
  const authority = String(callback.authority || '').slice(0, 80);
  if (!CALLBACK_AUTHORITY_RE.test(authority)) {
    recordCallback({ key, provider, callback, result: 'invalid_authority', errorCode: 'invalid_authority', durationMs: performance.now() - started });
    metricsRegistry.recordPayment(provider, 'invalid_callback');
    return redirectResult(req, res, 'failed');
  }

  const payment = get('SELECT * FROM payments WHERE provider = ? AND authority = ?', provider, authority);
  if (!payment) {
    recordCallback({ key, provider, callback, result: 'unknown_payment', errorCode: 'unknown_payment', durationMs: performance.now() - started });
    metricsRegistry.recordPayment(provider, 'unknown_payment');
    return redirectResult(req, res, 'failed');
  }
  const order = get('SELECT * FROM orders WHERE id = ?', payment.order_id);
  if (!order) {
    recordCallback({ key, provider, callback, result: 'unknown_order', errorCode: 'unknown_order', durationMs: performance.now() - started, payment });
    metricsRegistry.recordPayment(provider, 'unknown_order');
    return redirectResult(req, res, 'failed');
  }

  if (callback.invoice_id && ![order.id, order.code].includes(callback.invoice_id)) {
    recordCallback({ key, provider, callback, result: 'order_mismatch', errorCode: 'order_mismatch', durationMs: performance.now() - started, payment });
    metricsRegistry.recordPayment(provider, 'order_mismatch');
    return redirectResult(req, res, 'failed', order);
  }

  if (payment.status === 'paid' && payment.applied) {
    recordCallback({ key, provider, callback, result: 'duplicate_paid', durationMs: performance.now() - started, payment });
    metricsRegistry.recordPayment(provider, 'duplicate');
    return redirectResult(req, res, 'success', order, payment.ref_id);
  }
  if (payment.status === 'paid' && !payment.applied) {
    recordCallback({ key, provider, callback, result: 'manual_review', errorCode: 'late_payment_review', durationMs: performance.now() - started, payment });
    metricsRegistry.recordPayment(provider, 'manual_review');
    return redirectResult(req, res, 'pending', order, payment.ref_id);
  }
  if (payment.status !== 'pending') {
    recordCallback({ key, provider, callback, result: 'already_final', errorCode: payment.failure_reason, durationMs: performance.now() - started, payment });
    metricsRegistry.recordPayment(provider, 'already_final');
    return redirectResult(req, res, 'failed', order);
  }

  // Browser callback parameters are not proof of payment. Only server-to-server verification can settle an order.
  if (callback.status !== 'OK') {
    recordCallback({ key, provider, callback, result: 'customer_cancelled', durationMs: performance.now() - started, payment });
    metricsRegistry.recordPayment(provider, 'cancelled');
    return redirectResult(req, res, 'failed', order);
  }

  let verification;
  try {
    verification = await verifyGatewayPayment({
      provider,
      authority,
      amount: payment.amount,
      orderId: order.id,
      callbackData: callback,
    });
  } catch (error) {
    recordCallback({ key, provider, callback, result: 'verification_error', errorCode: error?.code || 'verification_error', durationMs: performance.now() - started, payment });
    metricsRegistry.recordPayment(provider, 'verification_error');
    return redirectResult(req, res, 'pending', order);
  }

  if (verification.success && provider === 'bank_direct' && verification.settlement !== 'settled') {
    recordCallback({ key, provider, callback, result: 'settlement_pending', errorCode: verification.settlement_code || 'settlement_pending', durationMs: performance.now() - started, payment });
    metricsRegistry.recordPayment(provider, 'settlement_pending');
    return redirectResult(req, res, 'pending', order, verification.ref_id);
  }

  const refId = String(verification.ref_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || null;
  if (!verification.success) {
    const failed = tx(() => {
      const currentPayment = get('SELECT * FROM payments WHERE id = ?', payment.id);
      const currentOrder = get('SELECT * FROM orders WHERE id = ?', order.id);
      if (currentPayment?.status === 'paid') return { alreadyPaid: Boolean(currentPayment.applied), order: currentOrder, refId: currentPayment.ref_id };
      if (!currentPayment || currentPayment.status !== 'pending') return { finalized: true, order: currentOrder };
      const ts = nowIso();
      run("UPDATE payments SET status='failed',failure_reason=?,verified_at=? WHERE id=? AND status='pending'", String(verification.code || 'verification_failed').slice(0, 80), ts, payment.id);
      run("UPDATE checkout_intents SET status='failed' WHERE authority=? AND status='pending'", authority);
      if (currentOrder?.status === 'pending' && currentOrder.payment_status === 'unpaid') {
        run("UPDATE orders SET payment_status='failed',status='cancelled',cancelled_at=?,updated_at=? WHERE id=?", ts, ts, currentOrder.id);
        releaseOrderReservations(currentOrder, 'آزادسازی پس از رد تأیید پرداخت');
        run(
          'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
          uid('oev'), currentOrder.id, 'cancelled', 'تأیید پرداخت از سوی درگاه انجام نشد و رزروها آزاد شد.', 'درگاه پرداخت', ts,
        );
      }
      return { failed: true, order: currentOrder };
    });
    recordCallback({ key, provider, callback, result: failed.alreadyPaid ? 'duplicate_paid' : 'verification_failed', errorCode: verification.code || 'verification_failed', durationMs: performance.now() - started, payment });
    metricsRegistry.recordPayment(provider, failed.alreadyPaid ? 'duplicate' : 'verification_failed');
    return redirectResult(req, res, failed.alreadyPaid ? 'success' : 'failed', failed.order || order, failed.refId);
  }

  const settlement = tx(() => {
    const currentPayment = get('SELECT * FROM payments WHERE id = ?', payment.id);
    const currentOrder = get('SELECT * FROM orders WHERE id = ?', order.id);
    if (!currentPayment || !currentOrder) return { state: 'missing' };
    if (currentPayment.status === 'paid') {
      return { state: currentPayment.applied ? 'already_paid' : 'manual_review', order: currentOrder, refId: currentPayment.ref_id };
    }
    if (currentPayment.status !== 'pending') return { state: 'final', order: currentOrder };

    const otherAppliedPayment = get('SELECT id FROM payments WHERE order_id=? AND applied=1 AND id<>? LIMIT 1', order.id, payment.id);
    const expired = payment.expires_at && new Date(payment.expires_at).getTime() < Date.now();
    const orderCanBePaid = currentOrder.status === 'pending' && currentOrder.payment_status === 'unpaid' && !expired && !otherAppliedPayment;
    const ts = nowIso();

    if (!orderCanBePaid) {
      run(
        "UPDATE payments SET status='paid',applied=0,ref_id=?,verified_at=?,failure_reason=? WHERE id=? AND status='pending'",
        refId, ts, expired ? 'late_payment_review' : otherAppliedPayment ? 'duplicate_capture_review' : 'order_not_payable_review', payment.id,
      );
      run("UPDATE checkout_intents SET status='paid' WHERE authority=? AND status='pending'", authority);
      if (expired && currentOrder.status === 'pending' && currentOrder.payment_status === 'unpaid') {
        run("UPDATE orders SET payment_status='failed',status='cancelled',cancelled_at=?,updated_at=? WHERE id=?", ts, ts, currentOrder.id);
        releaseOrderReservations(currentOrder, 'آزادسازی پس از پرداخت دیرهنگام');
      }
      run(
        'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
        uid('oev'), currentOrder.id, currentOrder.status, `پرداخت دریافت شد اما به‌صورت خودکار روی سفارش اعمال نشد (${expired ? 'late' : otherAppliedPayment ? 'duplicate_capture' : 'order_state'}).`, 'سیستم', ts,
      );
      return { state: 'manual_review', order: get('SELECT * FROM orders WHERE id=?', currentOrder.id), refId };
    }

    const updatePayment = run(
      "UPDATE payments SET status='paid',applied=1,ref_id=?,verified_at=?,failure_reason=NULL WHERE id=? AND status='pending' AND applied=0",
      refId, ts, payment.id,
    );
    if (!updatePayment.changes) return { state: 'race', order: get('SELECT * FROM orders WHERE id=?', order.id) };
    run("UPDATE checkout_intents SET status='paid' WHERE authority=? AND status='pending'", authority);
    run("UPDATE orders SET payment_status='paid',status='paid',paid_at=?,updated_at=?,loyalty_reserved=0,coupon_reserved=0 WHERE id=? AND status='pending' AND payment_status='unpaid'", ts, ts, currentOrder.id);
    run(
      'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
      uid('oev'), currentOrder.id, 'paid', `پرداخت از طریق ${provider} تأیید و تسویه شد.`, 'درگاه پرداخت', ts,
    );
    if (currentOrder.user_id) {
      notify({ userId: currentOrder.user_id, title: 'پرداخت موفق', body: `سفارش ${currentOrder.code} با موفقیت پرداخت شد.`, type: 'order', link: `/account/orders/${currentOrder.id}` });
    }
    return { state: 'paid', order: get('SELECT * FROM orders WHERE id=?', currentOrder.id), refId };
  });

  const result = settlement.state === 'paid' ? 'verified_paid'
    : settlement.state === 'already_paid' ? 'duplicate_paid'
      : settlement.state === 'manual_review' ? 'manual_review'
        : settlement.state;
  recordCallback({ key, provider, callback, result, durationMs: performance.now() - started, payment });
  metricsRegistry.recordPayment(provider, settlement.state === 'paid' ? 'verified_paid' : result);

  if (settlement.state === 'paid') {
    broadcast('admin', { type: 'order:paid', order: { code: settlement.order.code, ref: settlement.refId } });
    return redirectResult(req, res, 'success', settlement.order, settlement.refId);
  }
  if (settlement.state === 'already_paid') return redirectResult(req, res, 'success', settlement.order, settlement.refId);
  if (settlement.state === 'manual_review') {
    void opsAlerts.notify('critical', 'پرداخت نیازمند بررسی دستی است', {
      provider,
      order_code: settlement.order?.code,
      payment_id: payment.id,
      amount: payment.amount,
    });
    metricsRegistry.recordPayment(provider, 'manual_review');
    return redirectResult(req, res, 'pending', settlement.order || order, settlement.refId);
  }
  return redirectResult(req, res, 'pending', settlement.order || order, settlement.refId);
}

router.all(
  '/callback/:provider',
  rateLimit({ ...config.security.rateLimits.write, scope: 'payment-callback', max: 120 }),
  asyncHandler(handleGatewayCallback),
);

export default router;
