import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Truck, Printer, User, MapPin, CreditCard, MessageSquare } from 'lucide-react';
import { get, patch } from '../../lib/api';
import { ORDER_STATUS, number, toman, date } from '../../lib/format';
import { Badge, Loading, StatusBadge } from '../../components/ui';
import { toast } from '../../store';

export default function AdminOrderDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ status: '', tracking_code: '', shipping_carrier: '', admin_note: '' });

  const load = () =>
    get(`/admin/orders?q=${id}`).then(() => {}).catch(() => {});
  // از مسیر عمومی سفارش برای کارمندان استفاده می‌کنیم
  useEffect(() => {
    get(`/orders/${id}`)
      .then((d) => {
        setData(d);
        setForm({
          status: d.order.status,
          tracking_code: d.order.tracking_code || '',
          shipping_carrier: d.order.shipping_carrier || '',
          admin_note: d.order.admin_note || '',
        });
      })
      .catch((e) => toast(e.message, 'error'));
  }, [id]);

  const save = async () => {
    try {
      await patch(`/admin/orders/${id}`, form);
      toast('سفارش به‌روزرسانی شد.');
      const d = await get(`/orders/${id}`);
      setData(d);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!data?.order) return <Loading />;
  const o = data.order;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/admin/orders" className="flex items-center gap-1 hover:text-brand-300">
          <ArrowRight className="h-3 w-3" /> سفارش‌ها
        </Link>
        <span>/</span>
        <span className="text-slate-300">{o.code}</span>
      </nav>

      <header className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-base font-extrabold text-white">سفارش {o.code}</h1>
          <p className="mt-1 text-[11px] text-slate-500">{date(o.placed_at, { withTime: true })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge {...(ORDER_STATUS[o.status] || { label: o.status_label })} />
          <Badge color={o.payment_status === 'paid' ? 'emerald' : 'amber'}>{o.payment_status_label}</Badge>
          <button onClick={() => window.print()} className="btn-ghost btn-sm">
            <Printer className="h-3.5 w-3.5" /> چاپ
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-white">اقلام</h2>
            <div className="space-y-2">
              {o.items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                  <img src={it.thumbnail} alt={it.name_fa} className="h-12 w-12 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-200">{it.name_fa}</p>
                    <p className="text-[10px] text-slate-500">{it.sku} · {toman(it.unit_price)} × {number(it.qty)}</p>
                  </div>
                  <span className="text-xs font-bold text-brand-300">{toman(it.total)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-white">گردش سفارش</h2>
            <ol className="space-y-3">
              {o.events.map((e) => (
                <li key={e.id} className="flex gap-3 border-b border-white/5 pb-3 last:border-0">
                  <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" />
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{ORDER_STATUS[e.status]?.label || e.status}</p>
                    <p className="text-[11px] text-slate-500">{e.note} — {e.actor_name} · {date(e.created_at, { withTime: true })}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <Truck className="h-4 w-4 text-cyan-400" /> به‌روزرسانی وضعیت
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">وضعیت</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="input text-xs">
                  {Object.entries(ORDER_STATUS).map(([v, s]) => (
                    <option key={v} value={v}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">شرکت حمل</label>
                <input value={form.shipping_carrier} onChange={(e) => setForm((f) => ({ ...f, shipping_carrier: e.target.value }))} className="input text-xs" />
              </div>
              <div>
                <label className="label">کد رهگیری</label>
                <input value={form.tracking_code} onChange={(e) => setForm((f) => ({ ...f, tracking_code: e.target.value }))} className="input text-xs" dir="ltr" />
              </div>
            </div>
            <div>
              <label className="label">یادداشت داخلی</label>
              <textarea value={form.admin_note} onChange={(e) => setForm((f) => ({ ...f, admin_note: e.target.value }))} rows={2} className="input text-xs" />
            </div>
            <button onClick={save} className="btn-primary btn-sm">ذخیره تغییرات</button>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <User className="h-4 w-4 text-brand-400" /> مشتری
            </h2>
            <p className="text-xs text-slate-300">{o.customer?.name || 'مهمان'}</p>
            <p className="mt-1 text-[11px] text-slate-500">{o.customer?.phone}</p>
            <p className="text-[11px] text-slate-500">{o.customer?.email}</p>
            {o.customer_note ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" /> {o.customer_note}
              </p>
            ) : null}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <MapPin className="h-4 w-4 text-brand-400" /> آدرس
            </h2>
            <p className="text-[11px] leading-6 text-slate-400">
              {o.address?.receiver} — {o.address?.phone}
              <br />
              {o.address?.province}، {o.address?.city}، {o.address?.line}
            </p>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <CreditCard className="h-4 w-4 text-emerald-400" /> مالی
            </h2>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between text-slate-400"><span>جمع کالاها</span><span>{toman(o.subtotal)}</span></div>
              {o.discount ? <div className="flex justify-between text-emerald-400"><span>تخفیف</span><span>−{toman(o.discount)}</span></div> : null}
              <div className="flex justify-between text-slate-400"><span>ارسال</span><span>{toman(o.shipping_cost)}</span></div>
              <div className="flex justify-between text-slate-400"><span>مالیات</span><span>{toman(o.tax)}</span></div>
              <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-extrabold text-white"><span>مبلغ کل</span><span>{toman(o.total)}</span></div>
            </div>
            {o.payments?.length ? (
              <div className="mt-3 space-y-1 text-[10px] text-slate-500">
                {o.payments.map((p) => (
                  <p key={p.id}>تراکنش {p.provider} — {p.status} {p.ref_id ? `(${p.ref_id})` : ''}</p>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
