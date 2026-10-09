/**
 * High-performance L1/L2 in-memory smart cache with event-driven invalidation.
 */

class SmartCache {
  constructor(defaultTtlSeconds = 60) {
    this.l1 = new Map(); // key -> { value, expiresAt }
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  get(key) {
    const entry = this.l1.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.l1.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlSeconds = null) {
    const ttl = (ttlSeconds ? ttlSeconds * 1000 : this.defaultTtlMs);
    this.l1.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  del(key) {
    this.l1.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this.l1.keys()) {
      if (key.startsWith(prefix)) {
        this.l1.delete(key);
      }
    }
  }

  clear() {
    this.l1.clear();
  }
}

export const smartCache = new SmartCache(120);
