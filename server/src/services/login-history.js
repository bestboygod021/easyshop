import { all, run } from '../db/index.js';

/**
 * سرویس ثبت سوابق ورود کاربران و نشست‌های امنیتی دستگاه‌ها
 */

export class LoginHistoryService {
  /**
   * ثبت ورود موفق با مشخصات کلاینت
   */
  recordLogin({ userId, ip, userAgent, deviceType = 'desktop' }) {
    if (!userId) return null;

    const id = `lgh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    run(
      `INSERT INTO user_login_history (
         id, user_id, ip, user_agent, device_type, is_current, logged_in_at
       ) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      id,
      userId,
      ip || '127.0.0.1',
      userAgent || 'Unknown',
      deviceType,
      now
    );

    return { id, userId, loggedInAt: now };
  }

  /**
   * دریافت آخرین نشست‌ها و سوابق ورود کاربر
   */
  getUserSessions(userId, limit = 10) {
    return all(
      `SELECT id, ip, user_agent, device_type, is_current, logged_in_at 
       FROM user_login_history 
       WHERE user_id = ? 
       ORDER BY logged_in_at DESC 
       LIMIT ?`,
      userId,
      limit
    );
  }

  /**
   * خروج از تمام دستگاه‌ها و نشست‌های دیگر
   */
  revokeOtherSessions(userId, currentSessionId) {
    run(
      `UPDATE user_login_history 
       SET is_current = 0 
       WHERE user_id = ? AND id != ?`,
      userId,
      currentSessionId || ''
    );

    return { success: true, message: 'سایر نشست‌های فعال با موفقیت خاتمه یافتند.' };
  }
}

export const loginHistoryService = new LoginHistoryService();
