import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ShoppingBag, ShoppingCart, User, Search, Heart, Bell, Menu, X, Sun, Moon, LayoutDashboard,
  Headphones, Package, Wallet, Ticket, LogOut, ChevronLeft, Sparkles, MessageCircle, Home,
  Grid3X3, Percent, Languages, Store, ShieldCheck, Truck, RotateCcw, Phone,
} from 'lucide-react';
import { api, get, qs } from '../lib/api';
import { number, toman, initials, timeAgo } from '../lib/format';
import { useAuth, useCart, useNotifications, useSettings, useUI, useWishlist, toast } from '../store';
import { useI18n } from '../lib/i18n';
import { Badge, SmartImage, Spinner } from './ui';
import Connectors from './Connectors';
import CartDrawer from './CartDrawer';
import ChatWidget from './ChatWidget';

const STAFF = ['admin', 'support', 'seller'];

function NavItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition',
          isActive ? 'bg-brand-500/15 text-brand-300' : 'text-slate-300 hover:bg-white/5 hover:text-white',
        )
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

function SearchCommand() {
  const open = useUI((s) => s.searchOpen);
  const setOpen = useUI((s) => s.setSearchOpen);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ products: [], pages: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setResults({ products: [], pages: [] });
        return;
      }
      setLoading(true);
      try {
        const data = await get(`/search?${qs({ q })}`);
        setResults(data);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center bg-black/60 p-4 pt-20 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی محصول، دسته‌بندی یا صفحه…"
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          {loading ? <Spinner className="h-4 w-4 text-brand-400" /> : null}
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {results.products?.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setOpen(false);
                navigate(`/products/${p.slug}`);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-right hover:bg-white/5"
            >
              <SmartImage src={p.thumbnail} alt={p.name} className="h-10 w-10 shrink-0 rounded-lg" fallbackText="کالا" />
              <span className="flex-1">
                <span className="block text-xs font-semibold text-slate-200">{p.name}</span>
                <span className="block text-[11px] text-slate-500">{p.category_name}</span>
              </span>
              <span className="text-xs font-bold text-brand-300">{toman(p.price)}</span>
            </button>
          ))}
          {results.pages?.map((pg) => (
            <button
              key={pg.path}
              onClick={() => {
                setOpen(false);
                navigate(pg.path);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-right text-xs text-slate-300 hover:bg-white/5"
            >
              <Grid3X3 className="h-4 w-4 text-slate-500" /> رفتن به {pg.title}
            </button>
          ))}
          {!loading && q.length >= 2 && !results.products?.length && !results.pages?.length ? (
            <p className="p-4 text-center text-xs text-slate-500">نتیجه‌ای یافت نشد.</p>
          ) : null}
          {q.length < 2 ? (
            <div className="p-4">
              <p className="mb-2 text-[11px] font-semibold text-slate-500">جستجوهای پرطرفدار</p>
              <div className="flex flex-wrap gap-2">
                {['هدفون بی‌سیم', 'لپ‌تاپ', 'کفش ورزشی', 'ادکلن', 'کتاب'].map((s) => (
                  <button key={s} onClick={() => setQ(s)} className="chip border border-white/10 bg-white/5 text-slate-300">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NotificationBell() {
  const { items, unread, load, markAllRead } = useNotifications();
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (user) load();
  }, [user, load]);
  if (!user) return null;
  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread) setTimeout(markAllRead, 1200);
        }}
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {number(unread)}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="card absolute left-0 top-11 z-20 w-80 overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-xs font-bold text-white">اعلان‌ها</span>
              <button onClick={markAllRead} className="text-[11px] text-brand-300 hover:text-brand-200">
                خواندن همه
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="p-5 text-center text-xs text-slate-500">اعلان جدیدی ندارید.</p>
              ) : (
                items.map((n) => (
                  <Link
                    key={n.id}
                    to={n.link || '/account'}
                    onClick={() => setOpen(false)}
                    className={clsx('block border-b border-white/5 px-4 py-3 transition hover:bg-white/5', !n.is_read && 'bg-brand-500/5')}
                  >
                    <p className="text-xs font-semibold text-slate-200">{n.title}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{n.body}</p>
                    <p className="mt-1 text-[10px] text-slate-600">{timeAgo(n.created_at)}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) {
    return (
      <Link to="/login" className="btn-primary btn-sm hidden sm:inline-flex">
        <User className="h-3.5 w-3.5" />
        ورود / ثبت‌نام
      </Link>
    );
  }
  const links = [
    { to: '/account', icon: LayoutDashboard, label: 'داشبورد من' },
    { to: '/account/orders', icon: Package, label: 'سفارش‌های من' },
    { to: '/account/wishlist', icon: Heart, label: 'علاقه‌مندی‌ها' },
    { to: '/account/wallet', icon: Wallet, label: 'کیف پول و امتیاز' },
    { to: '/support', icon: Headphones, label: 'پشتیبانی' },
  ];
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 hover:border-brand-500/40">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-[11px] font-bold text-white">
          {initials(user.full_name)}
        </span>
        <span className="hidden text-xs font-semibold text-slate-200 lg:block">{user.full_name}</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="card absolute left-0 top-12 z-20 w-56 overflow-hidden p-1.5">
            <div className="border-b border-white/10 px-3 py-2.5">
              <p className="text-xs font-bold text-white">{user.full_name}</p>
              <p className="text-[11px] text-slate-500">{user.email}</p>
            </div>
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
              >
                <l.icon className="h-4 w-4" /> {l.label}
              </Link>
            ))}
            {STAFF.includes(user.role) ? (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-brand-300 hover:bg-brand-500/10"
              >
                <ShieldCheck className="h-4 w-4" /> پنل مدیریت
              </Link>
            ) : null}
            <button
              onClick={async () => {
                await logout();
                setOpen(false);
                toast('از حساب خود خارج شدید.', 'info');
                navigate('/');
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" /> خروج از حساب
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function Layout() {
  const { t, locale, setLocale } = useI18n();
  const theme = useUI((s) => s.theme);
  const toggleTheme = useUI((s) => s.toggleTheme);
  const setSearchOpen = useUI((s) => s.setSearchOpen);
  const cartCount = useCart((s) => s.items.reduce((sum, i) => sum + i.qty, 0));
  const openDrawer = useCart((s) => s.setDrawer);
  const wishlistCount = useWishlist((s) => s.ids.size);
  const user = useAuth((s) => s.user);
  const settings = useSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    get('/categories').then((d) => setCategories(d.items.slice(0, 7))).catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSearchOpen]);

  const navLinks = [
    { to: '/', icon: Home, label: t('nav.home') },
    { to: '/products', icon: Store, label: t('nav.products') },
    { to: '/categories', icon: Grid3X3, label: t('nav.categories') },
    { to: '/products?on_sale=1&sort=discount', icon: Percent, label: t('nav.deals') },
    { to: '/support', icon: Headphones, label: t('nav.support') },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Connectors />
      <SearchCommand />

      {/* نوار اعلان بالای صفحه */}
      <div className="hidden bg-gradient-to-l from-brand-600 via-violet-600 to-fuchsia-600 px-4 py-1.5 text-center text-[11px] font-medium text-white/95 sm:block">
        🎉 جشنواره پایان فصل — تا ۴۰٪ تخفیف + ارسال رایگان سفارش‌های بالای ۵ میلیون تومان
      </div>

      <header className={clsx('sticky top-0 z-50 transition', scrolled ? 'glass shadow-card' : 'bg-ink-900/80 backdrop-blur')}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 sm:px-5">
          <button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 lg:hidden">
            <Menu className="h-4 w-4" />
          </button>

          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-glow">
              <ShoppingBag className="h-5 w-5 text-white" />
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-extrabold text-white">EasyShop</span>
              <span className="block text-[10px] text-slate-500">{settings.store?.tagline || 'فروشگاه هوشمند'}</span>
            </span>
          </Link>

          <button
            onClick={() => setSearchOpen(true)}
            className="group flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-slate-500 transition hover:border-brand-500/40 hover:text-slate-300"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-right">{t('action.search')}</span>
            <kbd className="hidden rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] lg:block">⌘K</kbd>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setLocale(locale === 'fa' ? 'en' : 'fa')}
              title="تغییر زبان"
              className="hidden h-9 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 text-[11px] font-bold text-slate-300 hover:text-white sm:flex"
            >
              <Languages className="h-3.5 w-3.5" />
              {locale === 'fa' ? 'EN' : 'فا'}
            </button>
            <button
              onClick={toggleTheme}
              title="حالت روشن/تیره"
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <NotificationBell />
            <Link to="/account/wishlist" className="relative hidden h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-rose-300 sm:grid">
              <Heart className="h-4 w-4" />
              {wishlistCount > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {number(wishlistCount)}
                </span>
              ) : null}
            </Link>
            <button
              onClick={() => openDrawer(true)}
              className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-brand-300"
            >
              <ShoppingCart className="h-4 w-4" />
              {cartCount > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">
                  {number(cartCount)}
                </span>
              ) : null}
            </button>
            <UserMenu />
          </div>
        </div>

        {/* نوار دسته‌بندی دسکتاپ */}
        <nav className="hidden border-t border-white/5 lg:block">
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-1.5">
            {navLinks.map((l) => (
              <NavItem key={l.to} {...l} />
            ))}
            <span className="mx-2 h-4 w-px bg-white/10" />
            {categories.map((c) => (
              <NavLink
                key={c.id}
                to={`/categories/${c.slug}`}
                className={({ isActive }) =>
                  clsx('whitespace-nowrap rounded-lg px-2.5 py-2 text-xs transition', isActive ? 'text-brand-300' : 'text-slate-400 hover:text-white')
                }
              >
                {c.name}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-72 overflow-y-auto border-l border-white/10 bg-ink-850 p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 font-extrabold text-white">
                <ShoppingBag className="h-5 w-5 text-brand-400" /> EasyShop
              </span>
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {navLinks.map((l) => (
                <NavItem key={l.to} {...l} onClick={() => setMobileOpen(false)} />
              ))}
              {user ? (
                <>
                  <div className="my-2 h-px bg-white/10" />
                  <NavItem to="/account" icon={LayoutDashboard} label="داشبورد من" onClick={() => setMobileOpen(false)} />
                  <NavItem to="/account/orders" icon={Package} label="سفارش‌های من" onClick={() => setMobileOpen(false)} />
                  <NavItem to="/account/wallet" icon={Wallet} label="کیف پول" onClick={() => setMobileOpen(false)} />
                  <NavItem to="/account/tickets" icon={Ticket} label="تیکت‌ها" onClick={() => setMobileOpen(false)} />
                  {STAFF.includes(user.role) ? <NavItem to="/admin" icon={ShieldCheck} label="پنل مدیریت" onClick={() => setMobileOpen(false)} /> : null}
                </>
              ) : (
                <Link to="/login" className="btn-primary mt-3 w-full" onClick={() => setMobileOpen(false)}>
                  <User className="h-4 w-4" /> ورود / ثبت‌نام
                </Link>
              )}
            </div>
            <div className="mt-6 rounded-2xl border border-brand-500/20 bg-brand-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-brand-200">
                <Sparkles className="h-3.5 w-3.5" /> دستیار هوشمند
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">بپرسید چه می‌خواهید؛ پیشنهاد محصول می‌گیرید.</p>
              <button
                onClick={() => {
                  setMobileOpen(false);
                  useUI.getState().setChatOpen(true);
                }}
                className="btn-primary btn-sm mt-2 w-full"
              >
                شروع گفتگو
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <main className="flex-1 pb-20 lg:pb-0">
        <Outlet />
      </main>

      {/* فوتر */}
      <footer className="mt-12 border-t border-white/10 bg-ink-850/60">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600">
                <ShoppingBag className="h-4 w-4 text-white" />
              </span>
              <span className="font-extrabold text-white">EasyShop</span>
            </div>
            <p className="mt-3 text-xs leading-6 text-slate-500">
              {settings.store?.tagline || 'فروشگاه اینترنتی هوشمند'} — روی وب، iOS، اندروید و ویندوز. خرید امن با ضمانت بازگشت کالا و
              پشتیبانی ۲۴ ساعته.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge color="emerald" icon={ShieldCheck}>پرداخت امن</Badge>
              <Badge color="cyan" icon={Truck}>ارسال سریع</Badge>
              <Badge color="amber" icon={RotateCcw}>۷ روز مرجوعی</Badge>
            </div>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold text-slate-300">دسترسی سریع</h4>
            <ul className="space-y-2 text-xs text-slate-500">
              <li><Link className="hover:text-brand-300" to="/products">همه محصولات</Link></li>
              <li><Link className="hover:text-brand-300" to="/categories">دسته‌بندی‌ها</Link></li>
              <li><Link className="hover:text-brand-300" to="/products?on_sale=1">تخفیف‌ها</Link></li>
              <li><Link className="hover:text-brand-300" to="/support">پشتیبانی و تیکت</Link></li>
              <li><Link className="hover:text-brand-300" to="/about">درباره EasyShop</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold text-slate-300">حساب کاربری</h4>
            <ul className="space-y-2 text-xs text-slate-500">
              <li><Link className="hover:text-brand-300" to="/account">پنل کاربری</Link></li>
              <li><Link className="hover:text-brand-300" to="/account/orders">پیگیری سفارش</Link></li>
              <li><Link className="hover:text-brand-300" to="/account/wallet">کیف پول و امتیاز</Link></li>
              <li><Link className="hover:text-brand-300" to="/account/tickets">تیکت‌های من</Link></li>
              <li><Link className="hover:text-brand-300" to="/admin">ورود مدیران</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold text-slate-300">تماس با ما</h4>
            <ul className="space-y-2 text-xs text-slate-500">
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" /> {settings.store?.phone || '021-91001000'}
              </li>
              <li className="flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5" /> {settings.store?.email || 'info@easyshop.ir'}
              </li>
              <li>{settings.store?.address || 'تهران، خیابان ولیعصر، برج نیکان'}</li>
              <li>{settings.store?.working_hours || 'شنبه تا پنجشنبه ۹ تا ۱۸'}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 px-5 py-4 text-center text-[11px] text-slate-600">
          © {new Date().getFullYear()} EasyShop — تمامی حقوق محفوظ است. ساخته‌شده با ❤️ برای فروشندگان ایرانی.
        </div>
      </footer>

      {/* نوار پایین موبایل */}
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-ink-900/95 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {[
            { to: '/', icon: Home, label: 'خانه' },
            { to: '/categories', icon: Grid3X3, label: 'دسته‌ها' },
            { to: '/products', icon: Search, label: 'فروشگاه' },
            { to: '/account/orders', icon: Package, label: 'سفارش‌ها' },
            { to: '/account', icon: User, label: 'حساب من' },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx('flex flex-col items-center gap-1 py-2.5 text-[10px] transition', isActive ? 'text-brand-400' : 'text-slate-500')
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <CartDrawer />
      <ChatWidget />
    </div>
  );
}
