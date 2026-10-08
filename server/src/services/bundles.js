import { all, get, nowIso, run, uid } from '../db/index.js';

/**
 * Product Bundles & Kitting Manager.
 */

export function createProductBundle({ title, discountPct = 10, items = [] }) {
  const bundleId = uid('bnd');
  const now = nowIso();
  run(
    `INSERT INTO product_bundles (id, title, discount_pct, is_active, created_at)
     VALUES (?, ?, ?, 1, ?)`,
    bundleId,
    title,
    discountPct,
    now,
  );

  for (const item of items) {
    if (item.product_id) {
      run(
        `INSERT INTO product_bundle_items (bundle_id, product_id, qty)
         VALUES (?, ?, ?)`,
        bundleId,
        item.product_id,
        Number(item.qty) || 1,
      );
    }
  }

  return getBundleDetails(bundleId);
}

export function getBundleDetails(bundleId) {
  const bundle = get('SELECT * FROM product_bundles WHERE id = ?', bundleId);
  if (!bundle) return null;

  const items = all(
    `SELECT bi.qty, p.id, p.name_fa, p.price, p.stock
     FROM product_bundle_items bi
     JOIN products p ON p.id = bi.product_id
     WHERE bi.bundle_id = ?`,
    bundle.id,
  );

  const originalTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const bundlePrice = Math.round(originalTotal * (1 - (bundle.discount_pct / 100)));
  const maxAvailableBundles = items.length
    ? Math.min(...items.map((i) => Math.floor(i.stock / i.qty)))
    : 0;

  return {
    id: bundle.id,
    title: bundle.title,
    discount_pct: bundle.discount_pct,
    is_active: Boolean(bundle.is_active),
    items,
    original_total: originalTotal,
    bundle_price: bundlePrice,
    available_stock: Math.max(0, maxAvailableBundles),
  };
}

export function listActiveBundles() {
  const bundles = all('SELECT id FROM product_bundles WHERE is_active = 1');
  return bundles.map((b) => getBundleDetails(b.id)).filter(Boolean);
}
