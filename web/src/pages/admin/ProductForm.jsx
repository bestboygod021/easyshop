import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Save, ArrowRight, Sparkles, Plus, X, Image as ImageIcon, Upload } from 'lucide-react';
import { get, patch, post, upload } from '../../lib/api';
import { number, toman } from '../../lib/format';
import { Badge, Loading, Modal, Switch, Tabs } from '../../components/ui';
import AiProductStudio from '../../components/AiProductStudio';
import { toast } from '../../store';

const EMPTY = {
  name: '', name_en: '', slug: '', brand: '', category_id: '', price: '', compare_at_price: '', cost: '',
  stock: 0, unit: 'عدد', short_desc: '', description: '', description_en: '', specs: {}, tags: [],
  images: [], status: 'active', featured: false, warranty: '۲۴ ماه گارانتی شرکتی', shipping_days: 3,
  low_stock_threshold: 5, sku: '', variants: [],
};

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [tab, setTab] = useState('basic');
  const [specKey, setSpecKey] = useState('');
  const [specValue, setSpecValue] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    get('/categories?flat=1').then((d) => setCategories(d.items)).catch(() => {});
    if (isEdit) {
      get(`/products/${id}`)
        .then((d) => {
          const p = d.product;
          setForm({
            name: p.name, name_en: p.name_en || '', slug: p.slug, brand: p.brand || '', category_id: p.category_id || '',
            price: p.price, compare_at_price: p.compare_at_price || '', cost: p.cost || '', stock: p.stock,
            unit: p.unit || 'عدد', short_desc: p.short_desc || '', description: p.description || '',
            description_en: p.description_en || '', specs: p.specs || {}, tags: p.tags || [],
            images: p.images || [], status: p.status, featured: p.featured,
            warranty: p.warranty || '', shipping_days: p.shipping_days || 3, low_stock_threshold: 5, sku: p.sku,
            variants: d.variants.map((v) => ({ name_fa: v.name, name_en: v.name_en, price_delta: v.price_delta, stock: v.stock })),
          });
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => setLoading(false));
    }
  }, [id, isEdit]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name || !form.price) return toast('نام و قیمت محصول الزامی است.', 'error');
    setBusy(true);
    try {
      const payload = {
        name: form.name, name_en: form.name_en, brand: form.brand, category_id: form.category_id || null,
        price: Number(form.price), compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
        cost: form.cost ? Number(form.cost) : null, stock: Number(form.stock), unit: form.unit,
        short_desc: form.short_desc, description: form.description, description_en: form.description_en,
        specs: form.specs, tags: form.tags, images: form.images, status: form.status, featured: form.featured,
        warranty: form.warranty, shipping_days: Number(form.shipping_days), low_stock_threshold: Number(form.low_stock_threshold),
        short_desc_en: form.name_en ? `${form.name_en} — ${form.short_desc || ''}`.slice(0, 140) : '',
        variants: form.variants,
      };
      if (isEdit) {
        await patch(`/products/${id}`, payload);
        toast('محصول ذخیره شد.');
      } else {
        const data = await post('/products', { ...payload, sku: form.sku || undefined });
        toast('محصول ایجاد شد.');
        navigate(`/admin/products/${data.product.id}`);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (files) => {
    setUploading(true);
    try {
      const data = await upload(Array.from(files));
      set('images', [...form.images, ...data.urls]);
      toast('تصاویر آپلود شد.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const applyAiProduct = (data) => {
    const p = data.product;
    const cat = categories.find((c) => c.name === p.category_slug_or_name || c.slug === p.category_slug_or_name);
    setForm((f) => ({
      ...f,
      name: p.name_fa, name_en: p.name_en, brand: p.brand, price: p.price,
      compare_at_price: p.compare_at_price || '', cost: p.cost || '', stock: p.stock,
      short_desc: p.short_desc_fa, description: p.description_fa, description_en: p.description_en,
      specs: p.specs || {}, tags: p.tags || [], warranty: p.warranty, shipping_days: p.shipping_days,
      category_id: cat?.id || f.category_id, variants: p.variants || [], images: f.images,
    }));
    toast('محتوای هوش مصنوعی در فرم بارگذاری شد. بازبینی و ذخیره کنید.', 'info');
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/admin/products" className="flex items-center gap-1 hover:text-brand-300">
          <ArrowRight className="h-3 w-3" /> محصولات
        </Link>
        <span>/</span>
        <span className="text-slate-300">{isEdit ? 'ویرایش محصول' : 'محصول جدید'}</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-extrabold text-white">{isEdit ? 'ویرایش محصول' : 'افزودن محصول جدید'}</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStudioOpen(true)} className="btn-ghost btn-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-300" /> تولید محتوا با AI
          </button>
          <button onClick={save} disabled={busy} className="btn-primary btn-sm">
            <Save className="h-3.5 w-3.5" /> {busy ? 'در حال ذخیره…' : 'ذخیره محصول'}
          </button>
        </div>
      </header>

      <Tabs
        tabs={[
          { value: 'basic', label: 'اطلاعات پایه' },
          { value: 'content', label: 'توضیحات و مشخصات' },
          { value: 'media', label: 'تصاویر' },
          { value: 'variants', label: `واریانت‌ها (${number(form.variants.length)})` },
          { value: 'publish', label: 'انتشار و سئو' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card space-y-4 p-5">
          {tab === 'basic' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">نام محصول *</label>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="label">نام انگلیسی</label>
                  <input value={form.name_en} onChange={(e) => set('name_en', e.target.value)} className="input text-xs" dir="ltr" />
                </div>
                <div>
                  <label className="label">برند</label>
                  <input value={form.brand} onChange={(e) => set('brand', e.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="label">دسته‌بندی</label>
                  <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)} className="input text-xs">
                    <option value="">انتخاب کنید…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">کد کالا (SKU)</label>
                  <input value={form.sku} onChange={(e) => set('sku', e.target.value)} className="input text-xs" dir="ltr" placeholder="خودکار" />
                </div>
                <div>
                  <label className="label">قیمت (تومان) *</label>
                  <input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="label">قیمت قبل از تخفیف</label>
                  <input type="number" value={form.compare_at_price} onChange={(e) => set('compare_at_price', e.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="label">بهای تمام‌شده (محرمانه)</label>
                  <input type="number" value={form.cost} onChange={(e) => set('cost', e.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="label">موجودی اولیه</label>
                  <input type="number" value={form.stock} onChange={(e) => set('stock', e.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="label">واحد</label>
                  <input value={form.unit} onChange={(e) => set('unit', e.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="label">حد هشدار موجودی</label>
                  <input type="number" value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="label">گارانتی</label>
                  <input value={form.warranty} onChange={(e) => set('warranty', e.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="label">زمان ارسال (روز)</label>
                  <input type="number" value={form.shipping_days} onChange={(e) => set('shipping_days', e.target.value)} className="input text-xs" />
                </div>
              </div>
              {form.compare_at_price && Number(form.compare_at_price) > Number(form.price) ? (
                <Badge color="rose">
                  تخفیف {number(Math.round(((form.compare_at_price - form.price) / form.compare_at_price) * 100))}٪ نمایش داده می‌شود
                </Badge>
              ) : null}
            </>
          ) : null}

          {tab === 'content' ? (
            <>
              <div>
                <label className="label">توضیح کوتاه</label>
                <input value={form.short_desc} onChange={(e) => set('short_desc', e.target.value)} className="input text-xs" />
              </div>
              <div>
                <label className="label">توضیحات کامل (HTML مجاز)</label>
                <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={8} className="input font-mono text-[11px]" />
              </div>
              <div>
                <label className="label">توضیحات انگلیسی</label>
                <textarea value={form.description_en} onChange={(e) => set('description_en', e.target.value)} rows={4} className="input font-mono text-[11px]" dir="ltr" />
              </div>

              <div>
                <label className="label">مشخصات فنی</label>
                <div className="space-y-2">
                  {Object.entries(form.specs).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <input value={k} readOnly className="input flex-1 text-[11px]" />
                      <input
                        value={v}
                        onChange={(e) => set('specs', { ...form.specs, [k]: e.target.value })}
                        className="input flex-1 text-[11px]"
                      />
                      <button
                        onClick={() => {
                          const next = { ...form.specs };
                          delete next[k];
                          set('specs', next);
                        }}
                        className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input value={specKey} onChange={(e) => setSpecKey(e.target.value)} placeholder="ویژگی" className="input flex-1 text-[11px]" />
                    <input value={specValue} onChange={(e) => setSpecValue(e.target.value)} placeholder="مقدار" className="input flex-1 text-[11px]" />
                    <button
                      onClick={() => {
                        if (!specKey) return;
                        set('specs', { ...form.specs, [specKey]: specValue });
                        setSpecKey('');
                        setSpecValue('');
                      }}
                      className="btn-ghost btn-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">برچسب‌ها</label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {form.tags.map((t) => (
                    <span key={t} className="chip border border-white/10 bg-white/5 text-slate-300">
                      {t}
                      <button onClick={() => set('tags', form.tags.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput) {
                        set('tags', [...new Set([...form.tags, tagInput])]);
                        setTagInput('');
                      }
                    }}
                    placeholder="برچسب جدید + Enter"
                    className="input text-xs"
                  />
                </div>
              </div>
            </>
          ) : null}

          {tab === 'media' ? (
            <div className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 p-6 text-center hover:border-brand-500/50">
                <Upload className="h-6 w-6 text-slate-500" />
                <span className="text-xs text-slate-400">{uploading ? 'در حال آپلود…' : 'تصاویر را اینجا رها کنید یا کلیک کنید'}</span>
                <span className="text-[10px] text-slate-600">فرمت‌های مجاز: JPG، PNG، WebP، SVG — حداکثر ۸ مگابایت</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files?.length && handleUpload(e.target.files)} />
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {form.images.map((img, i) => (
                  <div key={i} className="group relative overflow-hidden rounded-xl border border-white/10">
                    <img src={img} alt={`تصویر ${i + 1}`} className="h-28 w-full object-cover" />
                    <button
                      onClick={() => set('images', form.images.filter((_, idx) => idx !== i))}
                      className="absolute left-2 top-2 rounded-lg bg-black/60 p-1 text-rose-300 opacity-0 transition group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {i === 0 ? <span className="absolute bottom-2 right-2 chip bg-brand-500/90 text-white">تصویر اصلی</span> : null}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="یا آدرس تصویر را وارد کنید (https://…)"
                  className="input text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value) {
                      set('images', [...form.images, e.target.value]);
                      e.target.value = '';
                    }
                  }}
                />
                <button onClick={() => setStudioOpen(true)} className="btn-ghost btn-sm whitespace-nowrap">
                  <Sparkles className="h-3.5 w-3.5 text-brand-300" /> تولید با AI
                </button>
              </div>
            </div>
          ) : null}

          {tab === 'variants' ? (
            <div className="space-y-3">
              {form.variants.map((v, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-4">
                  <input
                    value={v.name_fa}
                    onChange={(e) => {
                      const next = [...form.variants];
                      next[i] = { ...v, name_fa: e.target.value };
                      set('variants', next);
                    }}
                    placeholder="نام واریانت"
                    className="input text-[11px]"
                  />
                  <input
                    value={v.name_en || ''}
                    onChange={(e) => {
                      const next = [...form.variants];
                      next[i] = { ...v, name_en: e.target.value };
                      set('variants', next);
                    }}
                    placeholder="نام انگلیسی"
                    className="input text-[11px]"
                    dir="ltr"
                  />
                  <input
                    type="number"
                    value={v.price_delta}
                    onChange={(e) => {
                      const next = [...form.variants];
                      next[i] = { ...v, price_delta: Number(e.target.value) };
                      set('variants', next);
                    }}
                    placeholder="اختلاف قیمت"
                    className="input text-[11px]"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={v.stock}
                      onChange={(e) => {
                        const next = [...form.variants];
                        next[i] = { ...v, stock: Number(e.target.value) };
                        set('variants', next);
                      }}
                      placeholder="موجودی"
                      className="input text-[11px]"
                    />
                    <button
                      onClick={() => set('variants', form.variants.filter((_, idx) => idx !== i))}
                      className="rounded-lg px-2 text-rose-400 hover:bg-rose-500/10"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => set('variants', [...form.variants, { name_fa: 'نسخه جدید', name_en: '', price_delta: 0, stock: 0 }])}
                className="btn-ghost btn-sm"
              >
                <Plus className="h-3.5 w-3.5" /> افزودن واریانت
              </button>
            </div>
          ) : null}

          {tab === 'publish' ? (
            <div className="space-y-4">
              <div>
                <label className="label">وضعیت انتشار</label>
                <select value={form.status} onChange={(e) => set('status', e.target.value)} className="input text-xs">
                  <option value="active">فعال (نمایش در فروشگاه)</option>
                  <option value="draft">پیش‌نویس</option>
                  <option value="archived">آرشیو</option>
                </select>
              </div>
              <Switch checked={form.featured} onChange={(v) => set('featured', v)} label="نمایش در بخش «منتخب‌های EasyShop»" />
              <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 text-[11px] leading-6 text-brand-200">
                نکته سئو: عنوان محصول را با نام برند و مدل کامل بنویسید و از توضیحات تولیدشده با هوش مصنوعی استفاده کنید تا در
                نتایج گوگل بهتر دیده شوید.
              </div>
            </div>
          ) : null}
        </div>

        {/* ستون کنار */}
        <aside className="space-y-4">
          <div className="card p-4">
            <p className="mb-3 text-xs font-bold text-white">پیش‌نمایش</p>
            <div className="rounded-xl border border-white/10 p-3">
              <div className="mb-3 grid h-36 place-items-center overflow-hidden rounded-lg bg-ink-700">
                {form.images[0] ? <img src={form.images[0]} alt="preview" className="h-full w-full object-cover" /> : <ImageIcon className="h-8 w-8 text-slate-600" />}
              </div>
              <p className="line-clamp-2 text-xs font-bold text-slate-100">{form.name || 'نام محصول'}</p>
              <p className="mt-1 text-[10px] text-slate-500">{form.short_desc || 'توضیح کوتاه محصول'}</p>
              <p className="mt-2 text-sm font-extrabold text-brand-300">{form.price ? toman(form.price) : '۰ تومان'}</p>
            </div>
          </div>

          <div className="card p-4 text-[11px] leading-6 text-slate-400">
            <p className="mb-2 text-xs font-bold text-white">راهنمای سریع</p>
            <ul className="space-y-1.5">
              <li>• برای ایجاد سریع، از دکمه «تولید محتوا با AI» استفاده کنید.</li>
              <li>• تصویر اصلی اولین تصویر فهرست است.</li>
              <li>• قیمت قبل از تخفیف، درصد تخفیف را در فروشگاه نمایش می‌دهد.</li>
              <li>• واریانت‌ها برای رنگ/سایز/نسخه کاربرد دارند.</li>
            </ul>
          </div>
        </aside>
      </div>

      <AiProductStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        productId={id}
        initial={{ brief: form.name, brand: form.brand, price: form.price }}
        onCreated={(data) => {
          if (data?.product && !data.created_product) applyAiProduct(data);
        }}
      />
    </div>
  );
}
