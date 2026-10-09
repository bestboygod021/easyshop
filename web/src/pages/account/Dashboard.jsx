import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, Package, Ticket, Heart, TrendingUp, ArrowLeft, Bell, Sparkles, ShoppingBag,
} from 'lucide-react';
import { get } from '../../lib/api';
import { number, toman, timeAgo } from '../../lib/format';
import { ORDER_STATUS } from '../../lib/format';
import { Loading, StatCard, StatusBadge, EmptyState } from '../../components/ui';
import { useAuth } from '../../store';

export default function AccountDashboard() {
  const user = useAuth((s) => s.user);
  const [data, setData] = useState(null);

  useEffect(() => {
    get('/account/dashboard').then(setData).catch(() => {});
  }, []);

  if (!data) return <Loading />;

  return (
    <div className="space-y-5">
      <header className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-base font-extrabold text-white">سلام {user?.full_name?.split(' ')[0]} 👋</h1>
          <p className="mt-1 text-xs text-slate-500">خلاصه‌ی حساب، سفارش‌ها و امتیازهای شما در یک نگاه</p>
        </div>
        <Link to="/products" className="btn-primary btn-sm">
          <ShoppingBag className="h-3.5 w-3.5" /> خرید جدید
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="مجموع خرید" value={toman(data.stats.total_spent)} icon={TrendingUp} color="emerald" hint={`${number(data.stats.orders)} سفارش ثبت‌شده`} />
        <StatCard label="موجودی کیف پول" value={toman(data.stats.wallet)} icon={Wallet} color="brand" hint="قابل استفاده در خرید بعدی" />
        <StatCard label="امتیاز باشگاه مشتریان" value={number(data.stats.loyalty_points)} icon={Sparkles} color="amber" hint={`معادل ${toman(data.stats.loyalty_points * 1000)}`} />
        <StatCard label="تیکت‌های باز" value={number(data.stats.open_tickets)} icon={Ticket} color="rose" hint="در انتظار پاسخ پشتیبانی" />
        <StatCard label="علاقه‌مندی‌ها" value={number(data.stats.wishlist)} icon={Heart} color="violet" hint="محصولات ذخیره‌شده" />
        <StatCard label="سفارش‌های اخیر" value={number(data.recent_orders.length)} icon={Package} color="cyan" hint="۶۰ روز گذشته" />
      </div>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">آخرین سفارش‌ها</h2>
          <Link to="/account/orders" className="link flex items-center gap-1 text-xs font-semibold">
            همه سفارش‌ها <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data.recent_orders.length === 0 ? (
          <EmptyState title="هنوز سفارشی ثبت نکرده‌اید" description="اولین خرید خود را از فروشگاه انجام دهید." icon={Package} action={<Link to="/products" className="btn-primary btn-sm">رفتن به فروشگاه</Link>} />
        ) : (
          <div className="space-y-2">
            {data.recent_orders.map((o) => (
              <Link key={o.id} to={`/account/orders/${o.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-brand-500/40">
                <span className="text-xs font-bold text-slate-100">{o.code}</span>
                <span className="text-[11px] text-slate-500">{timeAgo(o.placed_at)}</span>
                <span className="text-[11px] text-slate-500">{number(o.item_count)} کالا</span>
                <span className="mr-auto text-xs font-bold text-brand-300">{toman(o.total)}</span>
                <StatusBadge {...(ORDER_STATUS[o.status] || { label: o.status })} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {data.notifications?.length ? (
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Bell className="h-4 w-4 text-brand-400" /> اعلان‌های خوانده‌نشده
          </h2>
          <div className="space-y-2">
            {data.notifications.map((n) => (
              <Link key={n.id} to={n.link || '/account'} className="block rounded-xl border border-white/10 bg-brand-500/5 p-3">
                <p className="text-xs font-semibold text-slate-100">{n.title}</p>
                <p className="mt-1 text-[11px] text-slate-500">{n.body}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
