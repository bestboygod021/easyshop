import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingBag, Mail, Lock, User, Phone, Eye, EyeOff, ShieldCheck, Sparkles, KeyRound } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth, toast } from '../store';
import { validators } from '../lib/format';
import { Badge } from '../components/ui';

const DEMO_ACCOUNTS = [
  { role: 'مدیر', email: 'admin@easyshop.ir', password: 'ShopMaster#2026', color: 'rose' },
  { role: 'پشتیبان', email: 'support@easyshop.ir', password: 'HelpDesk#2026', color: 'cyan' },
  { role: 'فروشنده', email: 'seller@easyshop.ir', password: 'Trader#2026', color: 'violet' },
  { role: 'مشتری', email: 'user@easyshop.ir', password: 'Shopper#2026', color: 'emerald' },
];

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const user = await login(form.email, form.password);
      toast(`خوش آمدید، ${user.full_name} 👋`);
      const next = params.get('next');
      if (next) navigate(next);
      else if (['admin', 'support'].includes(user.role)) navigate('/admin');
      else navigate('/account');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 lg:grid-cols-2">
      <div className="card p-6">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-glow">
            <ShoppingBag className="h-6 w-6 text-white" />
          </span>
          <h1 className="mt-3 text-lg font-extrabold text-white">ورود به حساب کاربری</h1>
          <p className="mt-1 text-xs text-slate-500">برای خرید سریع‌تر، پیگیری سفارش و استفاده از امتیاز باشگاه مشتریان</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">ایمیل</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
                className="input pr-10"
                required
              />
            </div>
          </div>
          <div>
            <label className="label">رمز عبور</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type={show ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                className="input px-10"
                required
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <label className="flex items-center gap-2 text-slate-400">
              <input type="checkbox" className="h-3.5 w-3.5 accent-brand-500" /> مرا به خاطر بسپار
            </label>
            <Link to="/forgot-password" className="link">فراموشی رمز عبور؟</Link>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'در حال ورود…' : 'ورود به حساب'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          حساب کاربری ندارید؟{' '}
          <Link to="/register" className="link font-semibold">ثبت‌نام سریع</Link>
        </p>
      </div>

      <div className="space-y-4">
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles className="h-4 w-4 text-brand-400" /> حساب‌های آزمایشی
          </h2>
          <p className="mt-2 text-[11px] leading-6 text-slate-500">
            برای بررسی سریع همه‌ی بخش‌ها می‌توانید با یکی از حساب‌های زیر وارد شوید (فقط در نسخه‌ی دمو).
          </p>
          <div className="mt-4 space-y-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => setForm({ email: a.email, password: a.password })}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-right transition hover:border-brand-500/40"
              >
                <span>
                  <span className="block text-xs font-bold text-slate-200">{a.role}</span>
                  <span className="block text-[10px] text-slate-500">{a.email}</span>
                </span>
                <Badge color={a.color}>{a.password}</Badge>
              </button>
            ))}
          </div>
        </div>

        <div className="card space-y-3 p-6 text-[11px] text-slate-400">
          <p className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> اطلاعات شما رمزنگاری شده ذخیره می‌شود؛ رمزها با bcrypt هش می‌شوند.
          </p>
          <p className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand-400" /> نشست‌ها با JWT و توکن تازه‌سازی امن مدیریت می‌شوند.
          </p>
        </div>
      </div>
    </div>
  );
}

export function Register() {
  const navigate = useNavigate();
  const { register, loading } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (!validators.email(form.email)) return toast('ایمیل معتبر وارد کنید.', 'error');
    if (form.phone && !validators.phone(form.phone)) return toast('شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.', 'error');
    if (form.password.length < 6) return toast('رمز عبور باید حداقل ۶ کاراکتر باشد.', 'error');
    if (form.password !== form.confirm) return toast('تکرار رمز عبور مطابقت ندارد.', 'error');
    try {
      await register({ full_name: form.full_name, email: form.email, phone: form.phone, password: form.password });
      toast('ثبت‌نام با موفقیت انجام شد 🎉 کد تخفیف WELCOME10 برای شما فعال شد.');
      navigate('/account');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="card p-6">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-extrabold text-white">ساخت حساب کاربری</h1>
          <p className="mt-1 text-xs text-slate-500">در چند ثانیه عضو EasyShop شوید و ۱۰٪ تخفیف اولین خرید بگیرید</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">نام و نام خانوادگی</label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="input pr-10" required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">ایمیل</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input" required />
            </div>
            <div>
              <label className="label">شماره موبایل</label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="09123456789" className="input pr-10" />
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">رمز عبور</label>
              <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="input" required />
            </div>
            <div>
              <label className="label">تکرار رمز عبور</label>
              <input type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} className="input" required />
            </div>
          </div>
          <label className="flex items-start gap-2 text-[11px] text-slate-400">
            <input type="checkbox" required className="mt-0.5 h-3.5 w-3.5 accent-brand-500" />
            <span>
              با ثبت‌نام، <Link to="/about" className="link">قوانین و مقررات</Link> فروشگاه را می‌پذیرم.
            </span>
          </label>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'در حال ثبت‌نام…' : 'ثبت‌نام و ورود'}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-500">
          قبلاً ثبت‌نام کرده‌اید؟ <Link to="/login" className="link font-semibold">ورود به حساب</Link>
        </p>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await post('/auth/forgot-password', { email });
      setSent(data);
      toast(data.message, 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-6">
        <h1 className="text-center text-lg font-extrabold text-white">بازیابی رمز عبور</h1>
        <p className="mt-2 text-center text-xs text-slate-500">ایمیل خود را وارد کنید تا لینک بازیابی برای شما ساخته شود.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input" required />
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'در حال ارسال…' : 'ارسال لینک بازیابی'}</button>
        </form>
        {sent?.reset_link ? (
          <div className="mt-4 rounded-xl border border-brand-500/25 bg-brand-500/5 p-3 text-[11px] leading-6 text-brand-200">
            در محیط دمو، لینک بازیابی مستقیماً نمایش داده می‌شود:
            <Link to={sent.reset_link} className="mt-1 block font-bold text-brand-300 underline">
              {sent.reset_link}
            </Link>
          </div>
        ) : null}
        <p className="mt-5 text-center text-xs text-slate-500">
          <Link to="/login" className="link">بازگشت به صفحه ورود</Link>
        </p>
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await post('/auth/reset-password', { token: params.get('token'), password });
      toast(data.message);
      navigate('/login');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-6">
        <h1 className="text-center text-lg font-extrabold text-white">تعیین رمز عبور جدید</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز عبور جدید" className="input" required minLength={6} />
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'در حال ذخیره…' : 'ذخیره رمز جدید'}</button>
        </form>
      </div>
    </div>
  );
}

export default Login;
