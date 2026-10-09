import { suggestFuzzyCorrection } from './fuzzy-search.js';
import { MemoryCache } from './memory-cache.js';

/**
 * کش اختصاصی کوئری‌های پرکاربرد جستجوی فازی محصولات
 */

class SearchCacheService {
  constructor() {
    this.cache = new MemoryCache(120000, 1000); // نگهداری نتایج به مدت ۲ دقیقه برای ۱۰۰۰ عبارت پرجستجو
  }

  async searchWithCache(query, candidates, options = {}) {
    const normalizedQuery = (query || '').trim().toLowerCase();
    const cacheKey = `search:${normalizedQuery}:${options.limit || 5}`;

    return this.cache.getOrCompute(
      cacheKey,
      async () => {
        return suggestFuzzyCorrection(normalizedQuery, candidates);
      },
      120000
    );
  }

  invalidate() {
    this.cache.clear();
  }
}

export const searchCacheService = new SearchCacheService();

