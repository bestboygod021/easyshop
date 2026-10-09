import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Heart, ShoppingCart, Truck, Zap, ShieldCheck, Star } from 'lucide-react';
import { Badge, Price, Rating, SmartImage } from './ui';
import { number, fa } from '../lib/format';
import { useAuth, useCart, useUI, useWishlist, toast } from '../store';

export default function ProductCard({ product, className, compact = false }) {
  const navigate = useNavigate();
  const addToCart = useCart((s) => s.add);
  const wishlist = useWishlist();
  const user = useAuth((s) => s.user);
  const [busy, setBusy] = useState(false);
  const inWishlist = wishlist.ids.has(product.id);
  const lowStock = product.stock > 0 && product.stock <= 3;

  const handleAdd = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await addToCart(product.id, { qty: 1 });
      toast(`«${product.name}» به سبد خرید اضافه شد.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleWishlist = async (e) => {
    e.preventDefault();
    if (!user) {
      toast('برای ذخیره‌ی علاقه‌مندی‌ها وارد شوید.', 'info');
      navigate('/login');
      return;
    }
    try {
      const res = await wishlist.toggle(product.id);
      toast(res.message, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Link
      to={`/products/${product.slug}`}
      className={clsx('card card-hover group flex flex-col overflow-hidden p-3', className)}
    >
      <div className="relative">
        <SmartImage
          src={product.thumbnail}
          alt={product.name}
          ratio="aspect-square"
          className="rounded-xl"
          fallbackText={product.name?.slice(0, 18)}
        />
        <div className="absolute right-2 top-2 flex flex-col gap-1.5">
          {product.discount_percent > 0 ? <Badge color="rose">٪{fa(product.discount_percent)} تخفیف</Badge> : null}
          {product.featured ? <Badge color="indigo" icon={Zap}>ویژه</Badge> : null}
          {lowStock ? <Badge color="amber">آخرین {number(product.stock)} عدد</Badge> : null}
        </div>
        <button
          onClick={handleWishlist}
          aria-label="افزودن به علاقه‌مندی‌ها"
          className={clsx(
            'absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full border backdrop-blur transition',
            inWishlist ? 'border-rose-400/40 bg-rose-500/20 text-rose-300' : 'border-white/15 bg-black/40 text-slate-300 hover:text-rose-300',
          )}
        >
          <Heart className={clsx('h-4 w-4', inWishlist && 'fill-rose-400')} />
        </button>
        {product.stock === 0 ? (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/60">
            <span className="rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-bold text-white">ناموجود</span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <span className="mb-1 text-[11px] text-brand-300/90">{product.category_name || product.brand || 'EasyShop'}</span>
        <h3 className={clsx('line-clamp-2 font-bold leading-6 text-slate-100 transition group-hover:text-brand-300', compact ? 'text-xs' : 'text-sm')}>
          {product.name}
        </h3>

        {!compact ? (
          <p className="mt-1.5 line-clamp-1 text-[11px] text-slate-500">{product.short_desc || product.brand}</p>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2">
          <Rating value={product.rating} count={product.rating_count} />
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <Star className="h-3 w-3 text-amber-400" /> {number(product.sold_count)} فروش
          </span>
        </div>

        <div className="mt-auto pt-3">
          <Price value={product.price} compareAt={product.compare_at_price} size={compact ? 'sm' : 'md'} />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={busy || product.stock === 0}
              className="btn-primary flex-1 !py-2 text-xs"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {busy ? 'در حال افزودن…' : 'افزودن به سبد'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
            {product.shipping_days ? (
              <span className="flex items-center gap-1">
                <Truck className="h-3 w-3" /> {fa(product.shipping_days)} روزه
              </span>
            ) : null}
            {product.warranty ? (
              <span className="flex items-center gap-1 line-clamp-1">
                <ShieldCheck className="h-3 w-3" /> گارانتی
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products = [], loading, skeletonCount = 8, className }) {
  if (loading) {
    return (
      <div className={clsx('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="card p-3">
            <div className="skeleton mb-3 aspect-square w-full" />
            <div className="skeleton mb-2 h-4 w-3/4" />
            <div className="skeleton h-6 w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={clsx('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

export function HorizontalProducts({ products = [], title, icon: Icon, to }) {
  if (!products.length) return null;
  return (
    <section className="space-y-3">
      <div className="section-title">
        <span className="flex items-center gap-2">
          {Icon ? <Icon className="h-5 w-5 text-brand-400" /> : null}
          {title}
        </span>
        {to ? (
          <Link to={to} className="link text-xs font-semibold">
            مشاهده همه
          </Link>
        ) : null}
      </div>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} compact className="w-[170px] shrink-0 sm:w-[190px]" />
        ))}
      </div>
    </section>
  );
}
