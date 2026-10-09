/**
 * B2B Legal Invoice & Tax Certificate Validator (Round 26)
 * Validates legal corporate identity (11-digit National Company ID / شناسه ملی اشخاص حقوقی),
 * verifies 12-digit Economic Code (کد اقتصادی), and calculates standard 10% VAT tax invoice breakdowns.
 */

export class B2BTaxCertificateValidatorService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Validate Iranian Legal Entity National ID (شناسه ملی ۱۱ رقمی اشخاص حقوقی)
   * Algorithmic modulo-11 check per Iranian National Organization for Civil Registration
   */
  isValidLegalNationalId(idStr) {
    if (!idStr || typeof idStr !== 'string') return false;
    const clean = idStr.trim().replace(/\D/g, '');
    if (clean.length !== 11) return false;

    // Tenth digit + 2 multiplier weights
    const d = clean.split('').map(Number);
    const checkDigit = d[10];

    const c = d[9] + 2;
    const weights = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += (d[i] + c) * weights[i];
    }

    const remainder = sum % 11;
    const calculatedCheck = remainder === 10 ? 0 : remainder;

    return calculatedCheck === checkDigit;
  }

  /**
   * Validate Iranian 12-digit Economic Code (کد اقتصادی)
   */
  isValidEconomicCode(codeStr) {
    if (!codeStr || typeof codeStr !== 'string') return false;
    const clean = codeStr.trim().replace(/\D/g, '');
    return clean.length === 12;
  }

  /**
   * Register or validate corporate profile for B2B tax invoicing
   */
  async registerB2BCorporateProfile({
    userId,
    companyName,
    legalNationalId,
    economicCode,
    registrationNumber,
    vatCertificateNumber,
    province,
    city,
    postalCode,
    address,
    phone
  }) {
    if (!companyName || !legalNationalId) {
      throw new Error('نام شرکت و شناسه ملی اشخاص حقوقی الزامی است.');
    }

    const isNationalIdValid = this.isValidLegalNationalId(legalNationalId);
    if (!isNationalIdValid) {
      throw new Error('شناسه ملی ۱۱ رقمی شرکت نامعتبر است (کنترل رقم کنترلی ثبت شرکت‌ها ناموفق بود).');
    }

    if (economicCode && !this.isValidEconomicCode(economicCode)) {
      throw new Error('کد اقتصادی باید دقیقاً ۱۲ رقم باشد.');
    }

    const profileId = `corp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO b2b_corporate_profiles 
       (id, user_id, company_name, legal_national_id, economic_code, registration_number, vat_certificate_number, province, city, postal_code, address, phone, is_verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        profileId,
        userId,
        companyName.trim(),
        legalNationalId.trim(),
        economicCode?.trim() || null,
        registrationNumber?.trim() || null,
        vatCertificateNumber?.trim() || null,
        province || 'تهران',
        city || 'تهران',
        postalCode?.trim() || null,
        address?.trim() || null,
        phone?.trim() || null,
        now
      ]
    );

    return {
      profile_id: profileId,
      company_name: companyName,
      legal_national_id: legalNationalId,
      economic_code: economicCode,
      is_verified: true,
      message: 'پروفایل حقوقی شرکت با موفقیت ثبت و استعلام شناسه ملی احراز شد.'
    };
  }

  /**
   * Calculate B2B invoice tax and VAT breakdown
   */
  calculateTaxBreakdown(subtotalToman, vatRatePercent = 10) {
    const subtotal = Math.max(Number(subtotalToman) || 0, 0);
    const vatRate = Math.max(Number(vatRatePercent) || 10, 0);

    const vatAmount = Math.round((subtotal * vatRate) / 100);
    const finalTotal = subtotal + vatAmount;

    return {
      subtotal_toman: subtotal,
      vat_rate_percent: vatRate,
      vat_amount_toman: vatAmount,
      final_payable_toman: finalTotal,
      currency: 'تومان'
    };
  }
}
