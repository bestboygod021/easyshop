import { all, get } from '../db/index.js';

/**
 * سیستم مدیریت انبار شعب و موجودی چندانباره (Multi-Warehouse Stock Allocator)
 * تخصیص هوشمند انبار تامین سفارش بر اساس موقعیت جغرافیایی و استان مقصد مشتری
 */
export class WarehouseStockAllocatorService {
  constructor() {
    this.defaultWarehouses = [
      { id: 'wh_tehran', name: 'انبار مرکزی تهران', province: 'تهران', coverage: ['تهران', 'البرز', 'قزوین', 'قم', 'سمنان', 'مرکزی'] },
      { id: 'wh_isfahan', name: 'انبار مرکزی جنوب و مرکز (اصفهان)', province: 'اصفهان', coverage: ['اصفهان', 'فارس', 'یزد', 'کرمان', 'بوشهر', 'هرمزگان', 'چهارمحال و بختیاری'] },
      { id: 'wh_mashhad', name: 'انبار شرق کشور (مشهد)', province: 'خراسان رضوی', coverage: ['خراسان رضوی', 'خراسان شمالی', 'خراسان جنوبی', 'سیستان و بلوچستان'] },
      { id: 'wh_tabriz', name: 'انبار شمال‌غرب (تبریز)', province: 'آذربایجان شرقی', coverage: ['آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'زنجان', 'گیلان'] },
    ];
  }

  /**
   * انتخاب نزدیک‌ترین و بهینه‌ترین انبار به مقصد خریدار
   */
  findBestWarehouseForDestination(destProvince = 'تهران') {
    const cleanProvince = String(destProvince || '').trim();
    
    // انطباق مستقیم با پوشش جغرافیایی
    for (const wh of this.defaultWarehouses) {
      if (wh.province === cleanProvince || wh.coverage.includes(cleanProvince)) {
        return wh;
      }
    }

    // پیش‌فرض: انبار مرکزی تهران
    return this.defaultWarehouses[0];
  }

  /**
   * دریافت موجودی یک کالا به تفکیک کلیه انبارها
   */
  getProductWarehouseInventory(productId) {
    const product = get('SELECT id, name_fa, stock FROM products WHERE id = ?', productId);
    if (!product) return null;

    const rows = all(
      `SELECT warehouse_id, stock_quantity, reserved_quantity, updated_at
       FROM product_warehouse_stocks
       WHERE product_id = ?`,
      productId,
    );

    const warehouseMap = {};
    for (const r of rows) {
      warehouseMap[r.warehouse_id] = {
        available: r.stock_quantity - r.reserved_quantity,
        stock: r.stock_quantity,
        reserved: r.reserved_quantity,
      };
    }

    // اگر موجودی اختصاصی هنوز ثبت نشده، موجودی کلی بین انبارها تقسیم می‌شود
    const allocations = this.defaultWarehouses.map((wh) => {
      const recorded = warehouseMap[wh.id];
      const stock = recorded ? recorded.stock : Math.floor(product.stock / this.defaultWarehouses.length);
      const available = recorded ? recorded.available : stock;

      return {
        warehouse_id: wh.id,
        warehouse_name: wh.name,
        province: wh.province,
        stock_quantity: stock,
        available_quantity: available,
      };
    });

    return {
      product_id: productId,
      product_name: product.name_fa,
      total_stock: product.stock,
      warehouses: allocations,
    };
  }

  /**
   * تخصیص سفارش به نزدیک‌ترین انبار دارای موجودی کافی
   */
  allocateOrderWarehouse({ productId, qty = 1, destinationProvince = 'تهران' }) {
    const inventory = this.getProductWarehouseInventory(productId);
    if (!inventory) throw new Error('محصول مورد نظر یافت نشد.');

    const bestWh = this.findBestWarehouseForDestination(destinationProvince);
    const primaryCandidate = inventory.warehouses.find((w) => w.warehouse_id === bestWh.id);

    if (primaryCandidate && primaryCandidate.available_quantity >= qty) {
      return {
        allocated_warehouse: primaryCandidate,
        is_direct_nearest: true,
        destination_province: destinationProvince,
        allocated_qty: qty,
      };
    }

    // در صورت کسری موجودی در انبار نزدیک، تخصیص به انبار مرکزی تهران یا اولین انبار دارای موجودی
    const fallbackWh = inventory.warehouses.find((w) => w.available_quantity >= qty) || inventory.warehouses[0];
    return {
      allocated_warehouse: fallbackWh,
      is_direct_nearest: false,
      reason: 'stock_transfer_required',
      destination_province: destinationProvince,
      allocated_qty: qty,
    };
  }
}

export const warehouseStockAllocatorService = new WarehouseStockAllocatorService();
