import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { MessageCircle, Send, Sparkles, X, Headphones, Bot, Paperclip, Check, CheckCheck } from 'lucide-react';
import { api, get, post, upload } from '../lib/api';
import { realtime } from '../lib/realtime';
import { timeAgo, toman } from '../lib/format';
import { useAuth, useUI, toast } from '../store';
import { SmartImage, Spinner, AiBadge } from './ui';

/**
 * ویجت ارتباط با مشتری و مدیر:
 * ۱) دستیار هوشمند خرید (هوش مصنوعی چندمدلی)
 * ۲) گفتگوی زنده با پشتیبانی (فروشنده/مدیر) روی WebSocket
 */
export default function ChatWidget() {
  const open = useUI((s) => s.chatOpen);
  const setOpen = useUI((s) => s.setChatOpen);
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState('ai');
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const off = realtime.on((msg) => {
      if (msg.type === 'chat:message' && msg.message?.sender_role !== 'customer' && !open) setUnread((u) => u + 1);
    });
    return off;
  }, [open]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 left-4 z-[110] flex items-center gap-2 rounded-2xl bg-gradient-to-l from-brand-600 to-violet-600 px-4 py-3 text-xs font-bold text-white shadow-glow transition hover:scale-105 lg:bottom-6"
      >
        <MessageCircle className="h-4 w-4" />
        گفتگو با پشتیبانی
        {unread > 0 ? (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px]">{unread}</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 left-3 z-[140] flex h-[520px] w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-850 shadow-2xl lg:bottom-6">
      <header className="flex items-center gap-2 border-b border-white/10 bg-gradient-to-l from-brand-600/20 to-violet-600/10 px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-500/20">
          {tab === 'ai' ? <Bot className="h-4 w-4 text-brand-300" /> : <Headphones className="h-4 w-4 text-emerald-300" />}
        </span>
        <div className="flex-1">
          <p className="text-xs font-bold text-white">{tab === 'ai' ? 'دستیار هوشمند EasyShop' : 'پشتیبانی آنلاین'}</p>
          <p className="text-[10px] text-slate-400">{tab === 'ai' ? 'پیشنهاد محصول با هوش مصنوعی' : 'پاسخ‌گویی تیم پشتیبانی'}</p>
        </div>
        <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex border-b border-white/10">
        {[
          { key: 'ai', label: 'دستیار هوشمند', icon: Sparkles },
          { key: 'live', label: 'گفتگو با پشتیبانی', icon: Headphones },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx('flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition', tab === t.key ? 'border-b-2 border-brand-500 text-brand-300' : 'text-slate-500 hover:text-slate-300')}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ai' ? <AiPanel /> : <LivePanel />}
    </div>
  );
}

/* ------------------------------ دستیار هوشمند ------------------------------ */
function AiPanel() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      body: 'سلام! 👋 من دستیار هوشمند EasyShop هستم. بگویید دنبال چه محصولی هستید — مثلاً «یک هدفون بی‌سیم خوب تا ۵ میلیون» — تا بهترین گزینه‌ها را پیشنهاد بدهم.',
      suggestions: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState('builtin');
  const endRef = useRef(null);

  useEffect(() => {
    get('/ai/models')
      .then((d) => {
        setProviders(d.providers.filter((p) => p.configured && p.enabled));
        const active = d.providers.find((p) => p.configured && p.enabled && p.slug !== 'builtin');
        if (active) setProvider(active.slug);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: 'user', body: text }]);
    setInput('');
    setBusy(true);
    try {
      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.body }));
      const data = await post('/ai/assistant', { message: text, history, provider });
      setMessages((m) => [...m, { role: 'assistant', body: data.reply, suggestions: data.suggestions || [], generator: data.generator }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', body: `⚠️ ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
            <div className={clsx('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-6', m.role === 'user' ? 'bg-brand-500/90 text-white' : 'border border-white/10 bg-white/5 text-slate-200')}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              {m.suggestions?.length ? (
                <div className="mt-2.5 space-y-2">
                  {m.suggestions.map((s) => (
                    <Link key={s.id} to={`/products/${s.slug}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2 transition hover:border-brand-500/40">
                      <SmartImage src={s.thumbnail} alt={s.name_fa} className="h-10 w-10 rounded-lg" fallbackText="کالا" />
                      <span className="flex-1">
                        <span className="block text-[11px] font-semibold text-slate-100">{s.name_fa}</span>
                        <span className="block text-[10px] text-brand-300">{toman(s.price)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
              {m.generator ? (
                <p className="mt-2 flex items-center gap-1 text-[9px] text-slate-500">
                  <AiBadge className="!px-1.5 !py-0.5">{m.generator.provider}</AiBadge>
                  {m.generator.model}
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {busy ? (
          <div className="flex justify-end">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-400">
              <Spinner className="h-3.5 w-3.5 text-brand-400" /> در حال فکر کردن…
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="border-t border-white/10 p-3">
        {providers.length > 1 ? (
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="input mb-2 !py-1.5 text-[10px]">
            {providers.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} — {p.default_model}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="مثلاً: تا ۵ میلیون هدفون خوب می‌خواهم"
            className="input !py-2 text-xs"
          />
          <button onClick={send} disabled={busy || !input.trim()} className="btn-primary !px-3 !py-2">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------- گفتگوی زنده ------------------------------ */
const GUEST_CHAT_KEY = 'easyshop.guestChat';

/** توکن گفتگوی مهمان فقط در همین مرورگر نگه‌داری می‌شود (سرور فقط هش را دارد) */
const guestStore = {
  read() {
    try {
      const raw = JSON.parse(localStorage.getItem(GUEST_CHAT_KEY) || 'null');
      return raw && raw.id && raw.token ? raw : null;
    } catch {
      return null;
    }
  },
  save(data) {
    try {
      if (data) localStorage.setItem(GUEST_CHAT_KEY, JSON.stringify(data));
      else localStorage.removeItem(GUEST_CHAT_KEY);
    } catch {
      /* ignore */
    }
  },
};

function LivePanel() {
  const user = useAuth((s) => s.user);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [guest, setGuest] = useState({ guest_name: '', guest_email: '' });
  const [typing, setTyping] = useState(false);
  const [guestToken, setGuestToken] = useState(() => guestStore.read()?.token || '');
  const endRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        if (!user) {
          // بازیابی گفتگوی مهمان با توکن اختصاصی همان گفتگو
          const saved = guestStore.read();
          if (!saved) return;
          const detail = await get(`/chat/conversations/${saved.id}`, { headers: { 'x-guest-token': saved.token } });
          setConversation(detail.conversation);
          setMessages(detail.conversation.messages || []);
          setGuestToken(saved.token);
          realtime.send({ type: 'join_conversation', conversation_id: saved.id, guest_token: saved.token });
          return;
        }
        const data = await get('/chat/conversations');
        const conv = data.items?.[0];
        if (conv) {
          const detail = await get(`/chat/conversations/${conv.id}`);
          setConversation(detail.conversation);
          setMessages(detail.conversation.messages || []);
          realtime.send({ type: 'join_conversation', conversation_id: conv.id });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [user]);

  useEffect(() => {
    const off = realtime.on((msg) => {
      if (msg.type === 'chat:message' && msg.message?.conversation_id === conversation?.id) {
        setMessages((m) => (m.find((x) => x.id === msg.message.id) ? m : [...m, msg.message]));
      }
      if (msg.type === 'chat:typing' && msg.from?.role !== 'customer') setTyping(Boolean(msg.is_typing));
    });
    return off;
  }, [conversation?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const startOrSend = async () => {
    const body = input.trim();
    if (!body) return;
    setBusy(true);
    try {
      if (!conversation) {
        const payload = user ? { message: body } : { message: body, ...guest };
        const data = await post('/chat/conversations', payload);
        setConversation(data.conversation);
        setMessages(data.conversation.messages || []);
        if (data.guest_token) {
          guestStore.save({ id: data.conversation.id, token: data.guest_token });
          setGuestToken(data.guest_token);
        }
        realtime.send({ type: 'join_conversation', conversation_id: data.conversation.id, guest_token: data.guest_token });
      } else {
        realtime.send({ type: 'chat:send', conversation_id: conversation.id, body, guest_token: guestToken || undefined });
        setMessages((m) => [...m, { id: `local-${Date.now()}`, body, sender_role: user ? 'customer' : 'guest', sender_name: user?.full_name || guest.guest_name || 'من', created_at: new Date().toISOString(), pending: true }]);
      }
      setInput('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onType = () => {
    if (!conversation) return;
    realtime.send({ type: 'chat:typing', conversation_id: conversation.id, is_typing: true, guest_token: guestToken || undefined });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => realtime.send({ type: 'chat:typing', conversation_id: conversation.id, is_typing: false, guest_token: guestToken || undefined }),
      1600,
    );
  };

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {!conversation && messages.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-[11px] leading-6 text-slate-300">
            سلام 🌱 چطور می‌توانیم کمک کنیم؟ پیام خود را بنویسید؛ تیم پشتیبانی یا دستیار هوشمند در سریع‌ترین زمان پاسخ می‌دهد.
            {!user ? (
              <div className="mt-2 space-y-2">
                <input value={guest.guest_name} onChange={(e) => setGuest((g) => ({ ...g, guest_name: e.target.value }))} placeholder="نام شما" className="input !py-1.5 text-[11px]" />
                <input value={guest.guest_email} onChange={(e) => setGuest((g) => ({ ...g, guest_email: e.target.value }))} placeholder="ایمیل" className="input !py-1.5 text-[11px]" />
              </div>
            ) : null}
          </div>
        ) : null}

        {messages.map((m) => {
          const mine = m.sender_role === 'customer' || m.sender_role === 'guest';
          return (
            <div key={m.id} className={clsx('flex', mine ? 'justify-start' : 'justify-end')}>
              <div className={clsx('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-6', mine ? 'bg-brand-500/90 text-white' : 'border border-white/10 bg-white/5 text-slate-200')}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={clsx('mt-1 flex items-center gap-1 text-[9px]', mine ? 'text-white/70' : 'text-slate-500')}>
                  {!mine ? `${m.sender_name} · ` : ''}
                  {timeAgo(m.created_at)}
                  {m.pending ? <Check className="h-3 w-3" /> : <CheckCheck className="h-3 w-3 opacity-60" />}
                </p>
              </div>
            </div>
          );
        })}
        {typing ? <p className="text-[10px] text-emerald-300">پشتیبانی در حال نوشتن است…</p> : null}
        <div ref={endRef} />
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') startOrSend();
              else onType();
            }}
            placeholder={conversation ? 'پیام خود را بنویسید…' : 'شروع گفتگو…'}
            className="input !py-2 text-xs"
          />
          <button onClick={startOrSend} disabled={busy || !input.trim()} className="btn-primary !px-3 !py-2">
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[9px] text-slate-600">
          گفتگوها ذخیره می‌شوند تا تیم پشتیبانی در پنل مدیریت پاسخ دهد.
        </p>
      </div>
    </>
  );
}
