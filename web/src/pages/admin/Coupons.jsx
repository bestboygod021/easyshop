import { useEffect, useState } from 'react';
import { BadgePercent, Plus, Copy, Power, Trash2 } from 'lucide-react';
import { get, patch, post } from '../../lib/api';
import { number, toman, date, fa } from '../../lib/format';
import { Badge, Loading, Modal, Switch } from '../../components/ui';
import { CopyButton } from '../../components/ui';
import { toast } from '../../store';

const TYPES = { percent: 'درصدی', fixed: 'مبلغ ثابت', free_shipping: 'ارسال رایگان' };

export default function Coupons() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', type: 'percent', value: 10, min_subtotal: 0, max_discount: '', usage_limit: '', per_user_limit: 1, ends_at: '', description: '' });

  const load = () => get('/admin/coupons').then((d) => setItems(d.items)).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    try {
      await post('/admin/coupons', form);
      toast('کد تخفیف ایجاد شد.');
      setOpen(false);
      setForm({ code: '', type: 'percent', value: 10, min_subtotal: 0, max_discount: '', usage_limit: '', per_user_limit: 1, ends_at: '', description: '' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggle = async (c) => {
    try {
      await patch(`/admin/coupons/${c.id}`, { is_active: !c.is_active });
      toast('وضعیت کد تغییر کرد.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!items) return <Loading />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <BadgePercent className="h-5 w-5 text-brand-400" /> کدهای تخفیف
          </h1>
          <p className="mt-1 text-xs text-slate-500">{number(items.length)} کد ثبت‌شده — کمپین‌های فروش خود را مدیریت کنید</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" /> کد جدید
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-brand-200">
                {c.code}
              </span>
              <Badge color={c.is_active ? 'emerald' : 'slate'}>{c.is_active ? 'فعال' : 'غیرفعال'}</Badge>
            </div>
            <p className="mt-3 text-xs text-slate-300">{c.description || TYPES[c.type]}</p>
            <div className="mt-3 space-y-1.5 text-[11px] text-slate-400">
              <p>
                مقدار:{' '}
                <b className="text-slate-200">
                  {c.type === 'percent' ? `${fa(c.value)}٪` : c.type === 'fixed' ? toman(c.value) : 'ارسال رایگان'}
                </b>
              </p>
              <p>حداقل خرید: {c.min_subtotal ? toman(c.min_subtotal) : 'ندارد'}</p>
              {c.max_discount ? <p>سقف تخفیف: {toman(c.max_discount)}</p> : null}
              <p>استفاده‌شده: {number(c.used_count)}{c.usage_limit ? ` از ${number(c.usage_limit)}` : ''}</p>
              {c.ends_at ? <p>انقضا: {date(c.ends_at)}</p> : null}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <CopyButton text={c.code} label="کپی کد" />
              <button onClick={() => toggle(c)} className={`rounded-lg p-1.5 ${c.is_active ? 'text-rose-400 hover:bg-rose-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}>
                <Power className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="ایجاد کد تخفیف"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={create} className="btn-primary btn-sm">ایجاد کد</button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">کد تخفیف</label>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="input font-mono text-xs" dir="ltr" placeholder="SUMMER25" />
          </div>
          <div>
            <label className="label">نوع</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input text-xs">
              {Object.entries(TYPES).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{form.type === 'percent' ? 'درصد تخفیف' : 'مبلغ تخفیف (تومان)'}</label>
            <input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))} className="input text-xs" disabled={form.type === 'free_shipping'} />
          </div>
          <div>
            <label className="label">حداقل مبلغ سفارش</label>
            <input type="number" value={form.min_subtotal} onChange={(e) => setForm((f) => ({ ...f, min_subtotal: Number(e.target.value) }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">سقف تخفیف (اختیاری)</label>
            <input type="number" value={form.max_discount} onChange={(e) => setForm((f) => ({ ...f, max_discount: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">محدودیت تعداد استفاده</label>
            <input type="number" value={form.usage_limit} onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))} className="input text-xs" />
          </div>
          <div>
            <label className="label">تاریخ انقضا</label>
            <input type="date" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} className="input text-xs" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">توضیحات</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input text-xs" placeholder="مثلاً: جشنواره پاییزه" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
