import { get, run, nowIso, uid } from '../db/index.js';
import { normalizeIranianMobile } from './iran-validators.js';

/**
 * ماژول ثبت تاپ‌آپ و شارژ مستقیم سیم‌کارت از کیف پول کاربری
 * (Mobile Airtime Direct Top-up Simulator)
 */
export class MobileAirtimeTopupService {
  /**
   * تشخیص اپراتور از روی پیش‌شماره موبایل
   */
  detectOperator(phone) {
    const clean = normalizeIranianMobile(phone) || phone;
    const prefix = clean.slice(0, 4);

    const mciPrefixes = ['0910', '0911', '0912', '0913', '0914', '0915', '0916', '0917', '0918', '0919', '0990', '0991', '0992'];
    const mtnPrefixes = ['0930', '0933', '0935', '0936', '0937', '0938', '0939', '0901', '0902', '0903', '0904', '0905'];
    const rightelPrefixes = ['0920', '0921', '0922'];

    if (mciPrefixes.includes(prefix)) return { operator: 'mci', name_fa: 'همراه اول' };
    if (mtnPrefixes.includes(prefix)) return { operator: 'mtn', name_fa: 'ایرانسل' };
    if (rightelPrefixes.includes(prefix)) return { operator: 'rightel', name_fa: 'رایتل' };

    return { operator: 'unknown', name_fa: 'سایر اپراتورها' };
  }

  /**
   * خرید شارژ مستقیم یا بسته اینترنت با کسر از کیف پول کاربر
   */
  purchaseTopup({ userId, phone, amountToman, chargeType = 'direct' }) {
    if (!userId || !phone || !amountToman || amountToman <= 0) {
      throw new Error('مشخصات کاربر، شماره موبایل و مبلغ شارژ الزامی است.');
    }

    const cleanPhone = normalizeIranianMobile(phone);
    if (!cleanPhone) throw new Error('شماره تلفن همراه وارد شده نامعتبر است.');

    const user = get('SELECT id, wallet FROM users WHERE id = ?', userId);
    if (!user) throw new Error('کاربر یافت نشد.');

    const amount = Math.round(Number(amountToman));
    if ((user.wallet || 0) < amount) {
      throw new Error(`موجودی کیف پول شما (${(user.wallet || 0).toLocaleString('fa-IR')} تومان) برای این تراکنش کافی نیست.`);
    }

    const operatorInfo = this.detectOperator(cleanPhone);
    const topupId = uid('topup');
    const now = nowIso();
    const newBalance = user.wallet - amount;

    // ۱. کسر از موجودی کیف پول کاربر
    run('UPDATE users SET wallet = ? WHERE id = ?', newBalance, userId);

    // ۲. ثبت تراکنش در گردش حساب کیف پول
    run(
      `INSERT INTO wallet_transactions (id, user_id, amount, type, reason, ref, balance_after, created_at)
       VALUES (?, ?, ?, 'debit', 'purchase', ?, ?, ?)`,
      uid('wtx'),
      userId,
      amount,
      topupId,
      newBalance,
      now,
    );

    // ۳. ثبت رکورد تاپ‌آپ
    run(
      `INSERT INTO mobile_topups (id, user_id, phone, operator, charge_type, amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'success', ?)`,
      topupId,
      userId,
      cleanPhone,
      operatorInfo.operator,
      chargeType,
      amount,
      now,
    );

    return {
      success: true,
      topup_id: topupId,
      phone: cleanPhone,
      operator: operatorInfo.name_fa,
      amount_toman: amount,
      charge_type: chargeType,
      wallet_balance_after: newBalance,
      ref_id: `SHARJ-${Date.now().toString().slice(-6)}`,
      message_fa: `شارژ مستقیم ${amount.toLocaleString('fa-IR')} تومانی ${operatorInfo.name_fa} با موفقیت اعمال شد.`,
      executed_at: now,
    };
  }
}

export const mobileAirtimeTopupService = new MobileAirtimeTopupService();
