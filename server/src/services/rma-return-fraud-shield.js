/**
 * RMA Return Fraud Shield Service (Round 25)
 * Analyzes customer return history, frequency of RMA requests, and return-to-order ratio.
 * Flags high-risk patterns (>40% return rate or multiple serial RMA disputes)
 * and enforces mandatory unboxing video inspection or manual supervisor sign-off.
 */

export class RmaReturnFraudShieldService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Assess RMA return risk profile for a user
   */
  async assessUserReturnRisk(userId) {
    if (!userId) throw new Error('User ID is required');

    // Total delivered or fulfilled orders
    const totalOrdersRow = await this.db.get(
      `SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status IN ('completed', 'delivered', 'paid', 'processing')`,
      [userId]
    );
    const totalOrders = Number(totalOrdersRow?.count || 0);

    // Total RMA returns recorded
    const rmaRows = await this.db.all(
      `SELECT id, status, reason FROM rma_requests WHERE user_id = ?`,
      [userId]
    );
    const totalRmaRequests = rmaRows.length;

    // Calculate Return Rate
    const returnRate = totalOrders > 0 ? (totalRmaRequests / totalOrders) * 100 : 0;

    // Determine Risk Level
    let riskLevel = 'LOW';
    let requiresVideoUnboxing = false;
    let autoApprovalAllowed = true;
    let recommendation = 'مرجوعی طبق فرآیند عادی پردازش شود.';

    if (totalOrders >= 2 && returnRate >= 50) {
      riskLevel = 'CRITICAL';
      requiresVideoUnboxing = true;
      autoApprovalAllowed = false;
      recommendation = 'ریسک تقلب بسیار بالا؛ ضبط و آپلود ویدیوی بازگشایی جعبه و تأیید مستقیم سرپرست انبار الزامی است.';
    } else if (totalOrders >= 3 && returnRate >= 33) {
      riskLevel = 'MODERATE';
      requiresVideoUnboxing = true;
      autoApprovalAllowed = false;
      recommendation = 'نرخ مرجوعی بیش از حد معمول؛ درخواست تصویر و فیلم بسته‌بندی پیش از صدور بارنامه بازگشت.';
    }

    return {
      user_id: userId,
      total_orders: totalOrders,
      total_rma_requests: totalRmaRequests,
      return_rate_percentage: Math.round(returnRate * 10) / 10,
      risk_level: riskLevel,
      requires_video_unboxing: requiresVideoUnboxing,
      auto_approval_allowed: autoApprovalAllowed,
      recommendation
    };
  }

  /**
   * Screen a specific return request before authorization
   */
  async screenReturnRequest({ userId, orderId, productId, returnReason }) {
    const riskAssessment = await this.assessUserReturnRisk(userId);

    const isHighRisk = riskAssessment.risk_level === 'CRITICAL' || riskAssessment.risk_level === 'MODERATE';

    return {
      order_id: orderId,
      product_id: productId,
      return_reason: typeof returnReason === 'string' ? returnReason.trim().slice(0, 500) : '',
      risk_assessment: riskAssessment,
      requires_supervisor_review: isHighRisk,
      mandatory_checklist: [
        'بررسی مطابقت شماره سریال (Serial / IMEI)',
        'بررسی پلمپ‌های امنیتی و کارتن اصلی',
        ...(riskAssessment.requires_video_unboxing ? ['بارگذاری فیلم کامل بدون کات از آنباکسینگ بسته'] : [])
      ],
      decision: isHighRisk ? 'FLAGGED_FOR_MANUAL_INSPECTION' : 'STANDARD_RETURN_ACCEPTED'
    };
  }
}
