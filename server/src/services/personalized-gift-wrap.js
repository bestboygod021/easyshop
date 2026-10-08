/**
 * Personalized Gift Wrap & Greeting Card Service (Round 27)
 * Configures luxury gift packaging options, custom greeting messages,
 * and generates price-free gift invoices (فاکتور هدیه بدون قیمت) for recipients.
 */

export class PersonalizedGiftWrapService {
  constructor(db) {
    this.db = db;
    this.wrapStyles = [
      { id: 'classic_navy', name: 'سرمه‌ای کلاسیک با روبان طلایی', fee_toman: 45000 },
      { id: 'romantic_red', name: 'قرمز فانتزی با روبان ساتن', fee_toman: 50000 },
      { id: 'minimal_kraft', name: 'کرافت دوستدار طبیعت با کنف', fee_toman: 35000 }
    ];
  }

  /**
   * Get available packaging themes
   */
  getWrapThemes() {
    return this.wrapStyles;
  }

  /**
   * Attach gift options to an order
   */
  async attachGiftOptionsToOrder({ orderId, wrapStyleId, recipientName, greetingMessage, hidePriceOnInvoice = true }) {
    if (!orderId) throw new Error('شناسه سفارش الزامی است');
    const selectedStyle = this.wrapStyles.find(w => w.id === wrapStyleId) || this.wrapStyles[0];

    const giftId = `gft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO order_gift_options 
       (id, order_id, wrap_style_id, wrap_style_name, wrap_fee_toman, recipient_name, greeting_message, hide_price_on_invoice, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        giftId,
        orderId,
        selectedStyle.id,
        selectedStyle.name,
        selectedStyle.fee_toman,
        recipientName?.trim() || 'دوست عزیز',
        greetingMessage?.trim() || 'با بهترین آرزوها!',
        hidePriceOnInvoice ? 1 : 0,
        now
      ]
    );

    return {
      gift_id: giftId,
      order_id: orderId,
      wrap_style: selectedStyle.name,
      wrap_fee_toman: selectedStyle.fee_toman,
      recipient_name: recipientName,
      hide_price_on_invoice: Boolean(hidePriceOnInvoice),
      message: 'بسته‌بندی هدیه و متن کارت تبریک اختصاصی با موفقیت ثبت شد.'
    };
  }

  /**
   * Render Gift Receipt Data (Without Prices)
   */
  async renderGiftReceipt(orderId) {
    const giftConfig = await this.db.get('SELECT * FROM order_gift_options WHERE order_id = ?', [orderId]);
    const orderItems = await this.db.all(
      `SELECT title, quantity FROM order_items WHERE order_id = ?`,
      [orderId]
    );

    return {
      order_id: orderId,
      is_gift_invoice: true,
      recipient_name: giftConfig?.recipient_name || 'گیرنده محترم',
      greeting_card_text: giftConfig?.greeting_message || '',
      wrap_theme: giftConfig?.wrap_style_name || 'بسته‌بندی اختصاصی هدیه',
      items: (orderItems || []).map(item => ({
        product_title: item.title,
        quantity: item.quantity
        // Prices strictly hidden
      })),
      footer_note: 'این مرسوله یک هدیه است و بنا به درخواست فرستنده، فاقد قیمت یا صورت‌حساب مالی می‌باشد.'
    };
  }
}
