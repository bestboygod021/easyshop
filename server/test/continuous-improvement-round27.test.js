import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DynamicCurrencyPricingService } from '../src/services/currency-pegged-pricing.js';
import { HighValueBankTransferService } from '../src/services/high-value-bank-transfer.js';
import { TieredVendorCommissionService } from '../src/services/tiered-vendor-commission.js';
import { PersonalizedGiftWrapService } from '../src/services/personalized-gift-wrap.js';
import { ThirdPartyWarrantyRegistryService } from '../src/services/third-party-warranty.js';

describe('Continuous Improvement Round 27 Test Suite', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      tables: {
        product_currency_pegs: [],
        high_value_bank_transfers: [],
        order_gift_options: [],
        third_party_warranties: [],
        products: [
          { id: 'prd_usd_laptop', title: 'لپ‌تاپ وارداتی دل', price: 60000000 },
          { id: 'prd_gold_coin', title: 'سکه طلا بهار آزادی', price: 45000000 }
        ],
        orders: [
          { id: 'ord_big_1', user_id: 'usr_buyer', total: 250000000, status: 'pending' }
        ],
        order_items: [
          { order_id: 'ord_big_1', title: 'کارت گرافیک RTX 4090', quantity: 1, price: 150000000 }
        ],
        vendors: [
          { id: 'vnd_1', name: 'فروشگاه آوا تلکام', tier: 'BRONZE' }
        ]
      },
      async get(query, params = []) {
        if (query.includes('FROM product_currency_pegs WHERE product_id = ?')) {
          return this.tables.product_currency_pegs.find(p => p.product_id === params[0]) || null;
        }
        if (query.includes('FROM high_value_bank_transfers WHERE id = ?')) {
          return this.tables.high_value_bank_transfers.find(t => t.id === params[0]) || null;
        }
        if (query.includes('COALESCE(SUM(total), 0) as total_sales FROM orders WHERE vendor_id = ?')) {
          const total_sales = this.tables.orders
            .filter(o => o.vendor_id === params[0] && ['completed', 'delivered'].includes(o.status))
            .reduce((sum, o) => sum + (o.total || 0), 0);
          return { total_sales };
        }
        if (query.includes('FROM order_gift_options WHERE order_id = ?')) {
          return this.tables.order_gift_options.find(g => g.order_id === params[0]) || null;
        }
        if (query.includes('FROM third_party_warranties WHERE serial_number = ?')) {
          return this.tables.third_party_warranties.find(w => w.serial_number === params[0]) || null;
        }
        return null;
      },
      async all(query, params = []) {
        if (query.includes('FROM order_items WHERE order_id = ?')) {
          return this.tables.order_items.filter(i => i.order_id === params[0]);
        }
        return [];
      },
      async run(query, params = []) {
        if (query.startsWith('INSERT INTO product_currency_pegs')) {
          this.tables.product_currency_pegs.push({
            id: params[0],
            product_id: params[1],
            base_peg_currency: params[2],
            base_foreign_cost: params[3],
            target_margin_percent: params[4],
            min_price_toman: params[5],
            max_price_toman: params[6],
            is_enabled: params[7],
            created_at: params[8],
            updated_at: params[9]
          });
        } else if (query.startsWith('UPDATE products SET price = ? WHERE id = ?')) {
          const p = this.tables.products.find(item => item.id === params[1]);
          if (p) p.price = params[0];
        } else if (query.startsWith('INSERT INTO high_value_bank_transfers')) {
          this.tables.high_value_bank_transfers.push({
            id: params[0],
            order_id: params[1],
            user_id: params[2],
            amount_toman: params[3],
            bank_name: params[4],
            tracking_number: params[5],
            sender_iban: params[6],
            receipt_image_url: params[7],
            status: 'PENDING_ACCOUNTANT',
            accountant_verified: 0,
            auditor_approved: 0,
            created_at: params[8]
          });
        } else if (query.includes('UPDATE high_value_bank_transfers') && query.includes('PENDING_AUDITOR')) {
          const t = this.tables.high_value_bank_transfers.find(item => item.id === params[3]);
          if (t) {
            t.status = 'PENDING_AUDITOR';
            t.accountant_verified = 1;
            t.accountant_user_id = params[0];
            t.accountant_notes = params[1];
            t.accountant_verified_at = params[2];
          }
        } else if (query.includes('UPDATE high_value_bank_transfers') && query.includes('APPROVED_AND_SETTLED')) {
          const t = this.tables.high_value_bank_transfers.find(item => item.id === params[3]);
          if (t) {
            t.status = 'APPROVED_AND_SETTLED';
            t.auditor_approved = 1;
            t.auditor_user_id = params[0];
            t.auditor_notes = params[1];
            t.auditor_approved_at = params[2];
          }
        } else if (query.startsWith('UPDATE orders SET status = \'paid\' WHERE id = ?')) {
          const ord = this.tables.orders.find(o => o.id === params[0]);
          if (ord) ord.status = 'paid';
        } else if (query.startsWith('UPDATE vendors SET tier = ? WHERE id = ?')) {
          const v = this.tables.vendors.find(item => item.id === params[1]);
          if (v) v.tier = params[0];
        } else if (query.startsWith('INSERT INTO order_gift_options')) {
          this.tables.order_gift_options.push({
            id: params[0],
            order_id: params[1],
            wrap_style_id: params[2],
            wrap_style_name: params[3],
            wrap_fee_toman: params[4],
            recipient_name: params[5],
            greeting_message: params[6],
            hide_price_on_invoice: params[7],
            created_at: params[8]
          });
        } else if (query.startsWith('INSERT INTO third_party_warranties')) {
          this.tables.third_party_warranties.push({
            id: params[0],
            serial_number: params[1],
            provider_id: params[2],
            provider_name: params[3],
            product_id: params[4],
            duration_months: params[5],
            start_date: params[6],
            end_date: params[7],
            status: 'ACTIVE',
            created_at: params[8]
          });
        }
        return { changes: 1 };
      }
    };
  });

  describe('1. DynamicCurrencyPricingService', () => {
    it('configures foreign currency peg and recalculates retail price with target margin', async () => {
      const service = new DynamicCurrencyPricingService(mockDb);

      await service.configureProductPricing({
        productId: 'prd_usd_laptop',
        basePegCurrency: 'USD',
        baseForeignCost: 1000, // 1000 USD
        targetMarginPercent: 20 // 20% margin
      });

      // Recalculate price when dollar rate is 65,000 Toman
      const recalculated = await service.recalculateProductPrice('prd_usd_laptop', 65000);

      assert.equal(recalculated.cost_toman, 65000000); // 1000 * 65000
      assert.equal(recalculated.final_price_toman, 78000000); // 65M * 1.20 = 78M

      const updatedProduct = mockDb.tables.products.find(p => p.id === 'prd_usd_laptop');
      assert.equal(updatedProduct.price, 78000000);
    });
  });

  describe('2. HighValueBankTransferService', () => {
    it('processes two-step verification workflow (accountant review & auditor release)', async () => {
      const service = new HighValueBankTransferService(mockDb);

      const submission = await service.submitBankTransfer({
        orderId: 'ord_big_1',
        userId: 'usr_buyer',
        amountToman: 250000000,
        bankName: 'بانک ملت',
        trackingNumber: 'SATNA-99887711',
        senderIban: 'IR980120000000001234567890'
      });
      assert.equal(submission.status, 'PENDING_ACCOUNTANT');

      // Step 1: Accountant review
      const accVerification = await service.verifyByAccountant(submission.transfer_id, 'usr_acc', 'واریز به حساب تجاری تطبیق داده شد');
      assert.equal(accVerification.status, 'PENDING_AUDITOR');

      // Step 2: Financial Auditor final approval
      const auditApproval = await service.approveByAuditor(submission.transfer_id, 'usr_chief_auditor', 'تأییدیه رسمی شاپرک پیوست شد');
      assert.equal(auditApproval.status, 'APPROVED_AND_SETTLED');
      assert.equal(auditApproval.order_released, true);

      // Verify order status updated to paid
      const order = mockDb.tables.orders.find(o => o.id === 'ord_big_1');
      assert.equal(order.status, 'paid');
    });
  });

  describe('3. TieredVendorCommissionService', () => {
    it('calculates tiered category commission with tier discount and evaluates vendor grade', async () => {
      const service = new TieredVendorCommissionService(mockDb);

      // Gold tier vendor in electronics category (base 6.0% - 1.5% gold discount = 4.5% commission)
      const commission = service.calculateCommission({
        categoryKey: 'electronics',
        vendorTier: 'GOLD',
        saleAmountToman: 100000000 // 100M
      });

      assert.equal(commission.effective_commission_rate, 4.5);
      assert.equal(commission.commission_amount_toman, 4500000);
      assert.equal(commission.vendor_payout_toman, 95500000);

      // Tier upgrade evaluation
      mockDb.tables.orders = [
        { vendor_id: 'vnd_1', total: 500000000, status: 'delivered' } // 500M sales -> GOLD
      ];
      const tierEval = await service.evaluateVendorTier('vnd_1');
      assert.equal(tierEval.calculated_tier, 'GOLD');
    });
  });

  describe('4. PersonalizedGiftWrapService', () => {
    it('attaches gift packaging, custom greeting message, and generates price-free invoice', async () => {
      const service = new PersonalizedGiftWrapService(mockDb);

      const themes = service.getWrapThemes();
      assert.ok(themes.length >= 3);

      const gift = await service.attachGiftOptionsToOrder({
        orderId: 'ord_big_1',
        wrapStyleId: 'classic_navy',
        recipientName: 'سارا حسینی',
        greetingMessage: 'تولدت مبارک سارای عزیز! 🌸',
        hidePriceOnInvoice: true
      });
      assert.equal(gift.recipient_name, 'سارا حسینی');
      assert.equal(gift.hide_price_on_invoice, true);

      const receipt = await service.renderGiftReceipt('ord_big_1');
      assert.equal(receipt.is_gift_invoice, true);
      assert.equal(receipt.recipient_name, 'سارا حسینی');
      assert.ok(receipt.items.length > 0);
      assert.equal(receipt.items[0].price, undefined); // Strictly no price in gift receipt
      assert.ok(receipt.footer_note.includes('هدیه'));
    });
  });

  describe('5. ThirdPartyWarrantyRegistryService', () => {
    it('registers electronic warranty and checks validity status by serial number', async () => {
      const service = new ThirdPartyWarrantyRegistryService(mockDb);

      const registration = await service.registerWarranty({
        serialOrImei: 'IMEI-867530901234567',
        providerId: 'samtel',
        durationMonths: 24
      });
      assert.equal(registration.provider_name, 'گارانتی سام‌تل');
      assert.equal(registration.status, 'ACTIVE');

      // Inquiry registered warranty
      const inquiry = await service.inquiryWarranty('IMEI-867530901234567');
      assert.equal(inquiry.has_warranty, true);
      assert.equal(inquiry.provider_name, 'گارانتی سام‌تل');
      assert.equal(inquiry.is_valid, true);
      assert.equal(inquiry.status, 'ACTIVE');

      // Inquiry non-existent warranty
      const missing = await service.inquiryWarranty('IMEI-000000000000000');
      assert.equal(missing.has_warranty, false);
      assert.equal(missing.status, 'NOT_FOUND');
    });
  });
});
