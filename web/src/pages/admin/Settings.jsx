import { useEffect, useState } from 'react';
import {
  Settings2, Store, Coins, Palette, Plug, Megaphone, Save, Send, ShieldCheck, Database, Download,
} from 'lucide-react';
import { get, post, put } from '../../lib/api';
import { number } from '../../lib/format';
import { Badge, Loading, Switch, Tabs } from '../../components/ui';
import { toast } from '../../store';

export default function Settings() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('store');
  const [saving, setSaving] = useState(false);
  const [broadcast, setBroadcast] = useState({ title: '', body: '', role: 'customer', link: '' });

  useEffect(() => {
    get('/admin/settings').then((d) => setData(d.settings)).catch((e) => toast(e.message, 'error'));
  }, []);

  const patch = (group, key, value) => setData((s) => ({ ...s, [group]: { ...s[group], [key]: value } }));

  const save = async (groups = [tab]) => {
    setSaving(true);
    try {
      const payload = {};
      for (const g of groups) payload[g] = data[g];
      await put('/admin/settings', { settings: payload });
      toast('تنظیمات ذخیره شد.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendBroadcast = async () => {
    try {
      const res = await post('/admin/broadcast', broadcast);
      toast(res.message || 'اعلان ارسال شد.');
      setBroadcast({ title: '', body: '', role: 'customer', link: '' });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <Settings2 className="h-5 w-5 text-brand-400" /> تنظیمات فروشگاه
        </h1>
        <p className="mt-1 text-xs text-slate-500">اطلاعات فروشگاه، قواعد فروش، ظاهر، اتصالات و اعلان‌ها</p>
      </header>

      <Tabs
        tabs={[
          { value: 'store', label: 'اطلاعات فروشگاه', icon: Store },
          { value: 'commerce', label: 'قواعد فروش', icon: Coins },
          { value: 'appearance', label: 'ظاهر', icon: Palette },
          { value: 'integrations', label: 'اتصالات', icon: Plug },
          { value: 'broadcast', label: 'اعلان همگانی', icon: Megaphone },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="card p-5">
        {tab === 'store' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">نام فروشگاه</label>
                <input value={data.store?.name || ''} onChange={(e) => patch('store', 'name', e.target.value)} className="input text-xs" />
              </div>
              <div>
                <label className="label">شعار</label>
                <input value={data.store?.tagline || ''} onChange={(e) => patch('store', 'tagline', e.target.value)} className="input text-xs" />
              </div>
              <div>
                <label className="label">ایمیل</label>
                <input value={data.store?.email || ''} onChange={(e) => patch('store', 'email', e.target.value)} className="input text-xs" dir="ltr" />
              </div>
              <div>
                <label className="label">تلفن</label>
                <input value={data.store?.phone || ''} onChange={(e) => patch('store', 'phone', e.target.value)} className="input text-xs" dir="ltr" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">آدرس</label>
                <input value={data.store?.address || ''} onChange={(e) => patch('store', 'address', e.target.value)} className="input text-xs" />
              </div>
              <div>
                <label className="label">اینستاگرام</label>
                <input value={data.store?.instagram || ''} onChange={(e) => patch('store', 'instagram', e.target.value)} className="input text-xs" dir="ltr" />
              </div>
              <div>
                <label className="label">تلگرام</label>
                <input value={data.store?.telegram || ''} onChange={(e) => patch('store', 'telegram', e.target.value)} className="input text-xs" dir="ltr" />
              </div>
              <div>
                <label className="label">ساعات کاری</label>
                <input value={data.store?.working_hours || ''} onChange={(e) => patch('store', 'working_hours', e.target.value)} className="input text-xs" />
              </div>
            </div>
            <button onClick={() => save(['store'])} disabled={saving} className="btn-primary btn-sm">
              <Save className="h-3.5 w-3.5" /> ذخیره
            </button>
          </div>
        ) : null}

        {tab === 'commerce' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">درصد مالیات</label>
                <input type="number" value={data.commerce?.tax_percent ?? 0} onChange={(e) => patch('commerce', 'tax_percent', Number(e.target.value))} className="input text-xs" />
              </div>
              <div>
                <label className="label">هزینه ارسال ثابت (تومان)</label>
                <input type="number" value={data.commerce?.shipping_flat ?? 0} onChange={(e) => patch('commerce', 'shipping_flat', Number(e.target.value))} className="input text-xs" />
              </div>
              <div>
                <label className="label">آستانه ارسال رایگان (تومان)</label>
                <input type="number" value={data.commerce?.free_shipping_threshold ?? 0} onChange={(e) => patch('commerce', 'free_shipping_threshold', Number(e.target.value))} className="input text-xs" />
              </div>
              <div>
                <label className="label">کش‌بک (درصد)</label>
                <input type="number" value={data.commerce?.cashback_percent ?? 0} onChange={(e) => patch('commerce', 'cashback_percent', Number(e.target.value))} className="input text-xs" />
              </div>
              <div>
                <label className="label">نرخ امتیاز وفاداری</label>
                <input type="number" value={data.commerce?.loyalty_rate ?? 1} onChange={(e) => patch('commerce', 'loyalty_rate', Number(e.target.value))} className="input text-xs" />
              </div>
              <div className="flex items-end">
                <Switch checked={Boolean(data.commerce?.cod_enabled)} onChange={(v) => patch('commerce', 'cod_enabled', v)} label="پرداخت در محل فعال" />
              </div>
            </div>
            <button onClick={() => save(['commerce'])} disabled={saving} className="btn-primary btn-sm">
              <Save className="h-3.5 w-3.5" /> ذخیره
            </button>
          </div>
        ) : null}

        {tab === 'appearance' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">رنگ اصلی</label>
                <input type="color" value={data.appearance?.primary || '#6366f1'} onChange={(e) => patch('appearance', 'primary', e.target.value)} className="input h-10 p-1" />
              </div>
              <div>
                <label className="label">رنگ مکمل</label>
                <input type="color" value={data.appearance?.accent || '#f97316'} onChange={(e) => patch('appearance', 'accent', e.target.value)} className="input h-10 p-1" />
              </div>
              <div className="flex items-end">
                <Switch checked={Boolean(data.appearance?.dark_mode_default)} onChange={(v) => patch('appearance', 'dark_mode_default', v)} label="حالت تاریک پیش‌فرض" />
              </div>
              <div className="sm:col-span-3">
                <label className="label">بنر صفحه اصلی</label>
                <input value={data.appearance?.homepage_banner || ''} onChange={(e) => patch('appearance', 'homepage_banner', e.target.value)} className="input text-xs" />
              </div>
            </div>
            <button onClick={() => save(['appearance'])} disabled={saving} className="btn-primary btn-sm">
              <Save className="h-3.5 w-3.5" /> ذخیره
            </button>
          </div>
        ) : null}

        {tab === 'integrations' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 p-4">
                <p className="flex items-center gap-2 text-xs font-bold text-white">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> درگاه پرداخت
                </p>
                <p className="mt-1 text-[11px] text-slate-500">زرین‌پال، آیدی‌پی، کارت به کارت و پرداخت در محل</p>
                <div className="mt-2 flex gap-1.5">
                  <Badge color="emerald">فعال</Badge>
                  <Badge color="slate">شبیه‌سازی‌شده</Badge>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 p-4">
                <p className="flex items-center gap-2 text-xs font-bold text-white">
                  <Plug className="h-4 w-4 text-brand-400" /> سرویس پیامک
                </p>
                <input
                  value={data.integrations?.sms_api_key || ''}
                  onChange={(e) => patch('integrations', 'sms_api_key', e.target.value)}
                  placeholder="کلید API کاوه‌نگار / ملی‌پیامک"
                  className="input mt-2 text-xs"
                  dir="ltr"
                />
              </div>
              <div className="rounded-2xl border border-white/10 p-4">
                <p className="flex items-center gap-2 text-xs font-bold text-white">
                  <Database className="h-4 w-4 text-violet-400" /> پایگاه داده
                </p>
                <p className="mt-1 text-[11px] text-slate-500">SQLite داخلی Node (بدون نیاز به نصب) — پشتیبان‌گیری روزانه</p>
                <a href="/api/docs" className="btn-ghost btn-sm mt-2">
                  <Download className="h-3.5 w-3.5" /> مستندات API
                </a>
              </div>
              <div className="rounded-2xl border border-white/10 p-4">
                <p className="flex items-center gap-2 text-xs font-bold text-white">
                  <Plug className="h-4 w-4 text-cyan-400" /> تحلیل‌گر بازدید
                </p>
                <input
                  value={data.integrations?.analytics_id || ''}
                  onChange={(e) => patch('integrations', 'analytics_id', e.target.value)}
                  placeholder="Google Analytics / Yektanet ID"
                  className="input mt-2 text-xs"
                  dir="ltr"
                />
              </div>
            </div>
            <button onClick={() => save(['integrations'])} disabled={saving} className="btn-primary btn-sm">
              <Save className="h-3.5 w-3.5" /> ذخیره
            </button>
          </div>
        ) : null}

        {tab === 'broadcast' ? (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500">
              ارسال اعلان لحظه‌ای (WebSocket) و ذخیره در پنل کاربری برای گروه انتخابی.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">عنوان اعلان</label>
                <input value={broadcast.title} onChange={(e) => setBroadcast((b) => ({ ...b, title: e.target.value }))} className="input text-xs" />
              </div>
              <div>
                <label className="label">گروه هدف</label>
                <select value={broadcast.role} onChange={(e) => setBroadcast((b) => ({ ...b, role: e.target.value }))} className="input text-xs">
                  <option value="customer">همه مشتریان</option>
                  <option value="seller">فروشندگان</option>
                  <option value="support">کارشناسان پشتیبانی</option>
                  <option value="admin">مدیران</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">متن پیام</label>
                <textarea value={broadcast.body} onChange={(e) => setBroadcast((b) => ({ ...b, body: e.target.value }))} rows={3} className="input text-xs" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">لینک (اختیاری)</label>
                <input value={broadcast.link} onChange={(e) => setBroadcast((b) => ({ ...b, link: e.target.value }))} placeholder="/products?discount=1" className="input text-xs" dir="ltr" />
              </div>
            </div>
            <button onClick={sendBroadcast} disabled={!broadcast.title} className="btn-primary btn-sm">
              <Send className="h-3.5 w-3.5" /> ارسال اعلان
            </button>
          </div>
        ) : null}
      </div>

      <div className="card p-4 text-[10px] leading-5 text-slate-500">
        <p>• نسخه API: v1 · پایگاه داده: SQLite · محیط اجرا: Node.js</p>
        <p>• {number(Object.keys(data).length)} گروه تنظیمات فعال است؛ تغییرات بلافاصله روی فروشگاه اعمال می‌شود.</p>
      </div>
    </div>
  );
}
