import { all, get, run } from '../db/index.js';

/**
 * سرویس کمپین‌های فروش شگفت‌انگیز و تخفیف‌های زمان‌دار (Flash Sales)
 */

export class FlashSaleService {
  /**
   * ایجاد کمپین فروش ویژه
   */
  createCampaign({ title, slug, startsAt, endsAt, discountPct, bannerUrl = null }) {
    const id = `fls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    run(
      `INSERT INTO flash_sales (id, title, slug, discount_pct, starts_at, ends_at, banner_url, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      id,
      title,
      slug,
      discountPct,
      startsAt,
      endsAt,
      bannerUrl,
      new Date().toISOString()
    );

    return { id, title, slug, startsAt, endsAt, discountPct };
  }

  /**
   * افزودن کالا به کمپین فروش ویژه
   */
  addProductToCampaign(campaignId, productId, customDiscountPrice = null) {
    const id = `flsi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    run(
      `INSERT INTO flash_sale_items (id, flash_sale_id, product_id, special_price, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      campaignId,
      productId,
      customDiscountPrice,
      new Date().toISOString()
    );
    return { id, campaignId, productId, customDiscountPrice };
  }

  /**
   * دریافت کمپین‌های فعال کنونی همراه با زمان باقیمانده (Countdown)
   */
  getActiveCampaigns() {
    const now = new Date().toISOString();
    const campaigns = all(
      `SELECT * FROM flash_sales 
       WHERE is_active = 1 AND starts_at <= ? AND ends_at >= ?
       ORDER BY ends_at ASC`,
      now,
      now
    );

    return campaigns.map(c => {
      const remainingSeconds = Math.max(0, Math.floor((new Date(c.ends_at).getTime() - Date.now()) / 1000));
      return {
        ...c,
        remaining_seconds: remainingSeconds,
        is_live: true,
      };
    });
  }

  /**
   * بررسی اینکه آیا کالا در فروش شگفت‌انگیز فعال است یا خیر
   */
  getProductFlashDiscount(productId) {
    const now = new Date().toISOString();
    const item = get(
      `SELECT fsi.*, fs.discount_pct, fs.ends_at, fs.title as campaign_title
       FROM flash_sale_items fsi
       JOIN flash_sales fs ON fsi.flash_sale_id = fs.id
       WHERE fsi.product_id = ? AND fs.is_active = 1 AND fs.starts_at <= ? AND fs.ends_at >= ?
       ORDER BY fs.discount_pct DESC LIMIT 1`,
      productId,
      now,
      now
    );

    if (!item) return null;

    const remainingSeconds = Math.max(0, Math.floor((new Date(item.ends_at).getTime() - Date.now()) / 1000));
    return {
      campaign_title: item.campaign_title,
      discount_pct: item.discount_pct,
      special_price: item.special_price,
      remaining_seconds: remainingSeconds,
    };
  }
}

export const flashSaleService = new FlashSaleService();
