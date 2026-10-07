import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { get, post } from '../../lib/api';
import { EmptyState, Loading, Price, Rating, SmartImage } from '../../components/ui';
import { useCart, useWishlist, toast } from '../../store';

export default function Wishlist() {
  const wishlist = useWishlist();
  const addToCart = useCart((s) => s.add);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    await wishlist.load();
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    try {
      const res = await wishlist.toggle(id);
      toast(res.message, 'info');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const add = async (id, name) => {
    try {
      await addToCart(id, { qty: 1 });
      toast(`«${name}» به سبد خرید اضافه شد.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-base font-extrabold text-white">
          <Heart className="h-5 w-5 text-rose-400" /> علاقه‌مندی‌های من
        </h1>
        <p className="mt-1 text-xs text-slate-500">{wishlist.items.length} محصول ذخیره‌شده</p>
      </header>

      {wishlist.items.length === 0 ? (
        <EmptyState
          title="لیست علاقه‌مندی‌ها خالی است"
          description="با کلیک روی آیکون قلب در صفحه محصول، آن را برای بعد ذخیره کنید."
          icon={Heart}
          action={<Link to="/products" className="btn-primary btn-sm">مشاهده محصولات</Link>}
        />
      ) : (
        <div className="space-y-3">
          {wishlist.items.map((p) => (
            <div key={p.id} className="card flex flex-wrap items-center gap-4 p-4">
              <SmartImage src={p.thumbnail} alt={p.name} className="h-20 w-20 shrink-0 rounded-xl" fallbackText={p.name?.slice(0, 8)} />
              <div className="min-w-0 flex-1">
                <Link to={`/products/${p.slug}`} className="line-clamp-2 text-sm font-bold text-slate-100 hover:text-brand-300">
                  {p.name}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Rating value={p.rating} count={p.rating_count} />
                  {!p.in_stock ? <span className="text-[11px] text-rose-400">ناموجود</span> : null}
                </div>
                <div className="mt-1"><Price value={p.price} compareAt={p.compare_at_price} size="sm" /></div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => add(p.id, p.name)} disabled={!p.in_stock} className="btn-primary btn-sm">
                  <ShoppingCart className="h-3.5 w-3.5" /> افزودن به سبد
                </button>
                <button onClick={() => remove(p.id)} className="btn-ghost btn-sm text-rose-300">
                  <Trash2 className="h-3.5 w-3.5" /> حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
