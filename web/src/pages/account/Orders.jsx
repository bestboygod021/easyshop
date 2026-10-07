import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, Filter, Repeat } from 'lucide-react';
import { get, post, qs } from '../../lib/api';
import { ORDER_STATUS, number, toman, timeAgo } from '../../lib/format';
import { EmptyState, Loading, Pagination, StatusBadge, Tabs } from '../../components/ui';
import { toast } from '../../store';

export default function AccountOrders() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = (s = status, p = page) => {
    setData(null);
    get(`/orders?${qs({ status: s, page: p, limit: 10 })}`)
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  };

  useEffect(() => {
    load();
  }, [status, page]);

  const reorder = async (id) => {
    try {
      const res = await post(`/orders/${id}/reorder`, {});
      toast(res.message);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-base font-extrabold text-white">
          <Package className="h-5 w-5 text-brand-400" /> سفارش‌های من
        </h1>
        <p className="mt-1 text-xs text-slate-500">پیگیری وضعیت، مشاهده جزئیات و سفارش مجدد</p>
      </header>

      <Tabs
        tabs={[
          { value: '', label: 'همه' },
          { value: 'pending', label: 'در انتظار پرداخت' },
          { value: 'paid', label: 'پرداخت شده' },
          { value: 'processing', label: 'در حال پردازش' },
          { value: 'shipped', label: 'ارسال شده' },
          { value: 'delivered', label: 'تحویل شده' },
          { value: 'cancelled', label: 'لغو شده' },
        ]}
        active={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <EmptyState title="سفارشی یافت نشد" description="با این وضعیت سفارشی ثبت نشده است." icon={Package} action={<Link to="/products" className="btn-primary btn-sm">شروع خرید</Link>} />
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((o) => (
              <div key={o.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-100">سفارش {o.code}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{timeAgo(o.placed_at)} · {number(o.items.length)} کالا</p>
                  </div>
                  <StatusBadge {...(ORDER_STATUS[o.status] || { label: o.status })} />
                  <span className="mr-auto text-sm font-extrabold text-brand-300">{toman(o.total)}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {o.items.slice(0, 4).map((it) => (
                    <div key={it.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                      <img src={it.thumbnail} alt={it.name_fa} className="h-9 w-9 rounded-lg object-cover" />
                      <span className="max-w-[160px] truncate text-[11px] text-slate-300">{it.name_fa}</span>
                      <span className="text-[10px] text-slate-500">×{number(it.qty)}</span>
                    </div>
                  ))}
                  {o.items.length > 4 ? <span className="self-center text-[11px] text-slate-500">+{number(o.items.length - 4)} کالای دیگر</span> : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <Link to={`/account/orders/${o.id}`} className="btn-ghost btn-sm">
                    مشاهده جزئیات
                  </Link>
                  <button onClick={() => reorder(o.id)} className="btn-ghost btn-sm">
                    <Repeat className="h-3.5 w-3.5" /> سفارش مجدد
                  </button>
                  {o.tracking_code ? (
                    <span className="chip border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
                      کد رهگیری: {o.tracking_code}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
