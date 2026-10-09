import { run } from '../db/index.js';

/**
 * سرویس ثبت مختصات جغرافیایی دقیق نقشه برای آدرس‌های ارسال (Delivery Geolocation Pinpoint)
 */
export class DeliveryGeolocationService {
  /**
   * اعتبارسنجی و ثبت مختصات جغرافیایی (عرض و طول جغرافیایی) برای آدرس خریدار
   */
  attachCoordinatesToAddress({ addressId, latitude, longitude }) {
    if (!addressId || latitude === undefined || longitude === undefined) {
      throw new Error('شناسه آدرس، عرض جغرافیایی (lat) و طول جغرافیایی (lng) الزامی است.');
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    // محدوده مرزهای جغرافیایی ایران (تقریبی: عرض ۲۵ تا ۴۰ شمالی، طول ۴۴ تا ۶۴ شرقی)
    const isWithinIranBounds = lat >= 24 && lat <= 41 && lng >= 43 && lng <= 65;

    run(
      `UPDATE addresses 
       SET latitude = ?, longitude = ? 
       WHERE id = ?`,
      lat, lng, addressId
    );

    return {
      address_id: addressId,
      latitude: lat,
      longitude: lng,
      is_within_iran_bounds: isWithinIranBounds,
      map_url: `https://neshan.org/maps/@${lat},${lng},16z`,
      message_fa: isWithinIranBounds 
        ? 'لوکیشن دقیق نقشه با موفقیت برای آدرس ثبت گردید.' 
        : 'توجه: مختصات ثبت‌شده خارج از محدوده مرزهای کشور قرار دارد.'
    };
  }

  /**
   * محاسبه فاصله هوایی تقریبی بر حسب کیلومتر (فرمول Haversine)
   */
  calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // شعاع زمین به کیلومتر
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Number((R * c).toFixed(1));
  }
}

export const deliveryGeolocationService = new DeliveryGeolocationService();
