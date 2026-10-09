import { all, productPublic } from '../utils/helpers.js';

/**
 * Recommends complementary products based on collaborative co-occurrence in orders.
 * "Customers who bought items in your cart also bought..."
 * @param {string[]} productIds - Array of product IDs currently in the cart
 * @param {number} limit - Number of recommendations to return
 */
export function getCartRecommendations(productIds = [], limit = 4) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    // If no cart items, return top selling active products
    const popular = all(
      `SELECT p.*, COALESCE(SUM(oi.qty), 0) AS popularity
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       WHERE p.status = 'active'
       GROUP BY p.id
       ORDER BY popularity DESC, p.created_at DESC
       LIMIT ?`,
      limit,
    );
    return popular.map((p) => productPublic(p, { withDescription: false }));
  }

  const placeholders = productIds.map(() => '?').join(',');
  // Find products that appear together with cart items in paid orders
  const coOccurred = all(
    `SELECT p.*, COUNT(DISTINCT o.id) AS co_count
     FROM order_items oi_cart
     JOIN orders o ON o.id = oi_cart.order_id
     JOIN order_items oi_other ON oi_other.order_id = o.id
     JOIN products p ON p.id = oi_other.product_id
     WHERE oi_cart.product_id IN (${placeholders})
       AND oi_other.product_id NOT IN (${placeholders})
       AND p.status = 'active'
       AND p.stock > 0
     GROUP BY p.id
     ORDER BY co_count DESC, p.created_at DESC
     LIMIT ?`,
    ...productIds,
    ...productIds,
    limit,
  );

  if (coOccurred.length >= limit) {
    return coOccurred.map((p) => productPublic(p, { withDescription: false }));
  }

  // Fallback to fill up to limit with category-related active products
  const existingIds = new Set([...productIds, ...coOccurred.map((p) => p.id)]);
  const catPlaceholders = productIds.map(() => '?').join(',');
  const fallback = all(
    `SELECT p.* FROM products p
     WHERE p.category_id IN (SELECT category_id FROM products WHERE id IN (${catPlaceholders}))
       AND p.id NOT IN (${[...existingIds].map(() => '?').join(',')})
       AND p.status = 'active'
       AND p.stock > 0
     LIMIT ?`,
    ...productIds,
    ...existingIds,
    limit - coOccurred.length,
  );

  return [...coOccurred, ...fallback].slice(0, limit).map((p) => productPublic(p, { withDescription: false }));
}
