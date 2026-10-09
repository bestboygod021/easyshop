import { all, run, nowIso, uid } from '../db/index.js';

/**
 * سیستم تحلیل کلمات ترند و رهگیری کوئری‌های پرجستجو و جستجوهای بدون نتیجه
 * (Search Trend Analytics & Zero-Result Query Monitor)
 */
export class SearchTrendAnalyticsService {
  /**
   * ثبت یک جستجوی جدید توسط کاربر یا مهمان
   */
  logSearchQuery({ query, resultsCount = 0, userId = null }) {
    const clean = String(query || '').trim().toLowerCase();
    if (!clean || clean.length < 2) return null;

    const logId = uid('srch');
    const now = nowIso();

    run(
      `INSERT INTO search_query_logs (id, query_text, results_count, user_id, searched_at)
       VALUES (?, ?, ?, ?, ?)`,
      logId,
      clean,
      Number(resultsCount) || 0,
      userId,
      now,
    );

    return { logged: true, query: clean, results_count: resultsCount };
  }

  /**
   * دریافت ترندهای برتر و کلمات پرتکرار در نوار جستجو
   */
  getTopTrendingSearches(limit = 6) {
    const rows = all(
      `SELECT query_text, COUNT(*) AS search_volume, AVG(results_count) AS avg_results
       FROM search_query_logs
       GROUP BY query_text
       ORDER BY search_volume DESC
       LIMIT ?`,
      limit,
    );

    if (rows.length === 0) {
      // مقادیر پیش‌فرض کاربردی بازار در صورت خالی بودن لاگ
      return [
        { query_text: 'گوشی سامسونگ', search_volume: 48, avg_results: 12 },
        { query_text: 'لپ تاپ ایسوس', search_volume: 35, avg_results: 8 },
        { query_text: 'هدفون بی‌سیم', search_volume: 29, avg_results: 6 },
        { query_text: 'پاوربانک فست شارژ', search_volume: 24, avg_results: 15 },
        { query_text: 'کیبورد مکانیکال', search_volume: 18, avg_results: 5 },
      ];
    }

    return rows;
  }

  /**
   * دریافت لیست کوئری‌های بدون نتیجه (Zero-Result Searches) جهت توسعه کاتالوگ توسط مدیر
   */
  getZeroResultSearches(limit = 10) {
    return all(
      `SELECT query_text, COUNT(*) AS fail_count, MAX(searched_at) AS last_searched
       FROM search_query_logs
       WHERE results_count = 0
       GROUP BY query_text
       ORDER BY fail_count DESC
       LIMIT ?`,
      limit,
    );
  }
}

export const searchTrendAnalyticsService = new SearchTrendAnalyticsService();
