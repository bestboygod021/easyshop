import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Search, Truck, Download, Printer } from 'lucide-react';
import { api, get, patch, qs } from '../../lib/api';
import { ORDER_STATUS, number, toman, date, timeAgo } from '../../lib/format';
import { Badge, EmptyState, Loading, Modal, Pagination, StatusBadge, Tabs } from '../../components/ui';
import { toast } from '../../store';

export default function AdminOrders() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ status: '', tracking_code: '', shipping_carrier: '', admin_note: '' });

  const load = () => {
    setData(null);
    get(`/admin/orders?${qs({ status, q, page, limit: 20 })}`)
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  };

  useEffect(() => {
    load();
  }, [status, page]);

  const openOrder = (o) => {
    setSelected(o);
    setForm({ status: o.status, tracking_code: o.tracking_code || '', shipping_carrier: o.shipping_carrier || '', admin_note: o.admin_note || '' });
  };

  const saveOrder = async () => {
    try {
      await patch(`/admin/orders/${selected.id}`, form);
      toast('سفارش به‌روزرسانی شد.');
      setSelected(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  /**
   * خروجی CSV از سرور گرفته می‌شود تا مقادیر با csvSafe پاک‌سازی شده باشند
   * (جلوگیری از CSV/Formula Injection در Excel).
   */
  const exportCsv = async () => {
    try {
      const res = await api(`/admin/export/orders.csv?${qs({ status })}`, { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `easyshop-orders-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast('فایل CSV دانلود شد.');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <ShoppingBag className="h-5 w-5 text-brand-400" /> سفارش‌ها
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {data ? `${number(data.total)} سفارش — مجموع فروش موفق: ${toman(data.revenue)}` : 'در حال بارگذاری…'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn-ghost btn-sm">
            <Download className="h-3.5 w-3.5" /> خروجی CSV
          </button>
        </div>
      </header>

      <div className="card space-y-3 p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
            placeholder="جستجو بر اساس کد سفارش، نام یا ایمیل مشتری…"
            className="input py-2 pr-10 text-xs"
          />
        </div>
        <Tabs
          tabs={[
            { value: '', label: 'همه' },
            ...Object.entries(ORDER_STATUS).map(([v, s]) => ({ value: v, label: s.label, count: data?.counts?.find((c) => c.status === v)?.c })),
          ]}
          active={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <EmptyState title="سفارشی یافت نشد" icon={ShoppingBag} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>کد سفارش</th>
                  <th>مشتری</th>
                  <th>اقلام</th>
                  <th>مبلغ</th>
                  <th>پرداخت</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/admin/orders/${o.id}`} className="link font-bold">{o.code}</Link>
                      {o.tracking_code ? <p className="text-[10px] text-slate-500">{o.tracking_code}</p> : null}
                    </td>
                    <td>
                      <p className="text-xs text-slate-200">{o.customer?.name || 'مهمان'}</p>
                      <p className="text-[10px] text-slate-500">{o.customer?.phone || o.customer?.email || '—'}</p>
                    </td>
                    <td className="text-[11px]">{number(o.items.length)} قلم</td>
                    <td className="text-xs font-bold text-brand-300">{toman(o.total)}</td>
                    <td>
                      <Badge color={o.payment_status === 'paid' ? 'emerald' : o.payment_status === 'failed' ? 'rose' : 'amber'}>
                        {o.payment_status_label}
                      </Badge>
                    </td>
                    <td><StatusBadge {...(ORDER_STATUS[o.status] || { label: o.status_label })} /></td>
                    <td className="text-[11px] text-slate-500">{timeAgo(o.placed_at)}</td>
                    <td>
                      <button onClick={() => openOrder(o)} className="btn-ghost btn-sm">
                        <Truck className="h-3.5 w-3.5" /> مدیریت
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size="lg"
        title={`مدیریت سفارش ${selected?.code || ''}`}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Link to={`/admin/orders/${selected?.id}`} className="btn-ghost btn-sm">صفحه جزئیات</Link>
            <button onClick={saveOrder} className="btn-primary btn-sm">ذخیره تغییرات</button>
          </div>
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">وضعیت سفارش</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="input text-xs">
                  {Object.entries(ORDER_STATUS).map(([v, s]) => (
                    <option key={v} value={v}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">شرکت حمل</label>
                <input value={form.shipping_carrier} onChange={(e) => setForm((f) => ({ ...f, shipping_carrier: e.target.value }))} className="input text-xs" placeholder="پست پیشتاز / تیپاکس" />
              </div>
              <div>
                <label className="label">کد رهگیری پستی</label>
                <input value={form.tracking_code} onChange={(e) => setForm((f) => ({ ...f, tracking_code: e.target.value }))} className="input text-xs" dir="ltr" />
              </div>
              <div>
                <label className="label">یادداشت داخلی</label>
                <input value={form.admin_note} onChange={(e) => setForm((f) => ({ ...f, admin_note: e.target.value }))} className="input text-xs" />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-3">
              <p className="mb-2 text-[11px] font-bold text-slate-200">اقلام سفارش</p>
              {selected.items.map((it) => (
                <div key={it.id} className="flex items-center gap-2 border-b border-white/5 py-1.5 last:border-0">
                  <img src={it.thumbnail} alt={it.name_fa} className="h-8 w-8 rounded-lg object-cover" />
                  <span className="flex-1 truncate text-[11px] text-slate-300">{it.name_fa}</span>
                  <span className="text-[10px] text-slate-500">×{number(it.qty)}</span>
                  <span className="text-[11px] font-bold text-brand-300">{toman(it.total)}</span>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 p-3 text-[11px] leading-6 text-slate-400">
                <p className="mb-1 font-bold text-slate-200">اطلاعات مشتری</p>
                <p>{selected.customer?.name || 'مهمان'}</p>
                <p>{selected.customer?.phone || '—'}</p>
                <p>{selected.customer?.email || '—'}</p>
              </div>
              <div className="rounded-xl border border-white/10 p-3 text-[11px] leading-6 text-slate-400">
                <p className="mb-1 font-bold text-slate-200">آدرس تحویل</p>
                <p>{selected.address?.receiver} — {selected.address?.phone}</p>
                <p>{selected.address?.province}، {selected.address?.city}</p>
                <p>{selected.address?.line}</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-3">
              <p className="mb-2 text-[11px] font-bold text-slate-200">تاریخچه</p>
              {selected.events?.map((e) => (
                <p key={e.id} className="border-b border-white/5 py-1 text-[11px] text-slate-400 last:border-0">
                  <b className="text-slate-300">{ORDER_STATUS[e.status]?.label || e.status}</b> — {e.note} · {date(e.created_at, { withTime: true })}
                </p>
              ))}
            </div>

            <button onClick={() => window.print()} className="btn-ghost btn-sm">
              <Printer className="h-3.5 w-3.5" /> چاپ فاکتور
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
