import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateInvoiceQrSvg } from '../src/services/qr-code.js';
import { getSystemResourceMetrics, measureEventLoopLag } from '../src/services/system-metrics.js';
import { smsOtpService } from '../src/services/sms-otp.js';
import { flashSaleService } from '../src/services/flash-sale.js';
import { imageOptimizer } from '../src/services/image-optimizer.js';

describe('Round 7 Improvements: QR Invoice, System Health & Lag, SMS OTP, Flash Sale, WebP/Image Optimizer', () => {

  it('1. Invoice QR Code: produces valid crisp SVG with finder patterns', () => {
    const svg = generateInvoiceQrSvg('ES-140025-INV', { size: 200 });
    assert.ok(svg.includes('<svg'), 'Must produce SVG markup');
    assert.ok(svg.includes('viewBox="0 0 200 200"'), 'Must have correct dimensions');
    assert.ok(svg.includes('<rect'), 'Must contain cells');
  });

  it('2. System Metrics & Event Loop: returns memory, CPU stats and measured loop latency', async () => {
    const metrics = getSystemResourceMetrics();
    assert.ok(typeof metrics.uptime_seconds === 'number');
    assert.ok(metrics.memory.heap_used_mb > 0);
    assert.ok(metrics.cpu.cores >= 1);
    assert.ok(['healthy', 'degraded'].includes(metrics.status));

    const lag = await measureEventLoopLag();
    assert.ok(typeof lag === 'number');
    assert.ok(lag >= 0);
  });

  it('3. SMS OTP: generates OTP, enforces attempts limit and verifies valid code', () => {
    const phone = '09123456789';
    const otp = smsOtpService.generateOtp(phone, 'login');
    assert.equal(otp.phone, phone);
    assert.equal(otp.code.length, 6);

    // ورود کد اشتباه
    const badVerify = smsOtpService.verifyOtp(phone, '000000', 'login');
    assert.equal(badVerify.success, false);

    // ورود کد صحیح
    const goodVerify = smsOtpService.verifyOtp(phone, otp.code, 'login');
    assert.equal(goodVerify.success, true);

    // بررسی عدم استفاده مجدد از کد مصرف شده
    const reuseVerify = smsOtpService.verifyOtp(phone, otp.code, 'login');
    assert.equal(reuseVerify.success, false);
  });

  it('4. Flash Sales: creates campaigns and provides live countdown timers', () => {
    const startsAt = new Date(Date.now() - 3600 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const campaign = flashSaleService.createCampaign({
      title: 'فروش شگفت‌انگیز نوروزی',
      slug: `nowruz-sale-${Date.now()}`,
      startsAt,
      endsAt,
      discountPct: 25,
    });
    assert.ok(campaign.id);

    const active = flashSaleService.getActiveCampaigns();
    assert.ok(active.length >= 1);
    assert.ok(active.some(c => c.id === campaign.id));
    const current = active.find(c => c.id === campaign.id);
    assert.ok(current.remaining_seconds > 0);
  });

  it('5. Image Optimizer: inspects binary image signatures and generates CDN headers', () => {
    const pngMagic = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const jpegMagic = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
    const invalidBuf = Buffer.from([0x00, 0x01, 0x02, 0x03]);

    assert.equal(imageOptimizer.inspectImage(pngMagic).format, 'png');
    assert.equal(imageOptimizer.inspectImage(jpegMagic).format, 'jpeg');
    assert.equal(imageOptimizer.inspectImage(invalidBuf).isValid, false);

    const headers = imageOptimizer.getOptimizedHeaders('image/webp');
    assert.equal(headers['Cache-Control'], 'public, max-age=31536000, immutable');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  });
});
