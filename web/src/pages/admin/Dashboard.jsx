import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Wallet, ShoppingBag, Users, Package, AlertTriangle, Ticket, Star, Sparkles, TrendingUp, Boxes, MessageSquare, ArrowLeft,
} from 'lucide-react';
import { get } from '../../lib/api';
import { number, toman, timeAgo } from '../../lib/format';
import { ORDER_STATUS } from '../../lib/format';
import { Badge, Loading, StatCard, StatusBadge } from '../../components/ui';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#10b981'];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    get(`/admin/dashboard?days=${days}`).then(setData).catch(() => {});
  }, [days]);

  if (!data) return <Loading label="در حال آماده‌سازی داشبورد…" />;
  const k = data.kpis;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-white">داشبورد مدیریت</h1>
          <p className="mt-1 text-xs text-slate-500">نمای کلی فروش، موجودی و پشتیبانی</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${days === d ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {number(d)} روز
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`فروش ${number(days)} روز اخیر`} value={toman(k.revenue)} icon={Wallet} color="emerald" hint={`مجموع کل: ${toman(k.revenue_total)}`} />
        <StatCard label="سفارش‌های دوره" value={number(k.orders)} icon={ShoppingBag} color="brand" hint={`میانگین سبد: ${toman(k.aov)}`} />
        <StatCard label="مشتریان" value={number(k.customers)} icon={Users} color="violet" hint={`${number(k.new_customers)} کاربر جدید`} />
        <StatCard label="محصولات فعال" value={number(k.products)} icon={Package} color="cyan" hint={`${number(k.low_stock)} کالا موجودی کم`} />
        <StatCard label="سفارش‌های در جریان" value={number(k.orders_pending)} icon={Boxes} color="amber" hint="در انتظار پردازش/ارسال" />
        <StatCard label="تیکت‌های باز" value={number(k.tickets_open)} icon={Ticket} color="rose" hint={`${number(k.chats_open)} گفتگوی زنده باز`} />
        <StatCard label="میانگین امتیاز" value={number(k.avg_rating)} icon={Star} color="amber" hint={`${number(k.reviews)} نظر ثبت‌شده`} />
        <StatCard label="فراخوانی هوش مصنوعی" value={number(k.ai_calls)} icon={Sparkles} color="brand" hint={`هزینه تخمینی: $${k.ai_cost}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="mb-4 text-sm font-bold text-white">روند فروش</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.sales_series}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => String(v).slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${Math.round(v / 1e6)}م`} />
                <Tooltip
                  contentStyle={{ background: '#0f1729', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 12, direction: 'rtl' }}
                  formatter={(value, name) => [name === 'revenue' ? toman(value) : number(value), name === 'revenue' ? 'فروش' : 'سفارش']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#818cf8" fill="url(#rev)" strokeWidth={2} />
                <Line type="monotone" dataKey="orders" stroke="#22c55e" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-white">وضعیت سفارش‌ها</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.status_breakdown} dataKey="c" nameKey="label" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {data.status_breakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, direction: 'rtl' }} />
                <Tooltip contentStyle={{ background: '#0f1729', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 12, direction: 'rtl' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-white">پرفروش‌ترین محصولات</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.top_products.slice(0, 6)} layout="vertical" margin={{ right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#0f1729', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 11, direction: 'rtl' }} formatter={(v) => [number(v), 'فروش']} />
                <Bar dataKey="sold_count" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-white">درآمد بر اساس دسته‌بندی</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.top_categories}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${Math.round(v / 1e6)}م`} />
                <Tooltip contentStyle={{ background: '#0f1729', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 11, direction: 'rtl' }} formatter={(v) => [toman(v), 'درآمد']} />
                <Bar dataKey="revenue" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles className="h-4 w-4 text-brand-400" /> مصرف هوش مصنوعی
          </h2>
          <div className="space-y-2">
            {data.ai_usage.length === 0 ? (
              <p className="text-[11px] text-slate-500">در این بازه فراخوانی‌ای ثبت نشده است.</p>
            ) : (
              data.ai_usage.map((u) => (
                <div key={u.provider} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <span className="text-[11px] font-bold text-slate-200">{u.provider}</span>
                  <span className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>{number(u.calls)} فراخوانی</span>
                    <span>{number(u.tokens)} توکن</span>
                    <span className="text-emerald-400">${Number(u.cost).toFixed(3)}</span>
                  </span>
                </div>
              ))
            )}
            <Link to="/admin/ai-providers" className="link flex items-center gap-1 pt-2 text-[11px] font-semibold">
              مدیریت کلیدها و مدل‌ها <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">آخرین سفارش‌ها</h2>
            <Link to="/admin/orders" className="link text-[11px] font-semibold">همه سفارش‌ها</Link>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>کد</th>
                  <th>مشتری</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/admin/orders/${o.id}`} className="link font-bold">{o.code}</Link>
                    </td>
                    <td>{o.customer_name}</td>
                    <td className="font-bold text-brand-300">{toman(o.total)}</td>
                    <td><StatusBadge {...(ORDER_STATUS[o.status] || { label: o.status_label })} /></td>
                    <td className="text-slate-500">{timeAgo(o.placed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <AlertTriangle className="h-4 w-4 text-amber-400" /> هشدار موجودی
            </h2>
            {data.low_stock.length === 0 ? (
              <p className="text-[11px] text-slate-500">همه محصولات موجودی مناسب دارند. 👌</p>
            ) : (
              <div className="space-y-2">
                {data.low_stock.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2">
                    <img src={p.thumbnail} alt={p.name} className="h-9 w-9 rounded-lg object-cover" />
                    <span className="flex-1 truncate text-[11px] text-slate-200">{p.name}</span>
                    <Badge color={p.stock === 0 ? 'rose' : 'amber'}>{number(p.stock)} عدد</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <MessageSquare className="h-4 w-4 text-brand-400" /> آخرین تیکت‌ها
            </h2>
            <div className="space-y-2">
              {data.recent_tickets.map((t) => (
                <Link key={t.id} to={`/admin/tickets/${t.id}`} className="block rounded-xl border border-white/10 bg-white/5 p-2.5 hover:border-brand-500/40">
                  <p className="truncate text-[11px] font-semibold text-slate-200">{t.subject}</p>
                  <p className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{t.code}</span>·<span>{t.customer_name}</span>·<span>{timeAgo(t.created_at)}</span>
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
          <TrendingUp className="h-4 w-4 text-emerald-400" /> آخرین نظرات مشتریان
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.recent_reviews.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/10 p-3">
              <p className="flex items-center gap-2 text-[11px] font-bold text-slate-200">
                {r.user_name} <span className="text-amber-400">{number(r.rating)}★</span>
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-400">{r.body}</p>
              <p className="mt-1 text-[10px] text-slate-600">{r.product_name}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
