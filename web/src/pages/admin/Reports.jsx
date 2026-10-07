import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { BarChart3, TrendingUp, Users, CreditCard, Star, Wallet } from 'lucide-react';
import { get, qs } from '../../lib/api';
import { number, toman, fa } from '../../lib/format';
import { Loading, StatCard, Tabs } from '../../components/ui';
import { toast } from '../../store';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7', '#ef4444'];

function ChartCard({ title, children, hint }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {hint ? <span className="text-[10px] text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export default function Reports() {
  const [days, setDays] = useState('30');
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    get(`/admin/reports?${qs({ days })}`)
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  }, [days]);

  if (!data) return <Loading />;

  const totalRevenue = data.sales_by_day.reduce((s, d) => s + d.revenue, 0);
  const totalOrders = data.sales_by_day.reduce((s, d) => s + d.orders, 0);
  const avgOrder = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;
  const chartData = data.sales_by_day.map((d) => ({ ...d, label: fa(new Date(d.date).toLocaleDateString('fa-IR', { month: '2-digit', day: '2-digit' })) }));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <BarChart3 className="h-5 w-5 text-brand-400" /> گزارش‌ها و تحلیل فروش
          </h1>
          <p className="mt-1 text-xs text-slate-500">داده‌های واقعی از سفارش‌ها، پرداخت‌ها و مشتریان</p>
        </div>
        <Tabs
          tabs={[
            { value: '7', label: '۷ روز' },
            { value: '30', label: '۳۰ روز' },
            { value: '90', label: '۹۰ روز' },
          ]}
          active={days}
          onChange={setDays}
        />
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="درآمد دوره" value={toman(totalRevenue)} icon={TrendingUp} color="emerald" />
        <StatCard label="تعداد سفارش" value={number(totalOrders)} icon={CreditCard} color="brand" />
        <StatCard label="میانگین سبد خرید" value={toman(avgOrder)} icon={Wallet} color="violet" />
        <StatCard label="مشتریان جدید امروز" value={number(data.daily.new_customers_today)} icon={Users} color="amber" hint={`نرخ تبدیل: ${fa(data.daily.conversion)}٪`} />
      </div>

      <ChartCard title="روند فروش" hint={`${fa(days)} روز گذشته`}>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="repRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
            <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `${Math.round(v / 1000000)}م`} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 11, direction: 'rtl' }}
              formatter={(v, n) => [n === 'revenue' ? toman(v) : number(v), n === 'revenue' ? 'درآمد' : 'سفارش']}
            />
            <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#repRev)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="فروش بر اساس دسته‌بندی">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.sales_by_category.filter((c) => c.name).slice(0, 7)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis type="number" stroke="#64748b" fontSize={10} tickFormatter={(v) => `${Math.round(v / 1000000)}م`} />
              <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={10} width={80} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 11, direction: 'rtl' }}
                formatter={(v) => [toman(v), 'درآمد']}
              />
              <Bar dataKey="revenue" fill="#22c55e" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="روش‌های پرداخت">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.payment_methods} dataKey="amount" nameKey="provider" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {data.payment_methods.map((m, i) => (
                  <Cell key={m.provider} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11, direction: 'rtl' }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #ffffff20', borderRadius: 12, fontSize: 11, direction: 'rtl' }}
                formatter={(v) => toman(v)}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="قیف وضعیت سفارش‌ها">
          <div className="space-y-2">
            {data.status_funnel.map((s) => {
              const total = data.status_funnel.reduce((sum, x) => sum + x.c, 0) || 1;
              const pct = Math.round((s.c / total) * 100);
              return (
                <div key={s.status}>
                  <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                    <span>{s.status}</span>
                    <span>{number(s.c)} ({fa(pct)}٪)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        <ChartCard title="پرخریدترین مشتریان">
          <div className="space-y-2">
            {data.top_customers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-[10px] font-bold text-white">
                  {fa(i + 1)}
                </span>
                <span className="flex-1 truncate text-[11px] text-slate-300">{c.name}</span>
                <span className="text-[10px] text-slate-500">{number(c.orders)} سفارش</span>
                <span className="text-[11px] font-bold text-brand-300">{toman(c.total)}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="توزیع امتیاز نظرات">
          <div className="space-y-3">
            {data.reviews_by_rating.map((r) => {
              const total = data.reviews_by_rating.reduce((s, x) => s + x.c, 0) || 1;
              const pct = Math.round((r.c / total) * 100);
              return (
                <div key={r.rating} className="flex items-center gap-3">
                  <span className="flex w-14 items-center gap-1 text-[11px] text-amber-300">
                    <Star className="h-3 w-3 fill-current" /> {fa(r.rating)}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-left text-[10px] text-slate-500">{number(r.c)}</span>
                </div>
              );
            })}
          </div>
        </ChartCard>

        <ChartCard title="شاخص‌های امروز">
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
              <p className="text-slate-500">سفارش امروز</p>
              <p className="mt-1 text-base font-extrabold text-white">{number(data.daily.orders_today)}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
              <p className="text-slate-500">درآمد امروز</p>
              <p className="mt-1 text-base font-extrabold text-emerald-300">{toman(data.daily.revenue_today)}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
              <p className="text-slate-500">مشتری جدید</p>
              <p className="mt-1 text-base font-extrabold text-white">{number(data.daily.new_customers_today)}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
              <p className="text-slate-500">نرخ تبدیل</p>
              <p className="mt-1 text-base font-extrabold text-brand-300">{fa(data.daily.conversion)}٪</p>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
