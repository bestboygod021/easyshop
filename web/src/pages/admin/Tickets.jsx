import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, Search, Bot, UserCheck } from 'lucide-react';
import { get, patch, qs } from '../../lib/api';
import { PRIORITY, TICKET_STATUS, timeAgo, number } from '../../lib/format';
import { Badge, EmptyState, Loading, StatCard, StatusBadge, Tabs } from '../../components/ui';
import { useAuth, toast } from '../../store';

export default function AdminTickets() {
  const me = useAuth((s) => s.user);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [q, setQ] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [agents, setAgents] = useState([]);

  const load = useCallback(() => {
    setData(null);
    get(`/tickets?${qs({ status, priority, q: searchQ, limit: 50 })}`)
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  }, [status, priority, searchQ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    get('/tickets/meta').then((d) => setAgents(d.agents)).catch(() => {});
  }, []);

  const assign = async (ticket, agentId) => {
    try {
      await patch(`/tickets/${ticket.id}`, { assigned_to: agentId });
      toast('مسئول تیکت تعیین شد.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const setStatusFor = async (ticket, next) => {
    try {
      await patch(`/tickets/${ticket.id}`, { status: next });
      toast('وضعیت تیکت تغییر کرد.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const counts = data?.counts?.reduce((acc, c) => ({ ...acc, [c.status]: c.c }), {}) || {};

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <Ticket className="h-5 w-5 text-brand-400" /> تیکت‌های پشتیبانی
        </h1>
        <p className="mt-1 text-xs text-slate-500">مدیریت درخواست‌ها، تخصیص به کارشناسان و پاسخ‌گویی سریع</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="باز" value={number(counts.open || 0)} icon={Ticket} color="emerald" />
        <StatCard label="در انتظار" value={number(counts.pending || 0)} icon={Ticket} color="amber" />
        <StatCard label="پاسخ داده‌شده" value={number(counts.answered || 0)} icon={Ticket} color="brand" />
        <StatCard label="حل‌شده" value={number(counts.resolved || 0)} icon={Ticket} color="violet" />
        <StatCard label="بسته" value={number(counts.closed || 0)} icon={Ticket} color="slate" />
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setSearchQ(q)} placeholder="جستجوی موضوع یا کد تیکت…" className="input py-2 pr-10 text-xs" />
          </div>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input w-auto py-2 text-xs">
            <option value="">همه اولویت‌ها</option>
            {Object.entries(PRIORITY).map(([v, p]) => (
              <option key={v} value={v}>{p.label}</option>
            ))}
          </select>
          <button onClick={load} className="btn-ghost btn-sm">اعمال فیلتر</button>
        </div>
        <Tabs
          tabs={[{ value: '', label: 'همه' }, ...Object.entries(TICKET_STATUS).map(([v, s]) => ({ value: v, label: s.label, count: counts[v] }))]}
          active={status}
          onChange={setStatus}
        />
      </div>

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <EmptyState title="تیکتی یافت نشد" icon={Ticket} />
      ) : (
        <div className="space-y-2">
          {data.items.map((t) => (
            <div key={t.id} className="card flex flex-wrap items-center gap-3 p-4">
              <Link to={`/admin/tickets/${t.id}`} className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-100 hover:text-brand-300">{t.subject}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span className="font-bold text-slate-400">{t.code}</span>
                  <span>·</span>
                  <span>{t.user?.full_name || 'مهمان'}</span>
                  <span>·</span>
                  <span>{timeAgo(t.last_message_at || t.created_at)}</span>
                  <span>·</span>
                  <span>{number(t.message_count)} پیام</span>
                </p>
              </Link>
              <StatusBadge {...(TICKET_STATUS[t.status] || { label: t.status })} />
              <StatusBadge {...(PRIORITY[t.priority] || { label: t.priority })} />
              <select
                value={t.assigned_to?.id || ''}
                onChange={(e) => assign(t, e.target.value)}
                className="input w-auto py-1.5 text-[10px]"
              >
                <option value="">تخصیص به…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name}</option>
                ))}
              </select>
              <div className="flex gap-1.5">
                {t.status !== 'resolved' ? (
                  <button onClick={() => setStatusFor(t, 'resolved')} className="btn-ghost btn-sm text-emerald-300">حل شد</button>
                ) : null}
                {t.status !== 'closed' ? (
                  <button onClick={() => setStatusFor(t, 'closed')} className="btn-ghost btn-sm text-slate-300">بستن</button>
                ) : null}
                <Link to={`/admin/tickets/${t.id}`} className="btn-primary btn-sm">پاسخ</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-3 p-4 text-[11px] text-slate-400">
        <Bot className="h-4 w-4 text-brand-400" />
        در صفحه هر تیکت می‌توانید با یک کلیک از هوش مصنوعی «پیشنهاد پاسخ» بگیرید و آن را ویرایش و ارسال کنید.
        <span className="mr-auto flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5" /> کارشناس وارد‌شده: {me?.full_name}
        </span>
      </div>
    </div>
  );
}
