/**
 * مدیریت مدارشکن (Circuit Breaker) برای درگاه‌های پرداخت
 * به منظور تشخیص خودکار قطعی یا اختلال درگاه و سوییچ خودکار به درگاه‌های پشتیبان
 */

export const CircuitState = {
  CLOSED: 'CLOSED',       // سالم - جریان عادی
  OPEN: 'OPEN',           // قطع - خطاهای متوالی بیش از حد مجاز، درگاه موقتاً مسدود
  HALF_OPEN: 'HALF_OPEN', // نیمه‌باز - آزمودن مجدد جهت ارزیابی بهبود وضعیت درگاه
};

export class GatewayCircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 3; // تعداد خطای متوالی برای باز شدن مدار
    this.resetTimeoutMs = options.resetTimeoutMs || 30000;  // زمان انتظار پیش از تست مجدد (۳۰ ثانیه)
    this.gateways = new Map();
  }

  getGatewayStatus(name) {
    if (!this.gateways.has(name)) {
      this.gateways.set(name, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        successCount: 0,
      });
    }
    const gw = this.gateways.get(name);
    const now = Date.now();

    // اگر مدار باز بوده و زمان انتظار تمام شده، به حالت نیمه‌باز می‌رود
    if (gw.state === CircuitState.OPEN && now - gw.lastFailureTime > this.resetTimeoutMs) {
      gw.state = CircuitState.HALF_OPEN;
    }

    return gw;
  }

  isAvailable(name) {
    const status = this.getGatewayStatus(name);
    return status.state !== CircuitState.OPEN;
  }

  recordSuccess(name) {
    const gw = this.getGatewayStatus(name);
    gw.state = CircuitState.CLOSED;
    gw.failureCount = 0;
    gw.successCount += 1;
  }

  recordFailure(name) {
    const gw = this.getGatewayStatus(name);
    gw.failureCount += 1;
    gw.lastFailureTime = Date.now();

    if (gw.failureCount >= this.failureThreshold) {
      gw.state = CircuitState.OPEN;
    }
  }

  /**
   * انتخاب هوشمند بهترین درگاه در دسترس از میان درگاه‌های پیکربندی شده
   * @param {Array<string>} preferredList لیست اولویت درگاه‌ها (مثلاً ['zibal', 'zarinpal', 'mrpardakht', 'mellat'])
   * @returns {string | null}
   */
  selectBestGateway(preferredList) {
    for (const gw of preferredList) {
      if (this.isAvailable(gw)) {
        return gw;
      }
    }
    // در صورت قطع بودن تمام درگاه‌های ترجیحی، اولین درگاه را برای تلاش مجدد برمی‌گرداند
    return preferredList[0] || null;
  }
}

export const gatewayCircuitBreaker = new GatewayCircuitBreaker();
