import { all, get, run } from '../db/index.js';

/**
 * سرویس شاخص رضایت و وفاداری خالص مشتریان (Net Promoter Score - NPS Engine)
 */
export class NpsEngine {
  /**
   * ثبت امتیاز نظرسنجی NPS توسط مشتری (امتیاز بین ۰ تا ۱۰)
   */
  submitNpsScore({ orderId, userId, score, feedbackText = '' }) {
    if (score === undefined || score === null) {
      throw new Error('امتیاز نظرسنجی الزامی است.');
    }

    const numericScore = Math.min(10, Math.max(0, parseInt(score, 10)));
    let category = 'passive'; // منفعل (۷-۸)
    if (numericScore >= 9) {
      category = 'promoter'; // مروج و وفادار (۹-۱۰)
    } else if (numericScore <= 6) {
      category = 'detractor'; // منتقد و ناراضی (۰-۶)
    }

    const id = `nps_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    run(
      `INSERT INTO nps_responses (id, order_id, user_id, score, category, feedback, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, orderId || null, userId || null, numericScore, category, 
      feedbackText ? String(feedbackText).slice(0, 500) : null, now
    );

    return {
      nps_id: id,
      score: numericScore,
      category,
      recorded_at: now,
    };
  }

  /**
   * محاسبه شاخص کل NPS: درصد مروجان منهای درصد منتقدان (-100 تا +100)
   */
  calculateNpsSummary() {
    const counts = all(
      `SELECT category, COUNT(*) as count
       FROM nps_responses
       GROUP BY category`
    );

    let promoters = 0;
    let passives = 0;
    let detractors = 0;

    for (const c of counts) {
      if (c.category === 'promoter') promoters = Number(c.count);
      if (c.category === 'passive') passives = Number(c.count);
      if (c.category === 'detractor') detractors = Number(c.count);
    }

    const total = promoters + passives + detractors;
    if (total === 0) {
      return { nps_score: 0, total_responses: 0, promoters: 0, passives: 0, detractors: 0 };
    }

    const promoterPct = (promoters / total) * 100;
    const detractorPct = (detractors / total) * 100;
    const npsScore = Math.round(promoterPct - detractorPct);

    return {
      nps_score: npsScore,
      total_responses: total,
      promoters_count: promoters,
      passives_count: passives,
      detractors_count: detractors,
      promoter_pct: Number(promoterPct.toFixed(1)),
      detractor_pct: Number(detractorPct.toFixed(1)),
    };
  }
}

export const npsEngine = new NpsEngine();
