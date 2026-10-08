/**
 * EasyShop database schema (SQLite / node:sqlite).
 * همه‌ی جداول مورد نیاز فروشگاه: کاربران، کاتالوگ، سبد خرید، سفارش‌ها،
 * پرداخت، انبار، نظرات، تیکت‌ها، چت زنده، باشگاه مشتریان، هوش مصنوعی و تنظیمات.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer',      -- customer | support | seller | admin
  avatar        TEXT,
  status        TEXT NOT NULL DEFAULT 'active',        -- active | blocked | pending
  permissions   TEXT NOT NULL DEFAULT '[]',
  wallet        INTEGER NOT NULL DEFAULT 0,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  locale        TEXT NOT NULL DEFAULT 'fa',
  notes         TEXT,
  reset_token   TEXT,
  reset_token_hash TEXT,
  reset_expires TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  last_login_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  token_hash TEXT,
  family     TEXT,
  user_agent TEXT,
  ip         TEXT,
  expires_at TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS addresses (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'آدرس من',
  receiver    TEXT NOT NULL,
  phone       TEXT NOT NULL,
  province    TEXT,
  city        TEXT,
  postal_code TEXT,
  line        TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
  slug        TEXT NOT NULL UNIQUE,
  name_fa     TEXT NOT NULL,
  name_en     TEXT,
  icon        TEXT,
  image       TEXT,
  color       TEXT,
  description_fa TEXT,
  description_en TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  sku           TEXT UNIQUE,
  slug          TEXT NOT NULL UNIQUE,
  name_fa       TEXT NOT NULL,
  name_en       TEXT,
  brand         TEXT,
  category_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
  price         INTEGER NOT NULL DEFAULT 0,
  compare_at_price INTEGER,
  cost          INTEGER,
  currency      TEXT NOT NULL DEFAULT 'IRT',
  stock         INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  unit          TEXT NOT NULL DEFAULT 'عدد',
  weight_grams  INTEGER,
  short_desc_fa TEXT,
  short_desc_en TEXT,
  description_fa TEXT,
  description_en TEXT,
  specs         TEXT NOT NULL DEFAULT '{}',
  tags          TEXT NOT NULL DEFAULT '[]',
  images        TEXT NOT NULL DEFAULT '[]',
  thumbnail     TEXT,
  status        TEXT NOT NULL DEFAULT 'active',        -- draft | active | archived
  featured      INTEGER NOT NULL DEFAULT 0,
  rating_avg    REAL NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  sold_count    INTEGER NOT NULL DEFAULT 0,
  view_count    INTEGER NOT NULL DEFAULT 0,
  warranty      TEXT,
  shipping_days INTEGER NOT NULL DEFAULT 3,
  ai_meta       TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  published_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

CREATE TABLE IF NOT EXISTS product_variants (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku        TEXT,
  name_fa    TEXT NOT NULL,
  name_en    TEXT,
  price_delta INTEGER NOT NULL DEFAULT 0,
  stock      INTEGER NOT NULL DEFAULT 0,
  attributes TEXT NOT NULL DEFAULT '{}',
  image      TEXT
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  ref        TEXT,
  user_id    TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS carts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_key TEXT,
  coupon_code TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         TEXT PRIMARY KEY,
  cart_id    TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT,
  qty        INTEGER NOT NULL DEFAULT 1,
  note       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coupons (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL DEFAULT 'percent',   -- percent | fixed | free_shipping
  value         INTEGER NOT NULL DEFAULT 0,
  min_subtotal  INTEGER NOT NULL DEFAULT 0,
  max_discount  INTEGER,
  starts_at     TEXT,
  ends_at       TEXT,
  usage_limit   INTEGER,
  per_user_limit INTEGER NOT NULL DEFAULT 1,
  used_count    INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  description   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id        TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL,
  order_id  TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending|paid|processing|packed|shipped|delivered|cancelled|refunded|returned
  payment_status TEXT NOT NULL DEFAULT 'unpaid',   -- unpaid|paid|failed|refunded
  subtotal      INTEGER NOT NULL DEFAULT 0,
  discount      INTEGER NOT NULL DEFAULT 0,
  tax           INTEGER NOT NULL DEFAULT 0,
  shipping_cost INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'IRT',
  coupon_code   TEXT,
  address       TEXT,
  shipping_method TEXT DEFAULT 'post',
  shipping_carrier TEXT,
  stock_committed  INTEGER NOT NULL DEFAULT 0,
  tracking_code TEXT,
  customer_note TEXT,
  admin_note    TEXT,
  loyalty_used  INTEGER NOT NULL DEFAULT 0,
  loyalty_reserved INTEGER NOT NULL DEFAULT 0,
  coupon_reserved INTEGER NOT NULL DEFAULT 0,
  checkout_key TEXT UNIQUE,
  placed_at     TEXT NOT NULL,
  paid_at       TEXT,
  shipped_at    TEXT,
  delivered_at  TEXT,
  cancelled_at  TEXT,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  name_fa    TEXT NOT NULL,
  name_en    TEXT,
  sku        TEXT,
  thumbnail  TEXT,
  variant_id TEXT,
  variant_name TEXT,
  unit_price INTEGER NOT NULL,
  qty        INTEGER NOT NULL,
  total      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  actor_id   TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL DEFAULT 'mock',
  amount      INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending|paid|failed|refunded
  applied     INTEGER NOT NULL DEFAULT 0,        -- پرداختی که تسویه‌ی سفارش را انجام داده است
  authority   TEXT,
  ref_id      TEXT,
  payload     TEXT,
  redirect_url TEXT,
  expires_at TEXT,
  failure_reason TEXT,
  card_mask   TEXT,
  card_hash   TEXT,
  created_at  TEXT NOT NULL,
  verified_at TEXT
);
CREATE TABLE IF NOT EXISTS payment_callback_events (
  id              TEXT PRIMARY KEY,
  provider        TEXT NOT NULL,
  callback_status TEXT,
  result          TEXT NOT NULL DEFAULT 'received',
  target_type     TEXT,
  target_id       TEXT,
  error_code      TEXT,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_callback_target ON payment_callback_events(target_type,target_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_callback_result ON payment_callback_events(result,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_callback_created ON payment_callback_events(created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  order_id      TEXT,
  rating        INTEGER NOT NULL,
  title         TEXT,
  body          TEXT,
  pros          TEXT,
  cons          TEXT,
  status        TEXT NOT NULL DEFAULT 'approved',  -- pending|approved|rejected
  helpful_count INTEGER NOT NULL DEFAULT 0,
  reply         TEXT,
  replied_at    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

CREATE TABLE IF NOT EXISTS wishlist (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,
  type          TEXT NOT NULL,                    -- credit | debit
  reason        TEXT NOT NULL,
  ref           TEXT,
  balance_after INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id       TEXT,
  subject        TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'general',
  priority       TEXT NOT NULL DEFAULT 'normal',  -- low|normal|high|urgent
  status         TEXT NOT NULL DEFAULT 'open',    -- open|pending|answered|resolved|closed
  assigned_to    TEXT,
  satisfaction   INTEGER,
  last_message_at TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id     TEXT,
  author_name TEXT,
  author_role TEXT,
  body        TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  is_internal INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  guest_name       TEXT,
  guest_email      TEXT,
  guest_token_hash TEXT,
  subject          TEXT,
  status           TEXT NOT NULL DEFAULT 'open',  -- open|pending|closed
  priority         TEXT NOT NULL DEFAULT 'normal',
  source           TEXT NOT NULL DEFAULT 'web',
  assigned_to      TEXT,
  last_message     TEXT,
  last_message_at  TEXT,
  unread_admin     INTEGER NOT NULL DEFAULT 0,
  unread_user      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT,
  sender_name     TEXT,
  sender_role     TEXT NOT NULL DEFAULT 'customer',
  body            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'text',  -- text|image|product|system|file
  meta            TEXT NOT NULL DEFAULT '{}',
  is_internal     INTEGER NOT NULL DEFAULT 0,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  read_at         TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  type       TEXT NOT NULL DEFAULT 'info',
  link       TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         TEXT PRIMARY KEY,
  email      TEXT,
  ip         TEXT,
  success    INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at);

CREATE TABLE IF NOT EXISTS review_helpful (
  review_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS wallet_topups (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT UNIQUE,
  gateway     TEXT,
  authority   TEXT,
  ref_id      TEXT,
  ip          TEXT,
  redirect_url TEXT,
  expires_at TEXT,
  created_at  TEXT NOT NULL,
  verified_at TEXT
);
CREATE TABLE IF NOT EXISTS checkout_intents (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL,
  user_id    TEXT,
  phone      TEXT,
  authority  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS ai_providers (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name_fa       TEXT NOT NULL,
  name_en       TEXT,
  kind          TEXT NOT NULL,                    -- openai|anthropic|gemini|builtin|custom
  base_url      TEXT NOT NULL,
  api_key       TEXT,
  models        TEXT NOT NULL DEFAULT '[]',
  default_model TEXT,
  supports_image INTEGER NOT NULL DEFAULT 0,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,
  priority      INTEGER NOT NULL DEFAULT 10,
  temperature   REAL NOT NULL DEFAULT 0.7,
  max_tokens    INTEGER NOT NULL DEFAULT 4096,
  monthly_token_cap INTEGER NOT NULL DEFAULT 0,
  used_tokens   INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_logs (
  id         TEXT PRIMARY KEY,
  provider   TEXT,
  model      TEXT,
  kind       TEXT,
  prompt     TEXT,
  response   TEXT,
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost       REAL NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'ok',
  error      TEXT,
  user_id    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created ON ai_logs(created_at);

CREATE TABLE IF NOT EXISTS ai_generations (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  provider   TEXT,
  model      TEXT,
  user_id    TEXT,
  input      TEXT,
  output     TEXT,
  status     TEXT NOT NULL DEFAULT 'draft',
  product_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  user_name  TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  meta       TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);
`;
