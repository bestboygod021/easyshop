import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ScratchAuthenticityService } from '../src/services/scratch-authenticity.js';
import { SmartReplenishmentSubscriptionService } from '../src/services/smart-replenishment.js';
import { InventoryDiscrepancyService } from '../src/services/inventory-discrepancy.js';
import { B2BTaxCertificateValidatorService } from '../src/services/b2b-tax-validator.js';
import { SocialBannerSvgGeneratorService } from '../src/services/social-banner-svg.js';

describe('Continuous Improvement Round 26 Test Suite', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      tables: {
        authenticity_codes: [],
        replenishment_schedules: [],
        inventory_cycle_counts: [],
        b2b_corporate_profiles: [],
        products: [
          { id: 'prd_1', title: 'ساعت هوشمند پرچمدار', price: 15000000, stock: 25 },
          { id: 'prd_filter', title: 'فیلتر دستگاه تصفیه آب', price: 400000, stock: 100 }
        ],
        users: [
          { id: 'usr_1', name: 'سهراب سپهری', phone: '09121112233' }
        ]
      },
      async get(query, params = []) {
        if (query.includes('FROM authenticity_codes')) {
          const code = this.tables.authenticity_codes.find(c => c.pin_hash === params[0]);
          if (!code) return null;
          const prod = this.tables.products.find(p => p.id === code.product_id);
          return { ...code, product_title: prod?.title || '' };
        }
        if (query.includes('FROM replenishment_schedules r JOIN products p')) {
          const schedule = this.tables.replenishment_schedules.find(s => s.id === params[0]);
          if (!schedule) return null;
          const prod = this.tables.products.find(p => p.id === schedule.product_id);
          return { ...schedule, price: prod?.price || 0 };
        }
        if (query.includes('FROM products WHERE id = ?')) {
          return this.tables.products.find(p => p.id === params[0]) || null;
        }
        return null;
      },
      async all(query, params = []) {
        if (query.includes('FROM replenishment_schedules r')) {
          return this.tables.replenishment_schedules.map(r => {
            const prod = this.tables.products.find(p => p.id === r.product_id);
            const usr = this.tables.users.find(u => u.id === r.user_id);
            return {
              ...r,
              product_title: prod?.title,
              product_price: prod?.price,
              phone: usr?.phone,
              user_name: usr?.name
            };
          });
        }
        if (query.includes('FROM inventory_cycle_counts c')) {
          return this.tables.inventory_cycle_counts.map(c => {
            const prod = this.tables.products.find(p => p.id === c.product_id);
            return { ...c, product_title: prod?.title };
          });
        }
        return [];
      },
      async run(query, params = []) {
        if (query.startsWith('INSERT INTO authenticity_codes')) {
          this.tables.authenticity_codes.push({
            id: params[0],
            product_id: params[1],
            batch_number: params[2],
            pin_hash: params[3],
            is_verified: 0,
            verified_count: 0,
            created_at: params[4]
          });
        } else if (query.includes('UPDATE authenticity_codes SET is_verified = 1')) {
          const rec = this.tables.authenticity_codes.find(c => c.id === params[3]);
          if (rec) {
            rec.is_verified = 1;
            rec.verified_count = 1;
            rec.first_verified_at = params[0];
            rec.last_verified_at = params[1];
            rec.verified_by_user_id = params[2];
          }
        } else if (query.includes('UPDATE authenticity_codes SET verified_count = ?')) {
          const rec = this.tables.authenticity_codes.find(c => c.id === params[2]);
          if (rec) {
            rec.verified_count = params[0];
            rec.last_verified_at = params[1];
          }
        } else if (query.startsWith('INSERT INTO replenishment_schedules')) {
          this.tables.replenishment_schedules.push({
            id: params[0],
            user_id: params[1],
            product_id: params[2],
            cycle_days: params[3],
            discount_percent: params[4],
            next_reminder_at: params[5],
            status: 'active',
            created_at: params[6]
          });
        } else if (query.startsWith('UPDATE replenishment_schedules')) {
          const schedule = this.tables.replenishment_schedules.find(s => s.id === params[2]);
          if (schedule) {
            schedule.next_reminder_at = params[0];
            schedule.last_ordered_at = params[1];
          }
        } else if (query.startsWith('INSERT INTO inventory_cycle_counts')) {
          this.tables.inventory_cycle_counts.push({
            id: params[0],
            product_id: params[1],
            system_stock: params[2],
            counted_stock: params[3],
            variance_qty: params[4],
            variance_value: params[5],
            status: params[6],
            warehouse_location: params[7],
            counted_by_user_id: params[8],
            notes: params[9],
            created_at: params[10]
          });
        } else if (query.startsWith('UPDATE products SET stock = ?')) {
          const p = this.tables.products.find(prod => prod.id === params[1]);
          if (p) p.stock = params[0];
        } else if (query.startsWith('INSERT INTO b2b_corporate_profiles')) {
          this.tables.b2b_corporate_profiles.push({
            id: params[0],
            user_id: params[1],
            company_name: params[2],
            legal_national_id: params[3],
            economic_code: params[4],
            registration_number: params[5],
            vat_certificate_number: params[6],
            province: params[7],
            city: params[8],
            postal_code: params[9],
            address: params[10],
            phone: params[11],
            is_verified: 1,
            created_at: params[12]
          });
        }
        return { changes: 1 };
      }
    };
  });

  describe('1. ScratchAuthenticityService', () => {
    it('generates scratch pins and verifies genuine vs already-scratched vs invalid codes', async () => {
      const service = new ScratchAuthenticityService(mockDb);

      const generated = await service.generateCodesForProduct({
        productId: 'prd_1',
        batchNumber: 'BATCH-2026-X',
        count: 5
      });
      assert.equal(generated.generated_count, 5);
      const testPin = generated.sample_pins[0];

      // 1) First verification: Genuine
      const firstCheck = await service.verifyCode(testPin, 'usr_1');
      assert.equal(firstCheck.status, 'GENUINE');
      assert.equal(firstCheck.is_authentic, true);
      assert.equal(firstCheck.batch_number, 'BATCH-2026-X');

      // 2) Second verification: Already verified
      const secondCheck = await service.verifyCode(testPin, 'usr_1');
      assert.equal(secondCheck.status, 'PREVIOUSLY_VERIFIED');
      assert.equal(secondCheck.total_verifications, 2);
      assert.ok(secondCheck.warning.includes('قبلاً'));

      // 3) Fake pin check: Invalid
      const fakeCheck = await service.verifyCode('SN-FAKEPIN999');
      assert.equal(fakeCheck.status, 'INVALID');
      assert.equal(fakeCheck.is_authentic, false);
    });
  });

  describe('2. SmartReplenishmentSubscriptionService', () => {
    it('schedules periodic replenishment and triggers one-click rebuy with loyalty discount', async () => {
      const service = new SmartReplenishmentSubscriptionService(mockDb);

      const sub = await service.scheduleReplenishment({
        userId: 'usr_1',
        productId: 'prd_filter',
        cycleDays: 45,
        discountPercent: 15
      });
      assert.equal(sub.cycle_days, 45);
      assert.equal(sub.discount_percent, 15);
      assert.equal(sub.status, 'active');

      const reorder = await service.triggerOneClickReorder(sub.subscription_id);
      assert.equal(reorder.original_price, 400000);
      assert.equal(reorder.discounted_price, 340000); // 15% off
      assert.ok(reorder.next_cycle_at);
    });
  });

  describe('3. InventoryDiscrepancyService', () => {
    it('records cycle count, identifies stock variance, and adjusts system stock', async () => {
      const service = new InventoryDiscrepancyService(mockDb);

      // System stock is 25. Actual physical count is 22 (shortage of 3)
      const countResult = await service.recordCycleCount({
        productId: 'prd_1',
        countedStock: 22,
        warehouseLocation: 'CENTRAL_WH',
        countedByUserId: 'usr_wh_mgr',
        notes: 'کسری انبارگردانی پایان سال'
      });

      assert.equal(countResult.system_stock, 25);
      assert.equal(countResult.counted_stock, 22);
      assert.equal(countResult.variance_quantity, -3);
      assert.equal(countResult.status, 'SHORTAGE');
      assert.equal(countResult.stock_adjusted, true);

      // Verify product stock in DB was updated to counted stock
      const updatedProduct = mockDb.tables.products.find(p => p.id === 'prd_1');
      assert.equal(updatedProduct.stock, 22);
    });
  });

  describe('4. B2BTaxCertificateValidatorService', () => {
    it('validates 11-digit legal national ID and calculates VAT invoice breakdown', async () => {
      const service = new B2BTaxCertificateValidatorService(mockDb);

      // Valid Iranian legal national ID where modulo formula equals check digit (e.g. 10103051496 has check=6 and calc=6)
      const isValid = service.isValidLegalNationalId('10103051496');
      assert.equal(isValid, true);

      const isInvalid = service.isValidLegalNationalId('12345678901');
      assert.equal(isInvalid, false);

      const profile = await service.registerB2BCorporateProfile({
        userId: 'usr_1',
        companyName: 'شرکت فناوری نوین رایانه',
        legalNationalId: '10103051496',
        economicCode: '411122233344',
        province: 'تهران'
      });
      assert.equal(profile.is_verified, true);
      assert.equal(profile.company_name, 'شرکت فناوری نوین رایانه');

      // VAT Breakdown
      const tax = service.calculateTaxBreakdown(10000000, 10);
      assert.equal(tax.subtotal_toman, 10000000);
      assert.equal(tax.vat_amount_toman, 1000000);
      assert.equal(tax.final_payable_toman, 11000000);
    });
  });

  describe('5. SocialBannerSvgGeneratorService', () => {
    it('generates Instagram Post and Story vector SVG graphics with Persian typography', () => {
      const service = new SocialBannerSvgGeneratorService();

      const postBanner = service.generateBanner({
        format: 'post',
        productTitle: 'گوشی موبایل گلکسی S24',
        originalPrice: 60000000,
        discountedPrice: 48000000,
        discountPercent: 20
      });
      assert.equal(postBanner.width, 1080);
      assert.equal(postBanner.height, 1080);
      assert.ok(postBanner.svg.includes('<svg width="1080" height="1080"'));
      assert.ok(postBanner.svg.includes('گوشی موبایل گلکسی S24'));
      assert.ok(postBanner.svg.includes('٪20 تخفیف'));

      const storyBanner = service.generateBanner({
        format: 'story',
        productTitle: 'لپ‌تاپ مک‌بوک پرو M3',
        originalPrice: 120000000,
        discountedPrice: 102000000,
        discountPercent: 15
      });
      assert.equal(storyBanner.width, 1080);
      assert.equal(storyBanner.height, 1920);
      assert.ok(storyBanner.svg.includes('<svg width="1080" height="1920"'));
    });
  });
});
