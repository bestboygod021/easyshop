import { all, get, run } from '../db/index.js';

/**
 * سرویس مدیریت بنرها، پوسته و پیام‌های مناسبتی زمان‌بندی‌شده تقویم خورشیدی
 */

export class HolidayThemeService {
  /**
   * ایجاد یا ثبت تم و بنر مناسبتی
   */
  createHolidayTheme({ title, slug, startsAt, endsAt, primaryColor, greetingMessage, bannerUrl }) {
    const id = `thm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    run(
      `INSERT INTO holiday_themes (
         id, title, slug, starts_at, ends_at, primary_color,
         greeting_message, banner_url, is_active, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      id,
      title,
      slug,
      startsAt,
      endsAt,
      primaryColor,
      greetingMessage,
      bannerUrl,
      new Date().toISOString()
    );

    return { id, title, slug, startsAt, endsAt };
  }

  /**
   * دریافت مناسبت و پوسته فعال فعلی سایت
   */
  getActiveTheme() {
    const now = new Date().toISOString();
    const theme = get(
      `SELECT * FROM holiday_themes 
       WHERE is_active = 1 AND starts_at <= ? AND ends_at >= ? 
       ORDER BY starts_at DESC LIMIT 1`,
      now,
      now
    );

    if (!theme) {
      return { active: false, theme: null };
    }

    return {
      active: true,
      theme: {
        title: theme.title,
        primary_color: theme.primary_color,
        greeting_message: theme.greeting_message,
        banner_url: theme.banner_url,
      },
    };
  }
}

export const holidayThemeService = new HolidayThemeService();
