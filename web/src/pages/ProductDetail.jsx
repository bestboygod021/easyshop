import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as Icons from 'lucide-react';
import {
  ShoppingCart, Heart, Share2, Truck, ShieldCheck, RotateCcw, Star, Check, Package, Zap,
  Sparkles, MessageSquare, ThumbsUp, Send, Store, ChevronLeft, BadgeCheck, Boxes, Info, Bot,
} from 'lucide-react';
import { get, post } from '../lib/api';
import { number, toman, timeAgo, fa } from '../lib/format';
import { useAuth, useCart, useWishlist, toast } from '../store';
import { Badge, EmptyState, Loading, Price, Rating, SmartImage, Tabs, AiBadge, InfoRow, Progress } from '../components/ui';
import { HorizontalProducts } from '../components/ProductCard';

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const addToCart = useCart((s) => s.add);
  const wishlist = useWishlist();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState(null);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState('description');
  const [busy, setBusy] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', body: '' });
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const load = () => {
    setLoading(true);
    get(`/products/${slug}`)
      .then((d) => {
        setData(d);
        setVariantId(d.variants?.[0]?.id || null);
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [slug]);

  if (loading) return <Loading label="در حال بارگذاری محصول…" />;
  if (!data?.product) return <EmptyState title="محصول یافت نشد" description="ممکن است این محصول حذف یا ناموجود شده باشد." />;

  const p = data.product;
  const variant = data.variants.find((v) => v.id === variantId);
  const price = p.price + (variant?.price_delta || 0);
  const compareAt = p.compare_at_price ? p.compare_at_price + (variant?.price_delta || 0) : null;
  const stock = variant ? variant.stock : p.stock;
  const inWishlist = wishlist.ids.has(p.id);
  const images = p.images?.length ? p.images : [p.thumbnail];

  const handleAdd = async (buyNow = false) => {
    setBusy(true);
    try {
      await addToCart(p.id, { qty, variantId });
      toast('محصول به سبد خرید اضافه شد.');
      if (buyNow) navigate('/checkout');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleWishlist = async () => {
    if (!user) return navigate('/login');
    try {
      const res = await wishlist.toggle(p.id);
      toast(res.message);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('لینک محصول کپی شد.');
      }
    } catch {
      /* ignore */
    }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login');
    try {
      await post(`/products/${p.id}/reviews`, reviewForm);
      toast('نظر شما ثبت شد. سپاسگزاریم!');
      setReviewForm({ rating: 5, title: '', body: '' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const analyzeReviews = async () => {
    setAnalyzing(true);
    try {
      const res = await post(`/ai/analyze-reviews/${p.id}`, {});
      setAiAnalysis(res.analysis);
      toast('تحلیل نظرات با هوش مصنوعی انجام شد.', 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const faq = p.ai_meta?.faq || [
    { q: 'ارسال چند روزه انجام می‌شود؟', a: `${fa(p.shipping_days || 3)} روز کاری با پست پیشتاز یا تیپاکس.` },
    { q: 'امکان مرجوعی وجود دارد؟', a: 'تا ۷ روز پس از تحویل، در صورت سالم بودن کالا و بسته‌بندی.' },
    { q: 'گارانتی چگونه است؟', a: p.warranty || 'گارانتی شرکتی با خدمات پس از فروش.' },
  ];

  const specs = Object.entries(p.specs || {});

  return (
    <div className="mx-auto max-w-7xl px-3 py-5 sm:px-5">
      {/* مسیر راهنما */}
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <Link to="/" className="hover:text-brand-300">خانه</Link>
        {data.breadcrumb?.map((b) => (
          <span key={b.id} className="flex items-center gap-2">
            <span>/</span>
            <Link to={`/categories/${b.slug}`} className="hover:text-brand-300">{b.name}</Link>
          </span>
        ))}
        <span>/</span>
        <span className="text-slate-300">{p.name}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* ---------------------------- گالری ---------------------------- */}
        <div className="space-y-3">
          <div className="card overflow-hidden p-3">
            <SmartImage src={images[activeImage]} alt={p.name} ratio="aspect-square" className="rounded-2xl" fallbackText={p.name.slice(0, 16)} />
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition ${activeImage === i ? 'border-brand-500' : 'border-transparent opacity-70 hover:opacity-100'}`}
                >
                  <img src={img} alt={`${p.name} ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div className="card space-y-2 p-4 text-xs">
            <p className="flex items-center gap-2 text-slate-300"><Truck className="h-4 w-4 text-cyan-400" /> ارسال {fa(p.shipping_days || 3)} روز کاری به سراسر کشور</p>
            <p className="flex items-center gap-2 text-slate-300"><ShieldCheck className="h-4 w-4 text-emerald-400" /> {p.warranty || 'گارانتی معتبر'}</p>
            <p className="flex items-center gap-2 text-slate-300"><RotateCcw className="h-4 w-4 text-amber-400" /> ۷ روز ضمانت بازگشت کالا</p>
            <p className="flex items-center gap-2 text-slate-300"><Store className="h-4 w-4 text-brand-400" /> فروشنده: EasyShop (ارسال از انبار تهران)</p>
          </div>
        </div>

        {/* ---------------------------- اطلاعات --------------------------- */}
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              {p.brand ? <Badge color="indigo">{p.brand}</Badge> : null}
              {p.category_name ? <Badge color="cyan">{p.category_name}</Badge> : null}
              {p.featured ? <Badge color="violet" icon={Zap}>منتخب</Badge> : null}
              {p.sold_count > 30 ? <Badge color="amber">پرفروش</Badge> : null}
            </div>

            <h1 className="mt-3 text-xl font-extrabold leading-8 text-white">{p.name}</h1>
            {p.name_en ? <p className="mt-1 text-xs text-slate-500">{p.name_en}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Rating value={p.rating} count={p.rating_count} size="lg" />
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Boxes className="h-3.5 w-3.5" /> {number(p.sold_count)} فروش موفق
              </span>
              <span className="text-xs text-slate-500">کد کالا: {p.sku}</span>
            </div>

            <p className="mt-4 text-sm leading-7 text-slate-300">{p.short_desc}</p>

            {/* واریانت‌ها */}
            {data.variants.length ? (
              <div className="mt-5">
                <label className="label">انتخاب مدل / نسخه</label>
                <div className="flex flex-wrap gap-2">
                  {data.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVariantId(v.id)}
                      disabled={v.stock === 0}
                      className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-40 ${
                        variantId === v.id ? 'border-brand-500 bg-brand-500/15 text-brand-200' : 'border-white/10 bg-white/5 text-slate-300 hover:border-brand-500/40'
                      }`}
                    >
                      {v.name}
                      {v.price_delta ? <span className="mr-1.5 text-[10px] text-slate-400">({v.price_delta > 0 ? '+' : ''}{toman(v.price_delta, { withUnit: false })})</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-5">
              <div>
                <Price value={price} compareAt={compareAt} size="xl" />
                {p.discount_percent > 0 ? (
                  <p className="mt-1 text-[11px] text-rose-300">سود شما از این خرید: {toman((compareAt || 0) - price)}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                  <button onClick={() => setQty((q) => Math.min(stock, q + 1))} disabled={qty >= stock} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-30">
                    <Icons.Plus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-bold text-white">{number(qty)}</span>
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-30">
                    <Icons.Minus className="h-4 w-4" />
                  </button>
                </div>
                <span className={`text-xs font-semibold ${stock > 5 ? 'text-emerald-400' : stock > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {stock > 5 ? 'موجود در انبار' : stock > 0 ? `تنها ${number(stock)} عدد باقی مانده` : 'ناموجود'}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={() => handleAdd(false)} disabled={busy || stock === 0} className="btn-primary flex-1">
                <ShoppingCart className="h-4 w-4" /> {busy ? 'در حال افزودن…' : 'افزودن به سبد خرید'}
              </button>
              <button onClick={() => handleAdd(true)} disabled={busy || stock === 0} className="btn-ghost flex-1">
                <Zap className="h-4 w-4 text-amber-400" /> خرید سریع
              </button>
              <button onClick={handleWishlist} className={`btn-ghost !px-3 ${inWishlist ? 'text-rose-300' : ''}`} title="علاقه‌مندی‌ها">
                <Heart className={`h-4 w-4 ${inWishlist ? 'fill-rose-400' : ''}`} />
              </button>
              <button onClick={share} className="btn-ghost !px-3" title="اشتراک‌گذاری">
                <Share2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/20 bg-brand-500/5 px-3 py-2.5 text-[11px] text-brand-200">
              <Sparkles className="h-3.5 w-3.5" />
              این محصول با موتور هوش مصنوعی EasyShop بهینه‌سازی شده است.
              {p.ai_meta?.model ? <AiBadge className="!py-0.5">{p.ai_meta.model}</AiBadge> : null}
            </div>
          </div>

          {/* تب‌ها */}
          <div className="card p-5">
            <Tabs
              tabs={[
                { value: 'description', label: 'توضیحات' },
                { value: 'specs', label: `مشخصات (${number(specs.length)})` },
                { value: 'reviews', label: `نظرات (${number(p.rating_count)})` },
                { value: 'faq', label: 'پرسش‌های متداول' },
              ]}
              active={tab}
              onChange={setTab}
            />

            <div className="mt-5">
              {tab === 'description' ? (
                <div className="prose-invert space-y-3 text-sm leading-7 text-slate-300 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-white [&_li]:my-1" dangerouslySetInnerHTML={{ __html: p.description || p.short_desc }} />
              ) : null}

              {tab === 'specs' ? (
                specs.length ? (
                  <div className="grid gap-x-8 sm:grid-cols-2">
                    {specs.map(([k, v]) => (
                      <InfoRow key={k} label={k} value={String(v)} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">مشخصات فنی ثبت نشده است.</p>
                )
              ) : null}

              {tab === 'reviews' ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-center">
                      <p className="text-3xl font-extrabold text-white">{number(p.rating)}</p>
                      <Rating value={p.rating} showValue={false} size="lg" />
                      <p className="mt-1 text-[11px] text-slate-500">از {number(p.rating_count)} نظر</p>
                    </div>
                    <div className="min-w-[200px] flex-1 space-y-1.5">
                      {[5, 4, 3, 2, 1].map((r) => {
                        const count = data.rating_buckets.find((b) => b.rating === r)?.c || 0;
                        const pct = p.rating_count ? (count / p.rating_count) * 100 : 0;
                        return (
                          <div key={r} className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span className="w-3">{fa(r)}</span>
                            <Star className="h-3 w-3 text-amber-400" />
                            <Progress value={pct} className="h-1.5" />
                            <span className="w-6 text-left">{number(count)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {user && ['admin', 'support', 'seller'].includes(user.role) ? (
                      <button onClick={analyzeReviews} disabled={analyzing} className="btn-ghost btn-sm">
                        <Bot className="h-3.5 w-3.5 text-brand-300" /> {analyzing ? 'در حال تحلیل…' : 'تحلیل نظرات با AI'}
                      </button>
                    ) : null}
                  </div>

                  {aiAnalysis ? (
                    <div className="rounded-2xl border border-brand-500/25 bg-brand-500/5 p-4">
                      <p className="flex items-center gap-2 text-xs font-bold text-brand-200">
                        <Sparkles className="h-4 w-4" /> جمع‌بندی هوش مصنوعی
                      </p>
                      <p className="mt-2 text-xs leading-6 text-slate-300">{aiAnalysis.summary}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[11px] font-semibold text-emerald-300">نقاط قوت</p>
                          <ul className="space-y-1 text-[11px] text-slate-400">
                            {aiAnalysis.pros?.map((x, i) => <li key={i}>✓ {x}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold text-rose-300">نقاط ضعف</p>
                          <ul className="space-y-1 text-[11px] text-slate-400">
                            {aiAnalysis.cons?.map((x, i) => <li key={i}>• {x}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <form onSubmit={submitReview} className="rounded-2xl border border-white/10 p-4">
                    <p className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-200">
                      <MessageSquare className="h-4 w-4 text-brand-400" /> ثبت نظر شما
                    </p>
                    {user ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">امتیاز:</span>
                          {[1, 2, 3, 4, 5].map((r) => (
                            <button key={r} type="button" onClick={() => setReviewForm((f) => ({ ...f, rating: r }))}>
                              <Star className={`h-5 w-5 ${r <= reviewForm.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
                            </button>
                          ))}
                        </div>
                        <input value={reviewForm.title} onChange={(e) => setReviewForm((f) => ({ ...f, title: e.target.value }))} placeholder="عنوان نظر (اختیاری)" className="input text-xs" />
                        <textarea value={reviewForm.body} onChange={(e) => setReviewForm((f) => ({ ...f, body: e.target.value }))} rows={3} placeholder="تجربه‌ی خود از این محصول را بنویسید…" className="input text-xs" />
                        <button type="submit" className="btn-primary btn-sm">
                          <Send className="h-3.5 w-3.5" /> ثبت نظر
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] text-slate-500">برای ثبت نظر ابتدا وارد حساب خود شوید.</p>
                        <Link to="/login" className="btn-primary btn-sm">ورود به حساب</Link>
                      </div>
                    )}
                  </form>

                  <div className="space-y-3">
                    {data.reviews.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-500">هنوز نظری ثبت نشده است. اولین نفر باشید!</p>
                    ) : (
                      data.reviews.map((r) => (
                        <div key={r.id} className="rounded-2xl border border-white/10 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="flex items-center gap-2 text-xs font-bold text-slate-200">
                                {r.user_name}
                                {r.title ? <span className="text-slate-400">— {r.title}</span> : null}
                              </p>
                              <div className="mt-1 flex items-center gap-3">
                                <Rating value={r.rating} showValue={false} />
                                <span className="text-[10px] text-slate-500">{timeAgo(r.created_at)}</span>
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                await post(`/products/reviews/${r.id}/helpful`, {});
                                toast('ممنون از بازخورد شما!');
                              }}
                              className="chip border border-white/10 bg-white/5 text-slate-400 hover:border-brand-500/40"
                            >
                              <ThumbsUp className="h-3 w-3" /> {number(r.helpful_count)}
                            </button>
                          </div>
                          <p className="mt-2 text-xs leading-6 text-slate-300">{r.body}</p>
                          {r.reply ? (
                            <div className="mt-3 rounded-xl border border-brand-500/20 bg-brand-500/5 p-3">
                              <p className="text-[11px] font-semibold text-brand-200">پاسخ EasyShop</p>
                              <p className="mt-1 text-[11px] leading-5 text-slate-300">{r.reply}</p>
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {tab === 'faq' ? (
                <div className="space-y-3">
                  {faq.map((f, i) => (
                    <details key={i} className="group rounded-xl border border-white/10 p-4">
                      <summary className="flex cursor-pointer items-center justify-between text-xs font-bold text-slate-200">
                        <span className="flex items-center gap-2"><Info className="h-3.5 w-3.5 text-brand-400" /> {f.q}</span>
                        <ChevronLeft className="h-4 w-4 transition group-open:-rotate-90" />
                      </summary>
                      <p className="mt-3 text-xs leading-6 text-slate-400">{f.a}</p>
                    </details>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {data.related?.length ? (
        <div className="mt-10">
          <HorizontalProducts products={data.related} title="محصولات مشابه" icon={Package} to={`/products?category=${p.category_slug}`} />
        </div>
      ) : null}
    </div>
  );
}
