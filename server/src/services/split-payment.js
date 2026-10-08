/**
 * سرویس پرداخت ترکیبی (Split Payment)
 * کسر بخشی از مبلغ سفارش از کیف پول و ایجاد صورتحساب برای مابقی در درگاه اینترنتی
 */

export class SplitPaymentService {
  /**
   * محاسبه سهم پرداخت کیف پول و درگاه بانکی
   * @param {number} totalAmount کل مبلغ سفارش به تومان
   * @param {number} walletBalance موجودی فعلی کیف پول کاربر به تومان
   * @param {boolean} useWallet آیا مشتری مایل به استفاده از کیف پول است؟
   */
  calculateSplit(totalAmount, walletBalance, useWallet = true) {
    if (!useWallet || walletBalance <= 0) {
      return {
        totalAmount,
        walletDeduction: 0,
        gatewayPayable: totalAmount,
        requiresGateway: totalAmount > 0,
        fullPaidByWallet: false,
      };
    }

    const walletDeduction = Math.min(totalAmount, walletBalance);
    const gatewayPayable = totalAmount - walletDeduction;

    return {
      totalAmount,
      walletDeduction,
      gatewayPayable,
      requiresGateway: gatewayPayable > 0,
      fullPaidByWallet: gatewayPayable === 0,
    };
  }
}

export const splitPaymentService = new SplitPaymentService();
