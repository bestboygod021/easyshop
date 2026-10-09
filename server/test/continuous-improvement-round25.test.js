import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PreOrderDepositService } from '../src/services/pre-order-deposit.js';
import { OrderConsolidationService } from '../src/services/order-consolidation.js';
import { RmaReturnFraudShieldService } from '../src/services/rma-return-fraud-shield.js';
import { B2BPriceListGeneratorService } from '../src/services/b2b-price-list-generator.js';
import { SpinTheWheelService } from '../src/services/spin-the-wheel.js';

describe('Continuous Improvement Round 25 Test Suite', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      tables: {
        pre_order_configs: [],
        pre_orders: [],
        orders: [],
        rma_requests: [],
        order_consolidations: [],
        user_spins: [],
        products: [
          { id: 'p1', title: 'گوشی موبایل پرچمدار', price: 50000000, category_id: 'cat_mobile', stock: 10, is_active: 1, barcode: '6261234567890' },
          { id: 'p2', title: 'لپ‌تاپ گیمینگ', price: 90000000, category_id: 'cat_laptop', stock: 0, is_active: 1, barcode: null }
        ],
        users: [
          { id: 'u1', name: 'علی رضایی', wallet: 500000 }
        ]
      },
      async get(query, params = []) {
        if (query.includes('FROM pre_order_configs WHERE product_id = ?')) {
          return this.tables.pre_order_configs.find(c => c.product_id === params[0]) || null;
        }
        if (query.includes('COALESCE(SUM(quantity), 0) as reserved FROM pre_orders')) {
          const reserved = this.tables.pre_orders
            .filter(p => p.product_id === params[0] && ['pending_deposit', 'deposit_paid'].includes(p.status))
            .reduce((sum, item) => sum + item.quantity, 0);
          return { reserved };
        }
        if (query.includes('COUNT(*) as count FROM orders WHERE user_id = ?')) {
          const count = this.tables.orders.filter(o => o.user_id === params[0]).length;
          return { count };
        }
        if (query.includes('FROM user_spins WHERE user_id = ? AND spun_at > ?')) {
          return this.tables.user_spins.find(s => s.user_id === params[0] && s.spun_at > params[1]) || null;
        }
        return null;
      },
      async all(query, params = []) {
        if (query.includes('FROM pre_orders WHERE user_id = ?')) {
          return this.tables.pre_orders.filter(p => p.user_id === params[0]);
        }
        if (query.includes('FROM orders WHERE id IN')) {
          return this.tables.orders.filter(o => params.slice(0, -1).includes(o.id) && o.user_id === params[params.length - 1]);
        }
        if (query.includes('FROM orders') && query.includes('user_id = ?')) {
          return this.tables.orders.filter(o => o.user_id === params[0]);
        }
        if (query.includes('FROM rma_requests WHERE user_id = ?')) {
          return this.tables.rma_requests.filter(r => r.user_id === params[0]);
        }
        if (query.includes('FROM products WHERE is_active = 1')) {
          return this.tables.products;
        }
        return [];
      },
      async run(query, params = []) {
        if (query.startsWith('INSERT INTO pre_order_configs')) {
          this.tables.pre_order_configs.push({
            id: params[0],
            product_id: params[1],
            is_enabled: params[2],
            deposit_percentage: params[3],
            estimated_arrival_days: params[4],
            quota_limit: params[5]
          });
        } else if (query.startsWith('UPDATE pre_order_configs')) {
          const idx = this.tables.pre_order_configs.findIndex(c => c.product_id === params[5]);
          if (idx !== -1) {
            this.tables.pre_order_configs[idx] = {
              ...this.tables.pre_order_configs[idx],
              is_enabled: params[0],
              deposit_percentage: params[1],
              estimated_arrival_days: params[2],
              quota_limit: params[3]
            };
          }
        } else if (query.startsWith('INSERT INTO pre_orders')) {
          this.tables.pre_orders.push({
            id: params[0],
            user_id: params[1],
            product_id: params[2],
            quantity: params[3],
            unit_price: params[4],
            total_amount: params[5],
            deposit_amount: params[6],
            remaining_balance: params[7],
            status: params[8],
            estimated_arrival_at: params[9],
            created_at: params[10]
          });
        } else if (query.startsWith('INSERT INTO order_consolidations')) {
          this.tables.order_consolidations.push({
            id: params[0],
            user_id: params[1],
            order_ids_json: params[2],
            consolidated_package_code: params[3],
            saved_shipping_amount: params[4],
            status: params[5],
            created_at: params[6]
          });
        } else if (query.startsWith('INSERT INTO user_spins')) {
          this.tables.user_spins.push({
            id: params[0],
            user_id: params[1],
            reward_type: params[2],
            reward_label: params[3],
            reward_code: params[4],
            spun_at: params[5]
          });
        } else if (query.startsWith('UPDATE users SET wallet')) {
          const user = this.tables.users.find(u => u.id === params[1]);
          if (user) {
            user.wallet += params[0];
          }
        }
        return { changes: 1 };
      }
    };
  });

  describe('1. PreOrderDepositService', () => {
    it('configures pre-order settings and records customer partial deposit', async () => {
      const service = new PreOrderDepositService(mockDb);

      const config = await service.configureProductPreOrder('p1', {
        isEnabled: true,
        depositPercentage: 20,
        estimatedArrivalDays: 10,
        quotaLimit: 50
      });
      assert.equal(config.deposit_percentage, 20);
      assert.equal(config.quota_limit, 50);

      const reservation = await service.createPreOrderReservation({
        userId: 'u1',
        productId: 'p1',
        quantity: 2,
        unitPrice: 10000000
      });

      assert.equal(reservation.total_amount, 20000000);
      assert.equal(reservation.deposit_amount, 4000000); // 20%
      assert.equal(reservation.remaining_balance, 16000000);
      assert.equal(reservation.status, 'deposit_paid');
    });
  });

  describe('2. OrderConsolidationService', () => {
    it('detects consolidatable orders for the same customer and merges shipping', async () => {
      const service = new OrderConsolidationService(mockDb);

      mockDb.tables.orders = [
        { id: 'ord_1', user_id: 'u1', total: 500000, shipping_cost: 45000, shipping_address: 'تهران، خیابان ولیعصر پلاک ۱', status: 'pending' },
        { id: 'ord_2', user_id: 'u1', total: 300000, shipping_cost: 45000, shipping_address: 'تهران، خیابان ولیعصر پلاک ۱', status: 'processing' }
      ];

      const eligibility = await service.findConsolidatableOrders('u1');
      assert.equal(eligibility.eligible, true);
      assert.equal(eligibility.order_count, 2);
      assert.equal(eligibility.shipping_savings, 45000);

      const consolidation = await service.consolidateOrders({
        userId: 'u1',
        orderIds: ['ord_1', 'ord_2']
      });

      assert.equal(consolidation.status, 'consolidated');
      assert.equal(consolidation.total_shipping_saved, 45000);
      assert.equal(mockDb.tables.order_consolidations.length, 1);
    });
  });

  describe('3. RmaReturnFraudShieldService', () => {
    it('flags high-frequency return users and enforces video unboxing checklist', async () => {
      const service = new RmaReturnFraudShieldService(mockDb);

      // User with 2 total orders and 2 returns (100% return rate)
      mockDb.tables.orders = [
        { id: 'o1', user_id: 'u1', status: 'delivered' },
        { id: 'o2', user_id: 'u1', status: 'delivered' }
      ];
      mockDb.tables.rma_requests = [
        { id: 'rma_1', user_id: 'u1', reason: 'عدم تطابق کالا' },
        { id: 'rma_2', user_id: 'u1', reason: 'ایراد فنی' }
      ];

      const risk = await service.assessUserReturnRisk('u1');
      assert.equal(risk.risk_level, 'CRITICAL');
      assert.equal(risk.requires_video_unboxing, true);
      assert.equal(risk.auto_approval_allowed, false);

      const screening = await service.screenReturnRequest({
        userId: 'u1',
        orderId: 'o1',
        productId: 'p1',
        returnReason: 'نقص فنی'
      });
      assert.equal(screening.decision, 'FLAGGED_FOR_MANUAL_INSPECTION');
      assert.ok(screening.mandatory_checklist.some(item => item.includes('آنباکسینگ')));
    });
  });

  describe('4. B2BPriceListGeneratorService', () => {
    it('generates wholesale catalog with tiered discount calculations and barcodes', async () => {
      const service = new B2BPriceListGeneratorService(mockDb);

      const list = await service.generatePriceList({ wholesaleDiscountPercent: 20 });
      assert.equal(list.total_items, 2);
      assert.equal(list.wholesale_discount_applied, '20%');

      const mobileItem = list.items.find(i => i.product_id === 'p1');
      assert.equal(mobileItem.retail_price_toman, 50000000);
      assert.equal(mobileItem.wholesale_price_toman, 40000000); // 20% off
      assert.equal(mobileItem.saving_amount_toman, 10000000);
      assert.equal(mobileItem.barcode, '6261234567890');
    });
  });

  describe('5. SpinTheWheelService', () => {
    it('provides wheel configuration, executes spin and enforces 24h limit', async () => {
      const service = new SpinTheWheelService(mockDb);

      const config = service.getWheelConfiguration();
      assert.ok(config.slices.length >= 6);

      const eligibility = await service.canUserSpin('u1');
      assert.equal(eligibility.can_spin, true);

      const spinResult = await service.executeSpin('u1');
      assert.ok(spinResult.spin_id);
      assert.ok(spinResult.reward.label);
      assert.equal(mockDb.tables.user_spins.length, 1);

      // Attempt second spin immediately
      const postEligibility = await service.canUserSpin('u1');
      assert.equal(postEligibility.can_spin, false);
      await assert.rejects(service.executeSpin('u1'), /شما امروز شانس خود را امتحان کرده‌اید/);
    });
  });
});
