/**
 * سرویس تحلیل هوشمند میزان اضطرار و اولویت‌بندی تیکت‌های پشتیبانی
 */
export class TicketUrgencyScorer {
  constructor() {
    this.highPriorityKeywords = [
      'پرداخت', 'کسر وجه', 'پول', 'ناموفق', 'تراکنش', 'کلاهبرداری',
      'شکایت', 'مرجوع', 'خراب', 'شکسته', 'فوری', 'کنسل', 'اشتباه'
    ];
    this.mediumPriorityKeywords = [
      'ارسال', 'تاخیر', 'پست', 'تیپاکس', 'کد رهگیری', 'فاکتور', 'گارانتی', 'کیف پول'
    ];
  }

  /**
   * ارزیابی متن تیکت و تعیین اولویت (low, normal, high, critical)
   */
  evaluateUrgency({ subject = '', message = '', orderStatus = null }) {
    const text = `${subject} ${message}`.toLowerCase();

    let score = 0;
    const detectedHigh = this.highPriorityKeywords.filter(kw => text.includes(kw));
    const detectedMed = this.mediumPriorityKeywords.filter(kw => text.includes(kw));

    score += detectedHigh.length * 3;
    score += detectedMed.length * 1.5;

    // تشدید اولویت برای وضعیت‌های خاص سفارش
    if (orderStatus === 'payment_failed' || orderStatus === 'processing_delayed') {
      score += 4;
    }

    let priority = 'normal';
    let priorityFa = 'عادی';
    let slaHours = 24;

    if (score >= 6) {
      priority = 'critical';
      priorityFa = 'بسیار فوری (بحرانی)';
      slaHours = 2;
    } else if (score >= 3) {
      priority = 'high';
      priorityFa = 'فوری';
      slaHours = 6;
    } else if (score === 0 && text.length < 30) {
      priority = 'low';
      priorityFa = 'کم‌اهمیت';
      slaHours = 48;
    }

    return {
      score,
      priority,
      priority_fa: priorityFa,
      target_sla_hours: slaHours,
      detected_keywords: [...detectedHigh, ...detectedMed],
    };
  }
}

export const ticketUrgencyScorer = new TicketUrgencyScorer();
