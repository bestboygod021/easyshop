import { all, get, run } from '../db/index.js';

/**
 * سرویس بررسی سلامت ساختار دیتابیس SQLite و بهینه‌سازی دیسک (Vacuum)
 */

export class DatabaseMaintenanceService {
  /**
   * اجرای تست سلامت کامل ساختار فایل دیتابیس
   * @returns {{ status: 'ok' | 'corrupt', details: string[] }}
   */
  checkIntegrity() {
    try {
      const results = all(`PRAGMA integrity_check`);
      const isOk = results.length === 1 && results[0]?.integrity_check === 'ok';
      return {
        status: isOk ? 'ok' : 'corrupt',
        details: results.map(r => r.integrity_check),
      };
    } catch (err) {
      return {
        status: 'error',
        details: [err.message],
      };
    }
  }

  /**
   * ارزیابی فضای دیسک و تعداد صفحات فایل دیتابیس
   */
  getDatabaseStats() {
    const pageSize = get(`PRAGMA page_size`)?.page_size || 4096;
    const pageCount = get(`PRAGMA page_count`)?.page_count || 0;
    const freelistCount = get(`PRAGMA freelist_count`)?.freelist_count || 0;

    const totalBytes = pageSize * pageCount;
    const freeBytes = pageSize * freelistCount;

    return {
      page_size: pageSize,
      page_count: pageCount,
      freelist_count: freelistCount,
      total_size_mb: Math.round((totalBytes / 1024 / 1024) * 100) / 100,
      reclaimable_space_mb: Math.round((freeBytes / 1024 / 1024) * 100) / 100,
    };
  }

  /**
   * آزادسازی فضای بلااستفاده دیسک
   */
  vacuum() {
    run(`VACUUM`);
    return {
      success: true,
      message: 'فرآیند بهینه‌سازی دیسک و Vacuum دیتابیس با موفقیت انجام شد.',
    };
  }
}

export const dbMaintenanceService = new DatabaseMaintenanceService();
