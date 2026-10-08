import fs from 'node:fs';
import path from 'node:path';

/**
 * سرویس تحلیل و بهینه‌سازی تصاویر بارگذاری‌شده
 * تشخیص فرمت‌ها، فراداده ابعاد و آماده‌سازی برای تحویل پرسرعت
 */

export class ImageOptimizer {
  /**
   * ارزیابی نوع و ساختار فایل آپلود شده
   * @param {Buffer} buffer بافر تصویر
   * @returns {{ format: string, isValid: boolean, isCompressible: boolean }}
   */
  inspectImage(buffer) {
    if (!buffer || buffer.length < 8) {
      return { format: 'unknown', isValid: false, isCompressible: false };
    }

    // بررسی امضای فایل‌ها (Magic Bytes)
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { format: 'png', isValid: true, isCompressible: true };
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { format: 'jpeg', isValid: true, isCompressible: true };
    }

    // WebP: RIFF ... WEBP
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return { format: 'webp', isValid: true, isCompressible: false };
    }

    return { format: 'other', isValid: false, isCompressible: false };
  }

  /**
   * تولید مشخصات پاسخ استاتیک با پشتیبانی از کش طولانی و هدرهای فشرده‌سازی
   */
  getOptimizedHeaders(mimeType) {
    return {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };
  }
}

export const imageOptimizer = new ImageOptimizer();
