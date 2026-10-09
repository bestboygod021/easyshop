import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingBag, Tag, Truck, ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { useCart, useAuth, toast } from '../store';
import { number, toman } from '../lib/format';
import { Badge, EmptyState, Loading, SmartImage } from '../components/ui';
import { useState } from 'react';

export default function Cart() {
  const { items, totals, loading, load, updateQty, remove, clear, applyCoupon } = useCart();
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const handleCoupon = async () => {
    setBusy(true);
    try {
      const res = await applyCoupon(code);
      toast(res.message || 'اعمال شد.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !items.length) return <Loading label="در حال بارگذاری سبد خرید…" />;

  if (!items.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          title="سبد خرید شما خالی است"
          description="با شروع خرید، محصولات مورد علاقه‌تان را اینجا خواهید دید."
          icon={ShoppingBag}
          action={
            <Link to="/products" className="btn-primary">
              رفتن به فروشگاه
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-5">
      <h1 className="mb-5 flex items-center gap-2 text-lg font-extrabold text-white">
        <ShoppingBag className="h-5 w-5 text-brand-400" /> سبد خرید
        <span className="text-xs font-normal text-slate-500">({number(totals?.item_count || 0)} کالا)</span>
      </h1>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="card flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
              <SmartImage src={item.thumbnail} alt={item.name} className="h-24 w-24 shrink-0 rounded-xl" fallbackText={item.name?.slice(0, 8)} />
              <div className="min-w-0 flex-1">
                <Link to={`/products/${item.slug}`} className="line-clamp-2 text-sm font-bold text-slate-100 hover:text-brand-300">
                  {item.name}
                </Link>
                {item.variant_name ? <Badge color="indigo" className="mt-1">{item.variant_name}</Badge> : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span>قیمت واحد: {toman(item.unit_price)}</span>
                  {item.available ? <span className="text-emerald-400">موجود</span> : <span className="text-rose-400">موجودی ناکافی</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1">
                <button onClick={() => updateQty(item.id, item.qty + 1)} disabled={item.qty >= item.stock} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-30">
                  <Plus className="h-4 w-4" />
                </button>
                <span className="w-9 text-center text-sm font-bold text-white">{number(item.qty)}</span>
                <button onClick={() => updateQty(item.id, item.qty - 1)} disabled={item.qty <= 1} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-30">
                  <Minus className="h-4 w-4" />
                </button>
              </div>
              <div className="text-left">
                <p className="text-sm font-extrabold text-brand-300">{toman(item.total)}</p>
                <button onClick={() => remove(item.id)} className="mt-1 flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300">
                  <Trash2 className="h-3 w-3" /> حذف
                </button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button onClick={clear} className="btn-ghost btn-sm text-rose-300">
              <Trash2 className="h-3.5 w-3.5" /> خالی کردن سبد
            </button>
            <Link to="/products" className="btn-ghost btn-sm">
              <ArrowLeft className="h-3.5 w-3.5" /> ادامه خرید
            </Link>
          </div>

          <div className="card flex flex-wrap items-center gap-3 p-4 text-[11px] text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> پرداخت امن
            <Truck className="h-4 w-4 text-cyan-400" /> ارسال سریع
            <Sparkles className="h-4 w-4 text-brand-400" /> امکان پرداخت با کیف پول و امتیاز باشگاه مشتریان
          </div>
        </div>

        {/* خلاصه سفارش */}
        <aside className="card sticky top-32 h-fit p-5">
          <h2 className="mb-4 text-sm font-bold text-white">خلاصه سفارش</h2>

          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Tag className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="کد تخفیف" className="input py-2 pr-9 text-xs" />
            </div>
            <button onClick={handleCoupon} disabled={busy || !code} className="btn-ghost btn-sm">اعمال</button>
          </div>

          <dl className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <dt>جمع کالاها</dt>
              <dd>{toman(totals?.subtotal)}</dd>
            </div>
            {totals?.discount > 0 ? (
              <div className="flex justify-between text-emerald-400">
                <dt>تخفیف {totals.coupon?.code ? `(${totals.coupon.code})` : ''}</dt>
                <dd>−{toman(totals.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-400">
              <dt>هزینه ارسال</dt>
              <dd>{totals?.shipping_free ? <span className="text-emerald-400">رایگان</span> : toman(totals?.shipping_cost)}</dd>
            </div>
            <div className="flex justify-between text-slate-400">
              <dt>مالیات</dt>
              <dd>{toman(totals?.tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-3 text-base font-extrabold text-white">
              <dt>قابل پرداخت</dt>
              <dd>{toman(totals?.total)}</dd>
            </div>
          </dl>

          <button onClick={() => navigate(user ? '/checkout' : '/login?next=/checkout')} className="btn-primary mt-5 w-full">
            ادامه فرآیند خرید
          </button>
          {!totals?.shipping_free && totals?.subtotal ? (
            <p className="mt-3 rounded-xl border border-brand-500/20 bg-brand-500/5 p-2.5 text-center text-[11px] text-brand-200">
              با {toman(5000000 - totals.subtotal)} خرید بیشتر، ارسال رایگان می‌شود!
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
