import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, Plus, MessageSquare } from 'lucide-react';
import { get, post } from '../../lib/api';
import { PRIORITY, TICKET_STATUS, timeAgo, number } from '../../lib/format';
import { EmptyState, Loading, Modal, StatusBadge, Tabs } from '../../components/ui';
import { toast } from '../../store';

export default function Tickets() {
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '', category: 'general', priority: 'normal' });
  const [busy, setBusy] = useState(false);

  const load = (s = status) => {
    setItems(null);
    get(`/tickets${s ? `?status=${s}` : ''}`)
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  };

  useEffect(() => {
    load();
  }, [status]);

  const submit = async () => {
    setBusy(true);
    try {
      const data = await post('/tickets', form);
      toast(`تیکت ${data.ticket.code} ثبت شد.`);
      setOpen(false);
      setForm({ subject: '', body: '', category: 'general', priority: 'normal' });
      load();
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
          <h1 className="flex items-center gap-2 text-base font-extrabold text-white">
            <Ticket className="h-5 w-5 text-brand-400" /> تیکت‌های پشتیبانی
          </h1>
          <p className="mt-1 text-xs text-slate-500">پیگیری درخواست‌ها و گفتگو با تیم پشتیبانی</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" /> تیکت جدید
        </button>
      </header>

      <Tabs
        tabs={[
          { value: '', label: 'همه' },
          { value: 'open', label: 'باز' },
          { value: 'answered', label: 'پاسخ داده شده' },
          { value: 'pending', label: 'در انتظار' },
          { value: 'resolved', label: 'حل شده' },
          { value: 'closed', label: 'بسته' },
        ]}
        active={status}
        onChange={setStatus}
      />

      {!items ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState title="تیکتی یافت نشد" description="اگر پرسش یا مشکلی دارید، تیکت جدید ثبت کنید." icon={Ticket} />
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <Link key={t.id} to={`/account/tickets/${t.id}`} className="card card-hover flex flex-wrap items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10">
                <MessageSquare className="h-4 w-4 text-brand-300" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-100">{t.subject}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span>{t.code}</span>
                  <span>·</span>
                  <span>{timeAgo(t.last_message_at || t.created_at)}</span>
                  <span>·</span>
                  <span>{number(t.message_count)} پیام</span>
                  {t.assigned_to ? <><span>·</span><span>پشتیبان: {t.assigned_to.full_name}</span></> : null}
                </p>
              </div>
              <StatusBadge {...(TICKET_STATUS[t.status] || { label: t.status })} />
              <StatusBadge {...(PRIORITY[t.priority] || { label: t.priority })} />
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="ثبت تیکت جدید"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={submit} disabled={busy} className="btn-primary btn-sm">{busy ? 'در حال ارسال…' : 'ارسال تیکت'}</button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">موضوع</label>
            <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="input text-xs" placeholder="مثلاً: مشکل در پرداخت سفارش" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">دسته‌بندی</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input text-xs">
                {[['general', 'عمومی'], ['order', 'سفارش'], ['shipping', 'ارسال'], ['billing', 'مالی'], ['returns', 'مرجوعی'], ['technical', 'فنی'], ['coupon', 'کد تخفیف']].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">اولویت</label>
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="input text-xs">
                {Object.entries(PRIORITY).map(([v, p]) => (
                  <option key={v} value={v}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">متن پیام</label>
            <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={4} className="input text-xs" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
