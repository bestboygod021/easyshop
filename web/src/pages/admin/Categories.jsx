import { useEffect, useState } from 'react';
import { FolderTree, Plus, Pencil, Trash2, Sparkles, Wand2, Search } from 'lucide-react';
import { del, get, patch, post } from '../../lib/api';
import { number } from '../../lib/format';
import { Badge, Loading, Modal, Switch } from '../../components/ui';
import { toast } from '../../store';

const ICONS = ['Smartphone', 'Laptop', 'Headphones', 'Camera', 'Home', 'Lamp', 'Shirt', 'Footprints', 'Heart', 'Sparkles', 'Dumbbell', 'Tent', 'Luggage', 'ShoppingBasket', 'Cookie', 'Blocks', 'Baby', 'BookOpen', 'PenTool', 'Tag'];

export default function AdminCategories() {
  const [tree, setTree] = useState(null);
  const [flat, setFlat] = useState([]);
  const [editing, setEditing] = useState(null);
  const [genOpen, setGenOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [generated, setGenerated] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [t, f] = await Promise.all([get('/categories?include_inactive=1'), get('/categories?flat=1&include_inactive=1')]);
    setTree(t.items);
    setFlat(f.items);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      if (editing.id) await patch(`/categories/${editing.id}`, editing);
      else await post('/categories', editing);
      toast('دسته‌بندی ذخیره شد.');
      setEditing(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (cat) => {
    if (!confirm(`حذف «${cat.name}»؟`)) return;
    try {
      const res = await del(`/categories/${cat.id}`);
      toast(res.message || 'حذف شد.', 'info');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const generate = async (save = false) => {
    setBusy(true);
    try {
      const data = await post('/ai/generate/categories', { topic, save, count: 6 });
      setGenerated(data.categories || []);
      toast(save ? `دسته‌بندی‌ها ذخیره شد (${data.saved?.length || 0} مورد).` : 'پیشنهاد دسته‌بندی تولید شد.', 'info');
      if (save) load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!tree) return <Loading />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <FolderTree className="h-5 w-5 text-brand-400" /> دسته‌بندی‌ها
          </h1>
          <p className="mt-1 text-xs text-slate-500">{number(flat.length)} دسته‌بندی (اصلی و زیردسته)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setGenOpen(true)} className="btn-ghost btn-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-300" /> ساخت با هوش مصنوعی
          </button>
          <button
            onClick={() => setEditing({ name: '', slug: '', icon: 'Tag', color: '#6366f1', parent_id: '', description: '', sort_order: 99, is_active: true })}
            className="btn-primary btn-sm"
          >
            <Plus className="h-3.5 w-3.5" /> دسته‌بندی جدید
          </button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        {tree.map((cat) => (
          <div key={cat.id} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${cat.color}22`, color: cat.color }}>
                  <FolderTree className="h-5 w-5" />
                </span>
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-white">
                    {cat.name}
                    {!cat.is_active ? <Badge color="slate">غیرفعال</Badge> : null}
                  </p>
                  <p className="text-[10px] text-slate-500">{cat.slug} · {number(cat.product_count)} محصول</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing({ ...cat, parent_id: cat.parent_id || '' })} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(cat)} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {cat.children?.length ? (
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {cat.children.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-2.5 py-1.5">
                    <span className="truncate text-[11px] text-slate-300">{c.name}</span>
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-600">{number(c.product_count)}</span>
                      <button onClick={() => setEditing({ ...c, parent_id: c.parent_id || '' })} className="text-slate-500 hover:text-white">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* ویرایش/ایجاد */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'ویرایش دسته‌بندی' : 'دسته‌بندی جدید'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={save} className="btn-primary btn-sm">ذخیره</button>
          </div>
        }
      >
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">نام</label>
              <input value={editing.name} onChange={(e) => setEditing((c) => ({ ...c, name: e.target.value }))} className="input text-xs" />
            </div>
            <div>
              <label className="label">نامک (slug)</label>
              <input value={editing.slug} onChange={(e) => setEditing((c) => ({ ...c, slug: e.target.value }))} className="input text-xs" dir="ltr" placeholder="خودکار از نام" />
            </div>
            <div>
              <label className="label">دسته والد</label>
              <select value={editing.parent_id || ''} onChange={(e) => setEditing((c) => ({ ...c, parent_id: e.target.value }))} className="input text-xs">
                <option value="">دسته اصلی (بدون والد)</option>
                {flat.filter((c) => !c.parent_id && c.id !== editing.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">آیکون</label>
              <select value={editing.icon} onChange={(e) => setEditing((c) => ({ ...c, icon: e.target.value }))} className="input text-xs">
                {ICONS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">رنگ</label>
              <input type="color" value={editing.color} onChange={(e) => setEditing((c) => ({ ...c, color: e.target.value }))} className="input h-10 p-1" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">توضیحات</label>
              <textarea value={editing.description || ''} onChange={(e) => setEditing((c) => ({ ...c, description: e.target.value }))} rows={2} className="input text-xs" />
            </div>
            <div>
              <label className="label">ترتیب</label>
              <input type="number" value={editing.sort_order} onChange={(e) => setEditing((c) => ({ ...c, sort_order: Number(e.target.value) }))} className="input text-xs" />
            </div>
            <div className="flex items-end">
              <Switch checked={editing.is_active !== false} onChange={(v) => setEditing((c) => ({ ...c, is_active: v }))} label="فعال باشد" />
            </div>
          </div>
        ) : null}
      </Modal>

      {/* تولید با AI */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="ساخت دسته‌بندی با هوش مصنوعی"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => generate(false)} disabled={busy} className="btn-ghost btn-sm">
              <Wand2 className="h-3.5 w-3.5" /> فقط پیشنهاد بده
            </button>
            <button onClick={() => generate(true)} disabled={busy} className="btn-primary btn-sm">
              <Sparkles className="h-3.5 w-3.5" /> تولید و ذخیره
            </button>
          </div>
        }
      >
        <label className="label">فروشگاه روی چه حوزه‌ای تمرکز دارد؟</label>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="مثلاً: لوازم ورزشی و کوهنوردی" className="input pr-10 text-xs" />
        </div>
        {generated.length ? (
          <div className="mt-4 space-y-2">
            {generated.map((c, i) => (
              <div key={i} className="rounded-xl border border-white/10 p-3">
                <p className="text-xs font-bold text-slate-200">{c.name_fa} <span className="text-[10px] text-slate-500">({c.slug})</span></p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.subcategories?.map((s, j) => (
                    <span key={j} className="chip border border-white/10 bg-white/5 text-[10px] text-slate-400">{s.name_fa}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
