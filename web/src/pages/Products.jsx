import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  SlidersHorizontal, X, LayoutGrid, List, ArrowDownUp, Sparkles, Search as SearchIcon, Star,
} from 'lucide-react';
import { get, qs } from '../lib/api';
import { number, toman } from '../lib/format';
import { Badge, EmptyState, Pagination, Price, Rating, SmartImage, Spinner, Tabs } from '../components/ui';
import ProductCard, { ProductGrid } from '../components/ProductCard';
import { toast } from '../store';

const SORTS = [
  { value: 'newest', label: 'جدیدترین' },
  { value: 'popular', label: 'محبوب‌ترین' },
  { value: 'cheapest', label: 'ارزان‌ترین' },
  { value: 'expensive', label: 'گران‌ترین' },
  { value: 'rating', label: 'بیشترین امتیاز' },
  { value: 'discount', label: 'بیشترین تخفیف' },
];

export default function Products() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(localStorage.getItem('easyshop.view') || 'grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(params.get('q') || '');

  const filters = useMemo(
    () => ({
      q: params.get('q') || '',
      category: params.get('category') || '',
      brand: params.get('brand') || '',
      min_price: params.get('min_price') || '',
      max_price: params.get('max_price') || '',
      rating: params.get('rating') || '',
      in_stock: params.get('in_stock') || '',
      on_sale: params.get('on_sale') || '',
      featured: params.get('featured') || '',
      sort: params.get('sort') || 'newest',
      page: Number(params.get('page') || 1),
    }),
    [params],
  );

  useEffect(() => {
    get('/categories?flat=1').then((d) => setCategories(d.items.filter((c) => c.is_active))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = qs({ ...filters, limit: 24 });
      const res = await get(`/products?${query}`);
      setData(res);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (patch) => {
    const next = { ...Object.fromEntries(params.entries()), ...patch };
    Object.keys(next).forEach((k) => {
      if (next[k] === '' || next[k] === null || next[k] === undefined) delete next[k];
    });
    if (!('page' in patch)) delete next.page;
    setParams(next);
  };

  const activeFilters = ['q', 'category', 'brand', 'min_price', 'max_price', 'rating', 'in_stock', 'on_sale', 'featured'].filter(
    (k) => filters[k],
  );

  const FilterPanel = (
    <div className="space-y-5">
      <div>
        <label className="label">جستجو</label>
        <div className="relative">
          <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && update({ q: search })}
            placeholder="نام محصول یا برند…"
            className="input pr-10 text-xs"
          />
        </div>
      </div>

      <div>
        <label className="label">دسته‌بندی</label>
        <div className="max-h-56 space-y-1 overflow-y-auto pl-1">
          <button
            onClick={() => update({ category: '' })}
            className={`block w-full rounded-lg px-2.5 py-1.5 text-right text-xs ${!filters.category ? 'bg-brand-500/15 text-brand-300' : 'text-slate-400 hover:bg-white/5'}`}
          >
            همه دسته‌ها
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => update({ category: c.slug })}
              className={`block w-full rounded-lg px-2.5 py-1.5 text-right text-xs ${filters.category === c.slug ? 'bg-brand-500/15 text-brand-300' : 'text-slate-400 hover:bg-white/5'} ${c.parent_id ? 'pr-4 text-[11px]' : ''}`}
            >
              {c.name}
              <span className="mr-1 text-[10px] text-slate-600">({number(c.product_count)})</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">محدوده قیمت (تومان)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={filters.min_price}
            onChange={(e) => update({ min_price: e.target.value })}
            placeholder="از"
            className="input py-2 text-xs"
          />
          <input
            type="number"
            value={filters.max_price}
            onChange={(e) => update({ max_price: e.target.value })}
            placeholder="تا"
            className="input py-2 text-xs"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            [0, 1000000],
            [1000000, 5000000],
            [5000000, 20000000],
            [20000000, ''],
          ].map(([min, max], i) => (
            <button key={i} onClick={() => update({ min_price: min || '', max_price: max || '' })} className="chip border border-white/10 bg-white/5 text-slate-400 hover:border-brand-500/40">
              {max ? `${number(min / 1000000)}–${number(max / 1000000)} م` : 'بالای ۲۰ م'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">حداقل امتیاز</label>
        <div className="flex flex-wrap gap-1.5">
          {[4.5, 4, 3.5, 3].map((r) => (
            <button
              key={r}
              onClick={() => update({ rating: filters.rating === String(r) ? '' : String(r) })}
              className={`chip border ${filters.rating === String(r) ? 'border-amber-400/40 bg-amber-500/15 text-amber-300' : 'border-white/10 bg-white/5 text-slate-400'}`}
            >
              <Star className="h-3 w-3" /> {number(r)} به بالا
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {[
          { key: 'in_stock', label: 'فقط کالاهای موجود' },
          { key: 'on_sale', label: 'فقط کالاهای تخفیف‌دار' },
          { key: 'featured', label: 'منتخب EasyShop' },
        ].map((f) => (
          <label key={f.key} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={filters[f.key] === '1'}
              onChange={(e) => update({ [f.key]: e.target.checked ? '1' : '' })}
              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-brand-500"
            />
            {f.label}
          </label>
        ))}
      </div>

      {activeFilters.length ? (
        <button
          onClick={() => setParams({})}
          className="btn-ghost btn-sm w-full text-rose-300 hover:border-rose-500/40"
        >
          <X className="h-3.5 w-3.5" /> پاک‌کردن فیلترها ({number(activeFilters.length)})
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-3 py-5 sm:px-5">
      <nav className="mb-4 flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/" className="hover:text-brand-300">خانه</Link>
        <span>/</span>
        <span className="text-slate-300">فروشگاه</span>
        {filters.category ? (
          <>
            <span>/</span>
            <span className="text-slate-300">{categories.find((c) => c.slug === filters.category)?.name || filters.category}</span>
          </>
        ) : null}
      </nav>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
            {filters.q ? `نتایج جستجو برای «${filters.q}»` : 'همه محصولات'}
            {data ? <span className="text-xs font-normal text-slate-500">({number(data.total)} کالا)</span> : null}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFiltersOpen(true)} className="btn-ghost btn-sm lg:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5" /> فیلترها
          </button>
          <div className="relative">
            <ArrowDownUp className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })} className="input py-2 pr-9 text-xs">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="hidden gap-1 rounded-xl border border-white/10 bg-white/5 p-1 sm:flex">
            {[
              { key: 'grid', icon: LayoutGrid },
              { key: 'list', icon: List },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => {
                  setView(v.key);
                  localStorage.setItem('easyshop.view', v.key);
                }}
                className={`rounded-lg p-1.5 ${view === v.key ? 'bg-brand-500 text-white' : 'text-slate-400'}`}
              >
                <v.icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeFilters.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeFilters.map((k) => (
            <button key={k} onClick={() => update({ [k]: '' })} className="chip border border-brand-500/30 bg-brand-500/10 text-brand-300">
              {k === 'q' ? `جستجو: ${filters.q}` : k === 'category' ? `دسته: ${filters.category}` : k === 'brand' ? `برند: ${filters.brand}` : k === 'min_price' ? `از ${toman(filters.min_price, { withUnit: false })}` : k === 'max_price' ? `تا ${toman(filters.max_price, { withUnit: false })}` : k === 'rating' ? `امتیاز ${filters.rating}+` : k === 'in_stock' ? 'موجود' : k === 'on_sale' ? 'تخفیف‌دار' : 'منتخب'}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="card sticky top-32 hidden h-fit p-4 lg:block">{FilterPanel}</aside>

        <div>
          {loading ? (
            <ProductGrid loading products={[]} />
          ) : data?.items?.length === 0 ? (
            <EmptyState
              title="محصولی با این مشخصات یافت نشد"
              description="فیلترها را تغییر دهید یا جستجوی دیگری انجام دهید. دستیار هوشمند هم می‌تواند کمک کند."
              action={
                <Link to="/products" className="btn-primary btn-sm">
                  <Sparkles className="h-3.5 w-3.5" /> نمایش همه محصولات
                </Link>
              }
            />
          ) : view === 'grid' ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {data.items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <div className="mt-6">
                <Pagination page={data.page} pages={data.pages} onChange={(p) => update({ page: p })} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                {data.items.map((p) => (
                  <Link key={p.id} to={`/products/${p.slug}`} className="card card-hover flex gap-4 p-3">
                    <SmartImage src={p.thumbnail} alt={p.name} className="h-28 w-28 shrink-0 rounded-xl" fallbackText={p.name?.slice(0, 8)} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[10px] text-brand-300">{p.category_name}</span>
                      <h3 className="line-clamp-2 text-sm font-bold text-slate-100">{p.name}</h3>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{p.short_desc}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Rating value={p.rating} count={p.rating_count} />
                        {p.in_stock ? <Badge color="emerald">موجود</Badge> : <Badge color="rose">ناموجود</Badge>}
                        {p.discount_percent > 0 ? <Badge color="rose">٪{number(p.discount_percent)} تخفیف</Badge> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end justify-between">
                      <Price value={p.price} compareAt={p.compare_at_price} />
                      <span className="btn-primary btn-sm">مشاهده</span>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-6">
                <Pagination page={data.page} pages={data.pages} onChange={(p) => update({ page: p })} />
              </div>
            </>
          )}
        </div>
      </div>

      {filtersOpen ? (
        <div className="fixed inset-0 z-[130] lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setFiltersOpen(false)} />
          <aside className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-ink-850 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-white">فیلترها</h3>
              <button onClick={() => setFiltersOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            {FilterPanel}
            <button onClick={() => setFiltersOpen(false)} className="btn-primary mt-5 w-full">
              نمایش {data ? number(data.total) : ''} محصول
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
