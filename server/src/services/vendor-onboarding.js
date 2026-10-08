import { all, get, run, nowIso, uid } from '../db/index.js';
import { isValidIranianNationalCode, isValidIranianIban } from './iran-validators.js';

/**
 * سامانه ثبت‌نام، احراز هویت و پذیرش فروشندگان جدید (Vendor Onboarding System)
 * ثبت مدارک صنفی، شماره شبا، اطلاعات مدیرمسئول و صف بررسی تایید مدیر
 */
export class VendorOnboardingService {
  /**
   * ثبت درخواست جدید فروشندگی توسط کاربر متقاضی
   */
  submitApplication({
    userId,
    storeName,
    nationalId,
    shebaIban,
    phone,
    businessLicenseNo = null,
    province = 'تهران',
    city = 'تهران',
    address = '',
  }) {
    if (!storeName || !nationalId || !shebaIban || !phone) {
      throw new Error('نام فروشگاه، کد ملی، شماره شبا و شماره تماس الزامی هستند.');
    }

    if (!isValidIranianNationalCode(nationalId)) {
      throw new Error('کد ملی وارد شده نامعتبر است.');
    }

    if (!isValidIranianIban(shebaIban)) {
      throw new Error('شماره شبا بانکی نامعتبر است.');
    }

    const applicationId = uid('vonb');
    const now = nowIso();

    run(
      `INSERT INTO vendor_applications (
         id, user_id, store_name, national_id, sheba_iban, phone,
         business_license_no, province, city, address, status, review_notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', null, ?, ?)`,
      applicationId,
      userId || null,
      storeName,
      nationalId,
      shebaIban,
      phone,
      businessLicenseNo,
      province,
      city,
      address,
      now,
      now,
    );

    return {
      application_id: applicationId,
      store_name: storeName,
      status: 'pending_review',
      message_fa: 'درخواست فروشندگی با موفقیت ثبت شد و در صف ارزیابی کارشناسان قرار گرفت.',
      submitted_at: now,
    };
  }

  /**
   * بررسی و تغییر وضعیت درخواست (تایید یا رد توسط مدیر)
   */
  reviewApplication(applicationId, { action = 'approve', reviewNotes = '', reviewerId = null }) {
    const app = get('SELECT * FROM vendor_applications WHERE id = ?', applicationId);
    if (!app) {
      throw new Error('درخواست فروشندگی یافت نشد.');
    }

    const now = nowIso();
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    run(
      `UPDATE vendor_applications 
       SET status = ?, review_notes = ?, updated_at = ?
       WHERE id = ?`,
      newStatus,
      reviewNotes,
      now,
      applicationId,
    );

    // در صورت تایید، اگر کاربر موجود بود، نقش آن به seller ارتقا می‌یابد
    if (action === 'approve' && app.user_id) {
      run("UPDATE users SET role = 'seller' WHERE id = ?", app.user_id);
    }

    return {
      application_id: applicationId,
      previous_status: app.status,
      new_status: newStatus,
      reviewed_by: reviewerId,
      notes: reviewNotes,
      updated_at: now,
    };
  }

  /**
   * دریافت لیست کلیه درخواست‌ها جهت پنل مدیریت
   */
  listApplications(status = null) {
    let sql = 'SELECT * FROM vendor_applications';
    const params = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    return all(sql, ...params);
  }
}

export const vendorOnboardingService = new VendorOnboardingService();
