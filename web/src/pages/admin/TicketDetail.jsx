import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight, Headphones, Send, Sparkles, Lock, Star, Paperclip, CheckCircle2, UserCheck,
} from 'lucide-react';
import { get, post, patch } from '../../lib/api';
import { realtime } from '../../lib/realtime';
import { PRIORITY, TICKET_STATUS, date, timeAgo, initials } from '../../lib/format';
import { Badge, Loading, Spinner, StatusBadge, Switch } from '../../components/ui';
import { toast } from '../../store';

export default function AdminTicketDetail() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [agents, setAgents] = useState([]);
  const endRef = useRef(null);

  const load = useCallback(() =>
    get(`/tickets/${id}`)
      .then((d) => setTicket(d.ticket))
      .catch((e) => toast(e.message, 'error')), [id]);

  useEffect(() => {
    load();
    get('/tickets/meta').then((d) => setAgents(d.agents)).catch(() => {});
    const off = realtime.on((msg) => {
      if (msg.type === 'ticket:message' && msg.ticket_id === id) load();
      if (msg.type === 'ticket:reply' && msg.ticket?.id === id) load();
    });
    return off;
  }, [id, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      if (internal) {
        // پیام داخلی برای مشتری نمایش داده نمی‌شود
        await post(`/tickets/${id}/messages`, { body: text, is_internal: true });
      } else {
        await post(`/tickets/${id}/messages`, { body: text });
      }
      setText('');
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const suggest = async () => {
    setAiBusy(true);
    try {
      const res = await post('/ai/support-reply', { message: `موضوع تیکت: ${ticket?.subject}\nآخرین پیام مشتری: ${[...(ticket?.messages || [])].reverse().find((m) => m.author_role === 'customer')?.body || ticket?.subject}` });
      setText(res.reply || '');
      toast('پیشنهاد هوش مصنوعی آماده شد.', 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const change = async (payload) => {
    try {
      await patch(`/tickets/${id}`, payload);
      toast('تیکت به‌روزرسانی شد.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!ticket) return <Loading />;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/admin/tickets" className="flex items-center gap-1 hover:text-brand-300">
          <ArrowRight className="h-3 w-3" /> تیکت‌ها
        </Link>
        <span>/</span>
        <span className="font-mono text-slate-300">{ticket.code}</span>
      </nav>

      <header className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h1 className="truncate text-base font-extrabold text-white">{ticket.subject}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>{ticket.user?.full_name || 'مهمان'}</span>·<span>{ticket.user?.email}</span>·
            <span>{date(ticket.created_at, { withTime: true })}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge {...(TICKET_STATUS[ticket.status] || { label: ticket.status })} />
          <StatusBadge {...(PRIORITY[ticket.priority] || { label: ticket.priority })} />
          <select value={ticket.status} onChange={(e) => change({ status: e.target.value })} className="input w-auto py-1.5 text-[10px]">
            {Object.entries(TICKET_STATUS).map(([v, s]) => (
              <option key={v} value={v}>{s.label}</option>
            ))}
          </select>
          <select value={ticket.priority} onChange={(e) => change({ priority: e.target.value })} className="input w-auto py-1.5 text-[10px]">
            {Object.entries(PRIORITY).map(([v, p]) => (
              <option key={v} value={v}>{p.label}</option>
            ))}
          </select>
          <select value={ticket.assigned_to?.id || ''} onChange={(e) => change({ assigned_to: e.target.value })} className="input w-auto py-1.5 text-[10px]">
            <option value="">بدون مسئول</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="card flex h-[62vh] flex-col overflow-hidden">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {ticket.messages.map((m) => {
              const staff = m.author_role !== 'customer';
              return (
                <div key={m.id} className={`flex ${staff ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-6 ${
                      m.is_internal
                        ? 'border border-amber-500/30 bg-amber-500/10 text-amber-100'
                        : staff
                          ? 'bg-brand-500/90 text-white'
                          : 'border border-white/10 bg-white/5 text-slate-200'
                    }`}
                  >
                    {m.is_internal ? (
                      <p className="mb-1 flex items-center gap-1 text-[9px] font-bold text-amber-300">
                        <Lock className="h-2.5 w-2.5" /> یادداشت داخلی
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1 text-[9px] ${staff && !m.is_internal ? 'text-white/70' : 'text-slate-500'}`}>
                      {m.author_name} · {timeAgo(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <footer className="border-t border-white/10 p-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="پاسخ خود را بنویسید…"
              className="input text-xs"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Switch checked={internal} onChange={setInternal} label="یادداشت داخلی (برای مشتری نمایش داده نمی‌شود)" />
              <button onClick={suggest} disabled={aiBusy} className="btn-ghost btn-sm mr-auto">
                {aiBusy ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5 text-brand-300" />} پیشنهاد پاسخ با AI
              </button>
              <button onClick={send} disabled={sending || !text.trim()} className="btn-primary btn-sm">
                {sending ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} ارسال
              </button>
            </div>
          </footer>
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <UserCheck className="h-4 w-4 text-brand-400" /> مشتری
            </h3>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-[11px] font-bold text-white">
                {initials(ticket.user?.full_name || 'مهمان')}
              </span>
              <div>
                <p className="text-xs font-bold text-slate-200">{ticket.user?.full_name || 'مهمان'}</p>
                <p className="text-[10px] text-slate-500">{ticket.user?.phone || 'شماره ثبت نشده'}</p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-[11px] text-slate-400">
              <p>دسته: <b className="text-slate-200">{ticket.category}</b></p>
              <p>تعداد پیام: <b className="text-slate-200">{ticket.message_count}</b></p>
              <p>آخرین فعالیت: <b className="text-slate-200">{timeAgo(ticket.last_message_at || ticket.created_at)}</b></p>
              {ticket.order_id ? <p>سفارش مرتبط: <b className="text-slate-200">{ticket.order_id}</b></p> : null}
              {ticket.satisfaction ? (
                <p className="flex items-center gap-1 text-amber-300">
                  رضایت مشتری:
                  {Array.from({ length: ticket.satisfaction }).map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-current" />
                  ))}
                </p>
              ) : null}
            </div>
          </div>

          <div className="card space-y-2 p-5">
            <h3 className="text-sm font-bold text-white">اقدامات سریع</h3>
            <button onClick={() => change({ status: 'answered' })} className="btn-ghost btn-sm w-full">
              <Headphones className="h-3.5 w-3.5" /> علامت‌گذاری به‌عنوان پاسخ‌داده‌شده
            </button>
            <button onClick={() => change({ status: 'resolved' })} className="btn-ghost btn-sm w-full text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> حل شد
            </button>
            <button onClick={() => change({ status: 'closed' })} className="btn-ghost btn-sm w-full">
              بستن تیکت
            </button>
          </div>

          <div className="card p-5 text-[10px] leading-6 text-slate-500">
            <p className="flex items-center gap-1.5">
              <Paperclip className="h-3 w-3" /> پیوست‌ها در نسخه بعدی به‌صورت کامل نمایش داده می‌شوند.
            </p>
            <p>یادداشت‌های داخلی در ستون سمت راست با رنگ کهربایی مشخص می‌شوند و هرگز برای مشتری ارسال نمی‌شوند.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
