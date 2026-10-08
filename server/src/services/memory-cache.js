/**
 * حافظه کش سبک درون‌برنامه‌ای (In-Memory SWR Cache)
 * جهت افزایش سرعت پاسخگویی و کاهش بار پرس‌وجوهای سنگین دیتابیس
 */

export class MemoryCache {
  constructor(defaultTtlMs = 60000, maxEntries = 500) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.cache.size >= this.maxEntries) {
      // حذف قدیمی‌ترین کلید
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * الگوی Stale-While-Revalidate: اگر داده منقضی شده موجود باشد فوراً برمی‌گرداند
   * و همزمان در پس‌زمینه تابع بازتولید داده را صدا می‌زند
   */
  async getOrCompute(key, computeFn, ttlMs = this.defaultTtlMs) {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (entry && now <= entry.expiresAt) {
      return { data: entry.value, fromCache: true, stale: false };
    }

    if (entry && now > entry.expiresAt) {
      // داده قدیمی (Stale) موجود است؛ به‌روزرسانی نامتقارن
      computeFn().then((freshValue) => {
        this.set(key, freshValue, ttlMs);
      }).catch(() => {});
      return { data: entry.value, fromCache: true, stale: true };
    }

    // مقداری در کش نیست؛ محاسبه و ذخیره کن
    const freshValue = await computeFn();
    this.set(key, freshValue, ttlMs);
    return { data: freshValue, fromCache: false, stale: false };
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

export const globalCache = new MemoryCache();
