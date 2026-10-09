/**
 * سرویس بررسی سلامت و در دسترس بودن پیوندها و تصاویر محصولات
 * جهت شناسایی لینک‌های شکسته (Broken Links) و تصاویر ۴۰۴ در کاتالوگ فروشگاه
 */

export class UrlHealthProber {
  /**
   * بررسی سلامت یک URL (تست فرمت، پروتکل مجاز و اعتبار ساختاری)
   * @param {string} url آدرس اینترنتی مورد نظر
   * @returns {{ valid: boolean, protocol: string | null, reason: string | null }}
   */
  validateUrlFormat(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, protocol: null, reason: 'آدرس اینترنتی خالی یا نامعتبر است.' };
    }

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, protocol: parsed.protocol, reason: 'تنها پروتکل‌های HTTP و HTTPS مجاز هستند.' };
      }

      // جلوگیری از پیمایش لوکال‌هاست یا دامنه‌های محلی در آدرس‌های خارجی
      const hostname = parsed.hostname.toLowerCase();
      if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname) || hostname.endsWith('.local')) {
        return { valid: false, protocol: parsed.protocol, reason: 'آدرس‌های محلی مجاز نمی‌باشند.' };
      }

      return { valid: true, protocol: parsed.protocol, reason: null };
    } catch {
      return { valid: false, protocol: null, reason: 'قالب نشانی اینترنتی نادرست است.' };
    }
  }

  /**
   * ارزیابی دسته‌ای تصاویر و لینک‌های محصولات
   * @param {Array<{ id: string, image_url: string }>} items
   */
  probeCatalogImages(items) {
    const results = [];
    for (const item of items) {
      const validation = this.validateUrlFormat(item.image_url);
      results.push({
        id: item.id,
        url: item.image_url,
        is_healthy: validation.valid,
        reason: validation.reason,
      });
    }

    const brokenCount = results.filter(r => !r.is_healthy).length;
    return {
      total_checked: items.length,
      broken_count: brokenCount,
      results,
    };
  }
}

export const urlHealthProber = new UrlHealthProber();
