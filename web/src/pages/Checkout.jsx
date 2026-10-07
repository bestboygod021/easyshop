import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MapPin, CreditCard, Wallet, Truck, Banknote, Check, ShieldCheck, Package, Plus, Sparkles, ChevronLeft,
} from 'lucide-react';
import { get, post } from '../lib/api';
import { number, toman } from '../lib/format';
import { useAuth, useCart, toast } from '../store';
import { Badge, EmptyState, Loading, Modal, SmartImage } from '../components/ui';

const SHIPPING = [
  { value: 'post', label: 'پست پیشتاز', desc: '۲ تا ۴ روز کاری', price: 45000 },
  { value: 'tipax', label: 'تیپاکس (پس‌کرایه)', desc: '۱ تا ۳ روز کاری', price: 65000 },
  { value: 'peyk', label: 'پیک شهری تهران', desc: 'همان روز (سفارش قبل از ۱۲)', price: 90000 },
  { value: 'in_person', label: 'تحویل حضوری در فروشگاه', desc: 'تهران، ولیعصر', price: 0 },
];

const PAYMENTS = [
  { value: 'gateway', label: 'پرداخت آنلاین (درگاه بانکی)', icon: CreditCard, desc: 'زرین‌پال / آسان پرداخت — امن و سریع' },
  { value: 'wallet', label: 'کیف پول EasyShop', icon: Wallet, desc: 'پرداخت از موجودی کیف پول' },
  { value: 'cod', label: 'پرداخت در محل (هنگام تحویل)', icon: Banknote, desc: 'فقط برای سفارش‌های داخل تهران' },
];

export default function Checkout() {
  const user = useAuth((s) => s.user);
  const { items, totals, load, clear } = useCart();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState('');
  const [guestAddress, setGuestAddress] = useState({ receiver: '', phone: '', province: 'تهران', city: 'تهران', postal_code: '', line: '' });
  const [shipping, setShipping] = useState('post');
  const [payment, setPayment] = useState('gateway');
  const [note, setNote] = useState('');
  const [loyalty, setLoyalty] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState(null);
  const [newAddressOpen, setNewAddressOpen] = useState(false);
  const [newAddress, setNewAddress] = useState({ title: 'آدرس جدید', receiver: '', phone: '', province: 'تهران', city: 'تهران', postal_code: '', line: '', is_default: true });

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    get('/account/addresses')
      .then((d) => {
        setAddresses(d.items);
        const def = d.items.find((a) => a.is_default) || d.items[0];
        if (def) setAddressId(def.id);
      })
      .catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <EmptyState
          title="برای تکمیل خرید وارد شوید"
          description="با ورود به حساب، سفارش‌ها و آدرس‌های شما ذخیره می‌شود و پیگیری سفارش آسان‌تر خواهد بود."
          action={
            <Link to="/login?next=/checkout" className="btn-primary">
              ورود / ثبت‌نام
            </Link>
          }
        />
      </div>
    );
  }

  if (!items.length && !result) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <EmptyState title="سبد خرید خالی است" action={<Link to="/products" className="btn-primary">شروع خرید</Link>} />
      </div>
    );
  }

  const shippingCost = SHIPPING.find((s) => s.value === shipping)?.price ?? 0;
  const loyaltyDiscount = loyalty * 1000;
  // مبلغ نهایی = جمع سبد (با مالیات و تخفیف) − هزینه ارسال پیش‌فرض + هزینه ارسال انتخابی − امتیاز
  const finalTotal = Math.max(0, (totals?.total || 0) - (totals?.shipping_cost || 0) + shippingCost - loyaltyDiscount);

  const saveAddress = async () => {
    try {
      const data = await post('/account/addresses', newAddress);
      setAddresses((a) => [data.address, ...a]);
      setAddressId(data.address.id);
      setNewAddressOpen(false);
      toast('آدرس جدید ذخیره شد.');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const payload = {
        payment_method: payment,
        shipping_method: shipping,
        shipping_carrier: SHIPPING.find((s) => s.value === shipping)?.label,
        note,
        use_loyalty: loyalty,
        ...(addressId ? { address_id: addressId } : { address: guestAddress }),
      };
      const data = await post('/orders/checkout', payload);
      if (payment === 'gateway') {
        // شبیه‌سازی بازگشت از درگاه بانکی؛ توکن/کد اقتدار صادرشده توسط سرور الزامی است
        const authority = data.payment?.authority || data.order?.payment?.authority || '';
        const paid = await post(`/orders/${data.order.id}/pay`, {
          success: true,
          authority,
          intent_token: data.payment?.intent_token,
          ...(!user && guestAddress.phone ? { phone: guestAddress.phone } : {}),
        });
        setResult(paid.order);
      } else {
        setResult(data.order);
      }
      await clear();
      toast('سفارش با موفقیت ثبت شد 🎉');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPlacing(false);
    }
  };

  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14">
        <div className="card p-8 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15">
            <Check className="h-8 w-8 text-emerald-400" />
          </span>
          <h1 className="mt-4 text-lg font-extrabold text-white">سفارش شما ثبت شد!</h1>
          <p className="mt-2 text-xs leading-6 text-slate-400">
            کد سفارش: <span className="font-bold text-brand-300">{result.code}</span>
            <br />
            وضعیت: {result.status_label || 'در حال پردازش'} — مبلغ: {toman(result.total)}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to={`/account/orders/${result.id}`} className="btn-primary">
              پیگیری سفارش
            </Link>
            <Link to="/products" className="btn-ghost">
              ادامه خرید
            </Link>
          </div>
          <p className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-brand-400" /> جزئیات سفارش از طریق ایمیل و اعلان‌های اپ برای شما ارسال شد.
          </p>
        </div>
      </div>
    );
  }

  const activeAddress = addresses.find((a) => a.id === addressId);

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-5">
      <h1 className="mb-5 flex items-center gap-2 text-lg font-extrabold text-white">
        <Package className="h-5 w-5 text-brand-400" /> تکمیل خرید
      </h1>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* آدرس */}
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <MapPin className="h-4 w-4 text-brand-400" /> آدرس تحویل
              </h2>
              <button onClick={() => setNewAddressOpen(true)} className="btn-ghost btn-sm">
                <Plus className="h-3.5 w-3.5" /> آدرس جدید
              </button>
            </div>

            {addresses.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                هنوز آدرسی ثبت نکرده‌اید. از دکمه «آدرس جدید» استفاده کنید.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {addresses.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAddressId(a.id)}
                    className={`rounded-xl border p-3 text-right transition ${addressId === a.id ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 bg-white/5 hover:border-brand-500/40'}`}
                  >
                    <span className="flex items-center gap-2 text-xs font-bold text-slate-100">
                      {a.title}
                      {a.is_default ? <Badge color="indigo">پیش‌فرض</Badge> : null}
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-400">{a.receiver} — {a.phone}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">{a.province}، {a.city}، {a.line}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ارسال */}
          <section className="card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
              <Truck className="h-4 w-4 text-cyan-400" /> روش ارسال
            </h2>
            <div className="space-y-2">
              {SHIPPING.map((s) => (
                <label key={s.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${shipping === s.value ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 bg-white/5'}`}>
                  <input type="radio" name="shipping" checked={shipping === s.value} onChange={() => setShipping(s.value)} className="accent-brand-500" />
                  <span className="flex-1">
                    <span className="block text-xs font-bold text-slate-100">{s.label}</span>
                    <span className="block text-[11px] text-slate-500">{s.desc}</span>
                  </span>
                  <span className="text-xs font-bold text-brand-300">{s.price ? toman(s.price) : 'رایگان'}</span>
                </label>
              ))}
            </div>
          </section>

          {/* پرداخت */}
          <section className="card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
              <CreditCard className="h-4 w-4 text-violet-400" /> روش پرداخت
            </h2>
            <div className="space-y-2">
              {PAYMENTS.map((p) => (
                <label key={p.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${payment === p.value ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 bg-white/5'}`}>
                  <input type="radio" name="payment" checked={payment === p.value} onChange={() => setPayment(p.value)} className="accent-brand-500" />
                  <p.icon className="h-4 w-4 text-slate-400" />
                  <span className="flex-1">
                    <span className="block text-xs font-bold text-slate-100">{p.label}</span>
                    <span className="block text-[11px] text-slate-500">{p.desc}</span>
                  </span>
                  {p.value === 'wallet' ? (
                    <span className="text-[11px] text-emerald-300">موجودی: {toman(user.wallet || 0)}</span>
                  ) : null}
                </label>
              ))}
            </div>

            {user.loyalty_points > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="flex items-center gap-2 text-xs font-bold text-amber-200">
                  <Sparkles className="h-3.5 w-3.5" /> استفاده از امتیاز باشگاه مشتریان
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  شما {number(user.loyalty_points)} امتیاز دارید (هر امتیاز = ۱٬۰۰۰ تومان)
                </p>
                <input
                  type="range"
                  min={0}
                  max={user.loyalty_points}
                  value={loyalty}
                  onChange={(e) => setLoyalty(Number(e.target.value))}
                  className="mt-2 w-full accent-amber-500"
                />
                <p className="text-[11px] text-amber-200">استفاده از {number(loyalty)} امتیاز = {toman(loyaltyDiscount)} تخفیف</p>
              </div>
            ) : null}

            <div className="mt-4">
              <label className="label">یادداشت سفارش (اختیاری)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input text-xs" placeholder="مثلاً: قبل از ارسال تماس بگیرید." />
            </div>
          </section>

          {/* اقلام */}
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-bold text-white">اقلام سفارش ({number(items.length)})</h2>
            <div className="space-y-2">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-3 rounded-xl border border-white/5 p-2">
                  <SmartImage src={i.thumbnail} alt={i.name} className="h-12 w-12 rounded-lg" fallbackText="کالا" />
                  <span className="flex-1 text-xs text-slate-200">{i.name}</span>
                  <span className="text-[11px] text-slate-500">×{number(i.qty)}</span>
                  <span className="text-xs font-bold text-brand-300">{toman(i.total)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* خلاصه */}
        <aside className="card sticky top-32 h-fit p-5">
          <h2 className="mb-4 text-sm font-bold text-white">صورت‌حساب</h2>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-400"><dt>جمع کالاها</dt><dd>{toman(totals?.subtotal)}</dd></div>
            {totals?.discount > 0 ? (
              <div className="flex justify-between text-emerald-400"><dt>تخفیف</dt><dd>−{toman(totals.discount)}</dd></div>
            ) : null}
            <div className="flex justify-between text-slate-400"><dt>ارسال ({SHIPPING.find((s) => s.value === shipping)?.label})</dt><dd>{shippingCost ? toman(shippingCost) : 'رایگان'}</dd></div>
            <div className="flex justify-between text-slate-400"><dt>مالیات</dt><dd>{toman(totals?.tax)}</dd></div>
            {loyaltyDiscount > 0 ? (
              <div className="flex justify-between text-amber-300"><dt>امتیاز باشگاه مشتریان</dt><dd>−{toman(loyaltyDiscount)}</dd></div>
            ) : null}
            <div className="flex justify-between border-t border-white/10 pt-3 text-base font-extrabold text-white">
              <dt>قابل پرداخت</dt>
              <dd>{toman(finalTotal)}</dd>
            </div>
          </dl>

          <button onClick={placeOrder} disabled={placing || !items.length} className="btn-primary mt-5 w-full">
            {placing ? 'در حال ثبت سفارش…' : payment === 'gateway' ? 'پرداخت و ثبت سفارش' : 'ثبت سفارش'}
            <ChevronLeft className="h-4 w-4" />
          </button>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> پرداخت امن با رمزنگاری SSL
          </p>
        </aside>
      </div>

      <Modal
        open={newAddressOpen}
        onClose={() => setNewAddressOpen(false)}
        title="افزودن آدرس جدید"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setNewAddressOpen(false)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={saveAddress} className="btn-primary btn-sm">ذخیره آدرس</button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">عنوان</label>
            <input value={newAddress.title} onChange={(e) => setNewAddress((a) => ({ ...a, title: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">نام گیرنده</label>
            <input value={newAddress.receiver} onChange={(e) => setNewAddress((a) => ({ ...a, receiver: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">تلفن همراه</label>
            <input value={newAddress.phone} onChange={(e) => setNewAddress((a) => ({ ...a, phone: e.target.value }))} placeholder="09xxxxxxxxx" className="input text-xs" />
          </div>
          <div>
            <label className="label">استان</label>
            <input value={newAddress.province} onChange={(e) => setNewAddress((a) => ({ ...a, province: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">شهر</label>
            <input value={newAddress.city} onChange={(e) => setNewAddress((a) => ({ ...a, city: e.target.value }))} className="input text-xs" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">نشانی کامل</label>
            <textarea value={newAddress.line} onChange={(e) => setNewAddress((a) => ({ ...a, line: e.target.value }))} rows={2} className="input text-xs" />
          </div>
          <div>
            <label className="label">کد پستی</label>
            <input value={newAddress.postal_code} onChange={(e) => setNewAddress((a) => ({ ...a, postal_code: e.target.value }))} className="input text-xs" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
