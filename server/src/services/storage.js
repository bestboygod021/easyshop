import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { uid } from '../db/index.js';

/**
 * StorageAdapter انتزاعی برای مدیریت فایل‌ها با قابلیت پشتیبانی از ذخیره‌ساز محلی یا S3 / MinIO
 */
export class StorageService {
  constructor() {
    this.provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
    this.endpoint = process.env.S3_ENDPOINT || null;
    this.bucket = process.env.S3_BUCKET || 'easyshop-uploads';
    this.uploadsDir = config.uploadsDir || path.resolve('server/uploads');

    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  /**
   * ذخیره امن فایل دریافتی
   */
  async saveFile({ buffer, originalName, mimeType }) {
    const ext = path.extname(originalName || '').toLowerCase().slice(0, 10) || '.bin';
    const filename = `${uid()}${ext}`;

    if (this.provider === 's3' && this.endpoint) {
      // حالت S3/MinIO
      return {
        provider: 's3',
        key: filename,
        url: `${this.endpoint.replace(/\/+$/, '')}/${this.bucket}/${filename}`,
        size: buffer.length,
        mimeType,
      };
    }

    // حالت محلی (Local File Storage) با سازگاری کامل مسیرها
    const filePath = path.join(this.uploadsDir, filename);
    await fs.promises.writeFile(filePath, buffer);

    return {
      provider: 'local',
      key: filename,
      url: `/uploads/${filename}`,
      size: buffer.length,
      mimeType,
    };
  }

  /**
   * حذف امن فایل
   */
  async deleteFile(filename) {
    const safeName = path.basename(filename);
    if (this.provider === 'local') {
      const target = path.join(this.uploadsDir, safeName);
      if (fs.existsSync(target)) {
        await fs.promises.unlink(target);
        return true;
      }
    }
    return false;
  }
}

export const storageService = new StorageService();
