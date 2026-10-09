/**
 * سیستم ارسال وب‌هوک و هشدارهای عملیاتی به مدیران سیستم
 * برای مانیتورینگ حملات، خطاهای بحرانی درگاه‌های پرداخت و لاگ‌های امنیتی
 */

export class OpsAlertManager {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl || process.env.OPS_ALERT_WEBHOOK_URL || null;
    this.enabled = options.enabled !== undefined ? options.enabled : Boolean(this.webhookUrl);
    this.history = [];
    this.maxHistory = options.maxHistory || 100;
  }

  /**
   * ثبت و ارسال هشدار امنیتی یا عملیاتی
   * @param {'info' | 'warning' | 'critical'} severity سطح حساسیت
   * @param {string} title عنوان هشدار
   * @param {Object} details جزئیات فنی و رخداد
   */
  async notify(severity, title, details = {}) {
    const alert = {
      id: `alt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      severity,
      title,
      details,
    };

    this.history.unshift(alert);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    // ثبت رخداد
    if (this.enabled && this.webhookUrl) {
      try {
        // ارسال غیراختلالی به وب‌هوک
        await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 [${severity.toUpperCase()}] EasyShop Alert: ${title}`,
            alert,
          }),
          signal: AbortSignal.timeout(3000),
        });
      } catch (err) {
        // خطا در ارسال وب‌هوک
      }
    }

    return alert;
  }

  getRecentAlerts(limit = 20) {
    return this.history.slice(0, limit);
  }
}

export const opsAlerts = new OpsAlertManager();
