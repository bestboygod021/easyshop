import { all, nowIso, run } from '../db/index.js';

/**
 * ماژول تسویه حساب گروهی پایا/ساتنا برای فروشندگان (Automated Paya/Satna Batch Payouts)
 * تولید فایل متنی استاندارد حواله گروهی پایا مطابق مشخصات پروتکل بانکی شاپرک/بانک مرکزی
 */
export class PayaBatchPayoutService {
  /**
   * تولید فرمت استاندارد ردیف حواله پایا (IBAN, مبلغ به ریال، نام ذینفع، شناسه واریز)
   */
  generatePayaBatchFile(payoutIds = []) {
    if (!Array.isArray(payoutIds) || payoutIds.length === 0) {
      throw new Error('حداقل یک شناسه تسویه برای ساخت فایل پایا الزامی است.');
    }

    const placeholders = payoutIds.map(() => '?').join(',');
    const payouts = all(
      `SELECT vp.id, vp.vendor_id, vp.period, vp.net_payout,
              u.full_name, u.sheba_number
       FROM vendor_payouts vp
       JOIN users u ON u.id = vp.vendor_id
       WHERE vp.id IN (${placeholders})`,
      ...payoutIds,
    );

    if (payouts.length === 0) {
      throw new Error('تسویه‌های معتبری برای تولید فایل یافت نشد.');
    }

    const lines = [];
    let totalRials = 0;
    const now = nowIso();
    const batchId = `PAYA-${Date.now().toString().slice(-8)}`;

    // هدر فایل پایا: شناسه بچ، تاریخ، تعداد رکوردها
    lines.push(`HEADER|${batchId}|${now.split('T')[0]}|${payouts.length}`);

    for (const p of payouts) {
      const iban = (p.sheba_number || 'IR000000000000000000000000').toUpperCase().replace(/\s+/g, '');
      const amountRials = (p.net_payout || 0) * 10; // تبدیل تومان به ریال برای حواله بین‌بانکی پایا
      totalRials += amountRials;
      const cleanName = (p.full_name || 'فروشنده همکار').replace(/\|/g, '');
      const refId = p.id;

      lines.push(`${iban}|${amountRials}|${cleanName}|${refId}|تسویه فروشگاه دوره ${p.period}`);

      // تغییر وضعیت تسویه به پردازش شده
      run("UPDATE vendor_payouts SET status = 'processing' WHERE id = ?", p.id);
    }

    // فوتر فایل: جمع مبالغ ریالی
    lines.push(`FOOTER|${totalRials}|${payouts.length}`);

    const fileContent = lines.join('\n');

    return {
      batch_id: batchId,
      record_count: payouts.length,
      total_amount_tomans: Math.round(totalRials / 10),
      total_amount_rials: totalRials,
      paya_file_content: fileContent,
      generated_at: now,
    };
  }
}

export const payaBatchPayoutService = new PayaBatchPayoutService();
