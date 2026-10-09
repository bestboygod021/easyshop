/**
 * شبیه‌ساز خرید اقساطی اسنپ‌پی و دیجی‌پی (BNPL 4-Installments Simulator)
 * محاسبه اقساط ماهانه بدون کارمزد و تولید اطلاعات طرح ۴ قسطه
 */
export class BnplSimulatorService {
  /**
   * محاسبه جزئیات ۴ قسط بدون سود و کارمزد
   */
  calculateInstallments(amountInTomans) {
    const total = Number(amountInTomans) || 0;
    const minThreshold = 200000; // حداقل خرید ۲۰۰ هزار تومان
    const maxThreshold = 20000000; // سقف اعتبار ۲۰ میلیون تومان

    const isEligible = total >= minThreshold && total <= maxThreshold;
    const installmentAmount = isEligible ? Math.round(total / 4) : 0;
    const firstPayment = installmentAmount; // قسط اول هنگام ثبت سفارش

    return {
      total_amount: total,
      is_eligible: isEligible,
      installments_count: 4,
      installment_amount: installmentAmount,
      first_payment_now: firstPayment,
      monthly_payment: installmentAmount,
      providers: [
        {
          id: 'snappay',
          name_fa: 'اسنپ‌پی (الان بخر، بعداً پرداخت کن)',
          badge_text: 'خرید در ۴ قسط بدون کارمزد',
          monthly_installment: installmentAmount,
        },
        {
          id: 'digipay',
          name_fa: 'دیجی‌پی (اعتبار اقساطی ۴ ماهه)',
          badge_text: 'بدون ضامن و بدون چک',
          monthly_installment: installmentAmount,
        },
      ],
      installment_schedule: isEligible
        ? [
            { step: 1, title: 'قسط اول (همین حالا)', amount: firstPayment },
            { step: 2, title: 'قسط دوم (۳۰ روز بعد)', amount: installmentAmount },
            { step: 3, title: 'قسط سوم (۶۰ روز بعد)', amount: installmentAmount },
            { step: 4, title: 'قسط چهارم (۹۰ روز بعد)', amount: installmentAmount },
          ]
        : [],
    };
  }
}

export const bnplSimulatorService = new BnplSimulatorService();
