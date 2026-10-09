import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import {
  Sparkles, Flame, Star, TrendingUp, Truck, ShieldCheck, Headset, Zap, ArrowLeft, Package,
  Smartphone, Laptop, Home as HomeIcon, Shirt, Heart, Dumbbell, ShoppingBasket, Blocks, BookOpen, Tag,
} from 'lucide-react';
import { get, qs } from '../lib/api';
import { number, toman, timeAgo } from '../lib/format';
import { useAuth, useUI, toast } from '../store';
import { Badge, Price, Rating, SmartImage, StatCard } from '../components/ui';
import ProductCard, { HorizontalProducts } from '../components/ProductCard';

const iconMap = { Smartphone, Laptop, Home: HomeIcon, Shirt, Heart, Dumbbell, ShoppingBasket, Blocks, BookOpen, Tag };

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const setChatOpen = useUI((s) => s.setChatOpen);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    get('/home')
      .then(setData)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
        <div className="skeleton h-72 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="skeleton h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const hero = data.hero?.[0];
  const heroSide = data.hero?.slice(1, 4) || [];

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-3 py-5 sm:px-5">
      {/* ------------------------------ هیرو بنر ------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-bl from-brand-600/30 via-violet-600/20 to-ink-850 p-6 lg:col-span-2 lg:p-10">
          <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute -bottom-16 right-10 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative max-w-xl">
            <Badge color="indigo" icon={Sparkles}>جشنواره پایان فصل — تا ۴۰٪ تخفیف</Badge>
            <h1 className="mt-4 text-balance text-2xl font-extrabold leading-relaxed text-white sm:text-4xl">
              هر آنچه می‌خواهید، <span className="bg-gradient-to-l from-brand-300 to-fuchsia-300 bg-clip-text text-transparent">سریع و مطمئن</span>
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              هزاران کالا از برندهای معتبر، ارسال سریع، ۷ روز ضمانت بازگشت و دستیار خرید هوشمند که دقیقاً همان چیزی را که می‌خواهید پیدا می‌کند.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/products" className="btn-primary">
                <Package className="h-4 w-4" /> شروع خرید
              </Link>
              <button onClick={() => setChatOpen(true)} className="btn-ghost">
                <Sparkles className="h-4 w-4 text-brand-300" /> مشاوره هوشمند خرید
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-cyan-400" /> ارسال رایگان بالای ۵ میلیون</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> پرداخت امن</span>
              <span className="flex items-center gap-1.5"><Headset className="h-3.5 w-3.5 text-brand-300" /> پشتیبانی ۲۴ ساعته</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          {heroSide.map((p) => (
            <Link key={p.id} to={`/products/${p.slug}`} className="card card-hover flex items-center gap-3 p-3">
              <SmartImage src={p.thumbnail} alt={p.name} className="h-16 w-16 shrink-0 rounded-xl" fallbackText={p.name?.slice(0, 8)} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs font-bold text-slate-100">{p.name}</p>
                <div className="mt-1"><Price value={p.price} compareAt={p.compare_at_price} size="sm" /></div>
              </div>
              <ArrowLeft className="h-4 w-4 shrink-0 text-slate-500" />
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------ مزیت‌ها ------------------------------ */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.banners?.map((b, i) => {
          const Icon = Icons[b.icon] || Truck;
          const colors = ['text-cyan-300', 'text-emerald-300', 'text-brand-300', 'text-fuchsia-300'];
          return (
            <div key={i} className="card flex items-center gap-3 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/5">
                <Icon className={`h-5 w-5 ${colors[i % colors.length]}`} />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-100">{b.title}</p>
                <p className="text-[11px] text-slate-500">{b.subtitle}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* ----------------------------- دسته‌بندی‌ها --------------------------- */}
      <section className="space-y-3">
        <div className="section-title">
          <span className="flex items-center gap-2"><Icons.Grid3X3 className="h-5 w-5 text-brand-400" /> دسته‌بندی‌های محبوب</span>
          <Link to="/categories" className="link text-xs font-semibold">همه دسته‌ها</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {data.categories?.map((c) => {
            const Icon = iconMap[c.icon] || Icons.Tag;
            return (
              <Link key={c.id} to={`/categories/${c.slug}`} className="card card-hover flex flex-col items-center gap-2 p-4 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `${c.color}22`, color: c.color }}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="text-[11px] font-bold text-slate-200">{c.name}</span>
                <span className="text-[10px] text-slate-500">{number(c.product_count)} کالا</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------------ پیشنهاد ویژه -------------------------- */}
      {data.deals?.length ? (
        <section className="rounded-3xl border border-rose-500/20 bg-gradient-to-l from-rose-500/10 via-transparent to-transparent p-4">
          <div className="section-title mb-4">
            <span className="flex items-center gap-2"><Flame className="h-5 w-5 text-rose-400" /> پیشنهادهای شگفت‌انگیز</span>
            <Link to="/products?on_sale=1&sort=discount" className="link text-xs font-semibold">همه تخفیف‌ها</Link>
          </div>
          <HorizontalProducts products={data.deals} title="" icon={null} />
        </section>
      ) : null}

      <HorizontalProducts products={data.best_sellers} title="پرفروش‌ترین‌ها" icon={TrendingUp} to="/products?sort=popular" />
      <HorizontalProducts products={data.featured} title="منتخب‌های EasyShop" icon={Zap} to="/products?featured=1" />
      <HorizontalProducts products={data.newest} title="جدیدترین محصولات" icon={Sparkles} to="/products?sort=newest" />

      {/* ------------------------------- دستیار AI ---------------------------- */}
      <section className="overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-l from-brand-600/20 via-violet-600/10 to-ink-850 p-6 lg:p-8">
        <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-500/20">
            <Sparkles className="h-7 w-7 text-brand-300" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-extrabold text-white">دستیار هوشمند خرید EasyShop</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              با اتصال به ۵ مدل برتر هوش مصنوعی (GPT، Claude، Gemini، Grok و DeepSeek) دقیقاً همان محصولی را پیدا می‌کنید که
              نیاز دارید. فقط بگویید چه می‌خواهید — بقیه‌اش با ما.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['GPT-4o', 'Claude Sonnet', 'Gemini 2.5 Pro', 'Grok 4', 'DeepSeek V3'].map((m) => (
                <Badge key={m} color="indigo">{m}</Badge>
              ))}
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 lg:w-auto">
            <button onClick={() => setChatOpen(true)} className="btn-primary whitespace-nowrap">
              <Sparkles className="h-4 w-4" /> گفتگو با دستیار
            </button>
            <button
              onClick={() => navigate('/products')}
              className="btn-ghost whitespace-nowrap"
            >
              جستجوی دستی محصولات
            </button>
          </div>
        </div>
      </section>

      {/* --------------------------------- نظرات ----------------------------- */}
      {data.reviews?.length ? (
        <section className="space-y-3">
          <h2 className="section-title">نظر مشتریان ما</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.reviews.map((r, i) => (
              <div key={i} className="card p-4">
                <Rating value={r.rating} showValue={false} />
                <p className="mt-2 text-xs font-bold text-slate-200">{r.title}</p>
                <p className="mt-1.5 line-clamp-3 text-[11px] leading-6 text-slate-400">{r.body}</p>
                <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-[10px] text-slate-500">
                  <span>{r.user_name || 'کاربر EasyShop'}</span>
                  <span>{r.product_name}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* --------------------------------- آمار ------------------------------ */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="محصول فعال" value={number(data.stats.products)} icon={Package} color="brand" hint="به‌روزرسانی روزانه" />
        <StatCard label="مشتری راضی" value={number(data.stats.customers)} icon={Heart} color="rose" hint="میانگین رضایت ۹۶٪" />
        <StatCard label="سفارش موفق" value={number(data.stats.orders)} icon={Truck} color="emerald" hint="ارسال به سراسر کشور" />
        <StatCard label="میانگین امتیاز" value={number(data.stats.avg_rating)} icon={Star} color="amber" hint="از ۵ امتیاز" />
      </section>

      {/* --------------------------------- برندها ---------------------------- */}
      {data.brands?.length ? (
        <section className="space-y-3">
          <h2 className="section-title">برندهای معتبر</h2>
          <div className="flex flex-wrap gap-2">
            {data.brands.map((b) => (
              <Link key={b} to={`/products?brand=${encodeURIComponent(b)}`} className="chip border border-white/10 bg-white/5 text-slate-300 hover:border-brand-500/40">
                {b}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
