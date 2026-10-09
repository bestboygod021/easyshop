/**
 * سرویس تبدیل و نمایش چند ارزی (تومان، ریال، تتر/USDT)
 * با قابلیت تنظیم نرخ روز و تبدیل بدون خطای اعشاری
 */

export class MultiCurrencyService {
  constructor(tetherRateInTomans = 95000) {
    this.tetherRateInTomans = tetherRateInTomans;
  }

  setTetherRate(rate) {
    if (rate > 0) this.tetherRateInTomans = rate;
  }

  /**
   * تبدیل مبلغ مبنا (تومان) به واحدهای رایج مالی
   * @param {number} amountInTomans مبلغ به تومان
   */
  convertAmount(amountInTomans) {
    const tomans = Number(amountInTomans) || 0;
    const rials = tomans * 10;
    const tether = Math.round((tomans / this.tetherRateInTomans) * 100) / 100;

    return {
      toman: tomans,
      rial: rials,
      usdt: tether,
      formatted: {
        toman: `${tomans.toLocaleString('fa-IR')} تومان`,
        rial: `${rials.toLocaleString('fa-IR')} ریال`,
        usdt: `${tether} USDT`,
      },
    };
  }
}

export const multiCurrencyService = new MultiCurrencyService();
