import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WholesaleVolumePricingService } from '../src/services/wholesale-volume-pricing.js';
import { VolumetricPackagingOptimizerService } from '../src/services/volumetric-packaging-optimizer.js';
import { PatternTransactionalSmsGateway } from '../src/services/pattern-transactional-sms.js';
import { SmartCheckoutCrossSellBumperService } from '../src/services/smart-checkout-cross-sell.js';
import { OpenBoxGradingInspectorService } from '../src/services/open-box-grading.js';

describe('Continuous Improvement Round 28 Test Suite', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      tables: {
        product_volume_tiers: [],
        transactional_sms_logs: [],
        open_box_inventory: [],
        products: [
          { id: 'prd_bulk_cable', title: 'کابل شارژ فست تایپ سی', price: 100000, category_id: 'cat_chargers', stock: 500, is_active: 1 },
          { id: 'prd_phone_flagship', title: 'گوشی پرچمدار سامسونگ', price: 40000000, category_id: 'mobile', stock: 20, is_active: 1 },
          { id: 'prd_case', title: 'قاب محافظ ژله‌ای شفاف', price: 150000, category_id: 'cat_cases', stock: 80, is_active: 1 }
        ]
      },
      async get(query, params = []) {
        if (query.includes('FROM products WHERE id = ?')) {
          return this.tables.products.find(p => p.id === params[0]) || null;
        }
        return null;
      },
      async all(query, params = []) {
        if (query.includes('FROM product_volume_tiers WHERE product_id = ?')) {
          return this.tables.product_volume_tiers
            .filter(t => t.product_id === params[0])
            .sort((a, b) => b.min_quantity - a.min_quantity);
        }
        if (query.includes('FROM products WHERE id IN')) {
          return this.tables.products.filter(p => params.includes(p.id));
        }
        if (query.includes('FROM products') && query.includes('id NOT IN')) {
          return this.tables.products.filter(p => !params.includes(p.id) && p.is_active === 1);
        }
        if (query.includes('FROM open_box_inventory')) {
          return this.tables.open_box_inventory.map(o => {
            const p = this.tables.products.find(prod => prod.id === o.original_product_id);
            return { ...o, product_title: p?.title, category_id: p?.category_id };
          });
        }
        return [];
      },
      async run(query, params = []) {
        if (query.startsWith('DELETE FROM product_volume_tiers WHERE product_id = ?')) {
          this.tables.product_volume_tiers = this.tables.product_volume_tiers.filter(t => t.product_id !== params[0]);
        } else if (query.startsWith('INSERT INTO product_volume_tiers')) {
          this.tables.product_volume_tiers.push({
            id: params[0],
            product_id: params[1],
            min_quantity: params[2],
            discount_percent: params[3],
            created_at: params[4]
          });
        } else if (query.startsWith('INSERT INTO transactional_sms_logs')) {
          this.tables.transactional_sms_logs.push({
            id: params[0],
            phone: params[1],
            pattern_key: params[2],
            pattern_code: params[3],
            tokens_json: params[4],
            provider: params[5],
            operator_message_id: params[6],
            status: 'DELIVERED',
            created_at: params[7]
          });
        } else if (query.startsWith('INSERT INTO open_box_inventory')) {
          this.tables.open_box_inventory.push({
            id: params[0],
            original_product_id: params[1],
            serial_number: params[2],
            grade: params[3],
            original_price: params[4],
            discounted_price: params[5],
            discount_percent: params[6],
            warranty_months: params[7],
            inspector_user_id: params[8],
            inspection_notes: params[9],
            status: 'AVAILABLE',
            created_at: params[10]
          });
        }
        return { changes: 1 };
      }
    };
  });

  describe('1. WholesaleVolumePricingService', () => {
    it('sets tiered price brackets and calculates bulk discounts accurately', async () => {
      const service = new WholesaleVolumePricingService(mockDb);

      await service.configureProductTiers('prd_bulk_cable', [
        { min_quantity: 5, discount_percent: 10 },
        { min_quantity: 20, discount_percent: 20 },
        { min_quantity: 50, discount_percent: 30 }
      ]);

      // Purchase 25 units: hits the 20+ tier (20% discount on 100,000 = 80,000/unit)
      const calculation = await service.calculateVolumePrice('prd_bulk_cable', 25, 100000);

      assert.equal(calculation.quantity, 25);
      assert.equal(calculation.discount_percent_applied, 20);
      assert.equal(calculation.effective_unit_price, 80000);
      assert.equal(calculation.total_price_toman, 2000000);
      assert.equal(calculation.total_savings_toman, 500000);
      assert.equal(calculation.tier_triggered, true);
    });
  });

  describe('2. VolumetricPackagingOptimizerService', () => {
    it('calculates volumetric vs physical weight and recommends optimal Iran Post carton', () => {
      const service = new VolumetricPackagingOptimizerService();

      // Send 2 items of 20x15x10 cm with total physical weight 800g
      const result = service.optimizeShipmentPackage([
        { lengthCm: 20, widthCm: 15, heightCm: 10, weightGrams: 400, quantity: 2 }
      ]);

      assert.ok(result.recommended_carton.id);
      assert.ok(result.physical_weight_kg > 0);
      assert.ok(result.volumetric_weight_kg > 0);
      assert.ok(result.billable_weight_kg >= result.physical_weight_kg);
    });
  });

  describe('3. PatternTransactionalSmsGateway', () => {
    it('dispatches pattern-based transactional OTP bypassing ad-blacklists', async () => {
      const service = new PatternTransactionalSmsGateway(mockDb);

      const dispatch = await service.sendPatternSms({
        phone: '09121234567',
        patternKey: 'OTP_VERIFY',
        tokenValues: { token: '482910' },
        primaryProvider: 'kavenegar'
      });

      assert.equal(dispatch.pattern_code, '10001');
      assert.equal(dispatch.bypasses_ad_blacklist, true);
      assert.equal(dispatch.status, 'DELIVERED');
      assert.equal(mockDb.tables.transactional_sms_logs.length, 1);
    });
  });

  describe('4. SmartCheckoutCrossSellBumperService', () => {
    it('generates high-affinity impulse cross-sell suggestions for checkout drawer', async () => {
      const service = new SmartCheckoutCrossSellBumperService(mockDb);

      const bumpers = await service.getCheckoutBumpOffers(['prd_phone_flagship'], 20);

      assert.ok(bumpers.offers.length > 0);
      const caseItem = bumpers.offers.find(i => i.product_id === 'prd_case');
      assert.ok(caseItem);
      assert.equal(caseItem.discount_percent, 20);
      assert.equal(caseItem.bump_price_toman, 120000); // 150000 - 20%
    });
  });

  describe('5. OpenBoxGradingInspectorService', () => {
    it('grades refurbished inventory unit, computes outlet discount, and lists unit', async () => {
      const service = new OpenBoxGradingInspectorService(mockDb);

      const listed = await service.gradeAndListUnit({
        originalProductId: 'prd_phone_flagship',
        serialNumber: 'SN-S24-OPENBOX-001',
        grade: 'GRADE_A',
        inspectorUserId: 'usr_inspector_1',
        inspectionNotes: 'بدون خط و خش، بازگشت از مشتری به علت تغییر رنگ'
      });

      assert.equal(listed.grade, 'GRADE_A');
      assert.equal(listed.original_price_toman, 40000000);
      assert.equal(listed.discount_percentage, 22);
      assert.equal(listed.outlet_price_toman, 31200000); // 40M * 0.78
      assert.equal(listed.outlet_warranty_months, 6);

      const available = await service.getAvailableOpenBoxUnits();
      assert.equal(available.length, 1);
      assert.equal(available[0].serial_number, 'SN-S24-OPENBOX-001');
    });
  });
});
