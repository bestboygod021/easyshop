import { useEffect, useState } from 'react';
import { Boxes, AlertTriangle, PackageX, ArrowUpDown, RefreshCw, Search } from 'lucide-react';
import { get, post, qs } from '../../lib/api';
import { number, toman, timeAgo } from '../../lib/format';
import { Badge, Loading, Modal, StatCard, Tabs } from '../../components/ui';
import { toast } from '../../store';

export default function Inventory() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [delta, setDelta] = useState(0);

  const load = () => get('/admin/inventory').then(setData).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    load();
  }, []);

  const apply = async () => {
    try {
      await post(`/products/${editing.id}/stock`, { delta: Number(delta), reason: 'اصلاح موجودی از انبار' });
      toast('موجودی ثبت شد.');
      setEditing(null);
      setDelta(0);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!data) return <Loading />;

  const items = data.items.filter((i) => {
    if (q && !i.name.includes(q)) return false;
    if (filter === 'low') return i.stock > 0 && i.stock <= i.low_stock_threshold;
    if (filter === 'out') return i.stock === 0;
    if (filter === 'ok') return i.stock > i.low_stock_threshold;
    return true;
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <Boxes className="h-5 w-5 text-brand-400" /> مدیریت انبار
        </h1>
        <p className="mt-1 text-xs text-slate-500">کنترل موجودی، ارزش انبار و تاریخچه تغییرات</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="تعداد کل کالا در انبار" value={number(data.summary.total_units)} icon={Boxes} color="brand" />
        <StatCard label="ارزش انبار" value={toman(data.summary.stock_value)} icon={ArrowUpDown} color="emerald" />
        <StatCard label="موجودی کم" value={number(data.summary.low)} icon={AlertTriangle} color="amber" />
        <StatCard label="ناموجود" value={number(data.summary.out)} icon={PackageX} color="rose" />
      </div>

      <div className="card space-y-3 p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کالا…" className="input py-2 pr-10 text-xs" />
        </div>
        <Tabs
          tabs={[
            { value: 'all', label: 'همه', count: data.items.length },
            { value: 'low', label: 'موجودی کم', count: data.summary.low },
            { value: 'out', label: 'ناموجود', count: data.summary.out },
            { value: 'ok', label: 'موجود' },
          ]}
          active={filter}
          onChange={setFilter}
        />
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>کالا</th>
              <th>دسته</th>
              <th>قیمت</th>
              <th>موجودی</th>
              <th>حد هشدار</th>
              <th>ارزش موجودی</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <img src={i.thumbnail} alt={i.name} className="h-9 w-9 rounded-lg object-cover" />
                    <div>
                      <p className="max-w-[220px] truncate text-xs text-slate-200">{i.name}</p>
                      <p className="text-[10px] text-slate-500">{i.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="text-[11px]">{i.category || '—'}</td>
                <td className="text-[11px]">{toman(i.price, { withUnit: false })}</td>
                <td>
                  <Badge color={i.stock === 0 ? 'rose' : i.stock <= i.low_stock_threshold ? 'amber' : 'emerald'}>
                    {number(i.stock)} {i.stock === 0 ? '(ناموجود)' : ''}
                  </Badge>
                </td>
                <td className="text-[11px] text-slate-500">{number(i.low_stock_threshold)}</td>
                <td className="text-[11px] text-brand-300">{toman(i.stock * i.price)}</td>
                <td>
                  <button
                    onClick={() => {
                      setEditing(i);
                      setDelta(0);
                    }}
                    className="btn-ghost btn-sm"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> اصلاح
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold text-white">آخرین تغییرات انبار</h2>
        <div className="space-y-2">
          {data.movements.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
              <Badge color={m.delta >= 0 ? 'emerald' : 'rose'}>{m.delta >= 0 ? `+${number(m.delta)}` : number(m.delta)}</Badge>
              <span className="flex-1 truncate text-[11px] text-slate-300">{m.product_name}</span>
              <span className="text-[10px] text-slate-500">{m.reason}</span>
              <span className="text-[10px] text-slate-600">{m.user_name || 'سیستم'} · {timeAgo(m.created_at)}</span>
            </div>
          ))}
        </div>
      </section>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`اصلاح موجودی — ${editing?.name || ''}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={apply} className="btn-primary btn-sm">ثبت تغییر</button>
          </div>
        }
      >
        <p className="text-xs text-slate-400">موجودی فعلی: <b className="text-white">{number(editing?.stock || 0)}</b></p>
        <label className="label mt-4">تغییر (+/-)</label>
        <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="input text-xs" />
        <p className="mt-3 text-[11px] text-slate-500">موجودی نهایی: <b className="text-brand-300">{number((editing?.stock || 0) + Number(delta || 0))}</b></p>
      </Modal>
    </div>
  );
}
