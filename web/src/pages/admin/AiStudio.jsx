import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Wand2, Image as ImageIcon, Megaphone, FolderTree, FileText, DollarSign, Star, Trash2,
  Upload, RefreshCw, Cpu, Check,
} from 'lucide-react';
import { del, get, post } from '../../lib/api';
import { number, toman, timeAgo } from '../../lib/format';
import { AiBadge, Badge, EmptyState, Loading, Spinner, Tabs } from '../../components/ui';
import { toast } from '../../store';

export default function AiStudio() {
  const [tab, setTab] = useState('products');
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState('builtin');
  const [model, setModel] = useState('');
  const [generations, setGenerations] = useState(null);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);

  // فرم‌ها
  const [brief, setBrief] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState(null);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [marketing, setMarketing] = useState(null);
  const [seo, setSeo] = useState(null);
  const [catList, setCatList] = useState([]);
  const [pricingProduct, setPricingProduct] = useState('');
  const [products, setProducts] = useState([]);
  const [pricing, setPricing] = useState(null);

  useEffect(() => {
    get('/ai/models').then((d) => {
      const active = d.providers.filter((p) => p.configured && p.enabled);
      setProviders(active);
      const best = active.find((p) => p.slug !== 'builtin') || active[0];
      if (best) {
        setProvider(best.slug);
        setModel(best.default_model);
      }
    });
    get('/categories?flat=1').then((d) => setCategories(d.items.filter((c) => c.is_active))).catch(() => {});
    get('/products/admin/all?limit=50').then((d) => setProducts(d.items)).catch(() => {});
    loadGenerations();
    get('/ai/logs?limit=1').then((d) => setStats(d.stats)).catch(() => {});
  }, []);

  const loadGenerations = () => get('/ai/generations?limit=30').then(setGenerations).catch(() => setGenerations({ items: [] }));

  const currentProvider = providers.find((p) => p.slug === provider);

  const run = async (fn, label) => {
    setBusy(true);
    try {
      await fn();
      toast(`${label} با موفقیت انجام شد.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <Sparkles className="h-5 w-5 text-brand-400" /> استودیوی هوش مصنوعی
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            ساخت محصول، تصویر، کمپین، سئو و دسته‌بندی با ۵ مدل برتر + موتور داخلی
          </p>
        </div>
        <Link to="/admin/ai-providers" className="btn-ghost btn-sm">
          <Cpu className="h-3.5 w-3.5" /> مدیریت کلیدها و مدل‌ها
        </Link>
      </header>

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">موتور هوش مصنوعی</label>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setModel(providers.find((p) => p.slug === e.target.value)?.default_model || '');
            }}
            className="input text-xs"
          >
            {providers.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">مدل</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="input text-xs">
            {(currentProvider?.models || []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <div className="text-[10px] text-slate-500">
            {stats ? (
              <>
                <p>{number(stats.calls)} فراخوانی · {number(stats.tokens)} توکن</p>
                <p>هزینه تخمینی: ${Number(stats.cost).toFixed(3)} · خطا: {number(stats.errors)}</p>
              </>
            ) : (
              'در حال بارگذاری آمار…'
            )}
          </div>
        </div>
      </div>

      <Tabs
        tabs={[
          { value: 'products', label: 'محصول کامل' },
          { value: 'image', label: 'تصویر محصول' },
          { value: 'marketing', label: 'کمپین بازاریابی' },
          { value: 'seo', label: 'بسته سئو' },
          { value: 'categories', label: 'دسته‌بندی' },
          { value: 'pricing', label: 'قیمت‌گذاری' },
          { value: 'history', label: 'پیش‌نویس‌ها' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="card p-5">
          {tab === 'products' ? (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <Wand2 className="h-4 w-4 text-brand-400" /> تولید محصول کامل
              </h2>
              <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="توضیح کوتاه محصول (مثلاً: ساعت هوشمند با پایش خواب)" className="input text-xs" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="input text-xs">
                  <option value="">دسته‌بندی خودکار</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.slug}>{c.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => run(async () => setResult(await post('/ai/generate/product', { brief, category, provider, model })), 'تولید محصول')} disabled={busy} className="btn-primary flex-1 btn-sm">
                    {busy ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />} تولید پیش‌نویس
                  </button>
                  <button
                    onClick={() =>
                      run(
                        async () => setResult(await post('/ai/generate/product', { brief, category, provider, model, auto_publish: true })),
                        'ساخت و انتشار محصول',
                      )
                    }
                    disabled={busy}
                    className="btn-ghost btn-sm"
                  >
                    <Upload className="h-3.5 w-3.5" /> انتشار مستقیم
                  </button>
                </div>
              </div>
              {result?.product ? (
                <div className="rounded-2xl border border-white/10 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <AiBadge>{result.generation?.model}</AiBadge>
                    <Badge color="indigo">{result.product.brand}</Badge>
                    <span className="text-[11px] font-bold text-brand-300">{toman(result.product.price)}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-white">{result.product.name_fa}</h3>
                  <div className="mt-2 max-h-56 overflow-y-auto text-[11px] leading-6 text-slate-300 [&_h3]:font-bold [&_h3]:text-white" dangerouslySetInnerHTML={{ __html: result.product.description_fa }} />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {result.product.tags?.map((t) => (
                      <Badge key={t} color="slate">{t}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'image' ? (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <ImageIcon className="h-4 w-4 text-brand-400" /> تولید تصویر محصول
              </h2>
              <input value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="توضیح تصویر؛ مثلاً: هدفون مشکی روی پس‌زمینه سفید استودیویی" className="input text-xs" />
              <button
                onClick={() =>
                  run(async () => {
                    const d = await post('/ai/generate/image', { prompt: imagePrompt, provider });
                    setImageUrl(d.url);
                  }, 'تولید تصویر')
                }
                disabled={busy || !imagePrompt}
                className="btn-primary btn-sm"
              >
                {busy ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />} تولید تصویر
              </button>
              {imageUrl ? (
                <div className="rounded-2xl border border-white/10 p-4">
                  <img src={imageUrl} alt="تصویر تولیدشده" className="mx-auto max-h-80 rounded-xl object-contain" />
                  <a href={imageUrl} download="easyshop-ai-image.png" className="btn-ghost btn-sm mt-3">دانلود تصویر</a>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'marketing' ? (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <Megaphone className="h-4 w-4 text-brand-400" /> کمپین بازاریابی
              </h2>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="موضوع کمپین؛ مثلاً: جشنواره پاییزه لوازم خانگی" className="input text-xs" />
              <button onClick={() => run(async () => setMarketing((await post('/ai/marketing', { topic, provider, model })).content), 'تولید کمپین')} disabled={busy || !topic} className="btn-primary btn-sm">
                {busy ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />} تولید محتوای کمپین
              </button>
              {marketing ? (
                <div className="space-y-2 rounded-2xl border border-white/10 p-4 text-[11px] leading-6 text-slate-300">
                  {Object.entries(marketing).map(([k, v]) => (
                    <p key={k}>
                      <b className="text-slate-200">{k}: </b>
                      {Array.isArray(v) ? v.join(' • ') : String(v).slice(0, 400)}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'seo' ? (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <FileText className="h-4 w-4 text-brand-400" /> بسته سئو
              </h2>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="موضوع؛ مثلاً: خرید لپ‌تاپ گیمینگ" className="input text-xs" />
              <button onClick={() => run(async () => setSeo((await post('/ai/generate/seo', { topic, provider, model })).seo), 'تولید بسته سئو')} disabled={busy || !topic} className="btn-primary btn-sm">
                {busy ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />} تولید
              </button>
              {seo ? (
                <div className="space-y-2 rounded-2xl border border-white/10 p-4 text-[11px] leading-6">
                  <p><span className="text-slate-500">عنوان سئو: </span><b className="text-slate-200">{seo.title}</b></p>
                  <p><span className="text-slate-500">متا: </span>{seo.meta_description}</p>
                  <p className="flex flex-wrap gap-1.5">{seo.keywords?.map((k) => <Badge key={k} color="indigo">{k}</Badge>)}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'categories' ? (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <FolderTree className="h-4 w-4 text-brand-400" /> پیشنهاد دسته‌بندی
              </h2>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="حوزه فروشگاه؛ مثلاً: لوازم ورزشی" className="input text-xs" />
              <div className="flex gap-2">
                <button onClick={() => run(async () => setCatList((await post('/ai/generate/categories', { topic, provider, model })).categories), 'پیشنهاد دسته‌بندی')} disabled={busy} className="btn-primary btn-sm">
                  {busy ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />} پیشنهاد
                </button>
                <button onClick={() => run(async () => setCatList((await post('/ai/generate/categories', { topic, provider, model, save: true })).categories), 'ذخیره دسته‌بندی‌ها')} disabled={busy} className="btn-ghost btn-sm">
                  <Check className="h-3.5 w-3.5" /> تولید و ذخیره در فروشگاه
                </button>
              </div>
              {catList.length ? (
                <div className="space-y-2">
                  {catList.map((c, i) => (
                    <div key={i} className="rounded-xl border border-white/10 p-3">
                      <p className="text-xs font-bold text-slate-200">{c.name_fa}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.subcategories?.map((s, j) => (
                          <span key={j} className="chip border border-white/10 bg-white/5 text-[10px] text-slate-400">{s.name_fa}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'pricing' ? (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <DollarSign className="h-4 w-4 text-brand-400" /> تحلیل قیمت‌گذاری
              </h2>
              <select value={pricingProduct} onChange={(e) => setPricingProduct(e.target.value)} className="input text-xs">
                <option value="">یک محصول انتخاب کنید…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button onClick={() => run(async () => setPricing((await post(`/ai/pricing/${pricingProduct}`, { provider, model })).pricing), 'تحلیل قیمت')} disabled={busy || !pricingProduct} className="btn-primary btn-sm">
                {busy ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />} تحلیل قیمت
              </button>
              {pricing ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-[11px] leading-6">
                  <p className="font-bold text-emerald-200">قیمت پیشنهادی: {toman(pricing.suggested_price)}</p>
                  <p className="text-slate-400">بازه: {toman(pricing.min_price)} تا {toman(pricing.max_price)}</p>
                  <p className="mt-1 text-slate-300">{pricing.reason}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'history' ? (
            !generations ? (
              <Loading />
            ) : generations.items.length === 0 ? (
              <EmptyState title="پیش‌نویسی وجود ندارد" icon={Sparkles} />
            ) : (
              <div className="space-y-2">
                {generations.items.map((g) => (
                  <div key={g.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3">
                    <AiBadge>{g.provider}</AiBadge>
                    <span className="flex-1 text-xs text-slate-200">
                      {g.kind === 'product' ? g.output?.name_fa : g.kind === 'image' ? 'تصویر تولیدشده' : g.kind}
                    </span>
                    <Badge color={g.status === 'published' ? 'emerald' : 'amber'}>{g.status === 'published' ? 'منتشرشده' : 'پیش‌نویس'}</Badge>
                    <span className="text-[10px] text-slate-500">{timeAgo(g.created_at)}</span>
                    {g.status !== 'published' ? (
                      <button
                        onClick={() => run(async () => { await post(`/ai/generations/${g.id}/publish`, {}); loadGenerations(); }, 'انتشار پیش‌نویس')}
                        className="btn-primary btn-sm"
                      >
                        <Upload className="h-3.5 w-3.5" /> انتشار
                      </button>
                    ) : g.product_id ? (
                      <Link to={`/admin/products/${g.product_id}`} className="btn-ghost btn-sm">مشاهده محصول</Link>
                    ) : null}
                    <button onClick={() => run(async () => { await del(`/ai/generations/${g.id}`); loadGenerations(); }, 'حذف پیش‌نویس')} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h3 className="mb-3 text-xs font-bold text-white">وضعیت مدل‌ها</h3>
            <div className="space-y-2">
              {providers.map((p) => (
                <div key={p.slug} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <span className="text-[11px] text-slate-300">{p.name}</span>
                  <Badge color={p.configured ? 'emerald' : 'slate'}>{p.configured ? 'آماده' : 'کلید ندارد'}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4 text-[11px] leading-6 text-slate-400">
            <h3 className="mb-2 text-xs font-bold text-white">نکته‌های حرفه‌ای</h3>
            <ul className="space-y-1.5">
              <li>• برای تولید انبوه، DeepSeek ارزان‌ترین گزینه است.</li>
              <li>• برای متن‌های ادبی و توصیفی، Claude بهترین کیفیت را دارد.</li>
              <li>• اگر کلید API ثبت نشده باشد، موتور داخلی EasyShop بدون توقف کار می‌کند.</li>
              <li>• هر پیش‌نویس قبل از انتشار قابل ویرایش است.</li>
            </ul>
            <Link to="/admin/ai-providers" className="btn-ghost btn-sm mt-3 w-full">
              <RefreshCw className="h-3.5 w-3.5" /> تنظیم کلیدهای API
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
