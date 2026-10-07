import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Wand2, Image as ImageIcon, Check, RefreshCw, Save, Upload, Tag, FileText, Megaphone, Star, DollarSign, Bot,
} from 'lucide-react';
import { get, post } from '../lib/api';
import { number, toman } from '../lib/format';
import { AiBadge, Badge, Modal, Spinner, Tabs } from './ui';
import { toast } from '../store';

/**
 * استودیوی تولید محصول با هوش مصنوعی.
 * مدیر/فروشنده می‌تواند با یک توضیح کوتاه، محصول کامل (نام، قیمت، توضیحات، سئو،
 * بازاریابی، تصویر، واریانت) بسازد و آن را پیش‌نویس یا منتشر کند.
 */
export default function AiProductStudio({ open, onClose, onCreated, productId = null, initial = {} }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('text');
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState('builtin');
  const [model, setModel] = useState('');
  const [categories, setCategories] = useState([]);
  const [brief, setBrief] = useState(initial.brief || '');
  const [category, setCategory] = useState(initial.category || '');
  const [brand, setBrand] = useState(initial.brand || '');
  const [price, setPrice] = useState(initial.price || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [seo, setSeo] = useState(null);
  const [marketing, setMarketing] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [reviewAnalysis, setReviewAnalysis] = useState(null);

  useEffect(() => {
    if (!open) return;
    get('/ai/models')
      .then((d) => {
        const active = d.providers.filter((p) => p.configured && p.enabled);
        setProviders(active);
        const best = active.find((p) => p.slug !== 'builtin') || active[0];
        if (best) {
          setProvider(best.slug);
          setModel(best.default_model);
        }
      })
      .catch(() => {});
    get('/categories?flat=1').then((d) => setCategories(d.items.filter((c) => c.is_active))).catch(() => {});
  }, [open]);

  const currentProvider = providers.find((p) => p.slug === provider);

  const generate = async (autoPublish = false) => {
    if (!brief.trim() && !category) return toast('توضیح کوتاه محصول را وارد کنید.', 'error');
    setBusy(true);
    try {
      const data = await post('/ai/generate/product', {
        brief,
        category: categories.find((c) => c.slug === category)?.name || category,
        brand,
        price: price ? Number(price) : undefined,
        provider,
        model: model || undefined,
        auto_publish: autoPublish,
      });
      setResult(data);
      toast(autoPublish ? 'محصول با موفقیت ساخته و منتشر شد 🎉' : 'پیش‌نویس محصول تولید شد.', 'success');
      onCreated?.(data);
      if (autoPublish) {
        setTimeout(() => {
          onClose?.();
          navigate('/admin/products');
        }, 800);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const generateImage = async () => {
    setImageBusy(true);
    try {
      const prompt = result?.product?.image_prompt || `${brief} — product photo, studio light, white background`;
      const data = await post('/ai/generate/image', { prompt, label: result?.product?.name_fa || brief, provider, product_id: productId || undefined });
      setImageUrl(data.url);
      toast('تصویر محصول تولید شد.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setImageBusy(false);
    }
  };

  const generateSeo = async () => {
    setBusy(true);
    try {
      const data = await post('/ai/generate/seo', { topic: result?.product?.name_fa || brief, provider, model });
      setSeo(data.seo);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const generateMarketing = async () => {
    setBusy(true);
    try {
      const data = await post('/ai/marketing', { topic: `معرفی ${result?.product?.name_fa || brief}`, provider, model });
      setMarketing(data.content || { body: data.text });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const suggestPricing = async () => {
    if (!productId) return toast('برای تحلیل قیمت، محصول باید ابتدا ذخیره شده باشد.', 'info');
    setBusy(true);
    try {
      const data = await post(`/ai/pricing/${productId}`, { provider, model });
      setPricing(data.pricing);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const analyzeReviews = async () => {
    if (!productId) return toast('برای تحلیل نظرات، محصول باید ذخیره شده باشد.', 'info');
    setBusy(true);
    try {
      const data = await post(`/ai/analyze-reviews/${productId}`, { provider, model });
      setReviewAnalysis(data.analysis);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const p = result?.product;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-400" /> استودیوی هوش مصنوعی EasyShop
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500">
            {result?.generation
              ? `تولیدشده با ${result.generation.providerName || result.generation.provider} — ${result.generation.model}`
              : `${providers.filter((x) => x.configured).length} مدل آماده استفاده`}
          </span>
          <div className="flex gap-2">
            <button onClick={() => generate(false)} disabled={busy} className="btn-ghost btn-sm">
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />} ذخیره پیش‌نویس
            </button>
            <button onClick={() => generate(true)} disabled={busy} className="btn-primary btn-sm">
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />} تولید و انتشار
            </button>
          </div>
        </div>
      }
    >
      <Tabs
        tabs={[
          { value: 'text', label: 'محتوای محصول', icon: Wand2 },
          { value: 'image', label: 'تصویر محصول' },
          { value: 'seo', label: 'سئو' },
          { value: 'marketing', label: 'بازاریابی' },
          { value: 'insight', label: 'قیمت و نظرات' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-4 space-y-4">
        {/* انتخاب مدل */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">موتور هوش مصنوعی</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                const found = providers.find((x) => x.slug === e.target.value);
                setModel(found?.default_model || '');
              }}
              className="input text-xs"
            >
              {providers.map((x) => (
                <option key={x.slug} value={x.slug}>
                  {x.name} {x.configured ? '' : '(کلید ثبت نشده)'}
                </option>
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
        </div>

        {tab === 'text' ? (
          <>
            <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
              <p className="mb-3 flex items-center gap-2 text-[11px] leading-6 text-brand-200">
                <Bot className="h-3.5 w-3.5" />
                یک توضیح کوتاه بنویسید؛ هوش مصنوعی نام، دسته‌بندی، قیمت پیشنهادی، مشخصات، توضیحات کامل سئوشده، واریانت‌ها و
                پرسش‌های متداول را می‌سازد.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">توضیح محصول (الزامی)</label>
                  <input
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="مثلاً: هدفون بی‌سیم با نویز کنسلینگ فعال برای کاربران حرفه‌ای"
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label">دسته‌بندی</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="input text-xs">
                    <option value="">انتخاب خودکار توسط AI</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">برند</label>
                  <input value={brand} onChange={(e) => setBrand(e.target.value)} className="input text-xs" placeholder="اختیاری" />
                </div>
                <div>
                  <label className="label">قیمت هدف (تومان)</label>
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="input text-xs" placeholder="خودکار" />
                </div>
                <div className="flex items-end">
                  <button onClick={() => generate(false)} disabled={busy} className="btn-primary w-full">
                    {busy ? <Spinner className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />} تولید محتوا
                  </button>
                </div>
              </div>
            </div>

            {p ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color="indigo">{p.brand || 'بدون برند'}</Badge>
                    <Badge color="cyan">{p.category_slug_or_name || category || 'دسته پیشنهادی'}</Badge>
                    {p.tags?.slice(0, 4).map((t) => (
                      <Badge key={t} color="slate">{t}</Badge>
                    ))}
                    <AiBadge className="ml-auto">{result?.generation?.model}</AiBadge>
                  </div>
                  <h3 className="mt-3 text-sm font-extrabold text-white">{p.name_fa}</h3>
                  <p className="text-[11px] text-slate-500">{p.name_en}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-400">
                    <span>قیمت: <b className="text-brand-300">{toman(p.price)}</b></span>
                    <span>قیمت قبل از تخفیف: {toman(p.compare_at_price)}</span>
                    <span>موجودی: {number(p.stock)}</span>
                    <span>گارانتی: {p.warranty}</span>
                    <span>ارسال: {number(p.shipping_days)} روز</span>
                  </div>
                  <div
                    className="mt-3 max-h-52 overflow-y-auto text-[11px] leading-6 text-slate-300 [&_h3]:mt-2 [&_h3]:font-bold [&_h3]:text-white"
                    dangerouslySetInnerHTML={{ __html: p.description_fa }}
                  />
                </div>

                {p.specs && Object.keys(p.specs).length ? (
                  <div className="rounded-2xl border border-white/10 p-4">
                    <p className="mb-2 text-[11px] font-bold text-slate-200">مشخصات فنی تولیدشده</p>
                    <div className="grid gap-x-6 sm:grid-cols-2">
                      {Object.entries(p.specs).map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-white/5 py-1.5 text-[11px]">
                          <span className="text-slate-500">{k}</span>
                          <span className="text-slate-300">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {p.variants?.length ? (
                  <div className="rounded-2xl border border-white/10 p-4">
                    <p className="mb-2 text-[11px] font-bold text-slate-200">واریانت‌ها</p>
                    <div className="flex flex-wrap gap-2">
                      {p.variants.map((v, i) => (
                        <span key={i} className="chip border border-white/10 bg-white/5 text-slate-300">
                          {v.name_fa} {v.price_delta ? `(+${toman(v.price_delta, { withUnit: false })})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {tab === 'image' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
              <p className="text-[11px] leading-6 text-brand-200">
                تصویر محصول با موتور تصویری انتخاب‌شده ساخته می‌شود (برای مدل‌های بدون پشتیبانی تصویر، موتور داخلی EasyShop
                تصویر گرافیکی حرفه‌ای تولید می‌کند).
              </p>
              <button onClick={generateImage} disabled={imageBusy} className="btn-primary mt-3 btn-sm">
                {imageBusy ? <Spinner className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />} تولید تصویر
              </button>
            </div>
            {imageUrl ? (
              <div className="rounded-2xl border border-white/10 p-4">
                <img src={imageUrl} alt="تصویر تولیدشده" className="mx-auto max-h-80 rounded-xl object-contain" />
                <div className="mt-3 flex justify-center gap-2">
                  <a href={imageUrl} download="easyshop-product.png" className="btn-ghost btn-sm">دانلود تصویر</a>
                  <button onClick={generateImage} className="btn-ghost btn-sm">
                    <RefreshCw className="h-3.5 w-3.5" /> تولید مجدد
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'seo' ? (
          <div className="space-y-3">
            <button onClick={generateSeo} disabled={busy} className="btn-ghost btn-sm">
              <FileText className="h-3.5 w-3.5" /> تولید بسته سئو
            </button>
            {seo ? (
              <div className="space-y-2 rounded-2xl border border-white/10 p-4 text-[11px]">
                <p><span className="text-slate-500">عنوان: </span><b className="text-slate-200">{seo.title}</b></p>
                <p><span className="text-slate-500">توضیحات متا: </span>{seo.meta_description}</p>
                <p className="flex flex-wrap gap-2">
                  <span className="text-slate-500">کلمات کلیدی:</span>
                  {seo.keywords?.map((k) => <Badge key={k} color="indigo">{k}</Badge>)}
                </p>
                {seo.faq?.length ? (
                  <div>
                    <p className="text-slate-500">پرسش‌های متداول پیشنهادی:</p>
                    {seo.faq.map((f, i) => (
                      <p key={i} className="mt-1 text-slate-300">• {f.q} — {f.a}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'marketing' ? (
          <div className="space-y-3">
            <button onClick={generateMarketing} disabled={busy} className="btn-ghost btn-sm">
              <Megaphone className="h-3.5 w-3.5" /> تولید کمپین بازاریابی
            </button>
            {marketing ? (
              <div className="space-y-2 rounded-2xl border border-white/10 p-4 text-[11px] leading-6 text-slate-300">
                {marketing.headline ? <p><b className="text-white">{marketing.headline}</b></p> : null}
                {marketing.subheadline ? <p className="text-slate-400">{marketing.subheadline}</p> : null}
                {marketing.body ? <p>{marketing.body}</p> : null}
                {marketing.bullets?.length ? (
                  <ul className="list-inside list-disc text-slate-400">
                    {marketing.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                ) : null}
                {marketing.sms ? <p><span className="text-slate-500">پیامک: </span>{marketing.sms}</p> : null}
                {marketing.push ? <p><span className="text-slate-500">پوش: </span>{marketing.push}</p> : null}
                {marketing.instagram ? <p className="whitespace-pre-wrap"><span className="text-slate-500">اینستاگرام: </span>{marketing.instagram}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'insight' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button onClick={suggestPricing} disabled={busy} className="btn-ghost btn-sm">
                <DollarSign className="h-3.5 w-3.5" /> تحلیل قیمت‌گذاری
              </button>
              <button onClick={analyzeReviews} disabled={busy} className="btn-ghost btn-sm">
                <Star className="h-3.5 w-3.5" /> تحلیل نظرات مشتریان
              </button>
            </div>
            {pricing ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-[11px] leading-6">
                <p className="font-bold text-emerald-200">قیمت پیشنهادی: {toman(pricing.suggested_price)}</p>
                <p className="text-slate-400">بازه منطقی: {toman(pricing.min_price)} تا {toman(pricing.max_price)}</p>
                <p className="mt-1 text-slate-300">{pricing.reason}</p>
                <p className="text-slate-500">استراتژی: {pricing.strategy}</p>
              </div>
            ) : null}
            {reviewAnalysis ? (
              <div className="rounded-2xl border border-white/10 p-4 text-[11px] leading-6">
                <p className="font-bold text-slate-200">جمع‌بندی نظرات</p>
                <p className="mt-1 text-slate-300">{reviewAnalysis.summary}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-emerald-300">نقاط قوت</p>
                    {reviewAnalysis.pros?.map((x, i) => <p key={i} className="text-slate-400">✓ {x}</p>)}
                  </div>
                  <div>
                    <p className="text-rose-300">نقاط ضعف</p>
                    {reviewAnalysis.cons?.map((x, i) => <p key={i} className="text-slate-400">• {x}</p>)}
                  </div>
                </div>
              </div>
            ) : null}
            {!productId ? (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200">
                برای تحلیل قیمت و نظرات، ابتدا محصول را ذخیره کنید (حالت ویرایش محصول).
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
