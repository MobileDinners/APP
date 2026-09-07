/**
 * Backfills subscriptions and invoice history onto an EXISTING database.
 *
 * seed() returns the moment it finds a restaurant, so a database created
 * before the billing tables existed has orgs and no subscriptions — which
 * means the admin dashboard would show an MRR of zero for six paying
 * restaurants. This fills that gap once; it is a no-op afterwards.
 *
 *   node scripts/seed-billing.cjs
 */
const { DatabaseSync } = require("node:sqlite");

const dir = process.env.MD_DATA_DIR || "./data";
const db = new DatabaseSync(`${dir}/mobile-dinners.db`);
db.exec("PRAGMA foreign_keys = ON");

// The tables may not exist yet if the app has never booted against this file.
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    org_id TEXT PRIMARY KEY REFERENCES orgs(org_id),
    plan TEXT NOT NULL CHECK (plan IN ('starter','growth','scale','enterprise')),
    status TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','canceled')),
    price_cents INTEGER NOT NULL,
    interval TEXT NOT NULL CHECK (interval IN ('month','year')),
    trial_ends_at TEXT, current_period_end TEXT, canceled_at TEXT,
    stripe_subscription_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS subscription_invoices (
    invoice_id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(org_id),
    amount_cents INTEGER NOT NULL, refunded_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('paid','failed','refunded','open')),
    period_start TEXT NOT NULL, period_end TEXT NOT NULL, paid_at TEXT,
    failure_reason TEXT, stripe_invoice_id TEXT, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_sub_invoices_org ON subscription_invoices(org_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sub_invoices_status ON subscription_invoices(status);
  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL,
    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
`);

const already = db.prepare("SELECT COUNT(*) AS n FROM subscriptions").get().n;
if (already > 0) {
  console.log(`  ${already} subscription(s) already present — nothing to do.`);
  process.exit(0);
}

const PLANS = {
  org_sunrise:   { plan: "growth",  status: "active",   monthly: 29900, interval: "year" },
  org_baohaus:   { plan: "growth",  status: "active",   monthly: 29900, interval: "year" },
  org_noodlebar: { plan: "starter", status: "active",   monthly: 11880, interval: "month" },
  org_ellery:    { plan: "scale",   status: "active",   monthly: 59900, interval: "year" },
  org_saffron:   { plan: "starter", status: "past_due", monthly: 11880, interval: "month" },
  org_pie:       { plan: "growth",  status: "trialing", monthly: 29900, interval: "year" },
};

const now = new Date();
const iso = (d) => d.toISOString();
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

const insSub = db.prepare(`
  INSERT INTO subscriptions (org_id, plan, status, price_cents, interval, trial_ends_at,
                             current_period_end, canceled_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`);
const insInv = db.prepare(`
  INSERT INTO subscription_invoices (invoice_id, org_id, amount_cents, refunded_cents, status,
                                     period_start, period_end, paid_at, failure_reason, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const orgs = db.prepare("SELECT org_id, brand_name FROM orgs").all();
let subs = 0, invs = 0, seq = 0;

db.exec("BEGIN");
try {
  for (const o of orgs) {
    const p = PLANS[o.org_id];
    if (!p) {
      console.log(`  skipped ${o.brand_name} — no plan mapping`);
      continue;
    }
    insSub.run(
      o.org_id, p.plan, p.status, p.monthly, p.interval,
      p.status === "trialing" ? iso(addMonths(now, 1)) : null,
      iso(addMonths(now, 1)), iso(addMonths(now, -11)), iso(now),
    );
    subs++;
    if (p.status === "trialing") continue;

    for (let m = 11; m >= 0; m--) {
      const periodStart = addMonths(now, -m);
      const failed = p.status === "past_due" && m === 0;
      const refunded = o.org_id === "org_noodlebar" && m === 7;
      insInv.run(
        `inv_seed_${(seq++).toString(36).padStart(6, "0")}`,
        o.org_id, p.monthly, refunded ? p.monthly : 0,
        failed ? "failed" : refunded ? "refunded" : "paid",
        iso(periodStart), iso(addMonths(periodStart, 1)),
        failed ? null : iso(periodStart),
        failed ? "card_declined: insufficient funds" : null,
        iso(periodStart),
      );
      invs++;
    }
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const mrr = db
  .prepare("SELECT COALESCE(SUM(price_cents),0) AS n FROM subscriptions WHERE status IN ('active','past_due')")
  .get().n;
console.log(`  ${subs} subscription(s), ${invs} invoice(s)`);
console.log(`  MRR: $${(mrr / 100).toFixed(2)}   ARR: $${((mrr * 12) / 100).toFixed(2)}`);
