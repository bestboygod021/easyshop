import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, Bot, Sparkles, User, CheckCheck, Wifi, WifiOff } from 'lucide-react';
import { get, patch, post, qs } from '../../lib/api';
import { realtime } from '../../lib/realtime';
import { CHAT_STATUS, timeAgo, initials } from '../../lib/format';
import { Badge, EmptyState, Loading, Spinner, StatusBadge, Tabs } from '../../components/ui';
import { toast } from '../../store';

export default function ChatInbox() {
  const [conversations, setConversations] = useState(null);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [connection, setConnection] = useState(realtime.connected);
  const endRef = useRef(null);

  const loadList = () => {
    get(`/chat/conversations?${qs({ limit: 50 })}`)
      .then((d) => {
        setConversations(d.items);
        if (!active && d.items[0]) openConversation(d.items[0]);
      })
      .catch(() => setConversations([]));
  };

  const openConversation = async (conv) => {
    setActive(conv);
    try {
      const detail = await get(`/chat/conversations/${conv.id}`);
      setMessages(detail.conversation.messages || []);
      realtime.send({ type: 'join_conversation', conversation_id: conv.id });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    const off = realtime.on((msg) => {
      if (msg.type === 'socket:open') setConnection(true);
      if (msg.type === 'socket:close' || msg.type === 'socket:error') setConnection(false);
      if (msg.type === 'chat:message') {
        if (msg.message?.conversation_id === active?.id) {
          setMessages((m) => (m.find((x) => x.id === msg.message.id) ? m : [...m, msg.message]));
        }
        loadList();
      }
      if (msg.type === 'conversation:update') loadList();
    });
    return off;
  }, [active?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !active) return;
    setSending(true);
    try {
      const res = await post(`/chat/conversations/${active.id}/messages`, { body: input });
      setMessages((m) => (m.find((x) => x.id === res.message.id) ? m : [...m, res.message]));
      setInput('');
      loadList();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const suggest = async () => {
    if (!active) return;
    setAiBusy(true);
    try {
      const res = await post('/chat/ai-suggest', { conversation_id: active.id });
      setInput(res.suggestion);
      toast('پیشنهاد هوش مصنوعی در کادر متن قرار گرفت.', 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const changeStatus = async (next) => {
    try {
      await patch(`/chat/conversations/${active.id}`, { status: next });
      toast('وضعیت گفتگو تغییر کرد.');
      loadList();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const filtered = useMemo(() => (conversations || []).filter((c) => !status || c.status === status), [conversations, status]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <MessageSquare className="h-5 w-5 text-brand-400" /> گفتگوهای زنده
          </h1>
          <p className="mt-1 text-xs text-slate-500">ارتباط مستقیم با مشتریان روی WebSocket — پاسخ لحظه‌ای</p>
        </div>
        <Badge color={connection ? 'emerald' : 'rose'} className="!py-1.5">
          {connection ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {connection ? 'اتصال زنده برقرار است' : 'اتصال زنده قطع است'}
        </Badge>
      </header>

      <Tabs
        tabs={[
          { value: '', label: 'همه' },
          ...Object.entries(CHAT_STATUS).map(([v, s]) => ({ value: v, label: s.label })),
        ]}
        active={status}
        onChange={setStatus}
      />

      {!conversations ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="card max-h-[70vh] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <EmptyState title="گفتگویی نیست" icon={MessageSquare} />
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c)}
                  className={`mb-1 flex w-full items-start gap-2.5 rounded-xl p-3 text-right transition ${active?.id === c.id ? 'bg-brand-500/15' : 'hover:bg-white/5'}`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-[10px] font-bold text-white">
                    {initials(c.user?.full_name || c.guest_name || 'مهمان')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-bold text-slate-200">{c.user?.full_name || c.guest_name || 'مهمان'}</span>
                      {c.unread_admin > 0 ? (
                        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{c.unread_admin}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">{c.last_message}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <StatusBadge {...(CHAT_STATUS[c.status] || { label: c.status })} />
                      <span className="text-[9px] text-slate-600">{timeAgo(c.last_message_at)}</span>
                    </span>
                  </span>
                </button>
              ))
            )}
          </aside>

          <section className="card flex h-[70vh] flex-col overflow-hidden">
            {!active ? (
              <EmptyState title="یک گفتگو را انتخاب کنید" icon={MessageSquare} />
            ) : (
              <>
                <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-[10px] font-bold text-white">
                    {initials(active.user?.full_name || active.guest_name || 'مهمان')}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-100">{active.user?.full_name || active.guest_name || 'مهمان'}</p>
                    <p className="text-[10px] text-slate-500">
                      {active.user?.email || active.guest_email || 'بدون ایمیل'} · {active.subject}
                    </p>
                  </div>
                  <select value={active.status} onChange={(e) => changeStatus(e.target.value)} className="input w-auto py-1.5 text-[10px]">
                    {Object.entries(CHAT_STATUS).map(([v, s]) => (
                      <option key={v} value={v}>{s.label}</option>
                    ))}
                  </select>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.map((m) => {
                    const staff = m.sender_role !== 'customer' && m.sender_role !== 'guest';
                    return (
                      <div key={m.id} className={`flex ${staff ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-6 ${staff ? 'bg-brand-500/90 text-white' : 'border border-white/10 bg-white/5 text-slate-200'}`}>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className={`mt-1 flex items-center gap-1 text-[9px] ${staff ? 'text-white/70' : 'text-slate-500'}`}>
                            {m.sender_name} · {timeAgo(m.created_at)}
                            {staff ? <CheckCheck className="h-3 w-3 shadow" /> : null}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>

                <footer className="border-t border-white/10 p-3">
                  <div className="flex items-center gap-2">
                    <button onClick={suggest} disabled={aiBusy} className="btn-ghost !px-3" title="پیشنهاد پاسخ با AI">
                      {aiBusy ? <Spinner className="h-4 w-4" /> : <Bot className="h-4 w-4 text-brand-300" />}
                    </button>
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && send()}
                      placeholder="پاسخ خود را بنویسید… (Enter برای ارسال)"
                      className="input !py-2 text-xs"
                    />
                    <button onClick={send} disabled={sending || !input.trim()} className="btn-primary !px-3 !py-2">
                      {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-600">
                    <Sparkles className="h-3 w-3 text-brand-400" /> با دکمه ربات، هوش مصنوعی یک پاسخ پیشنهادی می‌سازد؛ قبل از ارسال
                    بازبینی کنید.
                  </p>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
