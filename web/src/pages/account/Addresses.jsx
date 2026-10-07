import { useEffect, useState } from 'react';
import { MapPin, Plus, Trash2, Star } from 'lucide-react';
import { del, get, patch, post } from '../../lib/api';
import { Badge, EmptyState, Loading, Modal } from '../../components/ui';
import { toast } from '../../store';

const EMPTY = { title: 'آدرس من', receiver: '', phone: '', province: 'تهران', city: 'تهران', postal_code: '', line: '', is_default: false };

export default function Addresses() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = () => get('/account/addresses').then((d) => setItems(d.items)).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      await post('/account/addresses', form);
      toast('آدرس ذخیره شد.');
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const makeDefault = async (id) => {
    try {
      await patch(`/account/addresses/${id}`, { is_default: true });
      toast('آدرس پیش‌فرض تغییر کرد.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (id) => {
    try {
      await del(`/account/addresses/${id}`);
      toast('آدرس حذف شد.', 'info');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!items) return <Loading />;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-base font-extrabold text-white">
            <MapPin className="h-5 w-5 text-brand-400" /> آدرس‌های من
          </h1>
          <p className="mt-1 text-xs text-slate-500">آدرس‌های تحویل برای خریدهای سریع‌تر</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" /> آدرس جدید
        </button>
      </header>

      {items.length === 0 ? (
        <EmptyState title="آدرسی ثبت نشده است" description="برای تسریع فرآیند خرید، آدرس خود را ذخیره کنید." icon={MapPin} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-100">{a.title}</p>
                {a.is_default ? <Badge color="indigo">پیش‌فرض</Badge> : null}
              </div>
              <p className="mt-2 text-[11px] text-slate-300">{a.receiver} — {a.phone}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                {a.province}، {a.city}، {a.line}
                {a.postal_code ? ` — کد پستی: ${a.postal_code}` : ''}
              </p>
              <div className="mt-3 flex items-center gap-3">
                {!a.is_default ? (
                  <button onClick={() => makeDefault(a.id)} className="flex items-center gap-1 text-[11px] text-brand-300 hover:text-brand-200">
                    <Star className="h-3 w-3" /> پیش‌فرض کن
                  </button>
                ) : null}
                <button onClick={() => remove(a.id)} className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300">
                  <Trash2 className="h-3 w-3" /> حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="افزودن آدرس جدید"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={save} className="btn-primary btn-sm">ذخیره آدرس</button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">عنوان</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">نام گیرنده</label>
            <input value={form.receiver} onChange={(e) => setForm((f) => ({ ...f, receiver: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">تلفن</label>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">استان</label>
            <input value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">شهر</label>
            <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="input text-xs" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">نشانی کامل</label>
            <textarea value={form.line} onChange={(e) => setForm((f) => ({ ...f, line: e.target.value }))} rows={2} className="input text-xs" />
          </div>
          <div>
            <label className="label">کد پستی</label>
            <input value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} className="input text-xs" />
          </div>
          <label className="flex items-center gap-2 self-end text-[11px] text-slate-400">
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} className="h-3.5 w-3.5 accent-brand-500" />
            آدرس پیش‌فرض من باشد
          </label>
        </div>
      </Modal>
    </div>
  );
}
