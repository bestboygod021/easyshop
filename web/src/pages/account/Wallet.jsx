import { useEffect, useState } from 'react';
import { Wallet as WalletIcon, Sparkles, ArrowUpRight, ArrowDownLeft, Plus, Gift, TrendingUp } from 'lucide-react';
import { get, post } from '../../lib/api';
import { number, toman, date } from '../../lib/format';
import { Loading, StatCard, Modal, EmptyState } from '../../components/ui';
import { useAuth, toast } from '../../store';

export default function Wallet() {
  const [data, setData] = useState(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [amount, setAmount] = useState(500000);
  const [points, setPoints] = useState(0);
  const [busy, setBusy] = useState(false);
  const { bootstrap } = useAuth();

  const load = () => get('/account/wallet').then(setData).catch((e) => toast(e.message, 'error'));

  useEffect(() => {
    load();
  }, []);

  if (!data) return <Loading />;

  const topup = async () => {
    setBusy(true);
    try {
      const res = await post('/account/wallet/topup', { amount });
      toast(res.message);
      setTopupOpen(false);
      await load();
      await bootstrap();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const convert = async () => {
    if (!points) return;
    setBusy(true);
    try {
      const res = await post('/account/loyalty/convert', { points });
      toast(res.message);
      setPoints(0);
      await load();
      await bootstrap();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-base font-extrabold text-white">
          <WalletIcon className="h-5 w-5 text-brand-400" /> کیف پول و باشگاه مشتریان
        </h1>
        <p className="mt-1 text-xs text-slate-500">شارژ کیف پول، تبدیل امتیاز و مشاهده‌ی تراکنش‌ها</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="موجودی کیف پول" value={toman(data.wallet)} icon={WalletIcon} color="brand" hint="قابل استفاده در پرداخت" />
        <StatCard label="امتیاز فعلی" value={number(data.loyalty_points)} icon={Gift} color="amber" hint={`معادل ${toman(data.loyalty_value)}`} />
        <StatCard label="کش‌بک هر خرید" value={`${number(data.cashback_percent)}٪`} icon={TrendingUp} color="emerald" hint="به کیف پول شما" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-white">شارژ کیف پول</h2>
          <p className="text-[11px] leading-6 text-slate-500">
            در محیط دمو، شارژ کیف پول به‌صورت شبیه‌سازی‌شده و بدون درگاه واقعی انجام می‌شود.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[200000, 500000, 1000000, 2000000].map((a) => (
              <button
                key={a}
                onClick={() => {
                  setAmount(a);
                  setTopupOpen(true);
                }}
                className="chip border border-white/10 bg-white/5 text-slate-300 hover:border-brand-500/40"
              >
                {toman(a, { withUnit: false })}
              </button>
            ))}
          </div>
          <button onClick={() => setTopupOpen(true)} className="btn-primary mt-4">
            <Plus className="h-4 w-4" /> شارژ کیف پول
          </button>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles className="h-4 w-4 text-amber-400" /> تبدیل امتیاز به اعتبار
          </h2>
          <p className="text-[11px] leading-6 text-slate-500">هر امتیاز معادل ۱٬۰۰۰ تومان اعتبار در کیف پول است.</p>
          <input
            type="range"
            min={0}
            max={data.loyalty_points}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            className="mt-4 w-full accent-amber-500"
          />
          <p className="mt-2 text-xs text-amber-200">
            {number(points)} امتیاز ← {toman(points * 1000)}
          </p>
          <button onClick={convert} disabled={!points || busy} className="btn-primary mt-3">
            تبدیل کن
          </button>
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-white/10 px-5 py-4 text-sm font-bold text-white">تراکنش‌های اخیر</h2>
        {data.transactions.length === 0 ? (
          <div className="p-5">
            <EmptyState title="تراکنشی ثبت نشده است" />
          </div>
        ) : (
          <div className="table-wrap !rounded-none !border-0">
            <table className="data">
              <thead>
                <tr>
                  <th>نوع</th>
                  <th>شرح</th>
                  <th>مبلغ</th>
                  <th>موجودی پس از تراکنش</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className={`chip ${t.type === 'credit' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                        {t.type === 'credit' ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                        {t.type === 'credit' ? 'واریز' : 'برداشت'}
                      </span>
                    </td>
                    <td>{t.reason}</td>
                    <td className={t.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}>
                      {t.type === 'credit' ? '+' : '−'}{toman(Math.abs(t.amount))}
                    </td>
                    <td>{toman(t.balance_after)}</td>
                    <td className="text-slate-500">{date(t.created_at, { withTime: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        title="شارژ کیف پول"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setTopupOpen(false)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={topup} disabled={busy} className="btn-primary btn-sm">{busy ? 'در حال پردازش…' : 'پرداخت و شارژ'}</button>
          </div>
        }
      >
        <label className="label">مبلغ شارژ (تومان)</label>
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} step={50000} className="input" />
        <p className="mt-3 text-[11px] text-slate-500">
          مبلغ قابل پرداخت: <span className="font-bold text-brand-300">{toman(amount)}</span>
        </p>
      </Modal>
    </div>
  );
}
