import { all, get, run } from '../db/index.js';

/**
 * سرویس تجمیع، دسته‌بندی و شمارش تکرار خطاهای سمت کلاینت (Sentry-like Telemetry Aggregator)
 */

export class ClientErrorAggregator {
  /**
   * ثبت یا افزایش شمارنده خطای کلاینت
   */
  recordError({ errorMsg, url, userAgent, stack = null }) {
    if (!errorMsg) return { success: false };

    // تولید اثر انگشت منحصر‌به‌فرد خطا بر اساس ۵۰ کاراکتر اول پیام و آدرس مبدا
    const cleanMsg = String(errorMsg).trim().slice(0, 150);
    const cleanUrl = String(url || '').split('?')[0].slice(0, 100);
    const fingerprint = `${cleanUrl}::${cleanMsg}`;

    const existing = get(
      `SELECT id, occurrences FROM aggregated_client_errors WHERE fingerprint = ?`,
      fingerprint
    );

    const now = new Date().toISOString();

    if (existing) {
      run(
        `UPDATE aggregated_client_errors 
         SET occurrences = occurrences + 1, last_seen_at = ?, user_agent = ? 
         WHERE id = ?`,
        now,
        userAgent,
        existing.id
      );
      return { id: existing.id, occurrences: existing.occurrences + 1, is_new: false };
    }

    const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    run(
      `INSERT INTO aggregated_client_errors (
         id, fingerprint, error_msg, url, user_agent, stack, occurrences, first_seen_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      id,
      fingerprint,
      cleanMsg,
      cleanUrl,
      userAgent,
      stack,
      now,
      now
    );

    return { id, occurrences: 1, is_new: true };
  }

  /**
   * دریافت شایع‌ترین خطاهای کلاینت برای گزارش‌دهی به تیم فنی
   */
  getTopErrors(limit = 10) {
    return all(
      `SELECT * FROM aggregated_client_errors 
       ORDER BY occurrences DESC, last_seen_at DESC 
       LIMIT ?`,
      limit
    );
  }
}

export const clientErrorAggregator = new ClientErrorAggregator();
