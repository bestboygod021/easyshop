import { all, get, nowIso, run, uid } from '../db/index.js';
import { smsOtpService } from './sms-otp.js';

/**
 * سرویس هشدار کاهش قیمت کالا به مشتریان (Price Drop Notification Engine)
 * بررسی لیست علاقه‌مندی‌ها (Wishlist) و اشتراک‌های افت قیمت، و ارسال پیامک تخفیف ویژه
 */
export class PriceDropNotificationService {
  /**
   * ارزیابی کاهش قیمت محصول و ارسال پیامک به کاربرانی که کالا را در نشان‌شده‌ها دارند
   */
  async notifyPriceDrop({ productId, oldPrice, newPrice }) {
    if (!productId || newPrice >= oldPrice) {
      return { triggered: false, reason: 'price_not_decreased' };
    }

    const discountAmount = oldPrice - newPrice;
    const discountPct = Math.round((discountAmount / oldPrice) * 100);

    // حداقل ۵ درصد یا ۵۰ هزار تومان کاهش برای جلوگیری از اسپم
    if (discountPct < 5 && discountAmount < 50000) {
      return { triggered: false, reason: 'discount_too_small' };
    }

    const product = get('SELECT id, name_fa, slug FROM products WHERE id = ?', productId);
    if (!product) return { triggered: false, reason: 'product_not_found' };

    // یافتن کاربرانی که این محصول را در لیست علاقه‌مندی‌ها دارند
    const interestedUsers = all(
      `SELECT DISTINCT u.id, u.full_name, u.phone
       FROM wishlist w
       JOIN users u ON u.id = w.user_id
       WHERE w.product_id = ? AND u.phone IS NOT NULL AND u.phone != ''`,
      productId,
    );

    const results = [];
    const now = nowIso();

    for (const user of interestedUsers) {
      const smsText = `${user.full_name || 'کاربر گرامی'} عزیز، کالای "${product.name_fa}" در لیست علاقه‌مندی‌های شما ${discountPct}٪ تخفیف خورد!\nقیمت جدید: ${newPrice.toLocaleString('fa-IR')} تومان\nمشاهده و خرید:\nhttps://easyshop.ir/products/${product.slug || product.id}`;
      
      const sendRes = await smsOtpService.sendSms(user.phone, smsText);

      // ثبت اعلان درون‌برنامه‌ای
      run(
        `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        uid('ntf'),
        user.id,
        'کاهش قیمت در لیست علاقه‌مندی‌ها 🔥',
        `کالای "${product.name_fa}" شامل ${discountPct}٪ تخفیف شد.`,
        `/products/${product.slug || product.id}`,
        now,
      );

      results.push({
        user_id: user.id,
        phone: user.phone,
        sent: sendRes.sent,
      });
    }

    return {
      triggered: true,
      product_id: productId,
      old_price: oldPrice,
      new_price: newPrice,
      discount_pct: discountPct,
      notified_users_count: results.length,
      recipients: results,
    };
  }
}

export const priceDropNotificationService = new PriceDropNotificationService();
