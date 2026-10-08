import crypto from 'node:crypto';

/**
 * سیستم امضای دیجیتال و احراز اصالت فاکتورهای الکترونیکی
 * جهت جلوگیری از جعل فاکتور، تایید مراجع مالیاتی و سامانه مودیان
 */

export class InvoiceSigner {
  constructor(secretKey = null) {
    this.secretKey = secretKey || process.env.INVOICE_SIGNING_KEY || 'easyshop-secure-invoice-signing-key-2026';
  }

  /**
   * تولید اثر انگشت رمزنگاری‌شده (Digital Hash & Signature) برای یک سفارش/فاکتور
   */
  signInvoice(orderPayload) {
    const canonicalString = [
      orderPayload.code || orderPayload.id,
      orderPayload.placed_at || orderPayload.created_at,
      orderPayload.subtotal,
      orderPayload.tax || 0,
      orderPayload.total,
      orderPayload.national_id || orderPayload.customer_phone || '',
    ].join('|');

    const hash = crypto.createHash('sha256').update(canonicalString).digest('hex');
    const signature = crypto.createHmac('sha256', this.secretKey).update(hash).digest('hex');

    return {
      hash,
      signature: signature.slice(0, 32).toUpperCase(), // امضای استاندارد ۳۲ کاراکتری فاکتور
      canonical_string: canonicalString,
      signed_at: new Date().toISOString(),
    };
  }

  /**
   * اعتبارسنجی اصالت امضای فاکتور
   */
  verifyInvoice(orderPayload, signatureToVerify) {
    const generated = this.signInvoice(orderPayload);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(generated.signature, 'utf8'),
      Buffer.from(String(signatureToVerify || '').trim().toUpperCase(), 'utf8')
    );

    return {
      valid: isValid,
      hash: generated.hash,
    };
  }
}

export const invoiceSigner = new InvoiceSigner();
