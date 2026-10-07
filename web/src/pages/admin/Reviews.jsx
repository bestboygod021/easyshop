import { useEffect, useState } from 'react';
import { Star, Check, X, MessageSquare, Bot } from 'lucide-react';
import { get, patch, qs } from '../../lib/api';
import { number, timeAgo } from '../../lib/format';
import { Badge, EmptyState, Loading, Modal, Pagination, Rating, Tabs } from '../../components/ui';
import { toast } from '../../store';

export default function Reviews() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [reply, setReply] = useState(null);
  const [replyText, setReplyText] = useState('');

  const load = () => {
    setData(null);
    get(`/admin/reviews?${qs({ status, page, limit: 20 })}`)
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  };

  useEffect(() => {
    load();
  }, [status, page]);

  const update = async (review, payload) => {
    try {
      await patch(`/admin/reviews/${review.id}`, payload);
      toast('نظر به‌روزرسانی شد.');
      setReply(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <Star className="h-5 w-5 text-amber-400" /> مدیریت نظرات
        </h1>
        <p className="mt-1 text-xs text-slate-500">تأیید، رد و پاسخ به نظرات مشتریان</p>
      </header>

      <Tabs
        tabs={[
          { value: '', label: 'همه' },
          { value: 'pending', label: 'در انتظار تأیید' },
          { value: 'approved', label: 'تأییدشده' },
          { value: 'rejected', label: 'ردشده' },
        ]}
        active={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <EmptyState title="نظری یافت نشد" icon={Star} />
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      {r.user_name || 'کاربر'} <Rating value={r.rating} showValue={false} />
                      <Badge color={r.status === 'approved' ? 'emerald' : r.status === 'pending' ? 'amber' : 'rose'}>
                        {r.status === 'approved' ? 'تأییدشده' : r.status === 'pending' ? 'در انتظار' : 'ردشده'}
                      </Badge>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      محصول: {r.product_name} · {timeAgo(r.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {r.status !== 'approved' ? (
                      <button onClick={() => update(r, { status: 'approved' })} className="btn-ghost btn-sm text-emerald-300">
                        <Check className="h-3.5 w-3.5" /> تأیید
                      </button>
                    ) : null}
                    {r.status !== 'rejected' ? (
                      <button onClick={() => update(r, { status: 'rejected' })} className="btn-ghost btn-sm text-rose-300">
                        <X className="h-3.5 w-3.5" /> رد
                      </button>
                    ) : null}
                    <button
                      onClick={() => {
                        setReply(r);
                        setReplyText(r.reply || '');
                      }}
                      className="btn-ghost btn-sm"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> پاسخ
                    </button>
                  </div>
                </div>
                {r.title ? <p className="mt-2 text-xs font-semibold text-slate-300">{r.title}</p> : null}
                <p className="mt-1 text-xs leading-6 text-slate-400">{r.body}</p>
                {r.reply ? (
                  <div className="mt-3 rounded-xl border border-brand-500/20 bg-brand-500/5 p-3">
                    <p className="text-[11px] font-semibold text-brand-200">پاسخ شما</p>
                    <p className="mt-1 text-[11px] text-slate-300">{r.reply}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <Pagination page={data.page ?? 1} pages={Math.max(1, Math.ceil(data.total / (data.limit || 20)))} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(reply)}
        onClose={() => setReply(null)}
        title="پاسخ به نظر مشتری"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setReply(null)} className="btn-ghost btn-sm">انصراف</button>
            <button onClick={() => update(reply, { reply: replyText })} className="btn-primary btn-sm">ثبت پاسخ</button>
          </div>
        }
      >
        <p className="mb-3 text-[11px] text-slate-500">{reply?.body}</p>
        <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4} className="input text-xs" placeholder="پاسخ رسمی فروشگاه…" />
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
          <Bot className="h-3 w-3 text-brand-400" /> می‌توانید از «استودیوی هوش مصنوعی» برای پیشنهاد پاسخ استفاده کنید.
        </p>
      </Modal>
    </div>
  );
}
