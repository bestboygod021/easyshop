import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Send, Star, ShieldCheck, Bot } from 'lucide-react';
import { get, post } from '../../lib/api';
import { PRIORITY, TICKET_STATUS, date, timeAgo } from '../../lib/format';
import { Badge, Loading, StatusBadge, Spinner } from '../../components/ui';
import { useAuth, toast } from '../../store';

export default function TicketDetail() {
  const { id } = useParams();
  const user = useAuth((s) => s.user);
  const [data, setData] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const endRef = useRef(null);

  const load = () => get(`/tickets/${id}`).then(setData).catch((e) => toast(e.message, 'error'));

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.ticket?.messages?.length]);

  if (!data?.ticket) return <Loading />;
  const t = data.ticket;
  const isStaff = ['admin', 'support', 'seller'].includes(user?.role);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await post(`/tickets/${id}/messages`, { body });
      setData(res);
      setBody('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const askAi = async () => {
    setAiBusy(true);
    try {
      const res = await post('/ai/support-reply', { message: [...(t.messages || [])].reverse().find((m) => m.author_role !== 'customer')?.body || t.subject });
      setAiReply(res.reply);
      toast('پیشنهاد هوش مصنوعی آماده است.', 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/account/tickets" className="flex items-center gap-1 hover:text-brand-300">
          <ArrowRight className="h-3 w-3" /> تیکت‌های من
        </Link>
      </nav>

      <header className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-extrabold text-white">{t.subject}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>{t.code}</span>·<span>{date(t.created_at, { withTime: true })}</span>
              {t.order_id ? <Badge color="cyan">مرتبط با سفارش</Badge> : null}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge {...(TICKET_STATUS[t.status] || { label: t.status })} />
            <StatusBadge {...(PRIORITY[t.priority] || { label: t.priority })} />
          </div>
        </div>
      </header>

      <section className="card space-y-3 p-5">
        {t.messages.map((m) => {
          const mine = m.user_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] rounded-2xl border p-4 ${mine ? 'border-brand-500/25 bg-brand-500/10' : 'border-white/10 bg-white/5'}`}>
                <p className="flex items-center gap-2 text-[11px] font-bold text-slate-200">
                  {m.author_name}
                  <Badge color={m.author_role === 'customer' ? 'slate' : 'indigo'}>
                    {m.author_role === 'customer' ? 'مشتری' : 'پشتیبانی'}
                  </Badge>
                </p>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-300">{m.body}</p>
                <p className="mt-2 text-[10px] text-slate-600">{timeAgo(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </section>

      <section className="card p-5">
        {isStaff ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button onClick={askAi} disabled={aiBusy} className="btn-ghost btn-sm">
              <Bot className="h-3.5 w-3.5 text-brand-300" /> {aiBusy ? 'در حال تولید…' : 'پیشنهاد پاسخ با هوش مصنوعی'}
            </button>
            <select
              onChange={(e) => post(`/tickets/${id}`, { status: e.target.value }, {}).then(load).catch(() => {})}
              className="input w-auto py-1.5 text-[11px]"
              defaultValue=""
            >
              <option value="" disabled>تغییر وضعیت…</option>
              {Object.entries(TICKET_STATUS).map(([v, s]) => (
                <option key={v} value={v}>{s.label}</option>
              ))}
            </select>
          </div>
        ) : null}

        {aiReply ? (
          <div className="mb-3 rounded-xl border border-brand-500/25 bg-brand-500/5 p-3">
            <p className="text-[11px] font-bold text-brand-200">پیشنهاد پاسخ</p>
            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-6 text-slate-300">{aiReply}</p>
            <button onClick={() => setBody(aiReply)} className="btn-ghost btn-sm mt-2">استفاده از این متن</button>
          </div>
        ) : null}

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="پاسخ خود را بنویسید…"
          className="input text-xs"
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-[10px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> پیام شما برای تیم پشتیبانی ارسال می‌شود.
          </p>
          <button onClick={send} disabled={busy || !body.trim()} className="btn-primary btn-sm">
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} ارسال پیام
          </button>
        </div>
      </section>

      {t.status === 'resolved' && !t.satisfaction ? (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-xs text-slate-300">از کیفیت پاسخ‌گویی ما چقدر راضی بودید؟</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={async () => {
                  await post(`/tickets/${id}`, { satisfaction: s }, {});
                  toast('ممنون از بازخورد شما!');
                  load();
                }}
              >
                <Star className="h-5 w-5 text-amber-400 hover:fill-amber-400" />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
