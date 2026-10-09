import {
  all, get, getSettings, notify, nowIso, run, tx, uid,
} from '../db/index.js';

function releaseReservationsUnsafe(order, reason) {
  if (order.stock_committed) {
    for (const item of all('SELECT * FROM order_items WHERE order_id = ?', order.id)) {
      if (item.variant_id) {
        const variant = get('SELECT id FROM product_variants WHERE id = ?', item.variant_id);
        if (variant) run('UPDATE product_variants SET stock = stock + ? WHERE id = ?', item.qty, variant.id);
      } else if (item.product_id) {
        run('UPDATE products SET stock = stock + ? WHERE id = ?', item.qty, item.product_id);
      }
      if (item.product_id && get('SELECT id FROM products WHERE id = ?', item.product_id)) {
        run(
          'INSERT INTO inventory_movements (id,product_id,delta,reason,ref,created_at) VALUES (?,?,?,?,?,?)',
          uid('inv'), item.product_id, item.qty, reason, order.id, nowIso(),
        );
      }
    }
    run('UPDATE orders SET stock_committed = 0 WHERE id = ?', order.id);
  }

  if (order.loyalty_reserved && order.user_id && order.loyalty_used > 0) {
    run('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?', order.loyalty_used, order.user_id);
    run('UPDATE orders SET loyalty_reserved = 0 WHERE id = ?', order.id);
  }

  if (order.coupon_reserved && order.coupon_code) {
    run('UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE upper(code) = upper(?)', order.coupon_code);
    run('DELETE FROM coupon_redemptions WHERE order_id = ?', order.id);
    run('UPDATE orders SET coupon_reserved = 0 WHERE id = ?', order.id);
  }
}

export function reserveOrderStock(orderId, reason = 'رزرو مجدد سفارش') {
  return tx(() => {
    const order = get('SELECT * FROM orders WHERE id = ?', orderId);
    if (!order) throw Object.assign(new Error('سفارش یافت نشد.'), { status: 404 });
    if (order.stock_committed) return true;
    for (const item of all('SELECT * FROM order_items WHERE order_id = ?', order.id)) {
      if (!item.product_id) throw Object.assign(new Error(`محصول «${item.name_fa}» دیگر در دسترس نیست.`), { status: 409 });
      if (item.variant_id) {
        const variant = get('SELECT id, stock FROM product_variants WHERE id = ? AND product_id = ?', item.variant_id, item.product_id);
        if (!variant || variant.stock < item.qty) throw Object.assign(new Error(`موجودی «${item.name_fa}» کافی نیست.`), { status: 409 });
        const changed = run('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?', item.qty, variant.id, item.qty);
        if (!changed.changes) throw Object.assign(new Error(`موجودی «${item.name_fa}» کافی نیست.`), { status: 409 });
      } else {
        const product = get('SELECT stock, status FROM products WHERE id = ?', item.product_id);
        if (!product || product.status !== 'active' || product.stock < item.qty) {
          throw Object.assign(new Error(`موجودی «${item.name_fa}» کافی نیست.`), { status: 409 });
        }
        const changed = run('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ? AND status = \'active\'', item.qty, item.product_id, item.qty);
        if (!changed.changes) throw Object.assign(new Error(`موجودی «${item.name_fa}» کافی نیست.`), { status: 409 });
      }
      run(
        'INSERT INTO inventory_movements (id,product_id,delta,reason,ref,user_id,created_at) VALUES (?,?,?,?,?,?,?)',
        uid('inv'), item.product_id, -item.qty, reason, order.id, order.user_id, nowIso(),
      );
    }
    run('UPDATE orders SET stock_committed = 1 WHERE id = ?', order.id);
    return true;
  });
}

export function releaseOrderReservations(orderId, reason = 'آزادسازی موجودی سفارش') {
  return tx(() => {
    const order = get('SELECT * FROM orders WHERE id = ?', orderId);
    if (!order) return false;
    releaseReservationsUnsafe(order, reason);
    return true;
  });
}

function settleOrderUnsafe(payment, refId, actorName, cardDetails = {}) {
  const now = nowIso();
  const order = get('SELECT * FROM orders WHERE id = ?', payment.order_id);
  if (!order) throw Object.assign(new Error('سفارش مرتبط با پرداخت یافت نشد.'), { status: 404 });
  if (payment.status === 'paid') return { order, alreadyPaid: true, requiresRefund: false };
  if (!['pending', 'failed'].includes(payment.status)) return { order, alreadyPaid: false, requiresRefund: false, rejected: true };

  const mask = cardDetails.cardMask || null;
  const hash = cardDetails.cardHash || null;

  run("UPDATE payments SET status = 'paid', ref_id = ?, card_mask = COALESCE(?, card_mask), card_hash = COALESCE(?, card_hash), verified_at = ?, failure_reason = NULL WHERE id = ? AND status IN ('pending','failed')",
    refId || null, mask, hash, now, payment.id);
  const freshOrder = get('SELECT * FROM orders WHERE id = ?', order.id);
  const priorPaid = get("SELECT id FROM payments WHERE order_id = ? AND status = 'paid' AND id <> ? LIMIT 1", order.id, payment.id);
  const cancelledOrder = ['cancelled', 'refunded', 'returned'].includes(freshOrder.status);
  const reservationsReleased = !freshOrder.stock_committed;
  const requiresRefund = cancelledOrder || Boolean(priorPaid) || reservationsReleased;
  if (requiresRefund) {
    const reviewStatus = reservationsReleased && !cancelledOrder && !priorPaid ? 'payment_review' : freshOrder.status;
    run("UPDATE orders SET payment_status = 'paid', status = ?, updated_at = ? WHERE id = ?", reviewStatus, now, freshOrder.id);
    const reason = cancelledOrder
      ? `درگاه پس از لغو سفارش پرداخت را تأیید کرد${refId ? `؛ کد پیگیری: ${refId}` : ''}. بازپرداخت نیازمند بررسی پشتیبانی است.`
      : priorPaid
        ? `پرداخت دوم سفارش تأیید شد${refId ? `؛ کد پیگیری: ${refId}` : ''}. از تحویل/ثبت فروش دوباره جلوگیری شد؛ بازپرداخت لازم است.`
        : `پرداخت پس از آزادسازی رزرو موجودی تأیید شد${refId ? `؛ کد پیگیری: ${refId}` : ''}. سفارش برای بررسی مدیر متوقف شد.`;
    run(
      'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
      uid('oev'), freshOrder.id, reviewStatus, reason, actorName, now,
    );
    if (freshOrder.user_id) notify({
      userId: freshOrder.user_id,
      title: 'نیاز به بررسی بازپرداخت',
      body: cancelledOrder
        ? `پرداخت سفارش ${freshOrder.code} پس از لغو تأیید شد؛ با پشتیبانی تماس بگیرید.`
        : priorPaid
          ? `برای سفارش ${freshOrder.code} بیش از یک پرداخت تأیید شده است؛ تیم پشتیبانی پیگیری می‌کند.`
          : `پرداخت سفارش ${freshOrder.code} پس از آزادسازی موجودی تأیید شد؛ تیم پشتیبانی وضعیت را بررسی می‌کند.`,
      type: 'order',
      link: `/account/orders/${freshOrder.id}`,
    });
    return { order: get('SELECT * FROM orders WHERE id = ?', freshOrder.id), alreadyPaid: false, requiresRefund: true, duplicatePayment: Boolean(priorPaid) };
  }

  run("UPDATE payments SET applied = 1 WHERE id = ? AND status = 'paid'", payment.id);
  const nextStatus = freshOrder.status === 'pending' ? 'paid' : freshOrder.status;
  run("UPDATE orders SET payment_status = 'paid', status = ?, paid_at = COALESCE(paid_at, ?), updated_at = ?, loyalty_reserved = 0, coupon_reserved = 0 WHERE id = ?", nextStatus, now, now, freshOrder.id);
  const items = all('SELECT product_id, qty FROM order_items WHERE order_id = ?', freshOrder.id);
  for (const item of items) {
    if (item.product_id) run('UPDATE products SET sold_count = sold_count + ? WHERE id = ?', item.qty, item.product_id);
  }

  const settings = getSettings();
  const cashbackPercent = Math.max(0, Math.min(100, Number(settings.commerce?.cashback_percent) || 0));
  if (freshOrder.user_id && cashbackPercent > 0) {
    const cashback = Math.floor((Number(freshOrder.total) * cashbackPercent) / 100);
    const user = get('SELECT wallet FROM users WHERE id = ?', freshOrder.user_id);
    if (cashback > 0 && user) {
      run('UPDATE users SET wallet = wallet + ? WHERE id = ?', cashback, freshOrder.user_id);
      run(
        'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
        uid('wtx'), freshOrder.user_id, cashback, 'credit', 'کش‌بک خرید', freshOrder.code, user.wallet + cashback, now,
      );
    }
  }

  run(
    'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
    uid('oev'), freshOrder.id, nextStatus, `پرداخت تأیید شد${refId ? `؛ کد پیگیری: ${refId}` : ''}.`, actorName, now,
  );
  if (freshOrder.user_id) notify({
    userId: freshOrder.user_id,
    title: 'پرداخت موفق',
    body: `سفارش ${freshOrder.code} با موفقیت پرداخت شد.`,
    type: 'order',
    link: `/account/orders/${freshOrder.id}`,
  });
  return { order: get('SELECT * FROM orders WHERE id = ?', freshOrder.id), alreadyPaid: false, requiresRefund: false };
}

export function settleOrderPayment(paymentId, refId, actorName = 'درگاه پرداخت', cardDetails = {}) {
  return tx(() => {
    const payment = get('SELECT * FROM payments WHERE id = ?', paymentId);
    if (!payment) throw Object.assign(new Error('تراکنش یافت نشد.'), { status: 404 });
    return settleOrderUnsafe(payment, refId, actorName, cardDetails);
  });
}

export function settleWalletOrderPayment(paymentId) {
  return tx(() => {
    const payment = get('SELECT * FROM payments WHERE id = ?', paymentId);
    if (!payment || payment.provider !== 'wallet') throw Object.assign(new Error('تراکنش کیف پول یافت نشد.'), { status: 404 });
    if (payment.status === 'paid') return { order: get('SELECT * FROM orders WHERE id = ?', payment.order_id), alreadyPaid: true };
    if (payment.status !== 'pending') throw Object.assign(new Error('این تراکنش دیگر قابل پرداخت نیست.'), { status: 409 });
    const order = get('SELECT * FROM orders WHERE id = ?', payment.order_id);
    if (!order?.user_id) throw Object.assign(new Error('پرداخت از کیف پول برای مهمان ممکن نیست.'), { status: 400 });
    const wallet = get('SELECT wallet FROM users WHERE id = ?', order.user_id);
    const updated = run('UPDATE users SET wallet = wallet - ? WHERE id = ? AND wallet >= ?', payment.amount, order.user_id, payment.amount);
    if (!updated.changes) throw Object.assign(new Error('موجودی کیف پول کافی نیست.'), { status: 400 });
    const now = nowIso();
    run(
      'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
      uid('wtx'), order.user_id, payment.amount, 'debit', 'پرداخت سفارش', order.code, wallet.wallet - payment.amount, now,
    );
    return settleOrderUnsafe(payment, `WALLET-${order.code}`, 'کیف پول EasyShop');
  });
}

export function failPayment(paymentId, reason = 'پرداخت ناموفق بود.') {
  return tx(() => {
    const payment = get('SELECT * FROM payments WHERE id = ?', paymentId);
    if (!payment || payment.status !== 'pending') return false;
    const now = nowIso();
    run("UPDATE payments SET status = 'failed', failure_reason = ?, verified_at = ? WHERE id = ? AND status = 'pending'",
      String(reason).slice(0, 240), now, payment.id);
    const order = get('SELECT * FROM orders WHERE id = ?', payment.order_id);
    if (!order) return true;
    if (order.payment_status !== 'paid' && order.payment_status !== 'refunded') {
      run("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ?", now, order.id);
      releaseReservationsUnsafe(order, 'آزادسازی پس از پرداخت ناموفق');
      run(
        'INSERT INTO order_events (id,order_id,status,note,actor_name,created_at) VALUES (?,?,?,?,?,?)',
        uid('oev'), order.id, order.status, `پرداخت ناموفق بود: ${String(reason).slice(0, 180)}`, 'درگاه پرداخت', now,
      );
    }
    return true;
  });
}

export function resolveOrderReturn({ orderId, approve, actor, note }) {
  return tx(() => {
    const order = get('SELECT * FROM orders WHERE id = ?', orderId);
    if (!order || order.status !== 'return_requested') {
      throw Object.assign(new Error('درخواست مرجوعی فعال برای این سفارش پیدا نشد.'), { status: 409 });
    }
    const ticket = get("SELECT * FROM tickets WHERE order_id = ? AND category = 'returns' ORDER BY created_at DESC LIMIT 1", order.id);
    const now = nowIso();
    const cleanNote = String(note || '').trim().slice(0, 800);

    if (!approve) {
      run("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id = ? AND status = 'return_requested'", now, order.id);
      if (ticket) {
        run("UPDATE tickets SET status = 'resolved', updated_at = ?, last_message_at = ? WHERE id = ?", now, now, ticket.id);
        run(
          'INSERT INTO ticket_messages (id,ticket_id,user_id,author_name,author_role,body,created_at) VALUES (?,?,?,?,?,?,?)',
          uid('tms'), ticket.id, actor.id, actor.full_name, 'admin', cleanNote || 'درخواست مرجوعی تأیید نشد.', now,
        );
      }
      run(
        'INSERT INTO order_events (id,order_id,status,note,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?)',
        uid('oev'), order.id, 'delivered', cleanNote || 'درخواست مرجوعی بررسی و رد شد؛ سفارش در وضعیت تحویل‌شده باقی ماند.', actor.id, actor.full_name, now,
      );
      if (order.user_id) notify({ userId: order.user_id, title: 'نتیجه بررسی مرجوعی', body: cleanNote || `درخواست مرجوعی سفارش ${order.code} تأیید نشد.`, type: 'order', link: `/account/orders/${order.id}` });
      return get('SELECT * FROM orders WHERE id = ?', order.id);
    }

    if (!order.user_id) throw Object.assign(new Error('بازپرداخت خودکار فقط برای سفارش دارای حساب کاربری ممکن است.'), { status: 409 });
    if (order.payment_status !== 'paid') throw Object.assign(new Error('ابتدا باید دریافت وجه سفارش ثبت شده باشد.'), { status: 409 });
    const user = get('SELECT wallet, loyalty_points FROM users WHERE id = ?', order.user_id);
    if (!user) throw Object.assign(new Error('حساب کاربر سفارش پیدا نشد.'), { status: 404 });

    const refundAmount = Math.max(0, Number(order.total) || 0);
    const cashback = get("SELECT COALESCE(SUM(amount),0) amount FROM wallet_transactions WHERE user_id = ? AND ref = ? AND reason = 'کش‌بک خرید' AND type = 'credit'", order.user_id, order.code)?.amount || 0;
    const walletBefore = Number(user.wallet || 0);
    const cashbackReversal = Math.min(walletBefore + refundAmount, Number(cashback || 0));
    const walletAfter = walletBefore + refundAmount - cashbackReversal;

    for (const item of all('SELECT * FROM order_items WHERE order_id = ?', order.id)) {
      if (item.variant_id) {
        const variant = get('SELECT id FROM product_variants WHERE id = ? AND product_id = ?', item.variant_id, item.product_id);
        if (variant) run('UPDATE product_variants SET stock = stock + ? WHERE id = ?', item.qty, variant.id);
      } else if (item.product_id && get('SELECT id FROM products WHERE id = ?', item.product_id)) {
        run('UPDATE products SET stock = stock + ? WHERE id = ?', item.qty, item.product_id);
      }
      if (item.product_id && get('SELECT id FROM products WHERE id = ?', item.product_id)) {
        run(
          'INSERT INTO inventory_movements (id,product_id,delta,reason,ref,user_id,created_at) VALUES (?,?,?,?,?,?,?)',
          uid('inv'), item.product_id, item.qty, 'تأیید مرجوعی', order.id, actor.id, now,
        );
      }
    }

    run('UPDATE users SET wallet = ?, loyalty_points = loyalty_points + ? WHERE id = ?', walletAfter, Number(order.loyalty_used || 0), order.user_id);
    if (refundAmount > 0) run(
      'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
      uid('wtx'), order.user_id, refundAmount, 'credit', 'بازپرداخت مرجوعی به کیف پول', order.code, walletBefore + refundAmount, now,
    );
    if (cashbackReversal > 0) run(
      'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
      uid('wtx'), order.user_id, cashbackReversal, 'debit', 'برگشت کش‌بک سفارش مرجوعی', order.code, walletAfter, now,
    );
    run("UPDATE orders SET status = 'returned', payment_status = 'refunded', stock_committed = 0, loyalty_reserved = 0, coupon_reserved = 0, updated_at = ? WHERE id = ?", now, order.id);
    run("UPDATE payments SET status = 'refunded', verified_at = COALESCE(verified_at, ?) WHERE order_id = ? AND status = 'paid'", now, order.id);
    run(
      'INSERT INTO order_events (id,order_id,status,note,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?)',
      uid('oev'), order.id, 'returned', cleanNote || `مرجوعی تأیید شد؛ ${refundAmount.toLocaleString('fa-IR')} تومان به کیف پول بازپرداخت شد.`, actor.id, actor.full_name, now,
    );
    if (ticket) {
      run("UPDATE tickets SET status = 'resolved', updated_at = ?, last_message_at = ? WHERE id = ?", now, now, ticket.id);
      run(
        'INSERT INTO ticket_messages (id,ticket_id,user_id,author_name,author_role,body,created_at) VALUES (?,?,?,?,?,?,?)',
        uid('tms'), ticket.id, actor.id, actor.full_name, 'admin', cleanNote || 'مرجوعی دریافت و بازپرداخت به کیف پول انجام شد.', now,
      );
    }
    notify({ userId: order.user_id, title: 'مرجوعی و بازپرداخت انجام شد', body: `${refundAmount.toLocaleString('fa-IR')} تومان به کیف پول شما بازگشت.`, type: 'wallet', link: '/account/wallet' });
    return get('SELECT * FROM orders WHERE id = ?', order.id);
  });
}

export function resolveOrderPaymentReview({ orderId, actor, note }) {
  return tx(() => {
    const order = get('SELECT * FROM orders WHERE id = ?', orderId);
    if (!order) throw Object.assign(new Error('سفارش یافت نشد.'), { status: 404 });
    const paidPayments = all("SELECT * FROM payments WHERE order_id = ? AND status = 'paid' ORDER BY created_at ASC, rowid ASC", order.id);
    if (!paidPayments.length) throw Object.assign(new Error('پرداخت تأییدشده‌ای برای بازپرداخت پیدا نشد.'), { status: 409 });
    if (!order.user_id) throw Object.assign(new Error('بازپرداخت کیف پول برای سفارش مهمان ممکن نیست؛ پشتیبانی باید بازپرداخت را دستی پیگیری کند.'), { status: 409 });

    const fullReview = ['cancelled', 'refunded', 'returned', 'payment_review'].includes(order.status)
      || (order.status === 'pending' && !order.stock_committed && order.payment_status === 'paid');
    const refundable = fullReview ? paidPayments : paidPayments.filter((payment) => Number(payment.applied) !== 1);
    if (!refundable.length) {
      throw Object.assign(new Error('برای این سفارش پرداخت تکراریِ نیازمند بازپرداختی پیدا نشد.'), { status: 409 });
    }

    const user = get('SELECT wallet FROM users WHERE id = ?', order.user_id);
    if (!user) throw Object.assign(new Error('حساب کاربر سفارش پیدا نشد.'), { status: 404 });
    const now = nowIso();
    let balance = Number(user.wallet || 0);
    let refundTotal = 0;
    for (const payment of refundable) {
      const amount = Math.max(0, Number(payment.amount) || 0);
      const changed = run("UPDATE payments SET status = 'refunded', verified_at = COALESCE(verified_at, ?) WHERE id = ? AND status = 'paid'", now, payment.id);
      if (!changed.changes) continue;
      if (amount > 0) {
        balance += amount;
        refundTotal += amount;
        run(
          'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
          uid('wtx'), order.user_id, amount, 'credit', 'بازپرداخت پرداخت نیازمند بررسی', `${order.code}:${payment.id}`, balance, now,
        );
      }
    }
    if (!refundTotal) throw Object.assign(new Error('مبلغ قابل بازپرداختی پیدا نشد.'), { status: 409 });
    run('UPDATE users SET wallet = ? WHERE id = ?', balance, order.user_id);

    const allPaidRefunded = refundable.length === paidPayments.length;
    const finalStatus = allPaidRefunded && ['cancelled', 'payment_review', 'pending'].includes(order.status)
      ? 'refunded'
      : order.status;
    const finalPaymentStatus = allPaidRefunded ? 'refunded' : 'paid';
    run('UPDATE orders SET status = ?, payment_status = ?, updated_at = ? WHERE id = ?', finalStatus, finalPaymentStatus, now, order.id);
    const cleanNote = String(note || '').trim().slice(0, 800);
    run(
      'INSERT INTO order_events (id,order_id,status,note,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?)',
      uid('oev'), order.id, finalStatus,
      cleanNote || `${refundTotal.toLocaleString('fa-IR')} تومان بابت پرداخت تأییدشده‌ی نیازمند بررسی به کیف پول بازپرداخت شد.`,
      actor.id, actor.full_name, now,
    );
    notify({
      userId: order.user_id,
      title: 'بازپرداخت انجام شد',
      body: `${refundTotal.toLocaleString('fa-IR')} تومان بابت پرداخت سفارش ${order.code} به کیف پول شما بازگشت.`,
      type: 'wallet',
      link: '/account/wallet',
    });
    return { order: get('SELECT * FROM orders WHERE id = ?', order.id), refund_total: refundTotal };
  });
}

export function expireStaleMockPayments() {
  const now = nowIso();
  const stale = all(
    `SELECT p.id FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE p.provider = 'mock' AND p.status = 'pending' AND p.expires_at IS NOT NULL AND p.expires_at <= ?
       AND o.payment_status NOT IN ('paid','refunded') ORDER BY p.expires_at ASC LIMIT 200`,
    now,
  );
  let expired = 0;
  for (const payment of stale) {
    if (failPayment(payment.id, 'مهلت پرداخت آزمایشی پایان یافت.')) expired += 1;
  }
  const topups = run(
    "UPDATE wallet_topups SET status = 'expired', verified_at = ? WHERE gateway = 'mock' AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?",
    now, now,
  );

  return expired + Number(topups.changes || 0);
}

export function settleWalletTopupUnsafe({ topup, refId }) {
  const fresh = get('SELECT * FROM wallet_topups WHERE id = ?', topup.id);
  if (!fresh || fresh.status === 'paid') return { paid: fresh?.status === 'paid', alreadyProcessed: true };
  if (!['pending', 'expired', 'failed'].includes(fresh.status)) {
    throw Object.assign(new Error('وضعیت درخواست شارژ قابل تسویه نیست.'), { status: 409 });
  }
  const user = get('SELECT wallet FROM users WHERE id = ?', fresh.user_id);
  if (!user) throw Object.assign(new Error('حساب کیف پول یافت نشد.'), { status: 404 });
  const now = nowIso();
  const changed = run("UPDATE wallet_topups SET status = 'paid', ref_id = ?, verified_at = ? WHERE id = ? AND status IN ('pending','expired','failed')", refId || null, now, fresh.id);
  if (!changed.changes) return { paid: get('SELECT status FROM wallet_topups WHERE id = ?', fresh.id)?.status === 'paid', alreadyProcessed: true };
  run('UPDATE users SET wallet = wallet + ? WHERE id = ?', fresh.amount, fresh.user_id);
  run(
    'INSERT INTO wallet_transactions (id,user_id,amount,type,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?)',
    uid('wtx'), fresh.user_id, fresh.amount, 'credit', 'شارژ کیف پول از درگاه', refId || `TOPUP-${fresh.id}`, user.wallet + fresh.amount, now,
  );
  notify({ userId: fresh.user_id, title: 'شارژ کیف پول موفق', body: `مبلغ ${Number(fresh.amount).toLocaleString('fa-IR')} تومان به کیف پول اضافه شد.`, type: 'wallet', link: '/account/wallet' });
  return { paid: true, alreadyProcessed: false };
}
