/**
 * Open-Box & Refurbished Grading Inspector Service (Round 28)
 * Manages open-box, customer-return, or refurbished electronic goods.
 * Assigns standardized condition grades (GRADE_A_PLUS, GRADE_A, GRADE_B),
 * calculates discounted liquidation price, and issues special outlet warranties.
 */

export class OpenBoxGradingInspectorService {
  constructor(db) {
    this.db = db;
    this.gradeConfigs = {
      GRADE_A_PLUS: {
        label: 'گرید A+ (مشابه نو / کارتن باز)',
        discountPercent: 12,
        warrantyMonths: 12,
        description: 'کالا کاملاً نو بوده و صرفاً چسب پلمپ باز شده است. بدون کوچک‌ترین خط و خش.'
      },
      GRADE_A: {
        label: 'گرید A (خیلی تمیز)',
        discountPercent: 22,
        warrantyMonths: 6,
        description: 'دارای خط و خش بسیار ریز و میکروسکوپی در بدنه، سلامت فنی و باتری ۱۰۰٪.'
      },
      GRADE_B: {
        label: 'گرید B (کارکرده اقتصادی)',
        discountPercent: 35,
        warrantyMonths: 3,
        description: 'دارای آثار استفاده در بدنه، جعبه ریپک یا جایگزین، ۱۰۰٪ تست‌شده فنی با ضمانت مهلت تست.'
      }
    };
  }

  /**
   * Register and grade an open-box product unit
   */
  async gradeAndListUnit({ originalProductId, serialNumber, grade, inspectorUserId, inspectionNotes = '' }) {
    if (!originalProductId || !serialNumber || !grade) {
      throw new Error('شناسه محصول اصلی، شماره سریال و گرید کیفی الزامی است');
    }

    const gradeInfo = this.gradeConfigs[grade];
    if (!gradeInfo) {
      throw new Error(`گرید کیفی نامعتبر است. گریدهای مجاز: ${Object.keys(this.gradeConfigs).join(', ')}`);
    }

    const originalProduct = await this.db.get('SELECT id, title, price FROM products WHERE id = ?', [originalProductId]);
    if (!originalProduct) throw new Error('محصول مرجع در کاتالوگ یافت نشد');

    const origPrice = Number(originalProduct.price) || 0;
    const discountedPrice = Math.round((origPrice * (100 - gradeInfo.discountPercent)) / 100);

    const openBoxId = `ob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO open_box_inventory 
       (id, original_product_id, serial_number, grade, original_price, discounted_price, discount_percent, warranty_months, inspector_user_id, inspection_notes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?)`,
      [
        openBoxId,
        originalProductId,
        serialNumber.trim().toUpperCase(),
        grade,
        origPrice,
        discountedPrice,
        gradeInfo.discountPercent,
        gradeInfo.warrantyMonths,
        inspectorUserId || null,
        inspectionNotes,
        now
      ]
    );

    return {
      open_box_id: openBoxId,
      product_title: originalProduct.title,
      serial_number: serialNumber.trim().toUpperCase(),
      grade,
      grade_label: gradeInfo.label,
      original_price_toman: origPrice,
      outlet_price_toman: discountedPrice,
      discount_percentage: gradeInfo.discountPercent,
      outlet_warranty_months: gradeInfo.warrantyMonths,
      status: 'AVAILABLE',
      message: `کالای اوپن‌باکس با موفقیت در انبار اوت‌لت با گرید ${grade} ثبت و قیمت‌گذاری شد.`
    };
  }

  /**
   * Get available open-box units for catalog display
   */
  async getAvailableOpenBoxUnits() {
    return this.db.all(
      `SELECT o.*, p.title as product_title, p.category_id 
       FROM open_box_inventory o
       JOIN products p ON o.original_product_id = p.id
       WHERE o.status = 'AVAILABLE'
       ORDER BY o.created_at DESC`
    );
  }
}
