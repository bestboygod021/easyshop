import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Star, X, Check, AlertTriangle, Info, Loader2, ChevronDown, ChevronLeft, ChevronRight,
  PackageOpen, Search, Sparkles,
} from 'lucide-react';
import { toman, number, fa } from '../lib/format';
import { useUI } from '../store';

/* -------------------------------- اسپینر و بارگذاری ------------------------ */
export const Spinner = ({ className = '' }) => <Loader2 className={clsx('h-5 w-5 animate-spin', className)} />;

export const Loading = ({ label = 'در حال بارگذاری…' }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
    <Spinner className="h-7 w-7 text-brand-400" />
    <span className="text-sm">{label}</span>
  </div>
);

export const SkeletonCard = () => (
  <div className="card overflow-hidden p-3">
    <div className="skeleton mb-3 h-44 w-full" />
    <div className="skeleton mb-2 h-4 w-3/4" />
    <div className="skeleton mb-3 h-3 w-1/2" />
    <div className="skeleton h-6 w-1/3" />
  </div>
);

export const SkeletonRows = ({ rows = 5 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="skeleton h-12 w-full" />
    ))}
  </div>
);

/* ---------------------------------- نشان‌ها --------------------------------- */
const badgeColors = {
  emerald: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  blue: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  rose: 'bg-rose-500/15 text-rose-300 border border-rose-500/25',
  slate: 'bg-slate-500/15 text-slate-300 border border-slate-500/25',
  indigo: 'bg-brand-500/15 text-brand-300 border border-brand-500/25',
  violet: 'bg-violet-500/15 text-violet-300 border border-violet-500/25',
  cyan: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25',
  orange: 'bg-orange-500/15 text-orange-300 border border-orange-500/25',
};

export const Badge = ({ color = 'slate', children, className, icon: Icon }) => (
  <span className={clsx('chip', badgeColors[color] || badgeColors.slate, className)}>
    {Icon ? <Icon className="h-3 w-3" /> : null}
    {children}
  </span>
);

export const StatusBadge = ({ label, color = 'slate' }) => <Badge color={color}>{label}</Badge>;

/* ----------------------------------- قیمت ---------------------------------- */
export const Price = ({ value, compareAt, size = 'md', className }) => {
  const sizes = { sm: 'text-sm', md: 'text-base', lg: 'text-xl', xl: 'text-2xl' };
  const discount = compareAt && compareAt > value ? Math.round(((compareAt - value) / compareAt) * 100) : 0;
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
      <span className={clsx('font-extrabold text-white', sizes[size])}>{toman(value)}</span>
      {discount > 0 ? (
        <>
          <span className="text-xs text-slate-500 line-through">{toman(compareAt, { withUnit: false })}</span>
          <Badge color="rose">٪{fa(discount)}</Badge>
        </>
      ) : null}
    </div>
  );
};

/* --------------------------------- امتیاز --------------------------------- */
export const Rating = ({ value = 0, count, size = 'sm', showValue = true }) => {
  const stars = [1, 2, 3, 4, 5];
  const px = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-row-reverse items-center" dir="ltr">
        {stars.map((s) => (
          <Star
            key={s}
            className={clsx(px, s <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-600')}
          />
        ))}
      </div>
      {showValue && value > 0 ? <span className="text-xs font-semibold text-amber-300">{number(value)}</span> : null}
      {count !== undefined ? <span className="text-[11px] text-slate-500">({number(count)} نظر)</span> : null}
    </div>
  );
};

/* ---------------------------------- تصویر --------------------------------- */
export const SmartImage = ({ src, alt, className, fallbackText = 'EasyShop', ratio }) => {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = !src || failed ? `/api/placeholder?text=${encodeURIComponent(fallbackText)}&seed=3` : src;
  return (
    <div className={clsx('relative overflow-hidden bg-ink-700', ratio, className)}>
      {!loaded ? <div className="absolute inset-0 skeleton" /> : null}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
        className="h-full w-full object-cover transition duration-500 hover:scale-105"
      />
    </div>
  );
};

/* ---------------------------------- مودال --------------------------------- */
export const Modal = ({ open, onClose, title, children, size = 'md', footer }) => {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose?.();
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className={clsx('card relative z-10 max-h-[92vh] w-full overflow-hidden', sizes[size])}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-white/10 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
};

/* --------------------------------- توست‌ها -------------------------------- */
export const Toasts = () => {
  const toasts = useUI((s) => s.toasts);
  const icons = { success: Check, error: AlertTriangle, info: Info };
  const colors = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    info: 'border-brand-500/30 bg-brand-500/10 text-brand-200',
  };
  return (
    <div className="fixed bottom-20 left-1/2 z-[200] flex w-[92vw] max-w-sm -translate-x-1/2 flex-col gap-2 sm:bottom-6 sm:left-6 sm:translate-x-0">
      {toasts.map((t) => {
        const Icon = icons[t.type] || Info;
        return (
          <div key={t.id} className={clsx('flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-card backdrop-blur', colors[t.type] || colors.info)}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="leading-6">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
};

/* ------------------------------ حالت خالی صفحه ---------------------------- */
export const EmptyState = ({ title = 'چیزی یافت نشد', description, icon: Icon = PackageOpen, action }) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 py-16 text-center">
    <Icon className="h-10 w-10 text-slate-600" />
    <h3 className="text-sm font-bold text-slate-300">{title}</h3>
    {description ? <p className="max-w-sm text-xs leading-6 text-slate-500">{description}</p> : null}
    {action}
  </div>
);

/* --------------------------------- تب‌ها ---------------------------------- */
export const Tabs = ({ tabs, active, onChange, className }) => (
  <div className={clsx('no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1', className)}>
    {tabs.map((tab) => (
      <button
        key={tab.value}
        onClick={() => onChange(tab.value)}
        className={clsx(
          'whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition',
          active === tab.value ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
        )}
      >
        {tab.label}
        {tab.count !== undefined ? <span className="mr-1.5 text-[10px] opacity-80">({number(tab.count)})</span> : null}
      </button>
    ))}
  </div>
);

/* --------------------------------- صفحه‌بندی ------------------------------ */
export const Pagination = ({ page, pages, onChange }) => {
  const list = useMemo(() => {
    if (!pages || pages <= 1) return [];
    const out = [];
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    for (let i = start; i < start + 5 && i <= pages; i += 1) out.push(i);
    return out;
  }, [page, pages]);
  if (!pages || pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="btn-ghost btn-sm disabled:opacity-40">
        <ChevronRight className="h-4 w-4" /> قبلی
      </button>
      {list.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={clsx('h-8 w-8 rounded-lg text-xs font-bold transition', p === page ? 'bg-brand-500 text-white' : 'text-slate-400 hover:bg-white/10')}
        >
          {fa(p)}
        </button>
      ))}
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="btn-ghost btn-sm disabled:opacity-40">
        بعدی <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  );
};

/* ---------------------------------- آمار ---------------------------------- */
export const StatCard = ({ label, value, icon: Icon, hint, color = 'brand', trend }) => {
  const colors = {
    brand: 'from-brand-500/20 to-brand-500/5 text-brand-300',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-300',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-300',
    rose: 'from-rose-500/20 to-rose-500/5 text-rose-300',
    cyan: 'from-cyan-500/20 to-cyan-500/5 text-cyan-300',
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-300',
  };
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="mt-2 text-xl font-extrabold text-white">{value}</p>
          {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br', colors[color])}>
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
      </div>
      {trend !== undefined ? (
        <p className={clsx('mt-2 text-[11px] font-semibold', trend >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
          {trend >= 0 ? '▲' : '▼'} {number(Math.abs(trend))}٪ نسبت به ماه قبل
        </p>
      ) : null}
    </div>
  );
};

/* ------------------------------- نوار پیشرفت ------------------------------ */
export const Progress = ({ value = 0, color = 'brand', className }) => (
  <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-white/10', className)}>
    <div
      className={clsx('h-full rounded-full transition-all', color === 'brand' ? 'bg-brand-500' : color === 'rose' ? 'bg-rose-500' : color === 'amber' ? 'bg-amber-500' : 'bg-emerald-500')}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

/* --------------------------------- سوییچ ---------------------------------- */
export const Switch = ({ checked, onChange, label }) => (
  <label className="flex cursor-pointer items-center gap-2.5">
    <span
      onClick={() => onChange(!checked)}
      className={clsx('relative h-6 w-11 rounded-full transition', checked ? 'bg-brand-500' : 'bg-slate-600')}
    >
      <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', checked ? 'right-0.5' : 'right-[22px]')} />
    </span>
    {label ? <span className="text-xs text-slate-300">{label}</span> : null}
  </label>
);

/* -------------------------- انتخابگر با جستجو (combobox) ------------------- */
export const Select = ({ value, onChange, options = [], className, placeholder = 'انتخاب کنید…' }) => (
  <div className={clsx('relative', className)}>
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="input appearance-none pl-9">
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
  </div>
);

/* ------------------------------ کادر جستجو -------------------------------- */
export const SearchInput = ({ value, onChange, onSubmit, placeholder = 'جستجو…', className, autoFocus }) => (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit?.(value);
    }}
    className={clsx('relative', className)}
  >
    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input pr-10"
    />
  </form>
);

/* ------------------------------- نشان هوش مصنوعی --------------------------- */
export const AiBadge = ({ children = 'AI', className }) => (
  <span className={clsx('chip gap-1 border border-brand-400/30 bg-gradient-to-l from-brand-500/20 to-violet-500/20 text-brand-200', className)}>
    <Sparkles className="h-3 w-3" />
    {children}
  </span>
);

/* ------------------------------ کارت شاخص‌دار ----------------------------- */
export const InfoRow = ({ label, value, className }) => (
  <div className={clsx('flex items-center justify-between gap-4 border-b border-white/5 py-2.5 text-sm last:border-0', className)}>
    <span className="text-slate-400">{label}</span>
    <span className="font-medium text-slate-200">{value}</span>
  </div>
);

export const CopyButton = ({ text, label = 'کپی' }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="btn-ghost btn-sm"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
      {copied ? 'کپی شد' : label}
    </button>
  );
};

export const LinkMore = ({ to, children = 'مشاهده همه' }) => (
  <Link to={to} className="link flex items-center gap-1 text-xs font-semibold">
    {children}
    <ChevronLeft className="h-3.5 w-3.5" />
  </Link>
);
