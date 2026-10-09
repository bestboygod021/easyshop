import { all } from '../db/index.js';

/**
 * Computes RFM (Recency, Frequency, Monetary) Customer Segmentation scores.
 * Recency: Days since last paid order (Lower days = higher R score: 1 to 5)
 * Frequency: Total paid order count (Higher count = higher F score: 1 to 5)
 * Monetary: Total spent (Higher spend = higher M score: 1 to 5)
 */
export function calculateRfmSegments() {
  const customers = all(
    `SELECT u.id, u.full_name, u.email,
            COALESCE(COUNT(o.id), 0) AS frequency,
            COALESCE(SUM(o.total), 0) AS monetary,
            MAX(o.placed_at) AS last_order_date
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id AND o.payment_status = 'paid'
     WHERE u.role = 'customer'
     GROUP BY u.id`,
  );

  const now = Date.now();

  return customers.map((c) => {
    const daysSinceLast = c.last_order_date
      ? Math.max(0, Math.floor((now - new Date(c.last_order_date).getTime()) / (1000 * 60 * 60 * 24)))
      : 999;

    // Recency Score (1-5)
    let r = 1;
    if (daysSinceLast <= 15) r = 5;
    else if (daysSinceLast <= 30) r = 4;
    else if (daysSinceLast <= 60) r = 3;
    else if (daysSinceLast <= 120) r = 2;

    // Frequency Score (1-5)
    let f = 1;
    if (c.frequency >= 10) f = 5;
    else if (c.frequency >= 5) f = 4;
    else if (c.frequency >= 3) f = 3;
    else if (c.frequency >= 1) f = 2;

    // Monetary Score (1-5)
    let m = 1;
    if (c.monetary >= 20_000_000) m = 5;
    else if (c.monetary >= 10_000_000) m = 4;
    else if (c.monetary >= 5_000_000) m = 3;
    else if (c.monetary >= 1_000_000) m = 2;

    // Segment Definition
    let segment = 'new_or_inactive';
    const rfmScore = `${r}${f}${m}`;

    if (r >= 4 && f >= 4 && m >= 4) {
      segment = 'champions'; // قهرمانان
    } else if (r >= 3 && f >= 3) {
      segment = 'loyal_customers'; // مشتریان وفادار
    } else if (r >= 4 && f <= 2) {
      segment = 'promising'; // خریداران جدید با پتانسیل
    } else if (r <= 2 && f >= 3) {
      segment = 'at_risk'; // نیازمند توجه و فعال‌سازی مجدد
    } else if (r <= 2 && f <= 2 && c.frequency > 0) {
      segment = 'hibernating'; // خواب‌رفته
    }

    return {
      user_id: c.id,
      name: c.full_name,
      email: c.email,
      recency_days: daysSinceLast,
      frequency: c.frequency,
      monetary: c.monetary,
      scores: { r, f, m, combined: rfmScore },
      segment,
    };
  }).sort((a, b) => b.monetary - a.monetary);
}
