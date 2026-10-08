/**
 * سرویس تفکیک و کسر مالیات تکلیفی و ارزش افزوده تسویه حساب فروشندگان (Vendor Settlement Tax Splitter)
 * مطابق ماده ۸۶ و ماده ۱۶۹ مکرر قانون مالیات‌های مستقیم
 */
export class VendorSettlementTaxSplitter {
  /**
   * محاسبه خالص پرداختی به فروشنده با کسر مالیات تکلیفی و کمیسیون پلتفرم
   * @param {number} grossSales مجموع ناخالص فروش کالاهای فروشنده (تومان)
   * @param {number} commissionPct درصد کمیسیون پلتفرم (مثلا ۱۰٪)
   * @param {number} withholdingTaxPct درصد مالیات تکلیفی (پیش‌فرض ۳٪ یا ۵٪)
   * @param {number} vatPct درصد مالیات بر ارزش افزوده خدمات پلتفرم (۱۰٪)
   */
  calculateSettlementSplit({ grossSales, commissionPct = 10, withholdingTaxPct = 3, vatPct = 10 }) {
    const gross = Math.max(0, Number(grossSales) || 0);

    // ۱. کمیسیون ناخالص پلتفرم
    const platformCommission = Math.round((gross * commissionPct) / 100);

    // ۲. مالیات بر ارزش افزوده روی کمیسیون پلتفرم (نه کل کالا)
    const platformVat = Math.round((platformCommission * vatPct) / 100);

    // ۳. مالیات تکلیفی فروشنده (ماده ۸۶)
    const withholdingTax = Math.round((gross * withholdingTaxPct) / 100);

    // ۴. خالص مبلغ قابل واریز به شماره شبای فروشنده
    const netPayout = Math.max(0, gross - platformCommission - platformVat - withholdingTax);

    return {
      gross_sales: gross,
      platform_commission: platformCommission,
      commission_percentage: commissionPct,
      platform_vat: platformVat,
      vat_percentage: vatPct,
      withholding_tax: withholdingTax,
      withholding_tax_percentage: withholdingTaxPct,
      net_payout: netPayout,
      total_deductions: platformCommission + platformVat + withholdingTax,
      currency: 'تومان'
    };
  }
}

export const vendorSettlementTaxSplitter = new VendorSettlementTaxSplitter();
