/**
 * ماشین محاسبه تاریخ تحویل تقریبی سفارش (Estimated Delivery Date)
 * با در نظر گرفتن روزهای کاری رسمی ایران (شنبه تا پنج‌شنبه)، روزهای جمعه و نوع حامل بار
 */

export class DeliveryDateEstimator {
  /**
   * محاسبه تاریخ و بازه زمانی تحویل بر اساس حامل بار و شهر مقصد
   * @param {'post' | 'tipax' | 'peyk'} carrier روش ارسال
   * @param {string} destinationCity شهر مقصد
   * @param {Date} orderDate زمان ثبت سفارش
   */
  estimateDelivery(carrier = 'post', destinationCity = 'تهران', orderDate = new Date()) {
    let businessDaysNeeded = 3; // پیش‌فرض پست پیشتاز شهرستان

    if (carrier === 'peyk') {
      businessDaysNeeded = destinationCity.includes('تهران') ? 0 : 1; // پیک موتوری درون‌شهری در همان روز
    } else if (carrier === 'tipax') {
      businessDaysNeeded = destinationCity.includes('تهران') ? 1 : 2; // تیپاکس سریع
    } else if (carrier === 'post') {
      businessDaysNeeded = destinationCity.includes('تهران') ? 2 : 3; // پیشتاز
    }

    const targetDate = new Date(orderDate.getTime());
    let addedDays = 0;

    // اضافه کردن روزها با احتساب عبور از جمعه‌ها
    while (addedDays < businessDaysNeeded) {
      targetDate.setDate(targetDate.getDate() + 1);
      const dayOfWeek = targetDate.getDay(); // 5 = جمعه در تقویم میلادی
      if (dayOfWeek !== 5) {
        addedDays += 1;
      }
    }

    const minDate = new Date(targetDate.getTime());
    const maxDate = new Date(targetDate.getTime() + 24 * 3600 * 1000); // بازه یک‌روزه تحویل

    return {
      carrier,
      destination_city: destinationCity,
      business_days_needed: businessDaysNeeded,
      estimated_date_iso: targetDate.toISOString().slice(0, 10),
      estimated_range_fa: `بین ${minDate.toLocaleDateString('fa-IR')} تا ${maxDate.toLocaleDateString('fa-IR')}`,
    };
  }
}

export const deliveryDateEstimator = new DeliveryDateEstimator();
