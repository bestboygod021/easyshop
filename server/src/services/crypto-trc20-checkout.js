import crypto from 'node:crypto';
import { get, nowIso, run, uid } from '../db/index.js';
import { multiCurrencyService } from './multi-currency.js';

/**
 * سرویس شبیه‌ساز پرداخت کریپتو تتر بر بستر ترون (USDT TRC-20 Checkout Simulator)
 * با محاسبه لحظه‌ای نرخ تتر، تولید آدرس کیف‌پول اختصاصی، و تایید ترنزکشن هش (TxID)
 */
export class CryptoTrc20CheckoutService {
  constructor() {
    this.merchantTronAddress = 'TXeasyShopPlatformTrc20Vault998877';
  }

  /**
   * ایجاد درخواست پرداخت تتر برای یک سفارش
   */
  createCryptoPaymentIntent({ orderId, amountInTomans, tetherRate = 95000 }) {
    if (!orderId || !amountInTomans || amountInTomans <= 0) {
      throw new Error('مشخصات سفارش و مبلغ برای پرداخت ارزی الزامی است.');
    }

    multiCurrencyService.setTetherRate(tetherRate);
    const converted = multiCurrencyService.convertAmount(amountInTomans);
    const intentId = uid('cchk');
    const now = nowIso();
    // مهلت پرداخت ۳۰ دقیقه‌ای
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // آدرس یکتای تولیدی بر بستر TRC20 با پیشوند T
    const subAddressSuffix = crypto.createHash('md5').update(`${orderId}:${intentId}`).digest('hex').slice(0, 10);
    const depositAddress = `T${this.merchantTronAddress.slice(1, 24)}${subAddressSuffix}`;

    run(
      `INSERT INTO crypto_payments (id, order_id, amount_toman, amount_usdt, usdt_rate, network, deposit_address, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'TRC20', ?, 'pending', ?, ?)`,
      intentId,
      orderId,
      amountInTomans,
      converted.usdt,
      tetherRate,
      depositAddress,
      expiresAt,
      now,
    );

    return {
      intent_id: intentId,
      order_id: orderId,
      network: 'TRON (TRC-20)',
      token: 'USDT',
      amount_toman: amountInTomans,
      amount_usdt: converted.usdt,
      usdt_rate: tetherRate,
      deposit_address: depositAddress,
      qr_payload: `tron:${depositAddress}?token=USDT&amount=${converted.usdt}`,
      expires_at: expiresAt,
      status: 'pending',
    };
  }

  /**
   * شبیه‌سازی و تایید ترنزکشن واریزی تتر از طریق هش بلاک‌چین (TxID)
   */
  verifyCryptoPayment({ intentId, txHash }) {
    if (!intentId || !txHash) {
      throw new Error('شناسه پرداخت و هش تراکنش الزامی است.');
    }

    const payment = get('SELECT * FROM crypto_payments WHERE id = ?', intentId);
    if (!payment) {
      throw new Error('تراکنش کریپتو یافت نشد.');
    }

    if (payment.status === 'confirmed') {
      return {
        already_verified: true,
        status: 'confirmed',
        tx_hash: payment.tx_hash,
        order_id: payment.order_id,
      };
    }

    // بررسی تاریخ انقضا
    if (new Date(payment.expires_at).getTime() < Date.now()) {
      run("UPDATE crypto_payments SET status = 'expired' WHERE id = ?", intentId);
      throw new Error('مهلت پرداخت این سفارش به پایان رسیده است.');
    }

    const cleanTx = String(txHash).trim();
    if (cleanTx.length < 16) {
      throw new Error('فرمت هش تراکنش بلاک‌چین (TxID) نامعتبر است.');
    }

    const now = nowIso();
    run(
      `UPDATE crypto_payments 
       SET status = 'confirmed', tx_hash = ?, confirmed_at = ?
       WHERE id = ?`,
      cleanTx,
      now,
      intentId,
    );

    return {
      success: true,
      status: 'confirmed',
      intent_id: intentId,
      order_id: payment.order_id,
      amount_usdt: payment.amount_usdt,
      tx_hash: cleanTx,
      network: 'TRC-20',
      confirmed_at: now,
    };
  }
}

export const cryptoTrc20CheckoutService = new CryptoTrc20CheckoutService();
