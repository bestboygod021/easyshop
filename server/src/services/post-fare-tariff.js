/**
 * محاسبه‌گر پیشرفته تعرفه کرایه پستی بر اساس وزن و فاصله مبدا-مقصد (Dynamic Post Tare Tariff)
 * مطابق نرخ‌نامه رسمی پست پیشتاز و سفارشی جمهوری اسلامی ایران
 */
export class PostFareTariffCalculator {
  /**
   * محاسبه هزینه دقیق پست با در نظر گرفتن:
   * - وزن مرسوله به گرم (Base Weight)
   * - نوع همجواری استانی (درون‌استانی، همجوار، غیرهمجوار)
   * - هزینه بیمه عمومی و ارزش‌افزوده پستی
   */
  calculatePostFare({
    weightGrams = 500,
    originProvince = 'تهران',
    destProvince = 'تهران',
    declaredValueToman = 0,
    serviceType = 'pishtaz', // 'pishtaz' | 'sefareshi'
  }) {
    const weight = Math.max(100, Number(weightGrams) || 500);
    const isSameProvince = originProvince.trim() === destProvince.trim();

    // همجواری استان تهران با البرز، مازندران، سمنان، قم، مرکزی، قزوین
    const tehranNeighbors = ['البرز', 'مازندران', 'سمنان', 'قم', 'مرکزی', 'قزوین'];
    const isNeighbor = !isSameProvince && (
      (originProvince === 'تهران' && tehranNeighbors.includes(destProvince)) ||
      (destProvince === 'تهران' && tehranNeighbors.includes(originProvince))
    );

    let zoneMultiplier = 1.0; // درون استانی
    let zoneTitle = 'درون‌استانی';

    if (isNeighbor) {
      zoneMultiplier = 1.25;
      zoneTitle = 'استان‌های همجوار';
    } else if (!isSameProvince) {
      zoneMultiplier = 1.5;
      zoneTitle = 'استان‌های غیرهمجوار / دوردست';
    }

    // تعرفه پایه تا ۱ کیلوگرم برای پیشتاز
    const baseFare = serviceType === 'pishtaz' ? 45000 : 32000;
    
    // اضافه بار به ازای هر ۱ کیلوگرم مازاد بر ۱ کیلوگرم اول
    const extraWeightKg = Math.max(0, (weight - 1000) / 1000);
    const extraWeightRate = serviceType === 'pishtaz' ? 12000 : 8000;
    const weightSurcharge = Math.ceil(extraWeightKg) * extraWeightRate;

    // حق بیمه عمومی مرسوله (۰.۲٪ ارزش اعلام‌شده کالا)
    const insuranceFee = Math.max(5000, Math.round(Number(declaredValueToman) * 0.002));

    // حق بسته‌بندی و خدمات پستی
    const packagingFee = weight > 2000 ? 15000 : 8000;

    const rawTotal = (baseFare + weightSurcharge) * zoneMultiplier + insuranceFee + packagingFee;
    const finalFare = Math.round(rawTotal / 1000) * 1000; // رند به ۱۰۰۰ تومان

    return {
      service_type: serviceType === 'pishtaz' ? 'پست پیشتاز' : 'پست سفارشی',
      weight_grams: weight,
      origin: originProvince,
      destination: destProvince,
      zone_type: zoneTitle,
      base_fare: baseFare,
      weight_surcharge: weightSurcharge,
      insurance_fee: insuranceFee,
      packaging_fee: packagingFee,
      total_fare: finalFare,
    };
  }
}

export const postFareTariffCalculator = new PostFareTariffCalculator();
