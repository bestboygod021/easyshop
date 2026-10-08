/**
 * سرویس گزینه‌های کادوپیچی، بسته‌بندی هدیه و متن تبریک
 */

export class GiftWrapService {
  constructor() {
    this.wrapOptions = [
      { id: 'standard', title: 'بسته‌بندی رسمی و استاندارد', price: 0 },
      { id: 'luxury_box', title: 'جعبه کادویی هاردباکس لوکس همراه با روبان', price: 45000 },
      { id: 'kraft_eco', title: 'بسته‌بندی کرافت سازگار با محیط‌زیست', price: 25000 },
    ];
  }

  getAvailableWrapOptions() {
    return this.wrapOptions;
  }

  /**
   * محاسبه هزینه و افزودن خدمات کادوپیچی به سبد خرید
   */
  applyGiftWrap(wrapOptionId, greetingMessage = null) {
    const option = this.wrapOptions.find(w => w.id === wrapOptionId) || this.wrapOptions[0];
    const cleanMessage = greetingMessage ? String(greetingMessage).trim().slice(0, 300) : null;

    return {
      selected_wrap: option,
      wrap_cost: option.price,
      has_greeting_card: Boolean(cleanMessage),
      greeting_card_text: cleanMessage,
    };
  }
}

export const giftWrapService = new GiftWrapService();
