import { all, get, run } from '../db/index.js';

/**
 * سرویس ثبت و مدیریت نظرات همراه با تصویر خریداران واقعی (Photo Review Moderation)
 */
export class PhotoReviewService {
  /**
   * بررسی اینکه آیا کاربر کالا را خریداری کرده است یا خیر
   */
  isVerifiedBuyer(userId, productId) {
    if (!userId || !productId) return false;
    const purchase = get(
      `SELECT oi.id 
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.user_id = ? AND oi.product_id = ? AND o.payment_status = 'paid'
       LIMIT 1`,
      userId, productId
    );
    return Boolean(purchase);
  }

  /**
   * ثبت نظر همراه با تصاویر خریدار
   */
  submitReview({ productId, userId, rating, comment, photos = [] }) {
    if (!productId || !userId || !rating) {
      throw new Error('شناسه محصول، شناسه کاربر و امتیاز الزامی است.');
    }

    const verified = this.isVerifiedBuyer(userId, productId);
    const id = `rev_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const cleanPhotos = Array.isArray(photos) 
      ? photos.filter(p => typeof p === 'string' && p.startsWith('/uploads/')).slice(0, 5)
      : [];

    run(
      `INSERT INTO reviews (id, product_id, user_id, rating, body, photos_json, is_verified_purchase, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      id, productId, userId, Math.min(5, Math.max(1, Number(rating) || 5)), 
      comment ? String(comment).slice(0, 1000) : '',
      JSON.stringify(cleanPhotos),
      verified ? 1 : 0,
      now
    );

    return {
      review_id: id,
      product_id: productId,
      is_verified_buyer: verified,
      photos_count: cleanPhotos.length,
      status: 'pending'
    };
  }

  /**
   * تأیید یا رد نظر توسط مدیر
   */
  moderateReview(reviewId, status) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new Error('وضعیت نامعتبر است. فقط approved یا rejected مجاز است.');
    }

    run(`UPDATE reviews SET status = ? WHERE id = ?`, status, reviewId);
    return { review_id: reviewId, status };
  }

  /**
   * دریافت نظرات تأییدشده محصول
   */
  getProductReviews(productId) {
    const list = all(
      `SELECT r.id, r.product_id, r.user_id, r.rating, r.body as comment, r.photos_json, 
              r.is_verified_purchase, r.created_at, u.full_name as user_name
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.product_id = ? AND r.status = 'approved'
       ORDER BY r.created_at DESC`,
      productId
    );

    return list.map(r => ({
      ...r,
      photos: r.photos_json ? JSON.parse(r.photos_json) : []
    }));
  }
}

export const photoReviewService = new PhotoReviewService();
