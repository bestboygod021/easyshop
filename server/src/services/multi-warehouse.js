/**
 * سرویس مدیریت چندانباره و مسیریابی بهینه ارسال کالا (Multi-Warehouse Inventory Routing)
 */
export class MultiWarehouseService {
  constructor() {
    this.warehouses = [
      { id: 'wh_tehran', title_fa: 'انبار مرکزی تهران (شورآباد)', province: 'تهران', city: 'تهران', is_hub: true },
      { id: 'wh_isfahan', title_fa: 'انبار منطقه‌ای مرکز (اصفهان)', province: 'اصفهان', city: 'اصفهان', is_hub: false },
      { id: 'wh_mashhad', title_fa: 'انبار منطقه‌ای شرق (مشهد)', province: 'خراسان رضوی', city: 'مشهد', is_hub: false },
      { id: 'wh_shiraz', title_fa: 'انبار منطقه‌ای جنوب (شیراز)', province: 'فارس', city: 'شیراز', is_hub: false },
      { id: 'wh_tabriz', title_fa: 'انبار منطقه‌ای شمال‌غرب (تبریز)', province: 'آذربایجان شرقی', city: 'تبریز', is_hub: false },
    ];
  }

  getWarehouses() {
    return this.warehouses;
  }

  /**
   * انتخاب نزدیک‌ترین انبار به استان مقصد خریدار
   */
  findOptimalWarehouse(destinationProvince) {
    if (!destinationProvince) {
      return this.warehouses[0]; // انبار مرکزی پیش‌فرض
    }

    const cleanDest = String(destinationProvince).trim().replace('استان', '').trim();
    
    // تطابق استانی مستقیم
    const exactMatch = this.warehouses.find(w => w.province.includes(cleanDest) || cleanDest.includes(w.province));
    if (exactMatch) return exactMatch;

    // تطابق منطقه‌ای همجوار
    if (['البرز', 'قزوین', 'قم', 'سمنان', 'مازندران'].some(p => cleanDest.includes(p))) {
      return this.warehouses[0]; // تهران
    }
    if (['یزد', 'چهارمحال و بختیاری'].some(p => cleanDest.includes(p))) {
      return this.warehouses[1]; // اصفهان
    }
    if (['خراسان جنوبی', 'خراسان شمالی', 'سیستان و بلوچستان'].some(p => cleanDest.includes(p))) {
      return this.warehouses[2]; // مشهد
    }
    if (['بوشهر', 'هرمزگان', 'کهگیلویه و بویراحمد'].some(p => cleanDest.includes(p))) {
      return this.warehouses[3]; // شیراز
    }
    if (['آذربایجان غربی', 'اردبیل', 'زنجان'].some(p => cleanDest.includes(p))) {
      return this.warehouses[4]; // تبریز
    }

    return this.warehouses[0]; // در سایر موارد، انبار مرکزی تهران
  }
}

export const multiWarehouseService = new MultiWarehouseService();
