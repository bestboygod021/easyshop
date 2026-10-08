import { all, get, nowIso, run, stringifyJson, uid } from '../db/index.js';

/**
 * Reconciles an external bank statement list against internal payment records.
 * @param {Array<{ reference_id: string, amount: number, provider?: string, bank_date?: string }>} bankTransactions
 * @param {string} provider
 * @returns {object} Summary and items of reconciliation
 */
export function reconcileBankSettlements(bankTransactions, provider = 'zibal') {
  const batchId = uid('rec');
  const now = nowIso();
  let matchedCount = 0;
  let mismatchedAmountCount = 0;
  let missingLocallyCount = 0;

  const records = [];

  for (const tx of bankTransactions) {
    const refId = String(tx.reference_id || tx.ref_id || '').trim();
    const bankAmount = Number(tx.amount) || 0;

    if (!refId) continue;

    // Search internal payments by ref_id or authority
    const payment = get(
      `SELECT * FROM payments WHERE (ref_id = ? OR authority = ?) AND (provider = ? OR ? = '') LIMIT 1`,
      refId,
      refId,
      provider,
      provider,
    );

    let status = 'matched';
    let details = null;
    let orderId = null;

    if (!payment) {
      status = 'missing_locally';
      missingLocallyCount++;
      details = JSON.stringify({ reason: 'تراکنش بانکی در سیستم فروشگاه یافت نشد.' });
    } else {
      orderId = payment.order_id;
      if (Number(payment.amount) !== bankAmount) {
        status = 'amount_mismatch';
        mismatchedAmountCount++;
        details = JSON.stringify({
          expected: Number(payment.amount),
          received: bankAmount,
          reason: 'مبلغ تراکنش بانکی با مبلغ ثبت‌شده سفارش مغایرت دارد.',
        });
      } else {
        matchedCount++;
        details = JSON.stringify({ match: true, payment_id: payment.id, payment_status: payment.status });
      }
    }

    const recId = uid('rci');
    run(
      `INSERT INTO bank_reconciliations (id, batch_id, provider, reference_id, order_id, amount, status, reconciled_at, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      recId,
      batchId,
      provider,
      refId,
      orderId,
      bankAmount,
      status,
      now,
      details,
    );

    records.push({
      id: recId,
      reference_id: refId,
      order_id: orderId,
      amount: bankAmount,
      status,
      details: details ? JSON.parse(details) : null,
    });
  }

  return {
    batch_id: batchId,
    total_processed: bankTransactions.length,
    matched: matchedCount,
    mismatched_amount: mismatchedAmountCount,
    missing_locally: missingLocallyCount,
    reconciled_at: now,
    records,
  };
}

/**
 * Calculates stock demand forecasting and smart reorder points based on 30-day velocity.
 * Formula: Safety Stock = Max(2, Z * std_dev) or (Lead Time Days * Daily Velocity * 0.5)
 * Reorder Point (ROP) = (Average Daily Sales * Lead Time Days) + Safety Stock
 */
export function calculateReorderPoints(leadTimeDays = 7) {
  const products = all(
    `SELECT p.id, p.name_fa, p.stock, p.price, p.cost,
            COALESCE(SUM(oi.qty), 0) as sold_last_30_days
     FROM products p
     LEFT JOIN order_items oi ON oi.product_id = p.id
     LEFT JOIN orders o ON o.id = oi.order_id AND o.payment_status = 'paid' AND o.placed_at >= datetime('now', '-30 days')
     WHERE p.status = 'active'
     GROUP BY p.id`,
  );

  return products.map((item) => {
    const dailyVelocity = Number((item.sold_last_30_days / 30).toFixed(2));
    const leadTime = Math.max(1, Number(leadTimeDays) || 7);
    const leadTimeDemand = Math.ceil(dailyVelocity * leadTime);
    // Buffer safety stock based on 50% lead time demand (min 2 units)
    const safetyStock = Math.max(2, Math.ceil(leadTimeDemand * 0.5));
    const reorderPoint = leadTimeDemand + safetyStock;
    const currentStock = Number(item.stock) || 0;
    const needsReorder = currentStock <= reorderPoint;
    const recommendedOrderQty = needsReorder ? Math.max(reorderPoint * 2 - currentStock, 10) : 0;

    return {
      product_id: item.id,
      name: item.name_fa,
      current_stock: currentStock,
      sold_last_30_days: item.sold_last_30_days,
      daily_velocity: dailyVelocity,
      lead_time_days: leadTime,
      safety_stock: safetyStock,
      reorder_point: reorderPoint,
      needs_reorder: needsReorder,
      urgency: currentStock <= safetyStock ? 'critical' : (needsReorder ? 'warning' : 'ok'),
      recommended_order_qty: recommendedOrderQty,
    };
  }).sort((a, b) => (b.needs_reorder ? 1 : 0) - (a.needs_reorder ? 1 : 0));
}
