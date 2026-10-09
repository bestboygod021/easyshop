import { useCallback, useEffect, useState } from 'react';
import { ScrollText, Search, Filter, ShieldAlert } from 'lucide-react';
import { get, qs } from '../../lib/api';
import { date, number } from '../../lib/format';
import { Badge, EmptyState, Loading, Pagination } from '../../components/ui';
import { toast } from '../../store';
import { useAuth } from '../../store';

export default function Logs() {
  const me = useAuth((s) => s.user);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setData(null);
    get(`/admin/audit-logs?${qs({ page, limit: 50 })}`)
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  if (me && me.role !== 'admin') {
    return (
      <EmptyState
        title="دسترسی محدود"
        description="مشاهده لاگ‌های سیستم فقط برای مدیر اصلی امکان‌پذیر است."
        icon={ShieldAlert}
      />
    );
  }

  if (!data) return <Loading />;

  const items = q ? data.items.filter((l) => JSON.stringify(l).toLowerCase().includes(q.toLowerCase())) : data.items;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <ScrollText className="h-5 w-5 text-brand-400" /> لاگ سیستم
        </h1>
        <p className="mt-1 text-xs text-slate-500">{number(data.total)} رکورد ثبت‌شده از فعالیت مدیران و کارمندان</p>
      </header>

      <div className="card p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در لاگ‌ها (اکشن، کاربر، جزئیات)…" className="input py-2 pr-10 text-xs" />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
          <Filter className="h-3 w-3" /> فیلتر روی صفحه جاری اعمال می‌شود.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState title="رکوردی یافت نشد" icon={ScrollText} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>کاربر</th>
                  <th>عملیات</th>
                  <th>موجودیت</th>
                  <th>جزئیات</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-[11px] text-slate-500">{date(l.created_at, { withTime: true })}</td>
                    <td className="text-[11px] text-slate-300">{l.actor_name || '—'}</td>
                    <td><Badge color={l.action?.includes('delete') ? 'rose' : l.action?.includes('update') ? 'amber' : 'brand'}>{l.action}</Badge></td>
                    <td className="text-[10px] text-slate-500">{l.entity}{l.entity_id ? ` #${String(l.entity_id).slice(-6)}` : ''}</td>
                    <td className="max-w-[380px] truncate font-mono text-[10px] text-slate-500" dir="ltr">{l.meta || '—'}</td>
                    <td className="text-[10px] text-slate-600" dir="ltr">{l.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={Math.max(1, Math.ceil(data.total / (data.limit || 50)))} onChange={setPage} />
        </>
      )}
    </div>
  );
}
