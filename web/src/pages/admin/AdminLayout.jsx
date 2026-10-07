import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Package, FolderTree, ShoppingBag, Users, Boxes, Ticket, BadgePercent, MessageSquare,
  Sparkles, Cpu, Star, BarChart3, Settings as SettingsIcon, ScrollText, LogOut, Menu, X, Store,
  Bell, ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';
import { get } from '../../lib/api';
import { realtime } from '../../lib/realtime';
import { useAuth, useNotifications, toast } from '../../store';
import { number, initials } from '../../lib/format';

const GROUPS = [
  {
    title: 'مدیریت فروش',
    links: [
      { to: '/admin', icon: LayoutDashboard, label: 'داشبورد', end: true },
      { to: '/admin/orders', icon: ShoppingBag, label: 'سفارش‌ها' },
      { to: '/admin/products', icon: Package, label: 'محصولات' },
      { to: '/admin/categories', icon: FolderTree, label: 'دسته‌بندی‌ها' },
      { to: '/admin/inventory', icon: Boxes, label: 'انبار' },
      { to: '/admin/coupons', icon: BadgePercent, label: 'کدهای تخفیف' },
    ],
  },
  {
    title: 'مشتریان و پشتیبانی',
    links: [
      { to: '/admin/customers', icon: Users, label: 'کاربران' },
      { to: '/admin/tickets', icon: Ticket, label: 'تیکت‌ها' },
      { to: '/admin/chat', icon: MessageSquare, label: 'گفتگوهای زنده' },
      { to: '/admin/reviews', icon: Star, label: 'نظرات' },
    ],
  },
  {
    title: 'هوش مصنوعی و تحلیل',
    links: [
      { to: '/admin/ai-studio', icon: Sparkles, label: 'استودیوی هوش مصنوعی' },
      { to: '/admin/ai-providers', icon: Cpu, label: 'مدل‌ها و کلیدهای API' },
      { to: '/admin/reports', icon: BarChart3, label: 'گزارش‌ها' },
      { to: '/admin/logs', icon: ScrollText, label: 'لاگ‌ها' },
      { to: '/admin/settings', icon: SettingsIcon, label: 'تنظیمات' },
    ],
  },
];

export default function AdminLayout() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const push = useNotifications((s) => s.push);

  useEffect(() => {
    if (ready && !user) return navigate('/login?next=/admin');
    if (ready && user && !['admin', 'support', 'seller'].includes(user.role)) {
      toast('دسترسی به پنل مدیریت مجاز نیست.', 'error');
      return navigate('/account');
    }
  }, [ready, user, navigate]);

  useEffect(() => {
    get('/admin/dashboard')
      .then((d) => setStats(d.kpis))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const off = realtime.on((msg) => {
      if (msg.type === 'order:new') {
        toast(`سفارش جدید ${msg.order.code} ثبت شد.`, 'info');
        push({ id: Math.random().toString(), title: 'سفارش جدید', body: msg.order.code, created_at: new Date().toISOString() });
      }
      if (msg.type === 'ticket:new') toast('تیکت جدید ثبت شد.', 'info');
      if (msg.type === 'chat:message' && msg.message?.sender_role === 'customer') toast('پیام جدید در گفتگوی زنده.', 'info');
    });
    return off;
  }, [push]);

  if (!user) return null;

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600">
          <ShieldCheck className="h-5 w-5 text-white" />
        </span>
        <div>
          <p className="text-xs font-extrabold text-white">پنل مدیریت EasyShop</p>
          <p className="text-[10px] text-slate-500">
            {user.role === 'admin' ? 'دسترسی کامل مدیر' : user.role === 'support' ? 'دسترسی پشتیبانی' : 'دسترسی فروشنده'}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 px-2 text-[10px] font-bold text-slate-600">{g.title}</p>
            <div className="space-y-0.5">
              {g.links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 text-[11px] font-medium transition',
                      isActive ? 'bg-brand-500/15 text-brand-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                    )
                  }
                >
                  <l.icon className="h-4 w-4" />
                  <span className="flex-1">{l.label}</span>
                  {l.to === '/admin/orders' && stats?.orders_pending ? (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500/20 px-1 text-[9px] font-bold text-amber-300">
                      {number(stats.orders_pending)}
                    </span>
                  ) : null}
                  {l.to === '/admin/tickets' && stats?.tickets_open ? (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-500/20 px-1 text-[9px] font-bold text-rose-300">
                      {number(stats.tickets_open)}
                    </span>
                  ) : null}
                  {l.to === '/admin/chat' && stats?.chats_open ? (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand-500/20 px-1 text-[9px] font-bold text-brand-300">
                      {number(stats.chats_open)}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-[10px] font-bold text-white">
            {initials(user.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold text-slate-200">{user.full_name}</p>
            <p className="truncate text-[10px] text-slate-500">{user.email}</p>
          </div>
        </div>
        <Link to="/" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[11px] text-slate-400 hover:bg-white/5 hover:text-white">
          <Store className="h-4 w-4" /> مشاهده فروشگاه
        </Link>
        <button
          onClick={async () => {
            await useAuth.getState().logout();
            navigate('/');
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10"
        >
          <LogOut className="h-4 w-4" /> خروج
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-900 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l border-white/10 bg-ink-850 lg:block">{Sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-[130] lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-72 border-l border-white/10 bg-ink-850">{Sidebar}</aside>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-ink-900/95 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300">
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-xs font-bold text-white">پنل مدیریت</span>
          <Link to="/" className="mr-auto text-[11px] text-brand-300">فروشگاه</Link>
        </header>

        <div className="p-4 sm:p-6">
          <Outlet context={{ stats }} />
        </div>
      </div>
    </div>
  );
}
