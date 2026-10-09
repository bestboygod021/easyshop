import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ClickAndCollectPickupService } from '../src/services/click-and-collect-pickup.js';
import { GrossProfitMarginAnalyzerService } from '../src/services/gross-profit-analyzer.js';
import { AiNextOrderPredictiveEngine } from '../src/services/ai-next-order-predictor.js';
import { AffiliateShortLinkTrackerService } from '../src/services/affiliate-shortlink-tracker.js';
import { VendorDigitalContractSignerService } from '../src/services/vendor-digital-contract.js';
import { FeatureTogglesService } from '../src/services/feature-toggles.js';

describe('Continuous Improvement Round 29 Test Suite', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      tables: {
        order_pickup_reservations: [],
        affiliate_links: [],
        vendor_contracts: [],
        system_feature_toggles: [],
        vendors: [{ id: 'vnd_tech', is_contract_signed: 0 }],
        orders: [
          { id: 'ord_sample_1', user_id: 'usr_1', total: 2000000, status: 'completed', created_at: '2026-09-01T10:00:00Z' },
          { id: 'ord_sample_2', user_id: 'usr_1', total: 1500000, status: 'completed', created_at: '2026-09-15T10:00:00Z' }
        ],
        order_items: [
          { order_id: 'ord_sample_1', product_id: 'prd_coffee', title: 'دانه قهوه ۱ کیلوگرمی', price: 500000, cost: 350000, quantity: 4 }
        ]
      },
      async get(query, params = []) {
        if (query.includes('FROM order_pickup_reservations WHERE pickup_token = ?')) {
          return this.tables.order_pickup_reservations.find(p => p.pickup_token === params[0]) || null;
        }
        if (query.includes('FROM orders WHERE id = ?')) {
          return this.tables.orders.find(o => o.id === params[0]) || null;
        }
        if (query.includes('FROM affiliate_links WHERE slug = ?')) {
          return this.tables.affiliate_links.find(a => a.slug === params[0]) || null;
        }
        if (query.includes('FROM vendor_contracts WHERE id = ?')) {
          return this.tables.vendor_contracts.find(c => c.id === params[0]) || null;
        }
        if (query.includes('FROM system_feature_toggles WHERE feature_key = ?')) {
          return this.tables.system_feature_toggles.find(f => f.feature_key === params[0]) || null;
        }
        return null;
      },
      async all(query, params = []) {
        if (query.includes('FROM order_items WHERE order_id = ?')) {
          return this.tables.order_items.filter(i => i.order_id === params[0]);
        }
        if (query.includes('FROM orders WHERE user_id = ?')) {
          return this.tables.orders.filter(o => o.user_id === params[0]);
        }
        if (query.includes('FROM order_items') && query.includes('user_id = ?')) {
          return [
            { title: 'دانه قهوه ۱ کیلوگرمی', product_id: 'prd_coffee', purchase_frequency: 2 }
          ];
        }
        if (query.includes('FROM system_feature_toggles')) {
          return this.tables.system_feature_toggles;
        }
        return [];
      },
      async run(query, params = []) {
        if (query.startsWith('INSERT INTO order_pickup_reservations')) {
          this.tables.order_pickup_reservations.push({
            id: params[0],
            order_id: params[1],
            user_id: params[2],
            hub_id: params[3],
            hub_name: params[4],
            recipient_name: params[5],
            recipient_national_id: params[6],
            pickup_token: params[7],
            status: 'READY_FOR_PICKUP',
            created_at: params[8]
          });
        } else if (query.includes('UPDATE order_pickup_reservations SET status = \'COLLECTED\'')) {
          const rec = this.tables.order_pickup_reservations.find(r => r.id === params[2]);
          if (rec) {
            rec.status = 'COLLECTED';
            rec.collected_at = params[0];
            rec.staff_user_id = params[1];
          }
        } else if (query.startsWith('INSERT INTO affiliate_links')) {
          this.tables.affiliate_links.push({
            id: params[0],
            affiliate_user_id: params[1],
            slug: params[2],
            destination_url: params[3],
            commission_percent: params[4],
            clicks_count: 0,
            orders_count: 0,
            earnings_toman: 0,
            is_active: 1,
            created_at: params[5]
          });
        } else if (query.includes('UPDATE affiliate_links SET clicks_count')) {
          const l = this.tables.affiliate_links.find(item => item.id === params[0]);
          if (l) l.clicks_count += 1;
        } else if (query.includes('UPDATE affiliate_links SET orders_count')) {
          const l = this.tables.affiliate_links.find(item => item.id === params[1]);
          if (l) {
            l.orders_count += 1;
            l.earnings_toman += params[0];
          }
        } else if (query.startsWith('INSERT INTO vendor_contracts')) {
          this.tables.vendor_contracts.push({
            id: params[0],
            vendor_id: params[1],
            terms_version: params[2],
            national_id: params[3],
            signatory_name: params[4],
            signatory_mobile: params[5],
            digital_fingerprint: params[6],
            ip_address: params[7],
            status: 'SIGNED_AND_VERIFIED',
            signed_at: params[8]
          });
        } else if (query.startsWith('UPDATE vendors SET is_contract_signed')) {
          const v = this.tables.vendors.find(item => item.id === params[0]);
          if (v) v.is_contract_signed = 1;
        } else if (query.startsWith('INSERT INTO system_feature_toggles')) {
          this.tables.system_feature_toggles.push({
            feature_key: params[0],
            is_enabled: params[1],
            updated_by_user_id: params[2],
            updated_at: params[3]
          });
        } else if (query.startsWith('UPDATE system_feature_toggles')) {
          const t = this.tables.system_feature_toggles.find(item => item.feature_key === params[3]);
          if (t) {
            t.is_enabled = params[0];
            t.updated_by_user_id = params[1];
            t.updated_at = params[2];
          }
        }
        return { changes: 1 };
      }
    };
  });

  describe('1. ClickAndCollectPickupService', () => {
    it('registers collection hub pickup, issues verification token, and handovers package', async () => {
      const service = new ClickAndCollectPickupService(mockDb);

      const hubs = service.getPickupHubs();
      assert.ok(hubs.length >= 3);

      const reservation = await service.registerPickup({
        orderId: 'ord_sample_1',
        userId: 'usr_1',
        hubId: 'HUB_TEH_CENTRAL',
        recipientName: 'رضا کمالی',
        recipientNationalId: '0011223344'
      });
      assert.ok(reservation.pickup_token);
      assert.equal(reservation.status, 'READY_FOR_PICKUP');

      const handover = await service.verifyAndHandoverPickup(reservation.pickup_token, 'usr_staff_1');
      assert.equal(handover.status, 'COLLECTED');
    });
  });

  describe('2. GrossProfitMarginAnalyzerService', () => {
    it('analyzes net order profitability by calculating COGS, gateway fee, and packaging cost', async () => {
      const service = new GrossProfitMarginAnalyzerService(mockDb);

      const analysis = await service.analyzeOrderProfit('ord_sample_1');
      assert.equal(analysis.gross_revenue_toman, 2000000);
      assert.equal(analysis.cogs_total_toman, 1400000); // 4 * 350,000
      assert.equal(analysis.gateway_fee_toman, 4000); // Max fee capped
      assert.equal(analysis.packaging_cost_toman, 15000);
      assert.equal(analysis.net_gross_profit_toman, 581000);
      assert.equal(analysis.is_profitable, true);
    });
  });

  describe('3. AiNextOrderPredictiveEngine', () => {
    it('analyzes purchase intervals and forecasts customer reorder timing and basket', async () => {
      const service = new AiNextOrderPredictiveEngine(mockDb);

      const prediction = await service.predictNextOrderForUser('usr_1');
      assert.equal(prediction.has_sufficient_history, true);
      assert.equal(prediction.average_order_cycle_days, 14); // 14 days cadence
      assert.ok(prediction.predicted_next_order_date);
      assert.ok(prediction.predicted_basket_items.length > 0);
    });
  });

  describe('4. AffiliateShortLinkTrackerService', () => {
    it('creates branded shortlink, registers clicks, and credits attributed sales', async () => {
      const service = new AffiliateShortLinkTrackerService(mockDb);

      const link = await service.createAffiliateLink({
        affiliateUserId: 'usr_influencer',
        slug: 'tech-review',
        destinationUrl: 'https://easyshop.ir/products/laptop',
        commissionPercent: 8
      });
      assert.equal(link.slug, 'tech-review');

      const click = await service.recordClick('tech-review');
      assert.equal(click.affiliate_user_id, 'usr_influencer');

      const attribution = await service.attributeOrderCommission('tech-review', 10000000); // 10M
      assert.equal(attribution.commission_earned_toman, 800000); // 8%
      assert.equal(attribution.new_total_earnings, 800000);
    });
  });

  describe('5. VendorDigitalContractSignerService', () => {
    it('generates cryptographic SHA-256 fingerprint for vendor contract and verifies signature', async () => {
      const service = new VendorDigitalContractSignerService(mockDb);

      const terms = service.getContractTerms();
      assert.ok(terms.clauses.length >= 4);

      const signed = await service.signContract({
        vendorId: 'vnd_tech',
        nationalId: '10103344556',
        signatoryFullName: 'مهندس آرش شایان',
        signatoryMobile: '09121112233'
      });
      assert.ok(signed.digital_fingerprint);
      assert.equal(signed.status, 'SIGNED_AND_VERIFIED');

      const verification = await service.verifyContractSignature(signed.contract_id);
      assert.equal(verification.is_valid, true);
      assert.equal(verification.digital_fingerprint, signed.digital_fingerprint);
    });
  });

  describe('6. FeatureTogglesService (Admin On/Off Switches)', () => {
    it('retrieves all system modules and toggles features on and off dynamically', async () => {
      const service = new FeatureTogglesService(mockDb);

      // Default should be true
      const initialAll = await service.getAllFeatures();
      assert.equal(initialAll.click_and_collect, true);
      assert.equal(initialAll.gross_profit_analyzer, true);

      // Admin turns off 'open_box_outlet'
      await service.setFeatureState('open_box_outlet', false, 'usr_admin');
      const isOff = await service.isFeatureEnabled('open_box_outlet');
      assert.equal(isOff, false);

      // Admin turns it back on
      await service.setFeatureState('open_box_outlet', true, 'usr_admin');
      const isOn = await service.isFeatureEnabled('open_box_outlet');
      assert.equal(isOn, true);
    });
  });
});
