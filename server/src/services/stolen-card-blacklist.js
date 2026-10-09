import crypto from 'node:crypto';
import { all, get, nowIso, run, uid } from '../db/index.js';

/**
 * سرویس بررسی و استعلام لیست سیاه کارت‌های سرقتی/مسدودی شاپرک و پلیس فتا
 * (FATA & Shaparak Stolen/Blocked Card Blacklist Prober)
 * 
 * کارت‌ها بر اساس هش SHA-256 و ماسک کارت نگهداری می‌شوند تا امنیت PAN حفظ گردد.
 */
export class StolenCardBlacklistProber {
  /**
   * تولید هش امن از شماره کارت بانکی (PAN)
   */
  hashPan(pan) {
    const clean = String(pan || '').replace(/\D/g, '');
    return crypto.createHash('sha256').update(clean).digest('hex');
  }

  /**
   * ماسک کردن استاندارد کارت بانکی
   */
  maskPan(pan) {
    const clean = String(pan || '').replace(/\D/g, '');
    if (clean.length !== 16) return '****************';
    return `${clean.slice(0, 6)}******${clean.slice(12)}`;
  }

  /**
   * افزودن کارت سرقتی یا مسدودی به لیست سیاه
   */
  addToBlacklist({ cardPan, reason = 'stolen', reporter = 'FATA', notes = '' }) {
    const clean = String(cardPan || '').replace(/\D/g, '');
    if (clean.length !== 16) {
      throw new Error('شماره کارت بانکی نامعتبر است (باید ۱۶ رقم باشد).');
    }

    const panHash = this.hashPan(clean);
    const maskedPan = this.maskPan(clean);
    const id = uid('sblk');
    const now = nowIso();

    run(
      `INSERT INTO stolen_card_blacklist (id, pan_hash, card_mask, reason, reporter, notes, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(pan_hash) DO UPDATE SET
         reason = excluded.reason,
         reporter = excluded.reporter,
         notes = excluded.notes,
         is_active = 1,
         created_at = excluded.created_at`,
      id,
      panHash,
      maskedPan,
      reason,
      reporter,
      notes,
      now,
    );

    return {
      success: true,
      blacklist_id: id,
      card_mask: maskedPan,
      reason,
      reporter,
      is_blocked: true,
    };
  }

  /**
   * استعلام وضعیت کارت در لیست سیاه شاپرک و فتا
   */
  probeCardStatus(cardPan) {
    const clean = String(cardPan || '').replace(/\D/g, '');
    if (clean.length < 16) {
      return {
        is_blocked: false,
        status: 'invalid_card_length',
        reason: null,
      };
    }

    const panHash = this.hashPan(clean);
    const record = get(
      `SELECT id, card_mask, reason, reporter, notes, created_at 
       FROM stolen_card_blacklist 
       WHERE pan_hash = ? AND is_active = 1`,
      panHash,
    );

    if (record) {
      return {
        is_blocked: true,
        status: 'blocked_by_authority',
        card_mask: record.card_mask,
        reason: record.reason,
        reporter: record.reporter,
        blocked_at: record.created_at,
        notes: record.notes,
      };
    }

    return {
      is_blocked: false,
      status: 'clean',
      card_mask: this.maskPan(clean),
      reason: null,
    };
  }

  /**
   * دریافت فهرست کارت‌های مسدود شده (با ماسک امن)
   */
  getBlacklistSummary() {
    const rows = all(
      `SELECT id, card_mask, reason, reporter, notes, created_at 
       FROM stolen_card_blacklist 
       WHERE is_active = 1 
       ORDER BY created_at DESC 
       LIMIT 100`,
    );
    return {
      count: rows.length,
      blocked_cards: rows,
    };
  }
}

export const stolenCardBlacklistProber = new StolenCardBlacklistProber();
