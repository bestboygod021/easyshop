import { useState } from 'react';
import { User, Lock, MapPin, Plus, Trash2, Save, ShieldCheck, Languages } from 'lucide-react';
import { del, get, post, put } from '../../lib/api';
import { useAuth, useUI, toast } from '../../store';
import { validators, date } from '../../lib/format';
import { Badge, Loading, Modal } from '../../components/ui';
import { useEffect } from 'react';
import { useI18n } from '../../lib/i18n';

export default function Profile() {
  const { user, update } = useAuth();
  const { locale, setLocale } = useI18n();
  const [form, setForm] = useState({ full_name: user?.full_name || '', phone: user?.phone || '' });
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' });
  const [addresses, setAddresses] = useState([]);
  const [open, setOpen] = useState(false);
  const [newAddress, setNewAddress] = useState({ title: 'آدرس جدید', receiver: '', phone: '', province: 'تهران', city: 'تهران', postal_code: '', line: '', is_default: false });
  const [busy, setBusy] = useState(false);
  const toastFn = toast;

  const loadAddresses = () => get('/account/addresses').then((d) => setAddresses(d.items)).catch(() => {});
  useEffect(() => {
    loadAddresses();
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      await update(form);
      toastFn('اطلاعات حساب ذخیره شد.');
    } catch (err) {
      toastFn(err.message, 'error');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (passwords.new_password.length < 6) return toastFn('رمز جدید باید حداقل ۶ کاراکتر باشد.', 'error');
    if (passwords.new_password !== passwords.confirm) return toastFn('تکرار رمز مطابقت ندارد.', 'error');
    setBusy(true);
    try {
      const res = await post('/auth/change-password', passwords);
      toastFn(res.message);
      setPasswords({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toastFn(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveAddress = async () => {
    try {
      await post('/account/addresses', newAddress);
      toastFn('آدرس ذخیره شد.');
      setOpen(false);
      loadAddresses();
    } catch (err) {
      toastFn(err.message, 'error');
    }
  };

  const removeAddress = async (id) => {
    try {
      await del(`/account/addresses/${id}`);
      toastFn('آدرس حذف شد.', 'info');
      loadAddresses();
    } catch (err) {
      toastFn(err.message, 'error');
    }
  };

  if (!user) return <Loading />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-base font-extrabold text-white">
          <User className="h-5 w-5 text-brand-400" /> اطلاعات حساب کاربری
        </h1>
        <p className="mt-1 text-xs text-slate-500">ویرایش مشخصات، تغییر رمز عبور و مدیریت آدرس‌ها</p>
      </header>

      <div className="card flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-violet-500 text-lg font-bold text-white">
          {user.full_name?.slice(0, 1)}
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">{user.full_name}</p>
          <p className="text-[11px] text-slate-500">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge color="indigo">{user.role === 'admin' ? 'مدیر' : user.role === 'support' ? 'پشتیبان' : user.role === 'seller' ? 'فروشنده' : 'مشتری'}</Badge>
            <Badge color="emerald" icon={ShieldCheck}>حساب فعال</Badge>
            <Badge color="slate">عضویت از {date(user.created_at)}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="card space-y-4 p-5">
          <h2 className="text-sm font-bold text-white">مشخصات</h2>
          <div>
            <label className="label">نام و نام خانوادگی</label>
            <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="input text-xs" required />
          </div>
          <div>
            <label className="label">شماره موبایل</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="input text-xs"
              placeholder="09123456789"
            />
          </div>
          <div>
            <label className="label">ایمیل (غیرقابل تغییر)</label>
            <input value={user.email} disabled className="input text-xs opacity-60" />
          </div>
          <div>
            <label className="label flex items-center gap-2"><Languages className="h-3.5 w-3.5" /> زبان رابط کاربری</label>
            <select value={locale} onChange={(e) => setLocale(e.target.value)} className="input text-xs">
              <option value="fa">فارسی</option>
              <option value="en">English</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">
            <Save className="h-4 w-4" /> ذخیره تغییرات
          </button>
        </form>

        <form onSubmit={changePassword} className="card space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Lock className="h-4 w-4 text-brand-400" /> تغییر رمز عبور
          </h2>
          <div>
            <label className="label">رمز عبور فعلی</label>
            <input type="password" value={passwords.current_password} onChange={(e) => setPasswords((p) => ({ ...p, current_password: e.target.value }))} className="input text-xs" required />
          </div>
          <div>
            <label className="label">رمز عبور جدید</label>
            <input type="password" value={passwords.new_password} onChange={(e) => setPasswords((p) => ({ ...p, new_password: e.target.value }))} className="input text-xs" required />
          </div>
          <div>
            <label className="label">تکرار رمز جدید</label>
            <input type="password" value={passwords.confirm} onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))} className="input text-xs" required />
          </div>
          <p className="text-[11px] text-slate-500">پس از تغییر رمز، سایر نشست‌ها بسته می‌شوند.</p>
          <button type="submit" disabled={busy} className="btn-ghost">
            <Lock className="h-4 w-4" /> {busy ? 'در حال تغییر…' : 'تغییر رمز عبور'}
          </button>
        </form>
      </div>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <MapPin className="h-4 w-4 text-brand-400" /> آدرس‌های من
          </h2>
          <button onClick={() => setOpen(true)} className="btn-ghost btn-sm">
            <Plus className="h-3.5 w-3.5" /> افزودن آدرس
          </button>
        </div>
        {addresses.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">آدرسی ثبت نشده است.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {addresses.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-100">{a.title}</p>
                  {a.is_default ? <Badge color="indigo">پیش‌فرض</Badge> : null}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{a.receiver} — {a.phone}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{a.province}، {a.city}، {a.line}</p>
                <button onClick={() => removeAddress(a.id)} className="mt-3 flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300">
                  <Trash2 className="h-3 w-3" /> حذف
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="افزودن آدرس"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={saveAddress} className="btn-primary btn-sm">ذخیره</button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">عنوان</label>
            <input value={newAddress.title} onChange={(e) => setNewAddress((a) => ({ ...a, title: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">گیرنده</label>
            <input value={newAddress.receiver} onChange={(e) => setNewAddress((a) => ({ ...a, receiver: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">موبایل</label>
            <input value={newAddress.phone} onChange={(e) => setNewAddress((a) => ({ ...a, phone: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">استان</label>
            <input value={newAddress.province} onChange={(e) => setNewAddress((a) => ({ ...a, province: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">شهر</label>
            <input value={newAddress.city} onChange={(e) => setNewAddress((a) => ({ ...a, city: e.target.value }))} className="input text-xs" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">نشانی</label>
            <textarea value={newAddress.line} onChange={(e) => setNewAddress((a) => ({ ...a, line: e.target.value }))} rows={2} className="input text-xs" />
          </div>
          <div>
            <label className="label">کد پستی</label>
            <input value={newAddress.postal_code} onChange={(e) => setNewAddress((a) => ({ ...a, postal_code: e.target.value }))} className="input text-xs" />
          </div>
          <label className="flex items-center gap-2 self-end text-[11px] text-slate-400">
            <input type="checkbox" checked={newAddress.is_default} onChange={(e) => setNewAddress((a) => ({ ...a, is_default: e.target.checked }))} className="h-3.5 w-3.5 accent-brand-500" />
            آدرس پیش‌فرض
          </label>
        </div>
      </Modal>
    </div>
  );
}
