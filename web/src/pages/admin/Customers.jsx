import { useEffect, useState } from 'react';
import { Users, Search, ShieldCheck, Ban, Wallet, Mail, Phone, Pencil } from 'lucide-react';
import { get, patch, post, qs } from '../../lib/api';
import { number, toman, date, initials } from '../../lib/format';
import { Badge, Loading, Modal, Pagination, StatCard, Tabs } from '../../components/ui';
import { useAuth, toast } from '../../store';

const ROLES = { customer: 'مشتری', support: 'پشتیبان', seller: 'فروشنده', admin: 'مدیر' };

export default function Customers() {
  const me = useAuth((s) => s.user);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setData(null);
    get(`/admin/users?${qs({ q, role, page, limit: 20 })}`)
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  };

  useEffect(() => {
    load();
  }, [role, page]);

  const save = async () => {
    try {
      await patch(`/admin/users/${editing.id}`, {
        full_name: editing.full_name,
        phone: editing.phone,
        role: editing.role,
        status: editing.status,
        wallet: editing.wallet,
        loyalty_points: editing.loyalty_points,
        notes: editing.notes,
        ...(editing.new_password ? { password: editing.new_password } : {}),
      });
      toast('کاربر به‌روزرسانی شد.');
      setEditing(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const block = async (u) => {
    if (!confirm(`مسدود کردن «${u.full_name}»؟`)) return;
    try {
      await patch(`/admin/users/${u.id}`, { status: u.status === 'blocked' ? 'active' : 'blocked' });
      toast('وضعیت کاربر تغییر کرد.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <Users className="h-5 w-5 text-brand-400" /> کاربران
          </h1>
          <p className="mt-1 text-xs text-slate-500">مدیریت مشتریان، کارمندان و دسترسی‌ها</p>
        </div>
      </header>

      {data?.summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="مشتریان" value={number(data.summary.customers)} icon={Users} color="brand" />
          <StatCard label="کارمندان" value={number(data.summary.staff)} icon={ShieldCheck} color="violet" />
          <StatCard label="مسدودشده" value={number(data.summary.blocked)} icon={Ban} color="rose" />
        </div>
      ) : null}

      <div className="card space-y-3 p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
            placeholder="جستجوی نام، ایمیل یا شماره موبایل…"
            className="input py-2 pr-10 text-xs"
          />
        </div>
        <Tabs
          tabs={[{ value: '', label: 'همه' }, ...Object.entries(ROLES).map(([v, l]) => ({ value: v, label: l }))]}
          active={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
        />
      </div>

      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>نقش</th>
                  <th>سفارش‌ها</th>
                  <th>مجموع خرید</th>
                  <th>کیف پول</th>
                  <th>وضعیت</th>
                  <th>عضویت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-[10px] font-bold text-white">
                          {initials(u.full_name)}
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-slate-200">{u.full_name}</p>
                          <p className="flex items-center gap-1 text-[10px] text-slate-500">
                            <Mail className="h-2.5 w-2.5" /> {u.email}
                          </p>
                          {u.phone ? (
                            <p className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Phone className="h-2.5 w-2.5" /> {u.phone}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td><Badge color={u.role === 'admin' ? 'rose' : u.role === 'support' ? 'cyan' : u.role === 'seller' ? 'violet' : 'slate'}>{ROLES[u.role]}</Badge></td>
                    <td className="text-[11px]">{number(u.orders)}</td>
                    <td className="text-[11px] text-brand-300">{toman(u.total_spent)}</td>
                    <td className="text-[11px] text-emerald-300">{toman(u.wallet)}</td>
                    <td>
                      <Badge color={u.status === 'active' ? 'emerald' : u.status === 'blocked' ? 'rose' : 'amber'}>
                        {u.status === 'active' ? 'فعال' : u.status === 'blocked' ? 'مسدود' : 'در انتظار'}
                      </Badge>
                    </td>
                    <td className="text-[11px] text-slate-500">{date(u.created_at)}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => setEditing({ ...u, new_password: '' })} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {me?.role === 'admin' ? (
                          <button onClick={() => block(u)} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10">
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`ویرایش کاربر — ${editing?.full_name || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={save} className="btn-primary btn-sm">ذخیره</button>
          </div>
        }
      >
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">نام کامل</label>
              <input value={editing.full_name} onChange={(e) => setEditing((u) => ({ ...u, full_name: e.target.value }))} className="input text-xs" />
            </div>
            <div>
              <label className="label">موبایل</label>
              <input value={editing.phone || ''} onChange={(e) => setEditing((u) => ({ ...u, phone: e.target.value }))} className="input text-xs" />
            </div>
            <div>
              <label className="label">نقش</label>
              <select value={editing.role} onChange={(e) => setEditing((u) => ({ ...u, role: e.target.value }))} className="input text-xs">
                {Object.entries(ROLES).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">وضعیت</label>
              <select value={editing.status} onChange={(e) => setEditing((u) => ({ ...u, status: e.target.value }))} className="input text-xs">
                <option value="active">فعال</option>
                <option value="blocked">مسدود</option>
                <option value="pending">در انتظار تأیید</option>
              </select>
            </div>
            <div>
              <label className="label">کیف پول (تومان)</label>
              <input type="number" value={editing.wallet} onChange={(e) => setEditing((u) => ({ ...u, wallet: Number(e.target.value) }))} className="input text-xs" />
            </div>
            <div>
              <label className="label">امتیاز</label>
              <input type="number" value={editing.loyalty_points} onChange={(e) => setEditing((u) => ({ ...u, loyalty_points: Number(e.target.value) }))} className="input text-xs" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">رمز عبور جدید (اختیاری)</label>
              <input type="password" value={editing.new_password} onChange={(e) => setEditing((u) => ({ ...u, new_password: e.target.value }))} className="input text-xs" placeholder="خالی بگذارید تا تغییر نکند" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">یادداشت مدیریتی</label>
              <textarea value={editing.notes || ''} onChange={(e) => setEditing((u) => ({ ...u, notes: e.target.value }))} rows={2} className="input text-xs" />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
