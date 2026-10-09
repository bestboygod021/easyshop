/**
 * Affiliate Short-link & Influencer Marketing Tracker Service (Round 29)
 * Generates custom branded short-links for influencers/affiliates (e.g. /go/tech-review).
 * Tracks clicks, conversions, and attributes commission earnings.
 */

import crypto from 'node:crypto';

export class AffiliateShortLinkTrackerService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create trackable affiliate shortlink
   */
  async createAffiliateLink({ affiliateUserId, slug, destinationUrl, commissionPercent = 5 }) {
    if (!affiliateUserId || !destinationUrl) {
      throw new Error('شناسه معرف و آدرس مقصد لینک الزامی است');
    }

    const shortSlug = slug ? String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : crypto.randomBytes(3).toString('hex');
    const commission = Math.min(Math.max(Number(commissionPercent) || 5, 1), 30);
    const linkId = `aff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const existing = await this.db.get('SELECT * FROM affiliate_links WHERE slug = ?', [shortSlug]);
    if (existing) {
      throw new Error(`نام مستعار لینک (${shortSlug}) قبلاً توسط شخص دیگری رزرو شده است`);
    }

    await this.db.run(
      `INSERT INTO affiliate_links (id, affiliate_user_id, slug, destination_url, commission_percent, clicks_count, orders_count, earnings_toman, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, 1, ?)`,
      [linkId, affiliateUserId, shortSlug, destinationUrl, commission, now]
    );

    return {
      link_id: linkId,
      slug: shortSlug,
      short_url: `https://easyshop.ir/go/${shortSlug}`,
      destination_url: destinationUrl,
      commission_percent: commission,
      message: 'لینک اختصاصی بازاریابی همکاری در فروش با موفقیت ساخته شد.'
    };
  }

  /**
   * Record click on affiliate link
   */
  async recordClick(slug) {
    const link = await this.db.get('SELECT * FROM affiliate_links WHERE slug = ? AND is_active = 1', [slug]);
    if (!link) return null;

    await this.db.run('UPDATE affiliate_links SET clicks_count = clicks_count + 1 WHERE id = ?', [link.id]);

    return {
      destination_url: link.destination_url,
      affiliate_user_id: link.affiliate_user_id,
      slug: link.slug
    };
  }

  /**
   * Attribute order to affiliate link and credit commission
   */
  async attributeOrderCommission(slug, orderAmountToman) {
    const link = await this.db.get('SELECT * FROM affiliate_links WHERE slug = ? AND is_active = 1', [slug]);
    if (!link) return null;

    const saleAmount = Math.max(Number(orderAmountToman) || 0, 0);
    const commissionEarned = Math.round((saleAmount * link.commission_percent) / 100);

    await this.db.run(
      `UPDATE affiliate_links 
       SET orders_count = orders_count + 1, earnings_toman = earnings_toman + ?
       WHERE id = ?`,
      [commissionEarned, link.id]
    );

    return {
      affiliate_user_id: link.affiliate_user_id,
      sale_amount_toman: saleAmount,
      commission_earned_toman: commissionEarned,
      new_total_earnings: link.earnings_toman + commissionEarned
    };
  }
}
