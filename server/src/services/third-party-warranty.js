/**
 * Third-Party Warranty Registry Service (Round 27)
 * Registers, queries, and validates major official electronic warranty providers
 * (e.g., Samtel, MediaPardazesh, Hami, Avajang, Datiss) by IMEI or Serial Number.
 */

export class ThirdPartyWarrantyRegistryService {
  constructor(db) {
    this.db = db;
    this.knownProviders = [
      { id: 'samtel', name: 'گارانتی سام‌تل', support_phone: '021-84030' },
      { id: 'mediapardazesh', name: 'مدیا پردازش', support_phone: '021-42940' },
      { id: 'hami', name: 'گارانتی یکپارچه حامی', support_phone: '021-61018' },
      { id: 'avajang', name: 'آواژنگ', support_phone: '021-89312345' },
      { id: 'datiss', name: 'داتیس امرتات', support_phone: '021-88500000' }
    ];
  }

  /**
   * Register official warranty for a serial/IMEI
   */
  async registerWarranty({ serialOrImei, providerId, productId, durationMonths = 18 }) {
    if (!serialOrImei || !providerId) {
      throw new Error('شماره سریال/IMEI و شناسه شرکت گارانتی الزامی است');
    }

    const provider = this.knownProviders.find(p => p.id === providerId) || {
      id: providerId,
      name: providerId,
      support_phone: '021-88888888'
    };

    const cleanSerial = String(serialOrImei).trim().toUpperCase();
    const months = Math.max(Number(durationMonths) || 18, 1);

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    const recordId = `war_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO third_party_warranties 
       (id, serial_number, provider_id, provider_name, product_id, duration_months, start_date, end_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [
        recordId,
        cleanSerial,
        provider.id,
        provider.name,
        productId || null,
        months,
        startDate.toISOString(),
        endDate.toISOString(),
        now
      ]
    );

    return {
      warranty_id: recordId,
      serial_number: cleanSerial,
      provider_name: provider.name,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      duration_months: months,
      status: 'ACTIVE',
      message: `گارانتی رسمی ${provider.name} به مدت ${months} ماه فعال گردید.`
    };
  }

  /**
   * Inquiry warranty validity by serial or IMEI
   */
  async inquiryWarranty(serialOrImei) {
    if (!serialOrImei) throw new Error('شماره سریال یا IMEI الزامی است');
    const cleanSerial = String(serialOrImei).trim().toUpperCase();

    const record = await this.db.get(
      'SELECT * FROM third_party_warranties WHERE serial_number = ?',
      [cleanSerial]
    );

    if (!record) {
      return {
        serial_number: cleanSerial,
        has_warranty: false,
        status: 'NOT_FOUND',
        message: 'هیچ سابقه گارانتی رسمی برای این شماره سریال یا IMEI یافت نشد.'
      };
    }

    const now = new Date();
    const endDate = new Date(record.end_date);
    const isExpired = now > endDate;

    return {
      serial_number: record.serial_number,
      has_warranty: true,
      provider_name: record.provider_name,
      duration_months: record.duration_months,
      start_date_jalali: new Date(record.start_date).toLocaleDateString('fa-IR'),
      end_date_jalali: endDate.toLocaleDateString('fa-IR'),
      is_valid: !isExpired,
      status: isExpired ? 'EXPIRED' : 'ACTIVE',
      message: isExpired 
        ? `مهلت گارانتی ${record.provider_name} منقضی شده است.`
        : `گارانتی معتبر است (پایان اعتبار: ${endDate.toLocaleDateString('fa-IR')}).`
    };
  }
}
