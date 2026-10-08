import { all, run } from '../db/index.js';

/**
 * سرویس ثبت و تحلیل دلایل ترک خرید در صفحه تسویه (Exit Intent & Abandonment Reason Survey)
 */
export class ExitIntentSurveyService {
  constructor() {
    this.validReasons = [
      'high_shipping_cost', // هزینه بالای ارسال
      'no_preferred_gateway', // عدم وجود درگاه پرداخت دلخواه
      'changed_mind', // انصراف از خرید
      'technical_error', // خطای فنی سایت
      'found_cheaper_elsewhere', // یافتن قیمت ارزان‌تر در جای دیگر
      'other' // سایر
    ];
  }

  /**
   * ثبت دلیل انصراف کاربر هنگام تلاش برای ترک صفحه پرداخت
   */
  recordAbandonmentReason({ cartId, userId = null, reason, feedback = '' }) {
    if (!reason || !this.validReasons.includes(reason)) {
      throw new Error('دلیل انصراف انتخاب‌شده نامعتبر است.');
    }

    const id = `exit_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    run(
      `INSERT INTO exit_intent_surveys (id, cart_id, user_id, reason, feedback, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, cartId || null, userId || null, reason, 
      feedback ? String(feedback).slice(0, 500) : null, now
    );

    return {
      survey_id: id,
      reason,
      recorded_at: now,
      message_fa: 'بازخورد شما با موفقیت جهت بهبود خدمات فروشگاه ثبت شد.'
    };
  }

  /**
   * گزارش آماری دلایل ترک سبد خرید برای مدیر فروشگاه
   */
  getAbandonmentSummary() {
    const stats = all(
      `SELECT reason, COUNT(*) as count 
       FROM exit_intent_surveys 
       GROUP BY reason 
       ORDER BY count DESC`
    );

    const total = stats.reduce((sum, item) => sum + item.count, 0);

    return {
      total_feedbacks: total,
      reasons_breakdown: stats.map(s => ({
        reason: s.reason,
        count: s.count,
        percentage: total > 0 ? Number(((s.count / total) * 100).toFixed(1)) : 0
      }))
    };
  }
}

export const exitIntentSurveyService = new ExitIntentSurveyService();
