import { get, run } from '../db/index.js';

/**
 * سرویس زمان‌بندی هوشمند بازه‌های تحویل شهری با محدودیت ظرفیت ناوگان (Time-Slot Delivery Scheduler)
 */
export class TimeSlotDeliveryService {
  constructor() {
    this.slots = [
      { id: 'morning', label_fa: 'صبح (ساعت ۹ الی ۱۳)', max_capacity: 25 },
      { id: 'afternoon', label_fa: 'عصر (ساعت ۱۴ الی ۱۸)', max_capacity: 35 },
      { id: 'evening', label_fa: 'شب (ساعت ۱۹ الی ۲۲)', max_capacity: 20 },
    ];
  }

  /**
   * دریافت بازه‌های تحویل در دسترس برای تاریخ مشخص
   * @param {string} deliveryDate تاریخ به فرمت YYYY-MM-DD
   */
  getAvailableSlots(deliveryDate) {
    const targetDate = deliveryDate || new Date().toISOString().split('T')[0];

    return this.slots.map(slot => {
      const bookedCount = get(
        `SELECT COUNT(*) as count 
         FROM delivery_slot_bookings 
         WHERE delivery_date = ? AND slot_id = ?`,
        targetDate, slot.id
      )?.count || 0;

      const remainingCapacity = Math.max(0, slot.max_capacity - bookedCount);

      return {
        slot_id: slot.id,
        label: slot.label_fa,
        delivery_date: targetDate,
        max_capacity: slot.max_capacity,
        booked_count: bookedCount,
        remaining_capacity: remainingCapacity,
        is_available: remainingCapacity > 0
      };
    });
  }

  /**
   * رزرو بازه تحویل برای یک سفارش
   */
  bookSlot({ orderId, deliveryDate, slotId }) {
    if (!orderId || !deliveryDate || !slotId) {
      throw new Error('شناسه سفارش، تاریخ تحویل و بازه انتخابی الزامی است.');
    }

    const slot = this.slots.find(s => s.id === slotId);
    if (!slot) throw new Error('بازه انتخابی نامعتبر است.');

    const bookedCount = get(
      `SELECT COUNT(*) as count 
       FROM delivery_slot_bookings 
       WHERE delivery_date = ? AND slot_id = ?`,
      deliveryDate, slotId
    )?.count || 0;

    if (bookedCount >= slot.max_capacity) {
      return { success: false, reason: 'slot_full', message_fa: 'ظرفیت ارسال در این بازه تکمیل شده است.' };
    }

    const id = `slot_bk_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    run(
      `INSERT INTO delivery_slot_bookings (id, order_id, delivery_date, slot_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      id, orderId, deliveryDate, slotId, now
    );

    return {
      success: true,
      booking_id: id,
      order_id: orderId,
      delivery_date: deliveryDate,
      slot_label: slot.label_fa,
      message_fa: `سفارش برای تحویل در تاریخ ${deliveryDate} بازه ${slot.label_fa} با موفقیت رزرو شد.`
    };
  }
}

export const timeSlotDeliveryService = new TimeSlotDeliveryService();
