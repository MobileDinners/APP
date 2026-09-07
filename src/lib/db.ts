import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ensurePlatformAdmin, seed } from "./seed";

/**
 * Local-first store. In production this is Postgres 16 with row-level
 * security (spec §1.5); here it is the same schema shape against SQLite so the
 * whole slice runs with no Docker and no external services.
 *
 * Deliberate simplifications, flagged rather than hidden:
 *   · item option groups live in a JSON column instead of their own tables
 *   · no org_id RLS policy — SQLite has none; every query scopes explicitly
 */

const globalForDb = globalThis as unknown as { __mdDb?: DatabaseSync };

function open(): DatabaseSync {
  // MD_DATA_DIR lets the database live on a mounted volume in production;
  // locally it defaults to ./data next to the source.
  const dir = process.env.MD_DATA_DIR || join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "mobile-dinners.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  seed(db);
  // Every boot, not just an empty one: a managed host has no shell, so setting
  // MD_ADMIN_PASSWORD and redeploying is the only way to create this account.
  ensurePlatformAdmin(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!globalForDb.__mdDb) globalForDb.__mdDb = open();
  return globalForDb.__mdDb;
}

/**
 * Adds a column if it is not already there. CREATE TABLE IF NOT EXISTS silently
 * ignores new columns on an existing table, which meant every schema change so
 * far required wiping the database. This makes changes additive instead.
 */
function ensureColumn(
  db: DatabaseSync,
  table: string,
  column: string,
  ddl: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      org_id             TEXT PRIMARY KEY,
      slug               TEXT NOT NULL UNIQUE,
      brand_name         TEXT NOT NULL,
      cuisine            TEXT NOT NULL,
      price_band         TEXT NOT NULL,
      rating             REAL NOT NULL,
      rating_count       INTEGER NOT NULL DEFAULT 0,
      blurb              TEXT NOT NULL,
      hero_hue           INTEGER NOT NULL,
      image_kw           TEXT NOT NULL DEFAULT 'food',
      promo              TEXT,
      is_sponsored       INTEGER NOT NULL DEFAULT 0,
      distance_mi        REAL NOT NULL,
      address            TEXT NOT NULL,
      prep_base_seconds  INTEGER NOT NULL,
      accepting_orders   INTEGER NOT NULL DEFAULT 1,
      delivery_fee_cents INTEGER NOT NULL DEFAULT 99,
      points_multiplier  REAL NOT NULL DEFAULT 1.0
    );

    CREATE TABLE IF NOT EXISTS items (
      item_id       TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES orgs(org_id),
      section       TEXT NOT NULL,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
      cost_cents    INTEGER NOT NULL DEFAULT 0,
      prep_seconds  INTEGER NOT NULL DEFAULT 300,
      station       TEXT NOT NULL DEFAULT 'assembly',
      is_available  INTEGER NOT NULL DEFAULT 1,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      image_kw      TEXT NOT NULL DEFAULT 'food',
      is_popular    INTEGER NOT NULL DEFAULT 0,
      options_json  TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_items_org ON items(org_id, sort_order);

    CREATE TABLE IF NOT EXISTS orders (
      order_id            TEXT PRIMARY KEY,
      org_id              TEXT NOT NULL REFERENCES orgs(org_id),
      person_id           TEXT REFERENCES persons(person_id),
      menu_version_id     TEXT,
      channel             TEXT NOT NULL,
      fulfillment         TEXT NOT NULL,
      state               TEXT NOT NULL,
      subtotal_cents      INTEGER NOT NULL,
      discount_cents      INTEGER NOT NULL DEFAULT 0,
      tax_cents           INTEGER NOT NULL,
      tip_cents           INTEGER NOT NULL DEFAULT 0,
      delivery_fee_cents  INTEGER NOT NULL DEFAULT 0,
      service_fee_cents   INTEGER NOT NULL DEFAULT 0,
      total_cents         INTEGER NOT NULL,
      points_earned       INTEGER NOT NULL DEFAULT 0,
      points_redeemed     INTEGER NOT NULL DEFAULT 0,
      guest_name          TEXT NOT NULL DEFAULT '',
      guest_phone         TEXT NOT NULL DEFAULT '',
      address             TEXT NOT NULL DEFAULT '',
      placed_at           TEXT NOT NULL,
      promised_at         TEXT NOT NULL,
      idempotency_key     TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(org_id, placed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_person ON orders(person_id, placed_at DESC);

    CREATE TABLE IF NOT EXISTS order_items (
      order_id          TEXT NOT NULL REFERENCES orders(order_id),
      line_no           INTEGER NOT NULL,
      item_id           TEXT NOT NULL,
      name              TEXT NOT NULL,
      qty               INTEGER NOT NULL CHECK (qty > 0),
      unit_price_cents  INTEGER NOT NULL,
      options_label     TEXT NOT NULL DEFAULT '',
      notes             TEXT NOT NULL DEFAULT '',
      station           TEXT NOT NULL,
      prep_seconds      INTEGER NOT NULL,
      bumped_at         TEXT,
      PRIMARY KEY (order_id, line_no)
    );

    -- Append-only. Current order state is a fold over this table; the
    -- orders.state column is a projection kept for query speed (spec §1.4).
    CREATE TABLE IF NOT EXISTS order_events (
      order_id     TEXT NOT NULL REFERENCES orders(order_id),
      seq          INTEGER NOT NULL,
      event_type   TEXT NOT NULL,
      payload      TEXT NOT NULL DEFAULT '{}',
      actor        TEXT NOT NULL DEFAULT 'system',
      source       TEXT NOT NULL DEFAULT 'SYSTEM',
      occurred_at  TEXT NOT NULL,
      PRIMARY KEY (order_id, seq)
    );

    -- Menus are published as immutable snapshots, never mutated in place.
    -- Every order records the exact version it was priced against, so a later
    -- price change can never rewrite what a guest actually agreed to pay.
    CREATE TABLE IF NOT EXISTS menu_versions (
      menu_version_id TEXT PRIMARY KEY,
      org_id          TEXT NOT NULL REFERENCES orgs(org_id),
      version_no      INTEGER NOT NULL,
      content_hash    TEXT NOT NULL,
      snapshot_json   TEXT NOT NULL,
      item_count      INTEGER NOT NULL,
      source          TEXT NOT NULL,
      published_by    TEXT,
      published_at    TEXT NOT NULL,
      UNIQUE (org_id, version_no)
    );
    CREATE INDEX IF NOT EXISTS idx_menu_versions_org
      ON menu_versions(org_id, version_no DESC);

    -- Every AI proposal is logged with the human verdict. This is the eval
    -- set, the audit trail, and the dispute record all at once (spec 4.5).
    CREATE TABLE IF NOT EXISTS ai_decisions (
      decision_id   TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL,
      kind          TEXT NOT NULL,
      item_id       TEXT,
      proposal_json TEXT NOT NULL,
      verdict       TEXT NOT NULL CHECK (verdict IN ('accepted','dismissed')),
      actor         TEXT,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_decisions_org
      ON ai_decisions(org_id, created_at DESC);

    -- ============ IDENTITY & AUTH ============
    -- Platform-scoped: one person, one points wallet, across every restaurant.
    CREATE TABLE IF NOT EXISTS persons (
      person_id    TEXT PRIMARY KEY,
      phone_e164   TEXT UNIQUE,
      email        TEXT UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL
    );

    -- Tenant-scoped: staff belong to exactly one org and carry a role.
    CREATE TABLE IF NOT EXISTS staff (
      staff_id      TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES orgs(org_id),
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('owner','manager','shift_lead')),
      password_hash TEXT NOT NULL,
      pin_hash      TEXT,
      disabled      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL
    );

    -- Only the hash of a session token is stored; the raw token lives in the
    -- cookie and nowhere else, so a database leak cannot resume sessions.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash   TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('person','staff')),
      subject_id   TEXT NOT NULL,
      org_id       TEXT,
      created_at   TEXT NOT NULL,
      expires_at   TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_subject ON sessions(subject_type, subject_id);

    -- One-time codes are hashed too, expire fast, and cap attempts.
    CREATE TABLE IF NOT EXISTS otp_codes (
      otp_id     TEXT PRIMARY KEY,
      phone_e164 TEXT NOT NULL,
      code_hash  TEXT NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      consumed_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone_e164, created_at DESC);

    CREATE TABLE IF NOT EXISTS wallet (
      person_id      TEXT PRIMARY KEY,
      display_name   TEXT NOT NULL,
      points_balance INTEGER NOT NULL DEFAULT 0,
      tier           TEXT NOT NULL DEFAULT 'bronze',
      orders_count   INTEGER NOT NULL DEFAULT 0
    );

    -- Cross-brand points ledger. Every grant and redemption is a row; the
    -- wallet balance is a projection over it (spec §5.5).
    CREATE TABLE IF NOT EXISTS loyalty_entries (
      entry_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id  TEXT NOT NULL,
      org_id     TEXT,
      order_id   TEXT,
      delta      INTEGER NOT NULL,
      reason     TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // --- additive migrations -------------------------------------------
  // Marketing consent is per channel and timestamped: "they gave us their
  // number" is not consent to text them, and a regulator will ask when.
    // Stripe Connect. The account id is not a secret — it is an identifier, and
  // the restaurant's bank details never touch this database.
  ensureColumn(db, "orgs", "stripe_account_id", "TEXT");
  ensureColumn(db, "orgs", "charges_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orgs", "payouts_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orgs", "payments_updated_at", "TEXT");

ensureColumn(db, "persons", "marketing_sms", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "persons", "marketing_email", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "persons", "consent_at", "TEXT");
  ensureColumn(db, "persons", "opted_out_at", "TEXT");

  // Which upsell arm the guest was in when this order was placed. Recorded on
  // the order so average ticket can be compared between arms afterwards —
  // without it, "upsells raised AOV" is an unfalsifiable claim.
  ensureColumn(db, "orders", "upsell_arm", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      campaign_id  TEXT PRIMARY KEY,
      org_id       TEXT NOT NULL REFERENCES orgs(org_id),
      name         TEXT NOT NULL,
      template     TEXT NOT NULL,
      channel      TEXT NOT NULL CHECK (channel IN ('sms','email')),
      segment      TEXT NOT NULL,
      offer_type   TEXT NOT NULL CHECK (offer_type IN ('none','percent','amount')),
      offer_value  INTEGER NOT NULL DEFAULT 0,
      message      TEXT NOT NULL,
      holdout_pct  INTEGER NOT NULL DEFAULT 10,
      window_days  INTEGER NOT NULL DEFAULT 21,
      status       TEXT NOT NULL CHECK (status IN ('draft','active','completed')),
      created_by   TEXT,
      created_at   TEXT NOT NULL,
      activated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(org_id, created_at DESC);

    -- Every person considered for a campaign gets a row, including the ones
    -- we deliberately did NOT contact. Without the holdout arm and the
    -- suppression reasons stored here, "incremental revenue" is unprovable.
    CREATE TABLE IF NOT EXISTS campaign_sends (
      campaign_id       TEXT NOT NULL REFERENCES campaigns(campaign_id),
      person_id         TEXT NOT NULL,
      arm               TEXT NOT NULL CHECK (arm IN ('treated','holdout')),
      suppressed_reason TEXT,
      sent_at           TEXT,
      PRIMARY KEY (campaign_id, person_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sends_campaign ON campaign_sends(campaign_id, arm);

    -- Impressions and accepts for suggested add-ons. Suppressed rows are
    -- written for holdout carts too, so both arms are countable.
    CREATE TABLE IF NOT EXISTS upsell_events (
      event_id   TEXT PRIMARY KEY,
      org_id     TEXT NOT NULL,
      person_id  TEXT,
      item_id    TEXT,
      arm        TEXT NOT NULL CHECK (arm IN ('treated','holdout')),
      action     TEXT NOT NULL CHECK (action IN ('impression','accepted','suppressed')),
      price_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_upsell_org ON upsell_events(org_id, created_at DESC);

    -- The restaurant's own website. Draft/published mirrors the menu: what an
    -- operator edits is never what a guest sees until they say so.
    CREATE TABLE IF NOT EXISTS sites (
      org_id         TEXT PRIMARY KEY REFERENCES orgs(org_id),
      slug           TEXT NOT NULL UNIQUE,
      status         TEXT NOT NULL CHECK (status IN ('draft','published')),
      draft_json     TEXT NOT NULL,
      published_json TEXT,
      published_at   TEXT,
      updated_at     TEXT NOT NULL
    );

    -- ============ POS COEXIST MODE (spec 1.7) ============
    -- The restaurant keeps the till it already owns. Access tokens are sealed
    -- with AES-256-GCM; the key lives in the environment, never in this file.

    CREATE TABLE IF NOT EXISTS payments (
      payment_id       TEXT PRIMARY KEY,
      order_id         TEXT NOT NULL REFERENCES orders(order_id),
      org_id           TEXT NOT NULL REFERENCES orgs(org_id),
      provider         TEXT NOT NULL,
      intent_id        TEXT NOT NULL UNIQUE,
      status           TEXT NOT NULL,
      charge_cents     INTEGER NOT NULL,
      restaurant_cents INTEGER NOT NULL,
      platform_cents   INTEGER NOT NULL,
      tip_cents        INTEGER NOT NULL DEFAULT 0,
      refunded_cents   INTEGER NOT NULL DEFAULT 0,
      failure_reason   TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS payments_org ON payments(org_id, created_at);

    -- Processor events are recorded before they are acted on, so a replayed or
    -- duplicated webhook is a no-op rather than a second state change.
    CREATE TABLE IF NOT EXISTS payment_events (
      event_id    TEXT PRIMARY KEY,
      provider    TEXT NOT NULL,
      event_type  TEXT NOT NULL,
      intent_id   TEXT,
      order_id    TEXT,
      payload     TEXT NOT NULL,
      received_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS deliveries (
      delivery_id      TEXT PRIMARY KEY,
      order_id         TEXT NOT NULL REFERENCES orders(order_id),
      org_id           TEXT NOT NULL REFERENCES orgs(org_id),
      provider         TEXT NOT NULL,
      external_id      TEXT NOT NULL UNIQUE,
      provider_ref     TEXT,
      status           TEXT NOT NULL,
      -- What the courier charges US. Deliberately stored next to what the
      -- diner paid, because those are different numbers and the gap is a real
      -- cost that has to be visible rather than discovered at month end.
      courier_fee_cents INTEGER NOT NULL DEFAULT 0,
      guest_fee_cents   INTEGER NOT NULL DEFAULT 0,
      courier_name     TEXT,
      courier_phone    TEXT,
      courier_lat      REAL,
      courier_lng      REAL,
      pickup_eta       TEXT,
      dropoff_eta      TEXT,
      tracking_url     TEXT,
      support_ref      TEXT,
      cancel_reason    TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS deliveries_order ON deliveries(order_id);
    CREATE INDEX IF NOT EXISTS deliveries_org ON deliveries(org_id, created_at);

    -- Courier updates are recorded before they are acted on, so a replayed
    -- webhook cannot advance an order twice.
    CREATE TABLE IF NOT EXISTS delivery_events (
      event_id    TEXT PRIMARY KEY,
      provider    TEXT NOT NULL,
      external_id TEXT NOT NULL,
      status      TEXT NOT NULL,
      payload     TEXT NOT NULL,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pos_connections (
      org_id          TEXT PRIMARY KEY REFERENCES orgs(org_id),
      provider        TEXT NOT NULL CHECK (provider IN ('square','clover','sandbox')),
      merchant_id     TEXT NOT NULL,
      location_id     TEXT,
      access_token    TEXT NOT NULL,
      refresh_token   TEXT,
      expires_at      TEXT,
      status          TEXT NOT NULL CHECK (status IN ('active','needs_reauth','error')),
      last_sync_at    TEXT,
      last_error      TEXT,
      connected_at    TEXT NOT NULL
    );

    -- Their item id to ours. Without this, a rename on the till would look like
    -- a deletion plus an unrelated new item.
    CREATE TABLE IF NOT EXISTS pos_item_map (
      org_id      TEXT NOT NULL,
      provider    TEXT NOT NULL,
      external_id TEXT NOT NULL,
      item_id     TEXT NOT NULL,
      PRIMARY KEY (org_id, provider, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pos_map_item ON pos_item_map(org_id, item_id);

    CREATE TABLE IF NOT EXISTS pos_sync_log (
      log_id     TEXT PRIMARY KEY,
      org_id     TEXT NOT NULL,
      provider   TEXT NOT NULL,
      created    INTEGER NOT NULL DEFAULT 0,
      updated    INTEGER NOT NULL DEFAULT 0,
      unchanged  INTEGER NOT NULL DEFAULT 0,
      flagged    INTEGER NOT NULL DEFAULT 0,
      skipped    INTEGER NOT NULL DEFAULT 0,
      detail     TEXT NOT NULL DEFAULT '[]',
      ok         INTEGER NOT NULL DEFAULT 1,
      error      TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pos_sync_org ON pos_sync_log(org_id, created_at DESC);

    -- Orders pushed into the restaurant's own till so tickets print on the
    -- hardware their staff already use.
    CREATE TABLE IF NOT EXISTS pos_order_push (
      order_id          TEXT PRIMARY KEY REFERENCES orders(order_id),
      org_id            TEXT NOT NULL,
      provider          TEXT NOT NULL,
      external_order_id TEXT,
      status            TEXT NOT NULL CHECK (status IN ('pending','pushed','failed')),
      attempts          INTEGER NOT NULL DEFAULT 0,
      last_error        TEXT,
      updated_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pos_push_status ON pos_order_push(org_id, status);

    -- What a restaurant pays us every month.
    --
    -- This is the whole business model — 0% commission means the subscription
    -- IS the revenue — and until now it existed only as prose on the pricing
    -- page. Without it there is no MRR, no ARR, no billing history and no way
    -- to answer "who has not paid", so the admin dashboard had nothing real to
    -- compute from.
    --
    -- price_cents is stored per subscription rather than looked up from the
    -- plan, because a negotiated Enterprise rate and a grandfathered price are
    -- both normal and neither survives a price-list change.
    CREATE TABLE IF NOT EXISTS subscriptions (
      org_id               TEXT PRIMARY KEY REFERENCES orgs(org_id),
      plan                 TEXT NOT NULL CHECK (plan IN ('starter','growth','scale','enterprise')),
      status               TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','canceled')),
      -- Normalised to a MONTHLY figure so MRR is a sum, not a case statement.
      price_cents          INTEGER NOT NULL,
      interval             TEXT NOT NULL CHECK (interval IN ('month','year')),
      trial_ends_at        TEXT,
      current_period_end   TEXT,
      canceled_at          TEXT,
      stripe_subscription_id TEXT,
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL
    );

    -- One row per billing attempt, successful or not. Failed rows are the
    -- point: a subscription business dies of silent card failures, so they
    -- have to be visible rather than inferred from an absence.
    CREATE TABLE IF NOT EXISTS subscription_invoices (
      invoice_id      TEXT PRIMARY KEY,
      org_id          TEXT NOT NULL REFERENCES orgs(org_id),
      amount_cents    INTEGER NOT NULL,
      refunded_cents  INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL CHECK (status IN ('paid','failed','refunded','open')),
      period_start    TEXT NOT NULL,
      period_end      TEXT NOT NULL,
      paid_at         TEXT,
      failure_reason  TEXT,
      stripe_invoice_id TEXT,
      created_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sub_invoices_org ON subscription_invoices(org_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sub_invoices_status ON subscription_invoices(status);

    -- Platform-wide settings an admin can change without a deploy: featured
    -- restaurants, loyalty rules, provider toggles. One row per key holding
    -- JSON, same shape as site_content and for the same reason — the DEFAULTS
    -- live in code, so an empty table is a working platform.
    CREATE TABLE IF NOT EXISTS admin_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );

    -- Editable copy for the platform's own site: header nav, footer, taglines.
    -- One row, holding a JSON override. The DEFAULTS live in site-content.ts,
    -- not here, so an empty table renders the site that ships in the repo
    -- rather than a page with no navigation.
    CREATE TABLE IF NOT EXISTS site_content (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
  `);
}

export { DEMO_PERSON as DEMO_PERSON_ID } from "./seed";
