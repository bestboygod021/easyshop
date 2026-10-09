import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { Package, Sparkles, ArrowLeft } from 'lucide-react';
import { get } from '../lib/api';
import { number } from '../lib/format';
import { Loading, AiBadge } from '../components/ui';
import { toast } from '../store';

export default function Categories() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/categories')
      .then((d) => setItems(d.items))
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-5">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-white">دسته‌بندی محصولات</h1>
        <p className="mt-2 text-xs text-slate-500">
          {number(items.length)} دسته‌بندی اصلی و {number(items.reduce((s, c) => s + (c.children?.length || 0), 0))} زیردسته —
          همه‌چیز مرتب و قابل جستجو.
        </p>
      </div>

      <div className="space-y-6">
        {items.map((cat) => {
          const Icon = Icons[cat.icon] || Icons.Tag;
          return (
            <section key={cat.id} className="card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: `${cat.color}22`, color: cat.color }}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-white">{cat.name}</h2>
                    <p className="text-[11px] text-slate-500">{cat.description}</p>
                  </div>
                </div>
                <Link to={`/products?category=${cat.slug}`} className="link flex items-center gap-1 text-xs font-semibold">
                  {number(cat.product_count)} کالا <ArrowLeft className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {cat.children?.map((child) => {
                  const ChildIcon = Icons[child.icon] || Icons.Tag;
                  return (
                    <Link
                      key={child.id}
                      to={`/categories/${child.slug}`}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[11px] text-slate-300 transition hover:border-brand-500/40 hover:text-white"
                    >
                      <ChildIcon className="h-4 w-4" style={{ color: child.color }} />
                      <span className="flex-1">{child.name}</span>
                      <span className="text-[10px] text-slate-600">{number(child.product_count)}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-500/25 bg-brand-500/5 p-5">
        <p className="flex items-center gap-2 text-xs text-brand-200">
          <Sparkles className="h-4 w-4" /> دسته‌بندی مورد نظرتان را پیدا نکردید؟ با هوش مصنوعی بسازید.
        </p>
        <div className="flex gap-2">
          <AiBadge className="!py-1">تولید دسته‌بندی با AI در پنل مدیریت</AiBadge>
          <Link to="/products" className="btn-ghost btn-sm">
            <Package className="h-3.5 w-3.5" /> همه محصولات
          </Link>
        </div>
      </div>
    </div>
  );
}
