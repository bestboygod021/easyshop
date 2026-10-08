import { get, all } from '../db/index.js';

/**
 * سرویس امتیازدهی اعتباری و سنجش شایستگی خرید اقساطی (BNPL & Credit Scoring Engine)
 */
export class BnplCreditScoringService {
  /**
   * محاسبه امتیاز اعتباری کاربر بر اساس سابقه سفارشات پرداخت‌شده و عضویت
   */
  evaluateCreditScore(userId) {
    if (!userId) {
      return { eligible_for_bnpl: false, credit_score: 0, max_credit_limit: 0, reason: 'guest_user', message_fa: 'خرید اقساطی برای کاربران مهمان فعال نیست.' };
    }

    const user = get(`SELECT id, full_name, created_at, wallet FROM users WHERE id = ?`, userId);
    if (!user) {
      return { eligible_for_bnpl: false, credit_score: 0, max_credit_limit: 0, reason: 'user_not_found', message_fa: 'کاربر یافت نشد.' };
    }

    const orderStats = get(
      `SELECT COUNT(*) as paid_orders_count, COALESCE(SUM(total), 0) as total_spent
       FROM orders
       WHERE user_id = ? AND payment_status = 'paid'`,
      userId
    );

    const paidOrders = Number(orderStats?.paid_orders_count) || 0;
    const totalSpent = Number(orderStats?.total_spent) || 0;

    // فرمول محاسبه امتیاز اعتباری از ۰ تا ۱۰۰۰
    let score = 300; // پایه اولیه
    score += Math.min(300, paidOrders * 30); // هر سفارش موفق ۳۰ امتیاز (حداکثر ۳۰۰)
    score += Math.min(300, Math.floor(totalSpent / 100000) * 10); // هر ۱۰۰ هزار تومان ۱۰ امتیاز (حداکثر ۳۰۰)

    // محاسبه اعتبار خرید اقساطی
    let creditLimit = 0;
    let isEligible = false;

    if (score >= 700) {
      isEligible = true;
      creditLimit = 15000000; // ۱۵ میلیون تومان
    } else if (score >= 500) {
      isEligible = true;
      creditLimit = 8000000; // ۸ میلیون تومان
    } else if (score >= 400 && paidOrders >= 2) {
      isEligible = true;
      creditLimit = 3000000; // ۳ میلیون تومان
    }

    return {
      user_id: userId,
      credit_score: score,
      eligible_for_bnpl: isEligible,
      max_credit_limit: creditLimit,
      successful_orders: paidOrders,
      total_spent: totalSpent,
      installment_options: isEligible ? [
        { months: 3, interest_pct: 0, monthly_installment: Math.round(creditLimit / 3) },
        { months: 6, interest_pct: 4, monthly_installment: Math.round((creditLimit * 1.04) / 6) },
      ] : [],
      message_fa: isEligible 
        ? `شما واجد شرایط خرید اقساطی با سقف اعتبار ${creditLimit.toLocaleString('fa-IR')} تومان هستید.`
        : 'جهت فعال‌سازی خرید اقساطی، حداقل ۲ سفارش موفق در فروشگاه ثبت نمایید.'
    };
  }
}

export const bnplCreditScoringService = new BnplCreditScoringService();
