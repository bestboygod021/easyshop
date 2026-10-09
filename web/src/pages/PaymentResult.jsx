import { Link, useSearchParams } from 'react-router-dom';
import { Check, Clock3, CreditCard, X } from 'lucide-react';

const PAYMENT_STATES = {
  success: {
    title: 'پرداخت با موفقیت تأیید شد',
    message: 'تأیید پرداخت از سمت سرور انجام شد. وضعیت سفارش در حساب کاربری شما قابل پیگیری است.',
    Icon: Check,
    iconBg: 'bg-emerald-500/15',
    iconText: 'text-emerald-400',
  },
  pending: {
    title: 'پرداخت در حال بررسی است',
    message: 'درگاه پرداخت هنوز تأیید نهایی را برنگردانده است. از پرداخت دوباره خودداری کنید و کمی بعد وضعیت سفارش را بررسی کنید.',
    Icon: Clock3,
    iconBg: 'bg-amber-500/15',
    iconText: 'text-amber-400',
  },
  failed: {
    title: 'پرداخت تأیید نشد',
    message: 'سفارش تا دریافت تأیید معتبر از درگاه پرداخت‌شده محسوب نمی‌شود. می‌توانید از حساب کاربری وضعیت را بررسی کنید یا دوباره خرید را آغاز کنید.',
    Icon: X,
    iconBg: 'bg-rose-500/15',
    iconText: 'text-rose-400',
  },
};

export default function PaymentResult() {
  const [params] = useSearchParams();
  const status = ['success', 'pending', 'failed'].includes(params.get('status')) ? params.get('status') : 'pending';
  const result = PAYMENT_STATES[status];
  const { Icon } = result;
  const orderCode = String(params.get('order') || '').slice(0, 80);
  const reference = String(params.get('ref') || '').slice(0, 80);

  return (
    <main className="mx-auto max-w-2xl px-4 py-14">
      <section className="card p-8 text-center" aria-live="polite">
        <span className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${result.iconBg}`}>
          <Icon className={`h-8 w-8 ${result.iconText}`} />
        </span>
        <h1 className="mt-5 text-lg font-extrabold text-white">{result.title}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400">{result.message}</p>
        {orderCode ? <p className="mt-4 text-xs text-slate-400">کد سفارش: <bdi className="font-bold text-brand-300">{orderCode}</bdi></p> : null}
        {reference ? <p className="mt-2 text-xs text-slate-500">کد پیگیری درگاه: <bdi>{reference}</bdi></p> : null}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/account/orders" className="btn-primary">
            <CreditCard className="h-4 w-4" /> سفارش‌های من
          </Link>
          <Link to="/products" className="btn-ghost">بازگشت به فروشگاه</Link>
        </div>
      </section>
    </main>
  );
}
