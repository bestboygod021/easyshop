/**
 * Inventory Discrepancy & Cycle Counting Service (Round 26)
 * Facilitates warehouse cycle counts, logs discrepancies between physical count and system stock,
 * and records double-entry inventory write-offs / write-ups.
 */

export class InventoryDiscrepancyService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Record a cycle count result and calculate inventory variance
   */
  async recordCycleCount({ productId, countedStock, warehouseLocation = 'CENTRAL_WH', countedByUserId, notes = '' }) {
    if (!productId) throw new Error('شناسه محصول الزامی است');
    const physicalStock = Math.max(Number(countedStock) || 0, 0);

    const product = await this.db.get('SELECT id, title, stock, price FROM products WHERE id = ?', [productId]);
    if (!product) throw new Error('محصول مورد نظر یافت نشد');

    const systemStock = Number(product.stock) || 0;
    const varianceQuantity = physicalStock - systemStock;
    const varianceValueToman = varianceQuantity * (Number(product.price) || 0);

    let status = 'BALANCED';
    if (varianceQuantity < 0) status = 'SHORTAGE'; // کسری انبار
    if (varianceQuantity > 0) status = 'SURPLUS';  // مازاد انبار

    const countId = `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO inventory_cycle_counts (id, product_id, system_stock, counted_stock, variance_qty, variance_value, status, warehouse_location, counted_by_user_id, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [countId, productId, systemStock, physicalStock, varianceQuantity, varianceValueToman, status, warehouseLocation, countedByUserId, notes, now]
    );

    // If variance exists, sync system stock to physical count
    if (varianceQuantity !== 0) {
      await this.db.run('UPDATE products SET stock = ? WHERE id = ?', [physicalStock, productId]);
    }

    return {
      count_id: countId,
      product_id: productId,
      product_title: product.title,
      system_stock: systemStock,
      counted_stock: physicalStock,
      variance_quantity: varianceQuantity,
      variance_value_toman: varianceValueToman,
      status,
      stock_adjusted: varianceQuantity !== 0,
      message: status === 'BALANCED' 
        ? 'موجودی فیزیکی با سیستم کاملاً منطبق است.' 
        : `مغایرت انبارداری (${status === 'SHORTAGE' ? 'کسری' : 'مازاد'}: ${Math.abs(varianceQuantity)} عدد) ثبت و موجودی اصلاح شد.`
    };
  }

  /**
   * Get recent discrepancy logs
   */
  async getDiscrepancyReports(limit = 20) {
    return this.db.all(
      `SELECT c.*, p.title as product_title 
       FROM inventory_cycle_counts c
       JOIN products p ON c.product_id = p.id
       ORDER BY c.created_at DESC LIMIT ?`,
      [Math.max(Number(limit) || 20, 1)]
    );
  }
}
