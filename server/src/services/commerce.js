import { get, getSettings } from '../db/index.js';
import { cartTotals } from '../utils/helpers.js';
import { availablePaymentGateways, isPaymentGatewayProvider, paymentGatewayInfo } from './payment-gateway.js';

export const SHIPPING_METHODS = Object.freeze([
  { value: 'post', label: 'پست پیشتاز', description: '۲ تا ۴ روز کاری', price: 45_000, regions: 'all', estimated_days_min: 2, estimated_days_max: 4 },
  { value: 'tipax', label: 'تیپاکس', description: '۱ تا ۳ روز کاری', price: 65_000, regions: 'all', estimated_days_min: 1, estimated_days_max: 3 },
  { value: 'peyk', label: 'پیک شهری', description: 'ارسال همان‌روز در تهران', price: 90_000, regions: 'tehran', estimated_days_min: 0, estimated_days_max: 1 },
  { value: 'in_person', label: 'تحویل حضوری', description: 'تحویل از فروشگاه در تهران', price: 0, regions: 'tehran', estimated_days_min: 0, estimated_days_max: 0 },
]);

const PAYMENT_METHODS = Object.freeze([
  { value: 'wallet', label: 'کیف پول EasyShop', description: 'پرداخت از موجودی حساب', icon: 'wallet' },
  { value: 'cod', label: 'پرداخت در محل', description: 'فقط ارسال شهری تهران', icon: 'cash' },
]);

export function estimateDelivery(shippingMethod, city = '') {
  const isTehran = String(city || '').trim() === 'تهران';
  switch (shippingMethod) {
    case 'peyk':
      return { delivery_date_label: 'امروز یا حداکثر ۲۴ ساعت آینده', days_range: '۰ تا ۱ روز' };
    case 'in_person':
      return { delivery_date_label: 'آماده تحویل در ساعات کاری فروشگاه', days_range: 'همان‌روز' };
    case 'tipax':
      return {
        delivery_date_label: isTehran ? '۱ تا ۲ روز کاری' : '۲ تا ۳ روز کاری',
        days_range: isTehran ? '۱ تا ۲ روز' : '۲ تا ۳ روز',
      };
    case 'post':
    default:
      return {
        delivery_date_label: isTehran ? '۲ تا ۳ روز کاری' : '۳ تا ۵ روز کاری',
        days_range: isTehran ? '۲ تا ۳ روز' : '۳ تا ۵ روز',
      };
  }
}

export function getShippingMethods() {
  const commerce = getSettings().commerce || {};
  const configured = Array.isArray(commerce.shipping_methods) ? commerce.shipping_methods : [];
  return SHIPPING_METHODS.map((method) => {
    const custom = configured.find((item) => item?.value === method.value);
    const price = custom?.price === undefined ? method.price : Number(custom.price);
    return {
      ...method,
      label: typeof custom?.label === 'string' && custom.label.trim() ? custom.label.trim().slice(0, 80) : method.label,
      description: typeof custom?.description === 'string' && custom.description.trim() ? custom.description.trim().slice(0, 160) : method.description,
      price: Number.isSafeInteger(price) && price >= 0 ? price : method.price,
    };
  });
}

export function publicCommerceOptions(user) {
  const settings = getSettings();
  const gateway = paymentGatewayInfo();
  const gateways = availablePaymentGateways();
  const gatewayMethods = gateways.length
    ? gateways.map((provider) => ({
      value: provider.provider,
      label: provider.label,
      description: provider.sandbox ? 'پرداخت آنلاین در محیط آزمایشی' : 'انتقال امن به درگاه بانکی',
      icon: 'card',
      gateway: true,
      enabled: true,
      sandbox: provider.sandbox,
    }))
    : [{
      value: 'gateway', label: 'پرداخت آنلاین', description: 'انتقال امن به درگاه بانکی', icon: 'card',
      gateway: true, enabled: false, sandbox: false, disabled_reason: gateway.reason,
    }];
  const methods = [
    ...gatewayMethods,
    ...PAYMENT_METHODS
      .filter((method) => method.value !== 'wallet' || Boolean(user))
      .map((method) => ({ ...method, enabled: method.value === 'wallet' ? Boolean(user) : true, disabled_reason: null })),
  ];
  return {
    currency: settings.commerce?.currency_label || 'تومان',
    tax_percent: Number(settings.commerce?.tax_percent ?? 9),
    free_shipping_threshold: Number(settings.commerce?.free_shipping_threshold ?? 5_000_000),
    shipping_methods: getShippingMethods(),
    payment_methods: methods,
    gateway: {
      provider: gateway.provider,
      label: gateway.label,
      enabled: gateways.length > 0,
      sandbox: gateway.sandbox,
      providers: gateways,
    },
  };
}

export function buildCheckoutQuote({ cart, items, shippingMethod, useLoyalty = 0, user, city }) {
  const settings = getSettings();
  const commerce = settings.commerce || {};
  const methods = getShippingMethods();
  const shipping = methods.find((item) => item.value === shippingMethod);
  if (!shipping) throw Object.assign(new Error('روش ارسال نامعتبر است.'), { status: 400 });
  if (shipping.regions === 'tehran' && String(city || '').trim() !== 'تهران') {
    throw Object.assign(new Error(`روش «${shipping.label}» فقط برای شهر تهران فعال است.`), { status: 400 });
  }

  const base = cartTotals(cart, items, settings);
  const afterDiscount = Math.max(0, base.subtotal - base.discount);
  const threshold = Number(commerce.free_shipping_threshold ?? 5_000_000);
  const shippingFree = base.coupon?.type === 'free_shipping' || (threshold > 0 && afterDiscount >= threshold) || shipping.value === 'in_person' || items.length === 0;
  const shippingCost = shippingFree ? 0 : shipping.price;
  const taxPercent = Number(commerce.tax_percent ?? 0);
  const tax = Math.round((afterDiscount * Math.max(0, Math.min(100, taxPercent))) / 100);
  const beforeLoyalty = afterDiscount + shippingCost + tax;

  const rawPoints = Number(useLoyalty);
  if (!Number.isSafeInteger(rawPoints) || rawPoints < 0) {
    throw Object.assign(new Error('مقدار امتیاز باید عدد صحیح و نامنفی باشد.'), { status: 400 });
  }
  if (rawPoints > 0 && !user) {
    throw Object.assign(new Error('برای استفاده از امتیاز باشگاه باید وارد حساب شوید.'), { status: 401 });
  }
  const points = user ? Number(user.loyalty_points || 0) : 0;
  if (rawPoints > points) throw Object.assign(new Error('امتیاز باشگاه مشتریان کافی نیست.'), { status: 400 });
  if (rawPoints * 1_000 > beforeLoyalty) {
    throw Object.assign(new Error('مقدار امتیاز از مبلغ سفارش بیشتر است.'), { status: 400 });
  }

  const deliveryEstimate = estimateDelivery(shipping.value, city);

  return {
    subtotal: base.subtotal,
    discount: base.discount,
    coupon: base.coupon,
    coupon_invalid: Boolean(base.coupon?.invalid),
    tax,
    tax_percent: taxPercent,
    shipping_method: shipping.value,
    shipping_label: shipping.label,
    shipping_free: shippingFree,
    shipping_cost: shippingCost,
    delivery_estimate: deliveryEstimate,
    loyalty_used: rawPoints,
    loyalty_discount: rawPoints * 1_000,
    total: beforeLoyalty - rawPoints * 1_000,
    currency: commerce.currency_label || 'تومان',
  };
}

export function checkoutPaymentMethod(method, { user, city, shippingMethod }) {
  const requested = String(method || '').trim().toLowerCase();
  if (requested === 'gateway' || isPaymentGatewayProvider(requested)) {
    const info = paymentGatewayInfo(requested === 'gateway' ? undefined : requested);
    if (!info.enabled) throw Object.assign(new Error(info.reason || 'درگاه پرداخت آنلاین فعال نیست.'), { status: 503 });
    return info.provider;
  }
  if (!['wallet', 'cod'].includes(requested)) {
    throw Object.assign(new Error('روش پرداخت نامعتبر است.'), { status: 400 });
  }
  if (requested === 'wallet' && !user) {
    throw Object.assign(new Error('برای پرداخت از کیف پول ابتدا وارد حساب شوید.'), { status: 401 });
  }
  if (requested === 'cod' && (String(city || '').trim() !== 'تهران' || !['peyk', 'in_person'].includes(shippingMethod))) {
    throw Object.assign(new Error('پرداخت در محل فقط برای ارسال شهری تهران یا تحویل حضوری فعال است.'), { status: 400 });
  }
  return requested;
}

export function couponAvailability(coupon, userId, subtotal) {
  if (!coupon || !coupon.is_active) return 'کد تخفیف نامعتبر است.';
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return 'زمان استفاده از این کد تخفیف هنوز شروع نشده است.';
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) return 'این کد تخفیف منقضی شده است.';
  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) return 'ظرفیت استفاده از این کد تکمیل شده است.';
  if (coupon.min_subtotal && subtotal < coupon.min_subtotal) return 'حداقل مبلغ سفارش برای این کد رعایت نشده است.';
  if (userId && coupon.per_user_limit) {
    const used = get('SELECT COUNT(*) c FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?', coupon.id, userId)?.c || 0;
    if (used >= coupon.per_user_limit) return 'سقف استفاده‌ی شما از این کد تکمیل شده است.';
  }
  return null;
}
