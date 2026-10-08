import { all } from '../db/index.js';

/**
 * سرویس تحلیل کارمزد و سهم بازار درگاه‌های پرداخت (Zibal, Zarinpal, MrPardakht, Bank Direct)
 */
export class GatewayCommissionAnalyzer {
  constructor() {
    // قوانین رسمی کارمزد هر درگاه (مبالغ به تومان)
    this.feeRules = {
      zibal: { ratePct: 0.01, maxFee: 6000, title_fa: 'زیبال (۱٪ تا سقف ۶۰۰۰ تومان)' },
      zarinpal: { ratePct: 0.01, maxFee: 4000, title_fa: 'زرین‌پال (۱٪ تا سقف ۴۰۰۰ تومان)' },
      mrpardakht: { ratePct: 0.01, maxFee: 5000, title_fa: 'آقای پرداخت (۱٪ تا سقف ۵۰۰۰ تومان)' },
      bank_direct: { ratePct: 0.0002, maxFee: 4000, title_fa: 'درگاه مستقیم به‌پرداخت ملت (شاپرکی)' },
    };
  }

  /**
   * محاسبه کارمزد برای یک تراکنش بر اساس درگاه
   */
  calculateFee(gateway, amount) {
    const rule = this.feeRules[gateway] || { ratePct: 0.01, maxFee: 5000, title_fa: 'سایر' };
    const rawFee = Math.round(amount * rule.ratePct);
    return Math.min(rawFee, rule.maxFee);
  }

  /**
   * تحلیل کل تراکنش‌های موفق، سهم بازار هر درگاه و مجموع کارمزدهای پرداخت شده
   */
  getCommissionReport() {
    const stats = all(
      `SELECT provider as gateway, COUNT(*) as tx_count, COALESCE(SUM(amount), 0) as total_volume
       FROM payments
       WHERE status = 'paid'
       GROUP BY provider`
    );

    let overallVolume = 0;
    let overallFee = 0;

    const gatewayBreakdown = stats.map(s => {
      const vol = Number(s.total_volume) || 0;
      const count = Number(s.tx_count) || 0;
      const fee = this.calculateFee(s.gateway, vol);
      overallVolume += vol;
      overallFee += fee;

      return {
        gateway: s.gateway || 'unknown',
        title_fa: this.feeRules[s.gateway]?.title_fa || s.gateway,
        tx_count: count,
        volume: vol,
        estimated_fee: fee,
      };
    });

    const enriched = gatewayBreakdown.map(g => ({
      ...g,
      market_share_pct: overallVolume > 0 ? Number(((g.volume / overallVolume) * 100).toFixed(2)) : 0,
    }));

    return {
      total_volume: overallVolume,
      total_estimated_fee: overallFee,
      gateways: enriched,
    };
  }
}

export const gatewayCommissionAnalyzer = new GatewayCommissionAnalyzer();
