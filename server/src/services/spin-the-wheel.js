/**
 * Daily Spin-the-Wheel Gamification Service (Round 25)
 * Allows customers to spin a promotional wheel once per 24 hours to win rewards:
 * coupons, loyalty bonus points, free shipping vouchers, or consolation entries.
 */

export class SpinTheWheelService {
  constructor(db) {
    this.db = db;
    this.wheelSlices = [
      { id: 'slice_1', type: 'COUPON_10', label: '۱۰٪ تخفیف خرید', weight: 20, value: 10 },
      { id: 'slice_2', type: 'POINTS_100', label: '۱۰۰ سکه باشگاه وفاداری', weight: 25, value: 100 },
      { id: 'slice_3', type: 'FREE_SHIPPING', label: 'ارسال رایگان سفارش', weight: 20, value: 'FREE_SHIP' },
      { id: 'slice_4', type: 'COUPON_20', label: '۲۰٪ تخفیف شگفت‌انگیز', weight: 5, value: 20 },
      { id: 'slice_5', type: 'POINTS_50', label: '۵۰ سکه باشگاه وفاداری', weight: 20, value: 50 },
      { id: 'slice_6', type: 'LUCK_NEXT_TIME', label: 'فردا دوباره شانس خودتو امتحان کن!', weight: 10, value: 0 }
    ];
  }

  /**
   * Get wheel segments configuration
   */
  getWheelConfiguration() {
    return {
      slices: this.wheelSlices.map(s => ({ id: s.id, label: s.label, type: s.type }))
    };
  }

  /**
   * Check if a user is eligible to spin today
   */
  async canUserSpin(userId) {
    if (!userId) throw new Error('User ID is required');

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const lastSpin = await this.db.get(
      'SELECT * FROM user_spins WHERE user_id = ? AND spun_at > ? ORDER BY spun_at DESC LIMIT 1',
      [userId, oneDayAgo]
    );

    if (lastSpin) {
      const nextAvailable = new Date(new Date(lastSpin.spun_at).getTime() + 24 * 60 * 60 * 1000);
      return {
        can_spin: false,
        next_spin_available_at: nextAvailable.toISOString(),
        message: 'شما امروز شانس خود را امتحان کرده‌اید. لطفاً فردا مجدداً تلاش نمایید.'
      };
    }

    return {
      can_spin: true,
      message: 'گردونه شانس برای چرخش امروز آماده است!'
    };
  }

  /**
   * Execute spin for user
   */
  async executeSpin(userId) {
    const eligibility = await this.canUserSpin(userId);
    if (!eligibility.can_spin) {
      throw new Error(eligibility.message);
    }

    // Weighted random selection
    const totalWeight = this.wheelSlices.reduce((sum, s) => sum + s.weight, 0);
    let randomNum = Math.floor(Math.random() * totalWeight);
    let selectedSlice = this.wheelSlices[0];

    for (const slice of this.wheelSlices) {
      if (randomNum < slice.weight) {
        selectedSlice = slice;
        break;
      }
      randomNum -= slice.weight;
    }

    const spinId = `spin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    let rewardCode = null;
    if (selectedSlice.type.startsWith('COUPON_') || selectedSlice.type === 'FREE_SHIPPING') {
      rewardCode = `SPIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }

    await this.db.run(
      `INSERT INTO user_spins (id, user_id, reward_type, reward_label, reward_code, spun_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [spinId, userId, selectedSlice.type, selectedSlice.label, rewardCode, now]
    );

    // If points reward, credit user wallet/points if table exists
    if (selectedSlice.type.startsWith('POINTS_')) {
      const points = Number(selectedSlice.value);
      await this.db.run(
        'UPDATE users SET wallet = COALESCE(wallet, 0) + ? WHERE id = ?',
        [points * 1000, userId] // 1 point = 1000 toman bonus
      );
    }

    return {
      spin_id: spinId,
      user_id: userId,
      reward: {
        type: selectedSlice.type,
        label: selectedSlice.label,
        reward_code: rewardCode,
        value: selectedSlice.value
      },
      message: `تبریک! جایزه شما: ${selectedSlice.label}`
    };
  }
}
