import { Link } from 'react-router-dom';
import {
  ShoppingBag, Sparkles, Smartphone, Monitor, Apple, Globe, ShieldCheck, Cpu, Users, Truck, Database, Code2, Layers,
} from 'lucide-react';
import { Badge } from '../components/ui';

const PLATFORMS = [
  { icon: Globe, title: 'نسخه وب (PWA)', desc: 'قابل نصب روی هر مرورگری، پشتیبانی از حالت آفلاین و نوتیفیکیشن.' },
  { icon: Apple, title: 'اپلیکیشن iOS', desc: 'ساخته‌شده با Capacitor — خروجی Xcode و انتشار در App Store.' },
  { icon: Smartphone, title: 'اپلیکیشن اندروید', desc: 'خروجی APK/AAB با امضای دیجیتال برای Google Play و مایکت.' },
  { icon: Monitor, title: 'نسخه ویندوز', desc: 'اپ دسکتاپ Electron با نصب‌کننده NSIS و آپدیت خودکار.' },
];

const STACK = [
  { icon: Layers, title: 'فرانت‌اند', value: 'React 18 + Vite + TailwindCSS (RTL، دو زبانه، تم تاریک/روشن)' },
  { icon: Database, title: 'بک‌اند', value: 'Node.js + Express + SQLite (۲۵+ جدول، احراز هویت JWT، نقش‌ها)' },
  { icon: Cpu, title: 'هوش مصنوعی', value: 'OpenAI، Anthropic، Gemini، xAI و DeepSeek + موتور داخلی آفلاین' },
  { icon: Users, title: 'ارتباط با مشتری', value: 'چت زنده WebSocket، تیکتینگ، اعلان لحظه‌ای و پنل پشتیبانی' },
];

const AI_MODELS = [
  { name: 'OpenAI GPT-4o', use: 'تولید محصول، دستیار خرید، تحلیل نظرات' },
  { name: 'Anthropic Claude', use: 'توصیف حرفه‌ای، کمپین بازاریابی' },
  { name: 'Google Gemini', use: 'محتوای بلند، سئو، تحلیل تصویر' },
  { name: 'xAI Grok', use: 'پاسخ سریع، اطلاعات به‌روز' },
  { name: 'DeepSeek', use: 'تولید انبوه با کمترین هزینه' },
];

export default function About() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-l from-brand-600/20 to-transparent p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-glow">
          <ShoppingBag className="h-8 w-8 text-white" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold text-white">درباره EasyShop</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">
          EasyShop یک پلتفرم فروشگاهی کامل و متن‌باز است که برای فروشندگان ایرانی طراحی شده؛ از کاتالوگ و سبد خرید و
          پرداخت تا پنل مدیریت، پشتیبانی زنده و تولید خودکار محتوا با هوش مصنوعی — همه در یک سیستم یکپارچه.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Badge color="indigo" icon={Sparkles}>۵ موتور هوش مصنوعی</Badge>
          <Badge color="emerald" icon={ShieldCheck}>امنیت JWT + bcrypt</Badge>
          <Badge color="cyan" icon={Truck}>چندسکویی</Badge>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="section-title mb-4">روی چهار سکو در دسترس</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <div key={p.title} className="card flex items-start gap-3 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/5">
                <p.icon className="h-5 w-5 text-brand-300" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">{p.title}</p>
                <p className="mt-1 text-[11px] leading-6 text-slate-400">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="section-title mb-4">معماری فنی</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {STACK.map((s) => (
            <div key={s.title} className="card p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-white">
                <s.icon className="h-4 w-4 text-brand-400" /> {s.title}
              </p>
              <p className="mt-2 text-[11px] leading-6 text-slate-400">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 card p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Sparkles className="h-4 w-4 text-brand-400" /> موتور هوشمند EasyShop
        </h2>
        <p className="mt-2 text-[11px] leading-6 text-slate-400">
          مدیر فروشگاه می‌تواند کلید API هر سرویس را در پنل مدیریت وارد کند؛ در صورت نبود کلید یا قطعی سرویس، سیستم
          به‌صورت خودکار به موتور داخلی EasyShop سوئیچ می‌کند تا فروشگاه هرگز متوقف نشود.
        </p>
        <div className="mt-4 space-y-2">
          {AI_MODELS.map((m) => (
            <div key={m.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Cpu className="h-3.5 w-3.5 text-brand-300" /> {m.name}
              </span>
              <span className="text-[11px] text-slate-500">{m.use}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { title: 'قابلیت‌های فروشگاهی', items: ['کاتالوگ و دسته‌بندی چندسطحی', 'سبد خرید مهمان و کاربر', 'کد تخفیف و کمپین', 'پرداخت آنلاین/کیف پول/در محل', 'انبار و هشدار موجودی'] },
          { title: 'پنل کاربری', items: ['داشبورد سفارش‌ها', 'آدرس‌ها و علاقه‌مندی‌ها', 'کیف پول و امتیاز باشگاه', 'تیکت و گفتگوی زنده', 'اعلان‌های لحظه‌ای'] },
          { title: 'پنل مدیریت', items: ['داشبورد تحلیل فروش', 'تولید محصول با AI', 'مدیریت انبار و قیمت', 'گزارش‌ها و لاگ‌ها', 'تنظیمات و کلیدهای AI'] },
        ].map((col) => (
          <div key={col.title} className="card p-5">
            <p className="text-xs font-bold text-white">{col.title}</p>
            <ul className="mt-3 space-y-2 text-[11px] text-slate-400">
              {col.items.map((i) => (
                <li key={i} className="flex items-center gap-2">
                  <Code2 className="h-3 w-3 text-brand-400" /> {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <div className="mt-10 text-center">
        <Link to="/products" className="btn-primary">
          <ShoppingBag className="h-4 w-4" /> شروع خرید از EasyShop
        </Link>
      </div>
    </div>
  );
}
