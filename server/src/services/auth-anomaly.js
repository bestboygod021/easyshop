import { all, run } from '../db/index.js';

/**
 * سرویس پایش نوسانات غیرعادی احراز هویت و هشدارهای حملات بروت فورس
 */
export class AuthAnomalyAlertService {
  constructor(failedThreshold = 10, windowMinutes = 15) {
    this.failedThreshold = failedThreshold;
    this.windowMinutes = windowMinutes;
  }

  /**
   * ارزیابی تلاش‌های ناموفق ورود در پنجره زمانی مشخص و تشخیص حملات توزیع‌شده یا بروت‌فورس
   */
  detectAnomalies() {
    const windowStart = new Date(Date.now() - this.windowMinutes * 60 * 1000).toISOString();

    // شناسایی IP هایی با تلاش‌های ناموفق بیش از آستانه
    const suspiciousIps = all(
      `SELECT ip, COUNT(*) as failed_count
       FROM login_attempts
       WHERE success = 0 AND created_at >= ?
       GROUP BY ip
       HAVING failed_count >= ?
       ORDER BY failed_count DESC`,
      windowStart, this.failedThreshold
    );

    // شناسایی حساب‌هایی که هدف حملات متمرکز قرار گرفته‌اند
    const targetedAccounts = all(
      `SELECT email, COUNT(*) as attempt_count, COUNT(DISTINCT ip) as ip_count
       FROM login_attempts
       WHERE success = 0 AND created_at >= ?
       GROUP BY email
       HAVING attempt_count >= ?
       ORDER BY attempt_count DESC`,
      windowStart, this.failedThreshold
    );

    const hasAnomaly = suspiciousIps.length > 0 || targetedAccounts.length > 0;
    const alertLevel = (suspiciousIps.length > 3 || targetedAccounts.some(a => a.attempt_count > 30)) ? 'critical' : (hasAnomaly ? 'warning' : 'normal');

    return {
      window_minutes: this.windowMinutes,
      evaluated_at: new Date().toISOString(),
      has_anomaly: hasAnomaly,
      alert_level: alertLevel,
      suspicious_ips: suspiciousIps,
      targeted_accounts: targetedAccounts,
      recommended_action: hasAnomaly 
        ? 'فعال‌سازی چالش کپچا و مسدودسازی موقت IP های مشکوک توصیه می‌شود.' 
        : 'وضعیت ترافیک احراز هویت عادی است.'
    };
  }
}

export const authAnomalyAlertService = new AuthAnomalyAlertService();
