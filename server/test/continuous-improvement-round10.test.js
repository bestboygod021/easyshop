import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { urlHealthProber } from '../src/services/url-prober.js';
import { iranPostTrackingService } from '../src/services/post-tracking.js';
import { warrantyService } from '../src/services/warranty.js';
import { deliveryFeedbackService } from '../src/services/delivery-feedback.js';
import { holidayThemeService } from '../src/services/holiday-theme.js';

describe('Round 10 Improvements: URL Health Prober, Post Tracking, Warranties, Delivery Feedback & Holiday Themes', () => {

  it('1. URL Health Prober: validates HTTP/HTTPS formats and rejects local loops', () => {
    assert.equal(urlHealthProber.validateUrlFormat('https://cdn.example.com/item.jpg').valid, true);
    assert.equal(urlHealthProber.validateUrlFormat('ftp://cdn.example.com').valid, false);
    assert.equal(urlHealthProber.validateUrlFormat('http://127.0.0.1/exploit').valid, false);
    assert.equal(urlHealthProber.validateUrlFormat('not-a-valid-url').valid, false);

    const catalogCheck = urlHealthProber.probeCatalogImages([
      { id: '1', image_url: 'https://images.example.com/p1.png' },
      { id: '2', image_url: 'ftp://bad.com/p2.png' },
    ]);
    assert.equal(catalogCheck.total_checked, 2);
    assert.equal(catalogCheck.broken_count, 1);
  });

  it('2. Post Tracking: validates 24-digit Iran Post codes and builds tracking checkpoints', () => {
    // کد ۲۴ رقمی استاندارد
    const validCode = '123456789012345678901234';
    assert.equal(iranPostTrackingService.isValidTrackingCode(validCode), true);
    assert.equal(iranPostTrackingService.isValidTrackingCode('12345'), false);

    const tracking = iranPostTrackingService.mockTrackShipment(validCode);
    assert.equal(tracking.valid, true);
    assert.equal(tracking.carrier, 'شرکت ملی پست جمهوری اسلامی ایران (پیشتاز)');
    assert.ok(tracking.checkpoints.length >= 1);
  });

  it('3. Warranties: registers serial numbers and checks coverage dates', () => {
    const serial = `SN-${Date.now()}`;
    const warranty = warrantyService.registerWarranty({
      serialNumber: serial,
      customerName: 'سارا احمدی',
      phone: '09129999999',
      durationMonths: 24,
    });

    assert.ok(warranty.id);
    assert.equal(warranty.serialNumber, serial);

    const check = warrantyService.checkWarranty(serial);
    assert.equal(check.found, true);
    assert.equal(check.is_valid, true);
    assert.equal(check.status_fa, 'فعال و تحت پوشش ضمانت');

    // شماره سریال ناموجود
    const badCheck = warrantyService.checkWarranty('DOES-NOT-EXIST');
    assert.equal(badCheck.found, false);
  });

  it('4. Delivery Feedback: submits courier ratings and computes aggregates', () => {
    const feedback = deliveryFeedbackService.submitFeedback({
      orderId: 'ord_dlv_test',
      packagingRating: 5,
      courierRating: 4,
      timelinessRating: 5,
      comment: 'بسته‌بندی عالی بود و به موقع رسید.',
    });

    assert.ok(feedback.id);
    assert.equal(feedback.averageRating, 4.7);

    const stats = deliveryFeedbackService.getDeliveryPerformanceStats();
    assert.ok(stats.total_feedbacks >= 1);
    assert.ok(stats.overall_score >= 1);
  });

  it('5. Holiday Themes: sets temporal festive styling and greetings', () => {
    const startsAt = new Date(Date.now() - 3600 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const theme = holidayThemeService.createHolidayTheme({
      title: 'جشنواره بهاره نوروز',
      slug: `nowruz-theme-${Date.now()}`,
      startsAt,
      endsAt,
      primaryColor: '#10b981',
      greetingMessage: 'نوروز باستانی مبارک باد',
      bannerUrl: 'https://cdn.example.com/nowruz.jpg',
    });

    assert.ok(theme.id);
    const active = holidayThemeService.getActiveTheme();
    assert.equal(active.active, true);
    assert.equal(active.theme.greeting_message, 'نوروز باستانی مبارک باد');
  });
});
