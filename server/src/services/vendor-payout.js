import { all, get, nowIso, run, uid } from '../db/index.js';

/**
 * Calculates marketplace vendor sales, commissions, and net payouts.
 * @param {string} period - e.g. '2026-10'
 * @param {number} commissionPct - platform commission percent (default 10%)
 */
export function calculateVendorPayouts(period, commissionPct = 10) {
  // Pull vendors (users with role 'seller')
  const vendors = all("SELECT id, full_name, email, phone FROM users WHERE role = 'seller'");
  const now = nowIso();
  const results = [];

  for (const v of vendors) {
    // Sum total paid sales for products created/sold by this vendor
    const sales = get(
      `SELECT COALESCE(SUM(oi.total), 0) AS total_sales
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE p.created_by = ? AND o.payment_status = 'paid'`,
      v.id,
    )?.total_sales || 0;

    if (sales > 0) {
      const comm = Math.round((sales * commissionPct) / 100);
      const net = sales - comm;
      const payoutId = uid('payo');

      run(
        `INSERT INTO vendor_payouts (id, vendor_id, period, total_sales, commission, net_payout, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        payoutId,
        v.id,
        period,
        sales,
        comm,
        net,
        now,
      );

      results.push({
        payout_id: payoutId,
        vendor_id: v.id,
        vendor_name: v.full_name,
        period,
        total_sales: sales,
        commission: comm,
        net_payout: net,
        status: 'pending',
      });
    }
  }

  return results;
}
