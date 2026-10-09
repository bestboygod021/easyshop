import { all, get, nowIso, run, uid } from '../db/index.js';

/**
 * موتور گیمیفیکیشن و ماموریت‌های وفاداری مشتری (Loyalty Quests & Missions Engine)
 * تعریف چالش‌های تشویقی، رهگیری پیشرفت، و پاداش سکه و اعتبار باشگاه مشتریان
 */
export class LoyaltyQuestsService {
  /**
   * دریافت ماموریت‌های فعال برای یک کاربر
   */
  getUserQuests(userId) {
    if (!userId) return [];

    const defaultQuests = [
      {
        id: 'quest_first_review',
        title: 'ثبت اولین نظر با کیفیت',
        description: 'برای یکی از کالاهایی که خریده‌اید یک نظر بنویسید',
        reward_points: 50,
        icon: 'message-square',
        target_count: 1,
      },
      {
        id: 'quest_two_orders',
        title: 'خریدار وفادار ماه',
        description: 'در این ماه حداقل ۲ سفارش موفق ثبت کنید',
        reward_points: 120,
        icon: 'shopping-bag',
        target_count: 2,
      },
      {
        id: 'quest_profile_complete',
        title: 'تکمیل پروفایل و کدملی',
        description: 'کد ملی و آدرس پستی خود را در پروفایل تکمیل کنید',
        reward_points: 30,
        icon: 'user-check',
        target_count: 1,
      },
    ];

    // واکشی پیشرفت کاربر در هر ماموریت
    const userProgress = all('SELECT quest_id, current_count, is_completed FROM user_quest_progress WHERE user_id = ?', userId);
    const progressMap = {};
    for (const p of userProgress) {
      progressMap[p.quest_id] = p;
    }

    return defaultQuests.map((q) => {
      const prog = progressMap[q.id];
      const current = prog ? prog.current_count : 0;
      const completed = prog ? Boolean(prog.is_completed) : false;

      return {
        ...q,
        current_progress: current,
        is_completed: completed,
        progress_percentage: Math.min(100, Math.round((current / q.target_count) * 100)),
      };
    });
  }

  /**
   * تکمیل یک ماموریت و تخصیص امتیاز/امتیاز وفاداری به کاربر
   */
  completeQuest(userId, questId) {
    const quests = this.getUserQuests(userId);
    const quest = quests.find((q) => q.id === questId);
    if (!quest) throw new Error('ماموریت مورد نظر یافت نشد.');

    const now = nowIso();
    const existing = get('SELECT id, is_completed FROM user_quest_progress WHERE user_id = ? AND quest_id = ?', userId, questId);

    if (existing && existing.is_completed) {
      return { already_completed: true, message_fa: 'این ماموریت قبلاً تکمیل شده و پاداش آن دریافت شده است.' };
    }

    // به‌روزرسانی پیشرفت به حالت تکمیل شده
    run(
      `INSERT INTO user_quest_progress (id, user_id, quest_id, current_count, is_completed, completed_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(user_id, quest_id) DO UPDATE SET
         current_count = excluded.current_count,
         is_completed = 1,
         completed_at = excluded.completed_at`,
      uid('uqpr'),
      userId,
      questId,
      quest.target_count,
      now,
    );

    // افزودن امتیاز وفاداری به کاربر
    const user = get('SELECT loyalty_points FROM users WHERE id = ?', userId);
    const updatedPoints = (user?.loyalty_points || 0) + quest.reward_points;
    run('UPDATE users SET loyalty_points = ? WHERE id = ?', updatedPoints, userId);

    return {
      success: true,
      quest_id: questId,
      reward_points: quest.reward_points,
      new_total_points: updatedPoints,
      message_fa: `تبریک! ماموریت "${quest.title}" تکمیل شد و ${quest.reward_points} امتیاز دریافت کردید.`,
    };
  }
}

export const loyaltyQuestsService = new LoyaltyQuestsService();
