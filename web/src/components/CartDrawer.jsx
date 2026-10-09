import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2, X, Truck, Tag } from 'lucide-react';
import { useCart, toast } from '../store';
import { number, toman } from '../lib/format';
import { Badge, Price, SmartImage } from './ui';
import { useState } from 'react';

export default function CartDrawer() {
  const { items, totals, openDrawer, setDrawer, updateQty, remove, applyCoupon, loading } = useCart();
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);

  if (!openDrawer) return null;

  const changeQty = async (item, next) => {
    try {
      await updateQty(item.id, next);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleCoupon = async () => {
    setApplying(true);
    try {
      const res = await applyCoupon(code);
      toast(res.message || 'کد تخفیف اعمال شد.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
      <aside className="absolute left-0 top-0 flex h-full w-full max-w-md flex-col border-r border-white/10 bg-ink-850 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="flex items-center gap-2 font-bold text-white">
            <ShoppingBag className="h-5 w-5 text-brand-400" />
            سبد خرید
            <span className="text-xs font-normal text-slate-500">({number(totals?.item_count || 0)} کالا)</span>
          </h3>
          <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && !items.length ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <ShoppingBag className="h-12 w-12 text-slate-700" />
              <p className="text-sm font-semibold text-slate-400">سبد خرید شما خالی است</p>
              <Link to="/products" onClick={() => setDrawer(false)} className="btn-primary btn-sm">
                شروع خرید
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="card flex gap-3 p-3">
                  <SmartImage src={item.thumbnail} alt={item.name} className="h-20 w-20 shrink-0 rounded-xl" fallbackText={item.name?.slice(0, 10)} />
                  <div className="flex flex-1 flex-col">
                    <Link to={`/products/${item.slug}`} onClick={() => setDrawer(false)} className="line-clamp-2 text-xs font-semibold text-slate-200 hover:text-brand-300">
                      {item.name}
                    </Link>
                    {item.variant_name ? <span className="mt-0.5 text-[10px] text-slate-500">{item.variant_name}</span> : null}
                    {!item.available ? <Badge color="rose" className="mt-1 w-fit">موجودی ناکافی</Badge> : null}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
                        <button onClick={() => changeQty(item, item.qty + 1)} disabled={item.qty >= item.stock} className="grid h-6 w-6 place-items-center rounded text-slate-300 hover:bg-white/10 disabled:opacity-30">
                          <Plus className="h-3 w-3" />
                        </button>
                        <span className="w-7 text-center text-xs font-bold text-white">{number(item.qty)}</span>
                        <button onClick={() => changeQty(item, item.qty - 1)} disabled={item.qty <= 1} className="grid h-6 w-6 place-items-center rounded text-slate-300 hover:bg-white/10 disabled:opacity-30">
                          <Minus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-xs font-bold text-brand-300">{toman(item.total)}</span>
                    </div>
                  </div>
                  <button onClick={() => remove(item.id)} className="self-start rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 ? (
          <footer className="border-t border-white/10 p-4">
            <div className="mb-3 flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="کد تخفیف"
                  className="input py-2 pr-9 text-xs"
                />
              </div>
              <button onClick={handleCoupon} disabled={applying || !code} className="btn-ghost btn-sm">
                اعمال
              </button>
            </div>

            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <dt>جمع کالاها</dt>
                <dd>{toman(totals?.subtotal)}</dd>
              </div>
              {totals?.discount > 0 ? (
                <div className="flex justify-between text-emerald-400">
                  <dt>تخفیف{totals.coupon?.code ? ` (${totals.coupon.code})` : ''}</dt>
                  <dd>−{toman(totals.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-slate-400">
                <dt className="flex items-center gap-1">
                  <Truck className="h-3 w-3" /> ارسال
                </dt>
                <dd>{totals?.shipping_free ? <span className="text-emerald-400">رایگان</span> : toman(totals?.shipping_cost)}</dd>
              </div>
              <div className="flex justify-between text-slate-400">
                <dt>مالیات بر ارزش افزوده</dt>
                <dd>{toman(totals?.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-extrabold text-white">
                <dt>مبلغ قابل پرداخت</dt>
                <dd>{toman(totals?.total)}</dd>
              </div>
            </dl>

            <Link to="/checkout" onClick={() => setDrawer(false)} className="btn-primary mt-4 w-full">
              تکمیل خرید و پرداخت
            </Link>
            <Link to="/cart" onClick={() => setDrawer(false)} className="mt-2 block text-center text-xs text-slate-500 hover:text-brand-300">
              مشاهده‌ی صفحه سبد خرید
            </Link>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
