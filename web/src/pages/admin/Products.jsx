import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Filter, Pencil, Trash2, Sparkles, Boxes, BadgeCheck, Eye, TrendingDown, Wand2,
} from 'lucide-react';
import { del, get, patch, post, qs } from '../../lib/api';
import { number, toman, fa } from '../../lib/format';
import { Badge, EmptyState, Loading, Pagination, SmartImage, Tabs, Modal } from '../../components/ui';
import AiProductStudio from '../../components/AiProductStudio';
import { toast } from '../../store';

export default function AdminProducts() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState(params.get('q') || '');
  const [studioOpen, setStudioOpen] = useState(false);
  const [stockItem, setStockItem] = useState(null);
  const [stockDelta, setStockDelta] = useState(0);

  const query = params.get('q') || '';
  const status = params.get('status') || '';
  const category = params.get('category') || '';
  const page = Number(params.get('page') || 1);
  const sort = params.get('sort') || 'newest';

  const load = useCallback(() => {
    setData(null);
    get(`/products/admin/all?${qs({ status, category, q: query, sort, page, limit: 20 })}`)
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  }, [status, category, query, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setQ(query);
  }, [query]);

  useEffect(() => {
    get('/categories?flat=1').then((d) => setCategories(d.items)).catch(() => {});
  }, []);

  const update = (patchObj) => {
    const next = { ...Object.fromEntries(params.entries()), ...patchObj };
    Object.keys(next).forEach((k) => (next[k] === '' ? delete next[k] : null));
    if (!('page' in patchObj)) delete next.page;
    setParams(next);
  };

  const archive = async (product) => {
    if (!confirm(`آرشیو کردن «${product.name}»؟`)) return;
    try {
      await del(`/products/${product.id}`);
      toast('محصول آرشیو شد.', 'info');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggleStatus = async (product) => {
    try {
      await patch(`/products/${product.id}`, { status: product.status === 'active' ? 'draft' : 'active' });
      toast('وضعیت محصول تغییر کرد.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const applyStock = async () => {
    try {
      await post(`/products/${stockItem.id}/stock`, { delta: Number(stockDelta), reason: 'ویرایش از پنل مدیریت' });
      toast('موجودی به‌روزرسانی شد.');
      setStockItem(null);
      setStockDelta(0);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-white">مدیریت محصولات</h1>
          <p className="mt-1 text-xs text-slate-500">
            {data ? `${number(data.total)} محصول` : 'در حال بارگذاری…'} — ایجاد دستی یا با هوش مصنوعی
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStudioOpen(true)} className="btn-primary btn-sm">
            <Sparkles className="h-3.5 w-3.5" /> ساخت محصول با AI
          </button>
          <Link to="/admin/products/new" className="btn-ghost btn-sm">
            <Plus className="h-3.5 w-3.5" /> محصول جدید (دستی)
          </Link>
        </div>
      </header>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && update({ q })}
              placeholder="جستجوی نام، برند یا نامک…"
              className="input py-2 pr-10 text-xs"
            />
          </div>
          <select value={category} onChange={(e) => update({ category: e.target.value })} className="input w-auto py-2 text-xs">
            <option value="">همه دسته‌ها</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => update({ sort: e.target.value })} className="input w-auto py-2 text-xs">
            <option value="newest">جدیدترین</option>
            <option value="cheapest">ارزان‌ترین</option>
            <option value="expensive">گران‌ترین</option>
            <option value="popular">پرفروش‌ترین</option>
            <option value="rating">بیشترین امتیاز</option>
          </select>
        </div>
        <Tabs
          tabs={[
            { value: '', label: 'همه' },
            { value: 'active', label: 'فعال' },
            { value: 'draft', label: 'پیش‌نویس' },
            { value: 'archived', label: 'آرشیو' },
          ]}
          active={status}
          onChange={(v) => update({ status: v })}
        />
      </div>

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="محصولی یافت نشد"
          description="با هوش مصنوعی در چند ثانیه محصول جدید بسازید."
          icon={Boxes}
          action={<button onClick={() => setStudioOpen(true)} className="btn-primary btn-sm"><Wand2 className="h-3.5 w-3.5" /> ساخت محصول با AI</button>}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>محصول</th>
                  <th>دسته‌بندی</th>
                  <th>قیمت</th>
                  <th>موجودی</th>
                  <th>فروش</th>
                  <th>امتیاز</th>
                  <th>وضعیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <SmartImage src={p.thumbnail} alt={p.name} className="h-11 w-11 rounded-lg" fallbackText={p.name?.slice(0, 6)} />
                        <div className="min-w-0">
                          <p className="max-w-[240px] truncate text-xs font-semibold text-slate-200">{p.name}</p>
                          <p className="text-[10px] text-slate-500">{p.sku} · {p.brand || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-[11px]">{p.category_name || '—'}</td>
                    <td>
                      <p className="text-xs font-bold text-brand-300">{toman(p.price)}</p>
                      {p.compare_at_price ? <p className="text-[10px] text-slate-500 line-through">{toman(p.compare_at_price, { withUnit: false })}</p> : null}
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          setStockItem(p);
                          setStockDelta(0);
                        }}
                        className={`chip ${p.stock === 0 ? 'bg-rose-500/15 text-rose-300' : p.stock <= 5 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}
                      >
                        {number(p.stock)} عدد
                      </button>
                    </td>
                    <td className="text-[11px]">{number(p.sold_count)}</td>
                    <td className="text-[11px] text-amber-300">{number(p.rating)} ★</td>
                    <td>
                      <Badge color={p.status === 'active' ? 'emerald' : p.status === 'draft' ? 'amber' : 'slate'}>
                        {p.status === 'active' ? 'فعال' : p.status === 'draft' ? 'پیش‌نویس' : 'آرشیو'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Link to={`/products/${p.slug}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="مشاهده">
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <Link to={`/admin/products/${p.id}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="ویرایش">
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <button onClick={() => toggleStatus(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="تغییر وضعیت">
                          <BadgeCheck className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => archive(p)} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10" title="آرشیو">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => update({ page: p })} />
        </>
      )}

      <AiProductStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onCreated={() => load()}
      />

      <Modal
        open={Boolean(stockItem)}
        onClose={() => setStockItem(null)}
        title={`اصلاح موجودی — ${stockItem?.name || ''}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setStockItem(null)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={applyStock} className="btn-primary btn-sm">ثبت</button>
          </div>
        }
      >
        <p className="text-xs text-slate-400">موجودی فعلی: <b className="text-white">{number(stockItem?.stock || 0)}</b></p>
        <label className="label mt-4">مقدار افزایش/کاهش</label>
        <input type="number" value={stockDelta} onChange={(e) => setStockDelta(e.target.value)} className="input text-xs" />
        <p className="mt-3 text-[11px] text-slate-500">
          موجودی جدید: <b className="text-brand-300">{number((stockItem?.stock || 0) + Number(stockDelta || 0))}</b>
        </p>
        <div className="mt-3 flex gap-2">
          {[10, 25, 50, -5].map((d) => (
            <button key={d} onClick={() => setStockDelta(d)} className="chip border border-white/10 bg-white/5 text-slate-300">
              {d > 0 ? `+${fa(d)}` : fa(d)}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
