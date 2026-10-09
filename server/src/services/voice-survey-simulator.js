import { get, nowIso, run, uid } from '../db/index.js';

/**
 * سامانه شبیه‌ساز تماس صوتی خودکار رضایت‌سنجی پس از تحویل کالا
 * (Post-Delivery Interactive Voice Survey & NPS Simulator)
 */
export class VoiceSurveySimulatorService {
  /**
   * شبیه‌سازی ایجاد تماس صوتی هوشمند پس از تحویل موفق مرسوله
   */
  initiateVoiceSurveyCall({ orderId, phone = null }) {
    if (!orderId) throw new Error('شناسه سفارش برای تماس نظرسنجی الزامی است.');

    const order = get('SELECT id, code, user_id, status, delivered_at FROM orders WHERE id = ?', orderId);
    if (!order) throw new Error('سفارش مورد نظر یافت نشد.');

    let targetPhone = phone;
    if (!targetPhone && order.user_id) {
      const user = get('SELECT phone FROM users WHERE id = ?', order.user_id);
      targetPhone = user?.phone;
    }

    if (!targetPhone) {
      return { call_initiated: false, reason: 'no_phone_found' };
    }

    const callId = uid('vcl');
    const now = nowIso();

    // اسکریپت شبیه‌سازی سیستم تعاملی IVR صوتی
    const ivrScript = [
      { step: 1, message: `سلام! از فروشگاه EasyShop تماس می‌گیریم. سفارش شما با کد ${order.code || order.id} به تازگی تحویل شد.` },
      { step: 2, message: 'از ۱ تا ۵ چه امتیازی به سرعت ارسال و برخورد سفیر تحویل می‌دهید؟ لطفاً عدد مربوطه را شماره‌گیری نمایید.' },
      { step: 3, message: 'آیا بسته در وضعیت سالم و پلمپ به دست شما رسید؟ کلید ۱ برای بله و کلید ۲ برای خیر.' },
    ];

    run(
      `INSERT INTO voice_surveys (id, order_id, user_id, phone, status, score, feedback_notes, created_at)
       VALUES (?, ?, ?, ?, 'call_placed', null, null, ?)`,
      callId,
      orderId,
      order.user_id || null,
      targetPhone,
      now,
    );

    return {
      call_initiated: true,
      call_id: callId,
      order_id: orderId,
      phone: targetPhone,
      ivr_script: ivrScript,
      status: 'call_placed',
      dispatched_at: now,
    };
  }

  /**
   * ثبت پاسخ‌های دریافتی از کاربر در تماس صوتی
   */
  recordCallFeedback({ callId, score = 5, packageIntact = true, voiceMemoText = null }) {
    const survey = get('SELECT * FROM voice_surveys WHERE id = ?', callId);
    if (!survey) throw new Error('شناسه تماس نظرسنجی یافت نشد.');

    const cleanScore = Math.max(1, Math.min(5, Number(score) || 5));
    const notes = `سلامت بسته: ${packageIntact ? 'سالم و پلمپ' : 'دارای آسیب'}${voiceMemoText ? ' | یادداشت: ' + voiceMemoText : ''}`;
    const now = nowIso();

    run(
      `UPDATE voice_surveys 
       SET status = 'completed', score = ?, feedback_notes = ?, completed_at = ?
       WHERE id = ?`,
      cleanScore,
      notes,
      now,
      callId,
    );

    return {
      success: true,
      call_id: callId,
      score: cleanScore,
      notes,
      status: 'completed',
    };
  }

  /**
   * خلاصه آمار رضایت‌سنجی صوتی جهت داشبورد مدیریت کیفیت
   */
  getVoiceSurveyMetrics() {
    const row = get(
      `SELECT COUNT(*) AS total_calls,
              COALESCE(AVG(score), 5) AS avg_score,
              COUNT(CASE WHEN score >= 4 THEN 1 END) AS satisfied_count
       FROM voice_surveys
       WHERE status = 'completed'`,
    );

    const total = row?.total_calls || 0;
    const avgScore = row ? Number(row.avg_score.toFixed(1)) : 5;
    const satCount = row?.satisfied_count || 0;
    const satRate = total > 0 ? Math.round((satCount / total) * 100) : 100;

    return {
      total_completed_surveys: total,
      average_satisfaction_score: avgScore,
      satisfaction_rate_percentage: satRate,
    };
  }
}

export const voiceSurveySimulatorService = new VoiceSurveySimulatorService();
