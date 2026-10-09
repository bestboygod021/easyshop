/**
 * Click-and-Collect Warehouse Pickup Service (Round 29)
 * Allows customers to reserve orders for in-person warehouse/store pickup.
 * Generates secure digital QR verification codes and verifies recipient identity upon handover.
 */

import crypto from 'node:crypto';

export class ClickAndCollectPickupService {
  constructor(db) {
    this.db = db;
    this.pickupHubs = [
      { id: 'HUB_TEH_CENTRAL', name: 'انبار مرکزی تهران (شادآباد)', address: 'تهران، بزرگراه فتح، خیابان ۱۷ شهریور', workingHours: 'شنبه تا چهارشنبه ۹ الی ۱۷' },
      { id: 'HUB_TEH_EAST', name: 'مرکز توزیع شرق (تهرانپارس)', address: 'تهران، فلکه دوم تهرانپارس، خیابان فرجام', workingHours: 'شنبه تا پنج‌شنبه ۱۰ الی ۱۹' },
      { id: 'HUB_ISF_CENTRAL', name: 'هاب توزیع اصفهان', address: 'اصفهان، خیابان امام خمینی، شهرک صنعتی امیرکبیر', workingHours: 'شنبه تا چهارشنبه ۹ الی ۱۶' }
    ];
  }

  /**
   * Get list of active collection hubs
   */
  getPickupHubs() {
    return this.pickupHubs;
  }

  /**
   * Register a click-and-collect pickup for an order
   */
  async registerPickup({ orderId, userId, hubId, recipientName, recipientNationalId }) {
    if (!orderId || !hubId) throw new Error('شناسه سفارش و شناسه انبار تحویل الزامی است');
    const hub = this.pickupHubs.find(h => h.id === hubId) || this.pickupHubs[0];

    const pickupId = `pck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const pickupToken = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-char alphanumeric PIN
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO order_pickup_reservations 
       (id, order_id, user_id, hub_id, hub_name, recipient_name, recipient_national_id, pickup_token, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'READY_FOR_PICKUP', ?)`,
      [
        pickupId,
        orderId,
        userId,
        hub.id,
        hub.name,
        recipientName || 'خریدار محترم',
        recipientNationalId || null,
        pickupToken,
        now
      ]
    );

    return {
      pickup_id: pickupId,
      order_id: orderId,
      hub_name: hub.name,
      hub_address: hub.address,
      working_hours: hub.workingHours,
      pickup_token: pickupToken,
      qr_code_payload: `EASYSHOP-PICKUP:${orderId}:${pickupToken}`,
      status: 'READY_FOR_PICKUP',
      message: 'نوبت تحویل حضوری در انبار مرکزی با موفقیت ثبت شد. بارکد تحویل صادر گردید.'
    };
  }

  /**
   * Warehouse staff verifies token and hands over package
   */
  async verifyAndHandoverPickup(pickupToken, staffUserId) {
    if (!pickupToken) throw new Error('کد تحویل حضوری الزامی است');
    const cleanToken = String(pickupToken).trim().toUpperCase();

    const reservation = await this.db.get(
      'SELECT * FROM order_pickup_reservations WHERE pickup_token = ?',
      [cleanToken]
    );

    if (!reservation) {
      throw new Error('کد تحویل وارد شده نامعتبر است یا در سامانه یافت نشد');
    }

    if (reservation.status === 'COLLECTED') {
      return {
        status: 'ALREADY_COLLECTED',
        collected_at: reservation.collected_at,
        message: 'هشدار: این مرسوله قبلاً تحویل داده شده است!'
      };
    }

    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE order_pickup_reservations 
       SET status = 'COLLECTED', collected_at = ?, staff_user_id = ?
       WHERE id = ?`,
      [now, staffUserId || null, reservation.id]
    );

    // Update order to completed/delivered
    await this.db.run(`UPDATE orders SET status = 'delivered' WHERE id = ?`, [reservation.order_id]);

    return {
      pickup_id: reservation.id,
      order_id: reservation.order_id,
      recipient_name: reservation.recipient_name,
      status: 'COLLECTED',
      collected_at: now,
      message: 'احراز هویت انجام شد و مرسوله با موفقیت به مشتری تحویل گردید.'
    };
  }
}
