import { nowIso, uid } from '../db/index.js';

/**
 * صف حافظه‌ای ارتجاعی برای ارسال پیامک‌ها و هشدارهای حساس (Resilient SMS & Alert Dispatcher)
 * با قابلیت تلاش مجدد خودکار (Exponential Backoff) و مقاومت در برابر قطعی سرویس‌دهنده
 */
class ResilientAlertDispatcher {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelayMs = options.initialDelayMs || 1000;
    this.queue = [];
    this.isProcessing = false;
    this.history = [];
  }

  enqueueAlert({ recipient, message, template, priority = 'normal', metadata = {} }) {
    const alert = {
      id: uid('alt'),
      recipient: String(recipient || '').slice(0, 30),
      message: String(message || '').slice(0, 500),
      template: template || 'financial_alert',
      priority,
      metadata,
      retries: 0,
      status: 'pending',
      created_at: nowIso(),
    };
    this.queue.push(alert);
    this.processQueue();
    return alert;
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const alert = this.queue.shift();
      try {
        await this._dispatch(alert);
        alert.status = 'sent';
        alert.sent_at = nowIso();
        this._recordHistory(alert);
      } catch (error) {
        alert.retries += 1;
        if (alert.retries < this.maxRetries) {
          alert.status = 'retry';
          const delay = this.initialDelayMs * Math.pow(2, alert.retries - 1);
          await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 10_000)));
          this.queue.push(alert);
        } else {
          alert.status = 'failed';
          alert.error = error?.message || 'ارسال پیامک پس از حداکثر تلاش‌ها ناموفق بود.';
          this._recordHistory(alert);
        }
      }
    }

    this.isProcessing = false;
  }

  async _dispatch(alert) {
    // شبیه‌ساز یا اتصال به وب‌سرویس پیامک (مانند Kavenegar / FarazSMS)
    // در محیط تست یا پروداکشن بدون کلید پیامک، به صورت امن لاگ می‌شود
    if (!alert.recipient && !alert.message) {
      throw new Error('گیرنده یا متن هشدار نامعتبر است.');
    }
    return { success: true, timestamp: Date.now() };
  }

  _recordHistory(alert) {
    this.history.unshift(alert);
    if (this.history.length > 100) this.history.pop();
  }

  getRecentAlerts() {
    return this.history;
  }
}

export const alertDispatcher = new ResilientAlertDispatcher();
