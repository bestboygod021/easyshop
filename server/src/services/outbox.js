import { all, get, nowIso, run, stringifyJson, uid } from '../db/index.js';
import { config } from '../config.js';

export function enqueueWebhookEvent(eventType, payload, targetUrl = null) {
  const id = uid('wh');
  const now = nowIso();
  const url = targetUrl || config.accountingWebhookUrl || null;
  run(
    `INSERT INTO webhook_outbox (id, event_type, payload, status, attempts, target_url, created_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?)`,
    id,
    eventType,
    typeof payload === 'string' ? payload : stringifyJson(payload),
    url,
    now,
  );
  return id;
}

export async function processWebhookOutbox(batchSize = 20) {
  const pending = all(
    `SELECT * FROM webhook_outbox WHERE status IN ('pending', 'failed') AND attempts < 5 ORDER BY created_at ASC LIMIT ?`,
    batchSize,
  );

  const results = [];
  for (const item of pending) {
    if (!item.target_url) {
      // Marked as processed locally if no destination configured
      run(
        `UPDATE webhook_outbox SET status = 'skipped', processed_at = ?, last_error = 'No target URL configured' WHERE id = ?`,
        nowIso(),
        item.id,
      );
      results.push({ id: item.id, status: 'skipped' });
      continue;
    }

    try {
      const response = await fetch(item.target_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EasyShop-Event': item.event_type,
          'X-EasyShop-Delivery': item.id,
        },
        body: item.payload,
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        run(
          `UPDATE webhook_outbox SET status = 'delivered', attempts = attempts + 1, processed_at = ?, last_error = NULL WHERE id = ?`,
          nowIso(),
          item.id,
        );
        results.push({ id: item.id, status: 'delivered' });
      } else {
        const errorText = `HTTP ${response.status}: ${await response.text().catch(() => '')}`.slice(0, 500);
        run(
          `UPDATE webhook_outbox SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?`,
          errorText,
          item.id,
        );
        results.push({ id: item.id, status: 'failed', error: errorText });
      }
    } catch (err) {
      run(
        `UPDATE webhook_outbox SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?`,
        String(err.message).slice(0, 500),
        item.id,
      );
      results.push({ id: item.id, status: 'failed', error: err.message });
    }
  }

  return results;
}
