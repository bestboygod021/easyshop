import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Package, Truck, MapPin, CreditCard, XCircle, RotateCcw, CheckCircle2, Clock, ChevronRight,
} from 'lucide-react';
import { get, post } from '../../lib/api';
import { ORDER_STATUS, number, toman, date } from '../../lib/format';
import { Badge, InfoRow, Loading, StatusBadge, Modal } from '../../components/ui';
import { toast } from '../../store';

const FLOW = ['pending', 'paid', 'processing', 'packed', 'shipped', 'delivered'];

export default function OrderDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => get(`/orders/${id}`).then(setData).catch((e) => toast(e.message, 'error'));

  useEffect(() => {
    load();
  }, [id]);

  if (!data?.order) return <Loading />;
  const o = data.order;
  const currentIndex = FLOW.indexOf(o.status);

  const doCancel = async () => {
    setBusy(true);
    try {
      const res = await post(`/orders/${id}/cancel`, { reason });
      toast(res.message);
      setCancelOpen(false);
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doReturn = async () => {
    try {
      const res = await post(`/orders/${id}/return`, { reason });
      toast(res.message);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/account/orders" className="hover:text-brand-300">سفارش‌های من</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-slate-300">{o.code}</span>
      </nav>

      <header className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-base font-extrabold text-white">سفارش {o.code}</h1>
          <p className="mt-1 text-[11px] text-slate-500">ثبت‌شده در {date(o.placed_at, { withTime: true })}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge {...(ORDER_STATUS[o.status] || { label: o.status })} />
          <Badge color={o.payment_status === 'paid' ? 'emerald' : 'amber'}>{o.payment_status_label}</Badge>
        </div>
      </header>

      {/* نوار پیشرفت */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          {FLOW.map((s, i) => {
            const done = currentIndex >= i && o.status !== 'cancelled';
            return (
              <div key={s} className="flex flex-1 flex-col items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center rounded-full ${done ? 'bg-brand-500 text-white' : 'bg-white/10 text-slate-500'}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </span>
                <span className={`text-center text-[10px] ${done ? 'text-brand-300' : 'text-slate-500'}`}>{ORDER_STATUS[s]?.label}</span>
                {i < FLOW.length - 1 ? <span className={`absolute hidden ${done ? 'bg-brand-500' : 'bg-white/10'} lg:block`} /> : null}
              </div>
            );
          })}
        </div>
        {o.tracking_code ? (
          <p className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-center text-[11px] text-cyan-200">
            کد رهگیری مرسوله: <span className="font-bold">{o.tracking_code}</span> — {o.shipping_carrier}
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-white">اقلام سفارش</h2>
            <div className="space-y-2">
              {o.items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                  <img src={it.thumbnail} alt={it.name_fa} className="h-14 w-14 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-100">{it.name_fa}</p>
                    {it.variant_name ? <p className="text-[10px] text-slate-500">{it.variant_name}</p> : null}
                    <p className="mt-1 text-[11px] text-slate-500">{toman(it.unit_price)} × {number(it.qty)}</p>
                  </div>
                  <span className="text-xs font-bold text-brand-300">{toman(it.total)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-white">تاریخچه سفارش</h2>
            <ol className="space-y-3">
              {o.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{ORDER_STATUS[e.status]?.label || e.status}</p>
                    <p className="text-[11px] text-slate-500">{e.note} — {date(e.created_at, { withTime: true })}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-white">صورت‌حساب</h2>
            <InfoRow label="جمع کالاها" value={toman(o.subtotal)} />
            {o.discount ? <InfoRow label="تخفیف" value={`−${toman(o.discount)}`} /> : null}
            <InfoRow label="هزینه ارسال" value={o.shipping_cost ? toman(o.shipping_cost) : 'رایگان'} />
            <InfoRow label="مالیات" value={toman(o.tax)} />
            <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-xs text-slate-400">مبلغ کل</span>
              <span className="text-base font-extrabold text-white">{toman(o.total)}</span>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <MapPin className="h-4 w-4 text-brand-400" /> آدرس تحویل
            </h2>
            <p className="text-xs leading-6 text-slate-300">
              {o.address?.receiver} — {o.address?.phone}
              <br />
              {o.address?.province}، {o.address?.city}، {o.address?.line}
              {o.address?.postal_code ? <><br />کد پستی: {o.address.postal_code}</> : null}
            </p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
              <Truck className="h-3.5 w-3.5" /> {o.shipping_carrier || 'پست پیشتاز'} ({o.shipping_method})
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
              <CreditCard className="h-3.5 w-3.5" /> {o.payments?.[0]?.provider === 'wallet' ? 'کیف پول' : o.payments?.[0]?.provider === 'cod' ? 'پرداخت در محل' : 'درگاه بانکی'}
              {o.payments?.[0]?.ref_id ? ` — کد پیگیری: ${o.payments[0].ref_id}` : ''}
            </div>
          </section>

          <section className="card space-y-2 p-5">
            {!['cancelled', 'refunded', 'delivered', 'shipped'].includes(o.status) ? (
              <button onClick={() => setCancelOpen(true)} className="btn-danger w-full">
                <XCircle className="h-4 w-4" /> لغو سفارش
              </button>
            ) : null}
            {o.status === 'delivered' ? (
              <button onClick={doReturn} className="btn-ghost w-full">
                <RotateCcw className="h-4 w-4" /> درخواست مرجوعی
              </button>
            ) : null}
            <Link to="/account/tickets" className="btn-ghost w-full">
              <Package className="h-4 w-4" /> ثبت مشکل / پیام به پشتیبانی
            </Link>
          </section>
        </aside>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="لغو سفارش"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setCancelOpen(false)} className="btn-ghost btn-sm">بستن</button>
            <button onClick={doCancel} disabled={busy} className="btn-danger btn-sm">{busy ? 'در حال لغو…' : 'تأیید لغو سفارش'}</button>
          </div>
        }
      >
        <p className="text-xs leading-6 text-slate-400">
          در صورت پرداخت قبلی، مبلغ به کیف پول شما بازگردانده می‌شود. علت لغو را بنویسید (اختیاری).
        </p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input mt-3 text-xs" placeholder="علت لغو…" />
      </Modal>
    </div>
  );
}
