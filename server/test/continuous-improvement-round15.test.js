import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authAnomalyAlertService } from '../src/services/auth-anomaly.js';
import { gatewayCommissionAnalyzer } from '../src/services/gateway-commission.js';
import { npsEngine } from '../src/services/nps-engine.js';
import { bankReversalDispatcher } from '../src/services/bank-reversal.js';
import { aiAutoTaggingService } from '../src/services/ai-auto-tagging.js';
import { all } from '../src/db/index.js';

describe('Round 15 Improvements: Auth Anomaly, Gateway Commission, NPS Engine, Bank Reversal & AI Auto-Tagging', () => {

  it('1. Auth Anomaly: detects suspicious IP bursts and targeted email attacks', () => {
    const report = authAnomalyAlertService.detectAnomalies();
    assert.ok(typeof report.window_minutes === 'number');
    assert.ok(['normal', 'warning', 'critical'].includes(report.alert_level));
    assert.ok(Array.isArray(report.suspicious_ips));
  });

  it('2. Gateway Commission: calculates fee per transaction and generates volume breakdown', () => {
    const zibalFee = gatewayCommissionAnalyzer.calculateFee('zibal', 100000);
    assert.equal(zibalFee, 1000); // 1% of 100,000

    const zibalCapped = gatewayCommissionAnalyzer.calculateFee('zibal', 1000000);
    assert.equal(zibalCapped, 6000); // max 6,000

    const report = gatewayCommissionAnalyzer.getCommissionReport();
    assert.ok(typeof report.total_volume === 'number');
    assert.ok(Array.isArray(report.gateways));
  });

  it('3. NPS Engine: records promoter/detractor ratings and computes Net Promoter Score', () => {
    const res1 = npsEngine.submitNpsScore({
      score: 10,
      feedbackText: 'ارسال عالی و پشتیبانی فوق‌العاده',
    });
    assert.equal(res1.category, 'promoter');

    const res2 = npsEngine.submitNpsScore({
      score: 4,
      feedbackText: 'تاخیر در ارسال',
    });
    assert.equal(res2.category, 'detractor');

    const summary = npsEngine.calculateNpsSummary();
    assert.ok(typeof summary.nps_score === 'number');
    assert.ok(summary.total_responses >= 2);
  });

  it('4. Bank Reversal: executes automated reversal requests and records switch response', async () => {
    const result = await bankReversalDispatcher.requestReversal({
      paymentId: 'pmt_sample_test_999',
      saleOrderId: 'ord_123',
      saleReferenceId: 'ref_987654',
      reason: 'customer_cancellation_pre_shipping',
    });

    assert.equal(result.status, 'reversed');
    assert.equal(result.res_code, '0');
    assert.ok(result.reversal_id.startsWith('rev_'));
  });

  it('5. AI Auto-Tagging: extracts domain-relevant tags and keywords from product details', () => {
    const sampleProduct = {
      id: 'prd_demo_laptop',
      name_fa: 'لپتاپ گیمینگ ایسوس مدل ROG',
      description_fa: 'دارای حافظه رم سریع، گارانتی اصالت کالا و ارسال فوری با تخفیف ویژه',
      brand: 'ASUS',
    };

    const tags = aiAutoTaggingService.generateTags(sampleProduct);
    assert.ok(tags.tags.includes('دیجیتال'));
    assert.ok(tags.tags.includes('ارسال فوری'));
    assert.ok(tags.tags.includes('ASUS'));
    assert.ok(tags.suggested_keywords.length > 0);
  });
});
