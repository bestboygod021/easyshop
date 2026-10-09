import { useEffect, useState } from 'react';
import {
  Cpu, Key, Eye, EyeOff, Zap, CheckCircle2, XCircle, ExternalLink, Wand2, Settings2, Activity,
} from 'lucide-react';
import { get, put, post } from '../../lib/api';
import { number, toman } from '../../lib/format';
import { Badge, Loading, Modal, Spinner, StatCard, Switch, Tabs } from '../../components/ui';
import { toast } from '../../store';

export default function AiProviders() {
  const [providers, setProviders] = useState(null);
  const [edit, setEdit] = useState(null);
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState('');
  const [testResult, setTestResult] = useState({});
  const [logs, setLogs] = useState(null);
  const [tab, setTab] = useState('providers');
  const [aiSettings, setAiSettings] = useState(null);
  const [featured, setFeatured] = useState([]);

  const load = () => get('/ai/providers').then((d) => setProviders(d.providers)).catch((e) => toast(e.message, 'error'));

  useEffect(() => {
    load();
    get('/ai/models').then((d) => setFeatured(d.featured)).catch(() => {});
    get('/ai/logs?limit=60').then(setLogs).catch(() => {});
    get('/admin/settings').then((d) => setAiSettings(d.settings.ai || {})).catch(() => {});
  }, []);

  const save = async () => {
    try {
      await put(`/ai/providers/${edit.slug}`, {
        api_key: edit.api_key ?? undefined,
        default_model: edit.default_model,
        enabled: edit.enabled,
        priority: edit.priority,
        temperature: edit.temperature,
        max_tokens: edit.max_tokens,
        monthly_token_cap: edit.monthly_token_cap,
        notes: edit.notes,
      });
      toast('تنظیمات ذخیره شد.');
      setEdit(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const test = async (slug) => {
    setTesting(slug);
    try {
      const res = await post(`/ai/providers/${slug}/test`, {});
      setTestResult((t) => ({ ...t, [slug]: res }));
      toast(res.ok ? `اتصال ${slug} موفق بود.` : `خطا: ${res.error}`, res.ok ? 'success' : 'error');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTesting('');
    }
  };

  const saveAiSettings = async (patchObj) => {
    try {
      const next = { ...aiSettings, ...patchObj };
      setAiSettings(next);
      await put('/ai/settings', next);
      toast('تنظیمات هوش مصنوعی ذخیره شد.');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!providers) return <Loading />;

  const configuredCount = providers.filter((p) => p.configured && p.kind !== 'builtin').length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <Cpu className="h-5 w-5 text-brand-400" /> مدل‌های هوش مصنوعی و کلیدهای API
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {number(configuredCount)} سرویس ابری متصل · {number(providers.length)} ارائه‌دهنده فعال در سیستم
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="ارائه‌دهنده‌ها" value={number(providers.length)} icon={Cpu} color="brand" />
        <StatCard label="متصل با کلید" value={number(configuredCount)} icon={Key} color="emerald" />
        <StatCard label="توکن مصرفی" value={number(providers.reduce((s, p) => s + (p.used_tokens || 0), 0))} icon={Activity} color="violet" />
        <StatCard label="فراخوانی‌ها" value={number(logs?.stats?.calls || 0)} icon={Zap} color="amber" hint={`خطا: ${number(logs?.stats?.errors || 0)}`} />
      </div>

      <Tabs
        tabs={[
          { value: 'providers', label: 'ارائه‌دهنده‌ها' },
          { value: 'settings', label: 'تنظیمات هوش مصنوعی' },
          { value: 'logs', label: 'لاگ فراخوانی‌ها' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'providers' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {providers.map((p) => (
            <div key={p.slug} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-white">
                    {p.name}
                    {p.slug === 'builtin' ? <Badge color="indigo">بدون کلید</Badge> : null}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">{p.badge || p.name_en}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={p.configured ? 'emerald' : 'slate'}>{p.configured ? 'متصل' : 'کلید ندارد'}</Badge>
                  {testResult[p.slug] ? (
                    testResult[p.slug].ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-rose-400" />
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <p>مدل پیش‌فرض: <b className="text-slate-200">{p.default_model}</b></p>
                <p>اولویت: <b className="text-slate-200">{number(p.priority)}</b></p>
                <p>ماکزیمم توکن: <b className="text-slate-200">{number(p.max_tokens)}</b></p>
                <p>دمای مدل: <b className="text-slate-200">{p.temperature}</b></p>
                <p className="col-span-2">
                  کلید: <span className="font-mono text-slate-300">{p.api_key_masked || '—'}</span>
                </p>
                {p.used_tokens ? <p className="col-span-2">مصرف: {number(p.used_tokens)} توکن</p> : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => { setEdit({ ...p, api_key: '' }); setReveal(false); }} className="btn-ghost btn-sm">
                  <Settings2 className="h-3.5 w-3.5" /> تنظیم
                </button>
                <button onClick={() => test(p.slug)} disabled={testing === p.slug} className="btn-ghost btn-sm">
                  {testing === p.slug ? <Spinner className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5 text-amber-300" />} تست اتصال
                </button>
                {p.docs ? (
                  <a href={p.docs} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                    <ExternalLink className="h-3.5 w-3.5" /> دریافت کلید
                  </a>
                ) : null}
              </div>

              {testResult[p.slug] && !testResult[p.slug].ok ? (
                <p className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-[10px] text-rose-300">
                  {testResult[p.slug].error}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'settings' && aiSettings ? (
        <div className="card space-y-4 p-5">
          <h2 className="text-sm font-bold text-white">تنظیمات هوش مصنوعی فروشگاه</h2>
          <Switch checked={aiSettings.auto_fallback !== false} onChange={(v) => saveAiSettings({ auto_fallback: v })} label="در صورت خطای مدل، به‌صورت خودکار به مدل بعدی سوئیچ شود" />
          <Switch checked={Boolean(aiSettings.product_auto_publish)} onChange={(v) => saveAiSettings({ product_auto_publish: v })} label="انتشار خودکار محصولات تولیدشده با AI (بدون بازبینی)" />
          <Switch checked={aiSettings.allow_customer_assistant !== false} onChange={(v) => saveAiSettings({ allow_customer_assistant: v })} label="دستیار هوشمند خرید برای مشتریان فعال باشد" />
          <Switch checked={aiSettings.allow_support_ai !== false} onChange={(v) => saveAiSettings({ allow_support_ai: v })} label="پیشنهاد پاسخ هوشمند برای تیم پشتیبانی" />
          <div>
            <label className="label">ارائه‌دهنده پیش‌فرض</label>
            <select value={aiSettings.default_provider || 'builtin'} onChange={(e) => saveAiSettings({ default_provider: e.target.value })} className="input text-xs">
              {providers.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 text-[11px] leading-6 text-brand-200">
            <b>مدل‌های پیشنهادی:</b> {featured.map((f) => f.label).join(' · ')}
            <br />
            کلیدها به‌صورت رمزنگاری‌شده در دیتابیس ذخیره می‌شوند و هرگز در پاسخ‌های API به‌صورت کامل بازگردانده نمی‌شوند.
          </div>
        </div>
      ) : null}

      {tab === 'logs' ? (
        !logs ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>ارائه‌دهنده</th>
                  <th>مدل</th>
                  <th>نوع</th>
                  <th>توکن</th>
                  <th>هزینه</th>
                  <th>تأخیر</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {logs.items.map((l) => (
                  <tr key={l.id}>
                    <td className="text-[11px] text-slate-500">{new Date(l.created_at).toLocaleString('fa-IR')}</td>
                    <td className="text-[11px]">{l.provider}</td>
                    <td className="font-mono text-[10px] text-slate-400">{l.model}</td>
                    <td className="text-[11px]">{l.kind}</td>
                    <td className="text-[11px]">{number(l.tokens_in + l.tokens_out)}</td>
                    <td className="text-[11px] text-emerald-400">${Number(l.cost).toFixed(4)}</td>
                    <td className="text-[11px] text-slate-500">{number(l.latency_ms)}ms</td>
                    <td>
                      <Badge color={l.status === 'ok' ? 'emerald' : 'rose'}>{l.status === 'ok' ? 'موفق' : 'خطا'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={`تنظیمات ${edit?.name || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setEdit(null)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={save} className="btn-primary btn-sm">ذخیره</button>
          </div>
        }
      >
        {edit ? (
          <div className="space-y-3">
            <div>
              <label className="label">کلید API</label>
              <div className="relative">
                <input
                  type={reveal ? 'text' : 'password'}
                  value={edit.api_key}
                  onChange={(e) => setEdit((p) => ({ ...p, api_key: e.target.value }))}
                  placeholder={edit.api_key_masked ? 'برای تغییر مقدار جدید وارد کنید' : 'sk-…'}
                  className="input pl-10 font-mono text-xs"
                  dir="ltr"
                />
                <button onClick={() => setReveal((r) => !r)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">کلید فعلی: {edit.api_key_masked || 'ثبت نشده'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">مدل پیش‌فرض</label>
                <select value={edit.default_model} onChange={(e) => setEdit((p) => ({ ...p, default_model: e.target.value }))} className="input text-xs">
                  {edit.models?.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">اولویت (کمتر = بالاتر)</label>
                <input type="number" value={edit.priority} onChange={(e) => setEdit((p) => ({ ...p, priority: Number(e.target.value) }))} className="input text-xs" />
              </div>
              <div>
                <label className="label">دمای مدل (۰ تا ۲)</label>
                <input type="number" step="0.1" value={edit.temperature} onChange={(e) => setEdit((p) => ({ ...p, temperature: Number(e.target.value) }))} className="input text-xs" />
              </div>
              <div>
                <label className="label">حداکثر توکن خروجی</label>
                <input type="number" value={edit.max_tokens} onChange={(e) => setEdit((p) => ({ ...p, max_tokens: Number(e.target.value) }))} className="input text-xs" />
              </div>
              <div>
                <label className="label">سقف مصرف ماهانه (توکن)</label>
                <input type="number" value={edit.monthly_token_cap} onChange={(e) => setEdit((p) => ({ ...p, monthly_token_cap: Number(e.target.value) }))} className="input text-xs" />
              </div>
              <div>
                <label className="label">وضعیت</label>
                <div className="pt-2">
                  <Switch checked={edit.enabled} onChange={(v) => setEdit((p) => ({ ...p, enabled: v }))} label="فعال" />
                </div>
              </div>
            </div>
            <div>
              <label className="label">یادداشت</label>
              <textarea value={edit.notes || ''} onChange={(e) => setEdit((p) => ({ ...p, notes: e.target.value }))} rows={2} className="input text-xs" />
            </div>
            <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-[10px] leading-5 text-slate-400">
              راهنما: {edit.slug === 'openai' ? 'کلید از platform.openai.com — برای تولید متن و تصویر' : edit.slug === 'anthropic' ? 'کلید از console.anthropic.com — بهترین کیفیت نگارش' : edit.slug === 'gemini' ? 'کلید از aistudio.google.com — رایگان تا حد مصرف مشخص' : edit.slug === 'xai' ? 'کلید از console.x.ai' : edit.slug === 'deepseek' ? 'کلید از platform.deepseek.com — ارزان‌ترین' : 'تنظیمات این سرویس دلخواه است.'}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
