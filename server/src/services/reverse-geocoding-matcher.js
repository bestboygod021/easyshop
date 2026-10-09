/**
 * سیستم تطبیق هوشمند آدرس پستی با نقشه شهری و تعیین محدوده ناوگان شهری
 * (Reverse Geocoding & Urban Fleet Delivery Matcher)
 */
export class ReverseGeocodingMatcherService {
  constructor() {
    // محدوده‌های شهری تهران برای تعیین ناوگان پیک موتوری
    this.tehranDistricts = {
      central: ['ولیعصر', 'فاطمی', 'مطهری', 'انقلاب', 'کریمخان', 'جمهوری', 'حافظ'],
      north: ['تجریش', 'نیاوران', 'زعفرانیه', 'فرمانیه', 'اقدسیه', 'پاسداران', 'سعادت‌آباد', 'شهرک غرب'],
      west: ['صادقیه', 'ستارخان', 'مرزداران', 'پونک', 'جنت‌آباد', 'چیتگر', 'اکباتان'],
      east: ['تهرانپارس', 'نارمک', 'رسالت', 'پیروزی', 'تهران‌نو', 'نیرو هوایی'],
      south: ['نازی‌آباد', 'شوش', 'خاوران', 'فداییان اسلام', 'شهرری'],
    };
  }

  /**
   * تحلیل متن آدرس و استخراج مشخصات جغرافیایی و ناوگان مناسب
   */
  analyzeAddress(addressText = '', city = 'تهران', province = 'تهران') {
    const text = String(addressText || '').trim();
    if (!text) {
      throw new Error('متن آدرس الزامی است.');
    }

    const isTehran = city.includes('تهران') || province.includes('تهران') || text.includes('تهران');
    let detectedDistrict = 'خارج از محدوده مرکزی تهران';
    let inTrafficPlanZone = false;
    let suggestedFleet = 'پست پیشتاز';
    let estimatedExpressDeliveryMins = null;

    if (isTehran) {
      suggestedFleet = 'پیک موتوری فوری (ارسال همان روز)';
      estimatedExpressDeliveryMins = 120; // ۲ ساعت

      for (const [zone, keywords] of Object.entries(this.tehranDistricts)) {
        if (keywords.some((kw) => text.includes(kw))) {
          if (zone === 'central') {
            detectedDistrict = 'منطقه ۶ و ۷ مرکزی (محدوده طرح ترافیک)';
            inTrafficPlanZone = true;
          } else if (zone === 'north') {
            detectedDistrict = 'شمال تهران (منطقه ۱ و ۲ و ۳)';
          } else if (zone === 'west') {
            detectedDistrict = 'غرب تهران (منطقه ۲ و ۵ و ۲۲)';
          } else if (zone === 'east') {
            detectedDistrict = 'شرق تهران (منطقه ۴ و ۸ و ۱۳)';
          } else if (zone === 'south') {
            detectedDistrict = 'جنوب تهران (منطقه ۱۵ تا ۲۰)';
          }
          break;
        }
      }
    }

    // تولید مختصات تقریبی ژئوکدینگ برای شبیه‌سازی روی نقشه
    const baseLat = 35.6892;
    const baseLng = 51.3890;
    const hash = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const latOffset = ((hash % 100) - 50) / 1000;
    const lngOffset = (((hash * 7) % 100) - 50) / 1000;

    return {
      address_raw: text,
      city: isTehran ? 'تهران' : city,
      province: isTehran ? 'تهران' : province,
      is_capital_urban: isTehran,
      detected_district: detectedDistrict,
      in_traffic_plan_zone: inTrafficPlanZone,
      suggested_fleet: suggestedFleet,
      estimated_express_delivery_mins: estimatedExpressDeliveryMins,
      approximate_coordinates: {
        latitude: Number((baseLat + latOffset).toFixed(6)),
        longitude: Number((baseLng + lngOffset).toFixed(6)),
      },
    };
  }
}

export const reverseGeocodingMatcherService = new ReverseGeocodingMatcherService();
