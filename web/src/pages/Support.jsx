import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Headphones, MessageSquarePlus, Ticket, Phone, Mail, Clock, HelpCircle, Sparkles, Send, ChevronLeft,
  Bot, Mic, CheckCircle2, Truck, RotateCcw, CreditCard, Wrench,
} from 'lucide-react';
import { get, post } from '../lib/api';
import { useAuth, useUI, toast } from '../store';
import { Badge, EmptyState, Spinner, StatusBadge, Tabs } from '../components/ui';
import { PRIORITY, TICKET_STATUS, timeAgo } from '../lib/format';
import { dictionaries } from '../lib/i18n';

const FAQS = [
  { icon: Truck, q: 'ارسال سفارش چند روز طول می‌کشد؟', a: 'سفارش‌های تهران ۱ تا ۲ روز کاری و شهرستان‌ها ۲ تا ۴ روز کاری با پست پیشتاز یا تیپاکس ارسال می‌شوند. کد رهگیری پس از ارسال در پنل کاربری نمایش داده می‌شود.' },
  { icon: RotateCcw, q: 'شرایط مرجوعی کالا چیست؟', a: 'تا ۷ روز پس از تحویل، در صورت سالم بودن کالا و بسته‌بندی، امکان مرجوعی وجود دارد. هزینه بازگشت برای کالاهای معیوب با فروشگاه است.' },
  { icon: CreditCard, q: 'چه روش‌های پرداختی پشتیبانی می‌شود؟', a: 'پرداخت آنلاین (درگاه بانکی)، کیف پول EasyShop، پرداخت در محل (برای تهران) و پرداخت با امتیاز باشگاه مشتریان.' },
  { icon: Wrench, q: 'گارانتی محصولات چگونه است؟', a: 'همه‌ی محصولات دارای گارانتی شرکتی هستند (معمولاً ۱۲ تا ۲۴ ماه). خدمات پس از فروش از طریق تیکت یا تماس تلفنی پیگیری می‌شود.' },
  { icon: HelpCircle, q: 'چطور سفارشم را پیگیری کنم؟', a: 'از مسیر «پنل کاربری ← سفارش‌های من» وضعیت لحظه‌ای سفارش، کد رهگیری پستی و تاریخ تحویل را مشاهده می‌کنید.' },
];

export default function Support() {
  const user = useAuth((s) => s.user);
  const setChatOpen = useUI((s) => s.setChatOpen);
  const navigate = useNavigate();
  const [tab, setTab] = useState('faq');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '', category: 'general', priority: 'normal' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    get('/tickets?limit=10')
      .then((d) => setTickets(d.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const createTicket = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login?next=/support');
    setSending(true);
    try {
      const data = await post('/tickets', form);
      toast(`تیکت ${data.ticket.code} ثبت شد.`);
      setTickets((t) => [data.ticket, ...t]);
      setForm({ subject: '', body: '', category: 'general', priority: 'normal' });
      setTab('tickets');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 rounded-3xl border border-white/10 bg-gradient-to-l from-brand-600/15 to-transparent p-6">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-white">
          <Headphones className="h-6 w-6 text-brand-400" /> مرکز پشتیبانی EasyShop
        </h1>
        <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-400">
          پاسخ سؤالات پرتکرار، ثبت تیکت و گفتگوی زنده با تیم پشتیبانی. متوسط زمان پاسخ‌گویی ما کمتر از ۲ ساعت است و
          دستیار هوشمند به‌صورت ۲۴ ساعته آماده‌ی راهنمایی شماست.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => setChatOpen(true)} className="btn-primary">
            <Sparkles className="h-4 w-4" /> گفتگوی زنده با پشتیبانی
          </button>
          <button onClick={() => setTab('new')} className="btn-ghost">
            <MessageSquarePlus className="h-4 w-4" /> ثبت تیکت جدید
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Phone, title: 'تماس تلفنی', value: '۰۲۱-۹۱۰۰۱۰۰۰', hint: 'شنبه تا پنجشنبه ۹ تا ۱۸' },
          { icon: Mail, title: 'ایمیل پشتیبانی', value: 'support@easyshop.ir', hint: 'پاسخ حداکثر ۶ ساعت' },
          { icon: Bot, title: 'دستیار هوشمند', value: '۲۴/۷ فعال', hint: 'پاسخ فوری با هوش مصنوعی' },
        ].map((c) => (
          <div key={c.title} className="card flex items-center gap-3 p-4">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500/10">
              <c.icon className="h-5 w-5 text-brand-300" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-100">{c.title}</p>
              <p className="text-[11px] text-brand-300">{c.value}</p>
              <p className="text-[10px] text-slate-500">{c.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Tabs
          tabs={[
            { value: 'faq', label: 'سؤالات متداول' },
            { value: 'new', label: 'ثبت تیکت' },
            { value: 'tickets', label: 'تیکت‌های من', count: tickets.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-5">
        {tab === 'faq' ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {FAQS.map((f, i) => (
              <details key={i} className="card group p-4">
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-bold text-slate-100">
                  <span className="flex items-center gap-2">
                    <f.icon className="h-4 w-4 text-brand-400" />
                    {f.q}
                  </span>
                  <ChevronLeft className="h-4 w-4 shrink-0 transition group-open:-rotate-90" />
                </summary>
                <p className="mt-3 text-xs leading-6 text-slate-400">{f.a}</p>
              </details>
            ))}
          </div>
        ) : null}

        {tab === 'new' ? (
          <form onSubmit={createTicket} className="card space-y-4 p-5">
            {!user ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] text-amber-200">
                برای ثبت تیکت و پیگیری پاسخ، <Link to="/login?next=/support" className="font-bold underline">وارد حساب خود</Link> شوید.
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">موضوع</label>
                <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="مثلاً: تأخیر در ارسال سفارش" className="input text-xs" required />
              </div>
              <div>
                <label className="label">دسته‌بندی</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input text-xs">
                  {[
                    ['general', 'عمومی'], ['order', 'سفارش و خرید'], ['shipping', 'ارسال و تحویل'],
                    ['billing', 'مالی و فاکتور'], ['returns', 'مرجوعی و گارانتی'], ['technical', 'پشتیبانی فنی'], ['coupon', 'کد تخفیف'],
                  ].map(([v, l]) => (
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
              <label className="label">توضیحات</label>
              <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={5} placeholder="جزئیات مشکل یا پرسش خود را بنویسید…" className="input text-xs" required />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[11px] text-slate-500">
                <Clock className="h-3.5 w-3.5" /> میانگین زمان پاسخ: کمتر از ۲ ساعت کاری
              </p>
              <button type="submit" disabled={sending} className="btn-primary">
                <Send className="h-4 w-4" /> {sending ? 'در حال ارسال…' : 'ارسال تیکت'}
              </button>
            </div>
          </form>
        ) : null}

        {tab === 'tickets' ? (
          loading ? (
            <div className="flex justify-center py-10"><Spinner className="text-brand-400" /></div>
          ) : !user ? (
            <EmptyState title="برای مشاهده تیکت‌ها وارد شوید" action={<Link to="/login?next=/support" className="btn-primary btn-sm">ورود</Link>} />
          ) : tickets.length === 0 ? (
            <EmptyState
              title="تیکتی ثبت نکرده‌اید"
              description="اگر پرسشی دارید، می‌توانید تیکت جدید ثبت کنید یا با پشتیبانی گفتگو کنید."
              icon={Ticket}
              action={<button onClick={() => setTab('new')} className="btn-primary btn-sm">ثبت تیکت جدید</button>}
            />
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <Link key={t.id} to={`/account/tickets/${t.id}`} className="card card-hover flex flex-wrap items-center gap-3 p-4">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10">
                    <Ticket className="h-5 w-5 text-brand-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-100">{t.subject}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                      <span>{t.code}</span>
                      <span>·</span>
                      <span>{timeAgo(t.created_at)}</span>
                      <span>·</span>
                      <span>{t.message_count} پیام</span>
                    </p>
                  </div>
                  <StatusBadge {...(TICKET_STATUS[t.status] || { label: t.status })} />
                  <StatusBadge {...(PRIORITY[t.priority] || { label: t.priority })} />
                </Link>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
