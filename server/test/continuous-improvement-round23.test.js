import './isolated-seed.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { all } from '../src/db/index.js';
import { stockDepletionForecaster } from '../src/services/stock-depletion-forecaster.js';
import { payaBatchPayoutService } from '../src/services/paya-batch-payout.js';
import { newsletterCaptureService } from '../src/services/newsletter-capture.js';
import { loyaltyQuestsService } from '../src/services/loyalty-quests.js';
import { voiceSurveySimulatorService } from '../src/services/voice-survey-simulator.js';

describe('Round 23 Improvements: Stock Depletion Forecast, Paya Payout Batch, Newsletter Capture, Loyalty Quests & Voice Survey', () => {

  it('1. Stock Depletion Forecaster: calculates sales velocity and predicts runout window', () => {
    const sampleProduct = all('SELECT id FROM products LIMIT 1')[0];
    if (sampleProduct) {
      const forecast = stockDepletionForecaster.forecastProductDepletion(sampleProduct.id, 30);
      assert.ok('daily_sales_velocity' in forecast);
      assert.ok('current_stock' in forecast);
      assert.ok('urgency_level' in forecast);
      assert.ok(['safe', 'warning', 'critical'].includes(forecast.urgency_level));
    }
  });

  it('2. Paya Batch Payout: creates standard banking batch format with header, records and footer', () => {
    // یافتن یا ایجاد تسویه فروشنده
    const samplePayout = all('SELECT id FROM vendor_payouts LIMIT 1')[0];
    if (samplePayout) {
      const batch = payaBatchPayoutService.generatePayaBatchFile([samplePayout.id]);
      assert.ok(batch.batch_id.startsWith('PAYA-'));
      assert.ok(batch.paya_file_content.includes('HEADER|'));
      assert.ok(batch.paya_file_content.includes('FOOTER|'));
      assert.equal(batch.record_count, 1);
    }
  });

  it('3. Newsletter Lead Capture: subscribes user and assigns 15% welcome discount coupon', async () => {
    const uniquePhone = `0912${Math.floor(1000000 + Math.random() * 9000000)}`;
    const testEmail = `lead_${Date.now()}@example.com`;
    const sub = await newsletterCaptureService.subscribeLead({
      email: testEmail,
      phone: uniquePhone,
      source: 'test_suite',
    });

    assert.equal(sub.success, true);
    assert.ok(sub.subscriber_id);
    assert.ok(sub.welcome_coupon.startsWith('WELCOME-'));
    assert.equal(sub.discount_percentage, 15);
  });

  it('4. Loyalty Quests & Missions: tracks gamified missions and rewards points upon completion', () => {
    const sampleUser = all('SELECT id FROM users LIMIT 1')[0];
    const userId = sampleUser ? sampleUser.id : 'usr_test_quest';

    const quests = loyaltyQuestsService.getUserQuests(userId);
    assert.ok(Array.isArray(quests));
    assert.ok(quests.length >= 3);

    const completed = loyaltyQuestsService.completeQuest(userId, 'quest_first_review');
    assert.ok(completed.success || completed.already_completed);
  });

  it('5. Post-Delivery Voice Survey Simulator: initiates IVR call and logs satisfaction score', () => {
    const sampleOrder = all('SELECT id, user_id FROM orders LIMIT 1')[0];
    const orderId = sampleOrder ? sampleOrder.id : 'ord_test_survey';

    const call = voiceSurveySimulatorService.initiateVoiceSurveyCall({
      orderId,
      phone: '09121112233',
    });

    assert.equal(call.call_initiated, true);
    assert.ok(call.call_id);
    assert.equal(call.status, 'call_placed');

    const feedback = voiceSurveySimulatorService.recordCallFeedback({
      callId: call.call_id,
      score: 5,
      packageIntact: true,
      voiceMemo: 'تحویل بسیار سریع بود',
    });

    assert.equal(feedback.success, true);
    assert.equal(feedback.score, 5);
    assert.equal(feedback.status, 'completed');

    const metrics = voiceSurveySimulatorService.getVoiceSurveyMetrics();
    assert.ok(metrics.total_completed_surveys >= 1);
  });
});
