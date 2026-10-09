import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ADDITIONAL_INDEX_MIGRATIONS, COLUMN_MIGRATIONS, TABLE_MIGRATIONS } from '../../src/db/legacy-schema-migrations.js';
import { SCHEMA_SQL } from '../../src/db/schema.js';

const FIXTURE_TIME = '2026-10-09T00:00:00.000Z';

export function createSqliteImportFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-sqlite-import-'));
  const snapshotPath = path.join(directory, 'sanitized-fixture.sqlite');
  const database = new DatabaseSync(snapshotPath);
  database.exec(SCHEMA_SQL);
  for (const statement of TABLE_MIGRATIONS) database.exec(statement);
  for (const [table, column, definition] of COLUMN_MIGRATIONS) {
    const columns = database.prepare(`PRAGMA table_info("${table}")`).all();
    if (!columns.some((item) => item.name === column)) {
      database.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
    }
  }
  for (const statement of ADDITIONAL_INDEX_MIGRATIONS) database.exec(statement);

  // Deliberately insert the category child before its parent. The snapshot is
  // made internally consistent before foreign-key validation below.
  database.exec('PRAGMA foreign_keys = OFF');
  database.prepare(`INSERT INTO users
    (id, email, phone, password_hash, full_name, role, created_at, updated_at, reset_token, reset_token_hash, device_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('fixture-user', 'customer@example.invalid', '+15550000001', '$2b$10$production-password-hash', 'Fixture Customer', 'customer', FIXTURE_TIME, FIXTURE_TIME, 'reset-secret-fixture', 'reset-hash-fixture', '["device-token-fixture"]');
  database.prepare(`INSERT INTO categories (id, parent_id, slug, name_fa, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run('fixture-category-child', 'fixture-category-parent', 'fixture-child', 'Child', FIXTURE_TIME);
  database.prepare(`INSERT INTO categories (id, slug, name_fa, created_at)
    VALUES (?, ?, ?, ?)`)
    .run('fixture-category-parent', 'fixture-parent', 'Parent', FIXTURE_TIME);
  database.prepare(`INSERT INTO products
    (id, slug, name_fa, price, category_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('fixture-product', 'fixture-product', 'Fixture Product', 12500, 'fixture-category-child', FIXTURE_TIME, FIXTURE_TIME);
  database.prepare(`INSERT INTO orders
    (id, code, user_id, status, payment_status, subtotal, total, placed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('fixture-order', 'ORDER-FIXTURE-001', 'fixture-user', 'processing', 'paid', 12500, 12500, FIXTURE_TIME, FIXTURE_TIME);
  const insertPayment = database.prepare(`INSERT INTO payments
    (id, order_id, provider, amount, status, authority, ref_id, payload, redirect_url,
     failure_reason, card_mask, card_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertPayment.run('fixture-payment', 'fixture-order', 'mock', 12500, 'paid', 'authority-fixture-secret', 'provider-ref-fixture',
    '{"provider_secret":"fixture"}', 'https://payment.invalid/fixture', 'fixture-provider-detail',
    '4111********1111', 'fixture-card-derived-hash', FIXTURE_TIME);
  insertPayment.run('fixture-payment-second', 'fixture-order', 'mock', 12500, 'paid', 'authority-fixture-second-secret', 'provider-ref-fixture-second',
    '{"provider_secret":"fixture-second"}', 'https://payment.invalid/fixture-second', 'fixture-provider-detail-second',
    '4111********2222', 'fixture-card-derived-hash-second', '2026-10-09T00:01:00.000Z');
  database.prepare(`INSERT INTO ai_providers
    (id, slug, name_fa, kind, base_url, api_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('fixture-ai-provider', 'fixture-provider', 'Fixture Provider', 'custom', 'https://ai.invalid', 'ai-api-key-fixture', FIXTURE_TIME, FIXTURE_TIME);
  database.prepare(`INSERT INTO refresh_tokens
    (id, user_id, token, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run('fixture-refresh-token', 'fixture-user', 'refresh-token-fixture', 'refresh-hash-fixture', '2026-10-10T00:00:00.000Z', FIXTURE_TIME);
  database.prepare(`INSERT INTO sms_otps (id, phone, code, purpose, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run('fixture-sms-otp', '+15550000001', '654321', 'login', '2026-10-10T00:00:00.000Z', FIXTURE_TIME);
  database.prepare(`INSERT INTO checkout_intents (id, order_id, user_id, authority, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run('fixture-checkout-intent', 'fixture-order', 'fixture-user', 'checkout-authority-fixture', FIXTURE_TIME, '2026-10-10T00:00:00.000Z');
  database.prepare(`INSERT INTO webhook_outbox (id, event_type, payload, target_url, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run('fixture-webhook', 'order.created', '{"customer":"fixture"}', 'https://webhook.invalid', FIXTURE_TIME);
  database.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('provider_api_secret', 'must-not-copy-this-setting', FIXTURE_TIME);
  database.exec('PRAGMA foreign_keys = ON');
  if (database.prepare('PRAGMA foreign_key_check').get()) {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
    throw new Error('The synthetic SQLite import fixture has an invalid foreign key.');
  }
  database.close();

  return {
    directory,
    snapshotPath,
    dispose() { fs.rmSync(directory, { recursive: true, force: true }); },
  };
}
