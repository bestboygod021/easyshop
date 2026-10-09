import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Heart, Wallet, MapPin, Ticket, Bell, User, LogOut, ChevronLeft, ShieldCheck,
} from 'lucide-react';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useAuth, useNotifications, useWishlist, toast } from '../../store';
import { initials, number } from '../../lib/format';

const LINKS = [
  { to: '/account', icon: LayoutDashboard, label: 'داشبورد', end: true },
  { to: '/account/orders', icon: Package, label: 'سفارش‌های من' },
  { to: '/account/wishlist', icon: Heart, label: 'علاقه‌مندی‌ها' },
  { to: '/account/wallet', icon: Wallet, label: 'کیف پول و امتیاز' },
  { to: '/account/addresses', icon: MapPin, label: 'آدرس‌ها' },
  { to: '/account/tickets', icon: Ticket, label: 'تیکت‌های پشتیبانی' },
  { to: '/account/notifications', icon: Bell, label: 'اعلان‌ها' },
  { to: '/account/profile', icon: User, label: 'اطلاعات حساب' },
];

export default function AccountLayout() {
  const { user, ready, logout } = useAuth();
  const unread = useNotifications((s) => s.unread);
  const wishlistCount = useWishlist((s) => s.ids.size);
  const load = useNotifications((s) => s.load);
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) {
      toast('برای دسترسی به پنل کاربری وارد شوید.', 'info');
      navigate('/login?next=/account');
    }
    if (user) load();
  }, [ready, user, navigate, load]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-5">
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-3">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-sm font-bold text-white">
                {initials(user.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{user.full_name}</p>
                <p className="truncate text-[11px] text-slate-500">{user.email}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-white/5 p-2">
                <p className="text-[10px] text-slate-500">کیف پول</p>
                <p className="text-xs font-bold text-emerald-300">{number(user.wallet || 0)}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-2">
                <p className="text-[10px] text-slate-500">امتیاز</p>
                <p className="text-xs font-bold text-amber-300">{number(user.loyalty_points || 0)}</p>
              </div>
            </div>
          </div>

          <nav className="card overflow-hidden p-1.5">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium transition',
                    isActive ? 'bg-brand-500/15 text-brand-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                  )
                }
              >
                <l.icon className="h-4 w-4" />
                <span className="flex-1">{l.label}</span>
                {l.to === '/account/notifications' && unread > 0 ? (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {number(unread)}
                  </span>
                ) : null}
                {l.to === '/account/wishlist' && wishlistCount > 0 ? (
                  <span className="text-[10px] text-slate-500">{number(wishlistCount)}</span>
                ) : null}
              </NavLink>
            ))}
            {['admin', 'support', 'seller'].includes(user.role) ? (
              <NavLink
                to="/admin"
                className="mt-1 flex items-center gap-2.5 rounded-xl bg-brand-500/10 px-3 py-2.5 text-xs font-bold text-brand-300"
              >
                <ShieldCheck className="h-4 w-4" /> پنل مدیریت <ChevronLeft className="h-3.5 w-3.5" />
              </NavLink>
            ) : null}
            <button
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" /> خروج از حساب
            </button>
          </nav>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
