import { all, get, run } from '../db/index.js';

/**
 * سرویس نظرسنجی و امتیازدهی به خدمات ارسال، مأمور توزیع و بسته‌بندی سفارشات
 */

export class DeliveryFeedbackService {
  /**
   * ثبت امتیاز و بازخورد توسط خریدار پس از تحویل
   */
  submitFeedback({ orderId, userId, packagingRating, courierRating, timelinessRating, comment = null }) {
    if (!orderId) throw new Error('شناسه سفارش الزامی است.');

    const id = `dfb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const pRating = Math.min(5, Math.max(1, Number(packagingRating) || 5));
    const cRating = Math.min(5, Math.max(1, Number(courierRating) || 5));
    const tRating = Math.min(5, Math.max(1, Number(timelinessRating) || 5));
    const averageRating = Math.round(((pRating + cRating + tRating) / 3) * 10) / 10;

    run(
      `INSERT INTO delivery_feedbacks (
         id, order_id, user_id, packaging_rating, courier_rating,
         timeliness_rating, average_rating, comment, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      orderId,
      userId || null,
      pRating,
      cRating,
      tRating,
      averageRating,
      comment,
      new Date().toISOString()
    );

    return {
      id,
      orderId,
      averageRating,
      success: true,
      message: 'نظر و امتیاز شما با موفقیت ثبت شد.',
    };
  }

  /**
   * خلاصه و میانگین عملکرد ناوگان توزیع برای مدیران
   */
  getDeliveryPerformanceStats() {
    const stats = get(
      `SELECT 
         COUNT(*) as total_feedbacks,
         AVG(packaging_rating) as avg_packaging,
         AVG(courier_rating) as avg_courier,
         AVG(timeliness_rating) as avg_timeliness,
         AVG(average_rating) as overall_score
       FROM delivery_feedbacks`
    );

    return {
      total_feedbacks: stats?.total_feedbacks || 0,
      avg_packaging: Math.round((stats?.avg_packaging || 0) * 10) / 10,
      avg_courier: Math.round((stats?.avg_courier || 0) * 10) / 10,
      avg_timeliness: Math.round((stats?.avg_timeliness || 0) * 10) / 10,
      overall_score: Math.round((stats?.overall_score || 0) * 10) / 10,
    };
  }
}

export const deliveryFeedbackService = new DeliveryFeedbackService();
