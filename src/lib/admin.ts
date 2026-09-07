import { getDb } from "./db";
import { computeMrr, listInvoices, type Mrr } from "./billing";
import { PLATFORM_ORG_ID } from "./platform";

/**
 * Every figure the internal admin dashboard shows, in one file.
 *
 * Two rules run through all of it.
 *
 * FIRST: a number that cannot be computed honestly is not returned as zero.
 * Several providers have never run live — the payments and deliveries tables
 * are empty, not because nothing happened but because Stripe and DoorDash were
 * never connected. A dashboard that renders "$0 refunded" and "100% delivery
 * success" from no rows is worse than one that says NOT CONNECTED, because the
 * first is a confident lie and the second is a to-do list. Hence `Metric`
 * below, which carries its own provenance.
 *
 * SECOND: this is platform-wide and deliberately NOT tenant-scoped. Every
 * other query in the codebase scopes to one org from the session; these
 * intentionally do not, which is exactly why every caller must sit behind
 * isPlatformAdmin. Nothing here may be reached from a restaurant's session.
 */

/** A figure plus whether it means anything yet. */
export type Metric<T> =
  | { available: true; value: T }
  | { available: false; reason: string };

function ok<T>(value: T): Metric<T> {
  return { available: true, value };
}
function missing<T>(reason: string): Metric<T> {
  return { available: false, reason };
}

const db = () => getDb();

function count(sql: string, ...args: unknown[]): number {
  const r = db().prepare(sql).get(...(args as never[])) as { n: number } | undefined;
  return r?.n ?? 0;
}

/* ------------------------------------------------------------------ *
 * A. Dashboard home
 * ------------------------------------------------------------------ */

export type Overview = {
  restaurants: number;
  restaurantsAccepting: number;
  customers: number;
  orders: number;
  ordersToday: number;
  /** Gross merchandise value — what diners paid, NOT platform revenue. */
  gmvCents: number;
  /** What the platform actually earned. Subscriptions are the whole model. */
  mrr: Mrr;
  newCustomers30d: number;
  newMerchants30d: number;
  deliverySuccess: Metric<{ delivered: number; attempted: number; rate: number }>;
  posSync: Metric<{ connected: number; ok: number; failing: number; lastSyncAt: string | null }>;
};

export function overview(): Overview {
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const todayStart = new Date(new Date().toDateString()).toISOString();

  // GMV counts orders that actually completed. Cancelled and failed tickets
  // are not revenue and including them is the easiest way to overstate this.
  const gmv = db()
    .prepare(
      `SELECT COALESCE(SUM(total_cents), 0) AS n FROM orders
        WHERE state IN ('COMPLETED','SETTLED')`,
    )
    .get() as { n: number };

  return {
    // The platform's own org holds the administrator account and is not a
    // restaurant; counting it would overstate the network by one forever.
    restaurants: count("SELECT COUNT(*) AS n FROM orgs WHERE org_id != ?", PLATFORM_ORG_ID),
    restaurantsAccepting: count(
      "SELECT COUNT(*) AS n FROM orgs WHERE accepting_orders = 1 AND org_id != ?",
      PLATFORM_ORG_ID,
    ),
    customers: count("SELECT COUNT(*) AS n FROM persons"),
    orders: count("SELECT COUNT(*) AS n FROM orders"),
    ordersToday: count("SELECT COUNT(*) AS n FROM orders WHERE placed_at >= ?", todayStart),
    gmvCents: gmv.n,
    mrr: computeMrr(),
    newCustomers30d: count("SELECT COUNT(*) AS n FROM persons WHERE created_at >= ?", since30),
    newMerchants30d: count(
      "SELECT COUNT(*) AS n FROM subscriptions WHERE created_at >= ?",
      since30,
    ),
    deliverySuccess: deliverySuccess(),
    posSync: posSyncHealth(),
  };
}

/**
 * Delivery success rate.
 *
 * Returns unavailable rather than 100% when no courier has ever been booked.
 * A rate over zero attempts is not 100%, it is undefined, and printing the
 * former on a dashboard is how a broken integration goes unnoticed for a week.
 */
export function deliverySuccess(): Metric<{ delivered: number; attempted: number; rate: number }> {
  const attempted = count("SELECT COUNT(*) AS n FROM deliveries");
  if (attempted === 0) {
    return missing("No courier has ever been booked — DoorDash Drive is not connected.");
  }
  const delivered = count("SELECT COUNT(*) AS n FROM deliveries WHERE status = 'delivered'");
  return ok({ delivered, attempted, rate: delivered / attempted });
}

export function posSyncHealth(): Metric<{
  connected: number;
  ok: number;
  failing: number;
  lastSyncAt: string | null;
}> {
  const connected = count("SELECT COUNT(*) AS n FROM pos_connections");
  if (connected === 0) {
    return missing("No restaurant has connected a POS yet.");
  }
  const failing = count("SELECT COUNT(*) AS n FROM pos_connections WHERE status != 'connected'");
  const last = db()
    .prepare("SELECT MAX(last_sync_at) AS t FROM pos_connections")
    .get() as { t: string | null };
  return ok({ connected, ok: connected - failing, failing, lastSyncAt: last.t });
}

/** Orders per day for the trailing `days` days, oldest first. */
export function ordersByDay(days = 30): { day: string; orders: number; gmvCents: number }[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db()
    .prepare(
      `SELECT substr(placed_at, 1, 10) AS day,
              COUNT(*)                 AS orders,
              COALESCE(SUM(CASE WHEN state IN ('COMPLETED','SETTLED') THEN total_cents END), 0) AS gmv
         FROM orders
        WHERE placed_at >= ?
        GROUP BY day
        ORDER BY day ASC`,
    )
    .all(since) as Record<string, unknown>[];
  return rows.map((r) => ({
    day: String(r.day),
    orders: Number(r.orders),
    gmvCents: Number(r.gmv),
  }));
}

/* ------------------------------------------------------------------ *
 * B. Merchants
 * ------------------------------------------------------------------ */

export type MerchantRow = {
  orgId: string;
  slug: string;
  brandName: string;
  cuisine: string;
  acceptingOrders: boolean;
  isSponsored: boolean;
  rating: number;
  orders: number;
  gmvCents: number;
  plan: string | null;
  subStatus: string | null;
  mrrCents: number;
  posProvider: string | null;
  posStatus: string | null;
  posLastSyncAt: string | null;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  menuItems: number;
  publishedVersion: number | null;
};

export function listMerchants(): MerchantRow[] {
  return (
    db()
      .prepare(
        `SELECT o.org_id, o.slug, o.brand_name, o.cuisine, o.accepting_orders,
                o.is_sponsored, o.rating, o.stripe_account_id, o.charges_enabled,
                o.payouts_enabled,
                s.plan, s.status AS sub_status, s.price_cents,
                p.provider AS pos_provider, p.status AS pos_status, p.last_sync_at,
                (SELECT COUNT(*) FROM items i WHERE i.org_id = o.org_id) AS menu_items,
                (SELECT MAX(version_no) FROM menu_versions m WHERE m.org_id = o.org_id) AS pub_version,
                (SELECT COUNT(*) FROM orders r WHERE r.org_id = o.org_id) AS order_count,
                (SELECT COALESCE(SUM(total_cents), 0) FROM orders r
                  WHERE r.org_id = o.org_id AND r.state IN ('COMPLETED','SETTLED')) AS gmv
           FROM orgs o
           LEFT JOIN subscriptions s   ON s.org_id = o.org_id
           LEFT JOIN pos_connections p ON p.org_id = o.org_id
          WHERE o.org_id != ?
          ORDER BY o.brand_name`,
      )
      .all(PLATFORM_ORG_ID) as Record<string, unknown>[]
  ).map((r) => ({
    orgId: String(r.org_id),
    slug: String(r.slug),
    brandName: String(r.brand_name),
    cuisine: String(r.cuisine),
    acceptingOrders: r.accepting_orders === 1,
    isSponsored: r.is_sponsored === 1,
    rating: Number(r.rating),
    orders: Number(r.order_count ?? 0),
    gmvCents: Number(r.gmv ?? 0),
    plan: (r.plan as string) ?? null,
    subStatus: (r.sub_status as string) ?? null,
    // Only a live contract contributes; a trial or a cancellation is not MRR.
    mrrCents:
      r.sub_status === "active" || r.sub_status === "past_due" ? Number(r.price_cents ?? 0) : 0,
    posProvider: (r.pos_provider as string) ?? null,
    posStatus: (r.pos_status as string) ?? null,
    posLastSyncAt: (r.last_sync_at as string) ?? null,
    stripeAccountId: (r.stripe_account_id as string) ?? null,
    chargesEnabled: r.charges_enabled === 1,
    payoutsEnabled: r.payouts_enabled === 1,
    menuItems: Number(r.menu_items ?? 0),
    publishedVersion: r.pub_version === null ? null : Number(r.pub_version),
  }));
}

export function getMerchant(orgId: string): MerchantRow | null {
  return listMerchants().find((m) => m.orgId === orgId) ?? null;
}

/** The last `limit` POS syncs for one restaurant, newest first. */
export function posSyncLog(orgId: string, limit = 20) {
  return db()
    .prepare(
      `SELECT created, updated, unchanged, flagged, skipped, ok, error, created_at
         FROM pos_sync_log WHERE org_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(orgId, limit) as unknown as {
    created: number;
    updated: number;
    unchanged: number;
    flagged: number;
    skipped: number;
    ok: number;
    error: string | null;
    created_at: string;
  }[];
}

export function merchantInvoices(orgId: string) {
  return listInvoices({ orgId, limit: 50 });
}

/** Flips whether a restaurant appears in the marketplace at all. */
export function setAcceptingOrders(orgId: string, accepting: boolean): void {
  db()
    .prepare("UPDATE orgs SET accepting_orders = ? WHERE org_id = ?")
    .run(accepting ? 1 : 0, orgId);
}

export function setSponsored(orgId: string, sponsored: boolean): void {
  db().prepare("UPDATE orgs SET is_sponsored = ? WHERE org_id = ?").run(sponsored ? 1 : 0, orgId);
}

/* ------------------------------------------------------------------ *
 * C. Customers
 * ------------------------------------------------------------------ */

export type CustomerRow = {
  personId: string;
  displayName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  orders: number;
  spendCents: number;
  pointsBalance: number;
  tier: string;
  lastOrderAt: string | null;
  marketingSms: boolean;
  marketingEmail: boolean;
  optedOutAt: string | null;
};

export function listCustomers(opts: { q?: string; limit?: number; offset?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const q = opts.q?.trim();
  // LIKE on an unindexed column is fine at this size and honest about it; a
  // real search here wants FTS once the customer list is in the millions.
  const filter = q ? "WHERE p.display_name LIKE ? OR p.phone_e164 LIKE ? OR p.email LIKE ?" : "";
  const args: unknown[] = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];

  const total = count(
    `SELECT COUNT(*) AS n FROM persons p ${filter}`,
    ...(args as never[]),
  );

  const rows = db()
    .prepare(
      `SELECT p.person_id, p.display_name, p.phone_e164, p.email, p.created_at,
              p.marketing_sms, p.marketing_email, p.opted_out_at,
              w.points_balance, w.tier,
              (SELECT COUNT(*) FROM orders o WHERE o.person_id = p.person_id) AS orders,
              (SELECT COALESCE(SUM(total_cents),0) FROM orders o
                WHERE o.person_id = p.person_id AND o.state IN ('COMPLETED','SETTLED')) AS spend,
              (SELECT MAX(placed_at) FROM orders o WHERE o.person_id = p.person_id) AS last_order
         FROM persons p
         LEFT JOIN wallet w ON w.person_id = p.person_id
         ${filter}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...(args as never[]), limit, offset) as Record<string, unknown>[];

  return {
    total,
    rows: rows.map((r) => ({
      personId: String(r.person_id),
      displayName: String(r.display_name ?? ""),
      phone: String(r.phone_e164 ?? ""),
      email: (r.email as string) ?? null,
      createdAt: String(r.created_at),
      orders: Number(r.orders ?? 0),
      spendCents: Number(r.spend ?? 0),
      pointsBalance: Number(r.points_balance ?? 0),
      tier: String(r.tier ?? "bronze"),
      lastOrderAt: (r.last_order as string) ?? null,
      marketingSms: r.marketing_sms === 1,
      marketingEmail: r.marketing_email === 1,
      optedOutAt: (r.opted_out_at as string) ?? null,
    })) as CustomerRow[],
  };
}

/** Campaign sends for one customer — the engagement record we actually keep. */
export function customerEngagement(personId: string) {
  return db()
    .prepare(
      `SELECT c.name, c.channel, s.arm, s.suppressed_reason, s.sent_at
         FROM campaign_sends s
         JOIN campaigns c ON c.campaign_id = s.campaign_id
        WHERE s.person_id = ?
        ORDER BY s.sent_at DESC LIMIT 50`,
    )
    .all(personId) as unknown as {
    name: string;
    channel: string;
    arm: string;
    suppressed_reason: string | null;
    sent_at: string;
  }[];
}

/* ------------------------------------------------------------------ *
 * D. Marketing reach (platform-wide)
 * ------------------------------------------------------------------ */

export function engagementSummary() {
  const sends = count("SELECT COUNT(*) AS n FROM campaign_sends");
  const suppressed = count(
    "SELECT COUNT(*) AS n FROM campaign_sends WHERE suppressed_reason IS NOT NULL",
  );
  return {
    campaigns: count("SELECT COUNT(*) AS n FROM campaigns"),
    sends,
    suppressed,
    smsOptIn: count("SELECT COUNT(*) AS n FROM persons WHERE marketing_sms = 1"),
    emailOptIn: count("SELECT COUNT(*) AS n FROM persons WHERE marketing_email = 1"),
    optedOut: count("SELECT COUNT(*) AS n FROM persons WHERE opted_out_at IS NOT NULL"),
  };
}

/* ------------------------------------------------------------------ *
 * E. Delivery operations
 * ------------------------------------------------------------------ */

export type DeliveryRow = {
  deliveryId: string;
  orderId: string;
  orgId: string;
  provider: string;
  status: string;
  courierFeeCents: number;
  guestFeeCents: number;
  courierName: string | null;
  dropoffEta: string | null;
  cancelReason: string | null;
  createdAt: string;
};

export function listDeliveries(limit = 100): DeliveryRow[] {
  return (
    db()
      .prepare(
        `SELECT delivery_id, order_id, org_id, provider, status, courier_fee_cents,
                guest_fee_cents, courier_name, dropoff_eta, cancel_reason, created_at
           FROM deliveries ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[]
  ).map((r) => ({
    deliveryId: String(r.delivery_id),
    orderId: String(r.order_id),
    orgId: String(r.org_id),
    provider: String(r.provider),
    status: String(r.status),
    courierFeeCents: Number(r.courier_fee_cents ?? 0),
    guestFeeCents: Number(r.guest_fee_cents ?? 0),
    courierName: (r.courier_name as string) ?? null,
    dropoffEta: (r.dropoff_eta as string) ?? null,
    cancelReason: (r.cancel_reason as string) ?? null,
    createdAt: String(r.created_at),
  }));
}

export function deliveryWebhookLog(limit = 100) {
  return db()
    .prepare(
      `SELECT event_id, provider, external_id, status, received_at
         FROM delivery_events ORDER BY received_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as {
    event_id: string;
    provider: string;
    external_id: string;
    status: string;
    received_at: string;
  }[];
}

/**
 * Delivery fee economics.
 *
 * guest_fee is what the diner paid; courier_fee is what the network charged
 * us. The difference is the platform's exposure — negative means we subsidised
 * the trip, which is fine deliberately and alarming by accident.
 */
export function deliveryEconomics(): Metric<{
  trips: number;
  guestCents: number;
  courierCents: number;
  marginCents: number;
  subsidised: number;
}> {
  const n = count("SELECT COUNT(*) AS n FROM deliveries");
  if (n === 0) return missing("No deliveries yet — DoorDash Drive is not connected.");
  const r = db()
    .prepare(
      `SELECT COALESCE(SUM(guest_fee_cents),0)   AS guest,
              COALESCE(SUM(courier_fee_cents),0) AS courier,
              SUM(CASE WHEN guest_fee_cents < courier_fee_cents THEN 1 ELSE 0 END) AS sub
         FROM deliveries`,
    )
    .get() as { guest: number; courier: number; sub: number };
  return ok({
    trips: n,
    guestCents: r.guest,
    courierCents: r.courier,
    marginCents: r.guest - r.courier,
    subsidised: r.sub,
  });
}

/* ------------------------------------------------------------------ *
 * F. Orders
 * ------------------------------------------------------------------ */

export type AdminOrderRow = {
  orderId: string;
  orgId: string;
  brandName: string;
  personId: string | null;
  guestName: string;
  guestPhone: string;
  state: string;
  fulfillment: string;
  channel: string;
  totalCents: number;
  placedAt: string;
  promisedAt: string | null;
  paymentStatus: string | null;
  deliveryStatus: string | null;
  posPushStatus: string | null;
};

export function listAllOrders(
  opts: {
    state?: string;
    orgId?: string;
    q?: string;
    /** Only orders with a real card payment — the refundable ones. */
    paidOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {},
) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.state) {
    where.push("o.state = ?");
    args.push(opts.state);
  }
  if (opts.orgId) {
    where.push("o.org_id = ?");
    args.push(opts.orgId);
  }
  if (opts.q?.trim()) {
    where.push("(o.order_id LIKE ? OR o.guest_name LIKE ? OR o.guest_phone LIKE ?)");
    const like = `%${opts.q.trim()}%`;
    args.push(like, like, like);
  }
  if (opts.paidOnly) {
    // Seeded and sandbox orders have no payments row, and nothing can be
    // refunded against them. Support only ever wants this subset.
    where.push("EXISTS (SELECT 1 FROM payments p2 WHERE p2.order_id = o.order_id)");
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = count(
    `SELECT COUNT(*) AS n FROM orders o ${clause}`,
    ...(args as never[]),
  );

  const rows = db()
    .prepare(
      `SELECT o.order_id, o.org_id, g.brand_name, o.person_id, o.guest_name, o.guest_phone,
              o.state, o.fulfillment, o.channel, o.total_cents, o.placed_at, o.promised_at,
              pay.status  AS payment_status,
              d.status    AS delivery_status,
              push.status AS pos_push_status
         FROM orders o
         JOIN orgs g            ON g.org_id = o.org_id
         LEFT JOIN payments pay ON pay.order_id = o.order_id
         LEFT JOIN deliveries d ON d.order_id = o.order_id
         LEFT JOIN pos_order_push push ON push.order_id = o.order_id
         ${clause}
        ORDER BY o.placed_at DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...(args as never[]), limit, offset) as Record<string, unknown>[];

  return {
    total,
    rows: rows.map((r) => ({
      orderId: String(r.order_id),
      orgId: String(r.org_id),
      brandName: String(r.brand_name),
      personId: (r.person_id as string) ?? null,
      guestName: String(r.guest_name ?? ""),
      guestPhone: String(r.guest_phone ?? ""),
      state: String(r.state),
      fulfillment: String(r.fulfillment),
      channel: String(r.channel),
      totalCents: Number(r.total_cents ?? 0),
      placedAt: String(r.placed_at),
      promisedAt: (r.promised_at as string) ?? null,
      paymentStatus: (r.payment_status as string) ?? null,
      deliveryStatus: (r.delivery_status as string) ?? null,
      posPushStatus: (r.pos_push_status as string) ?? null,
    })) as AdminOrderRow[],
  };
}

export function orderStateCounts(): { state: string; n: number }[] {
  return db()
    .prepare("SELECT state, COUNT(*) AS n FROM orders GROUP BY state ORDER BY n DESC")
    .all() as unknown as { state: string; n: number }[];
}

/** POS injection health, platform-wide — section F's "POS injection status". */
export function posPushHealth() {
  return db()
    .prepare("SELECT status, COUNT(*) AS n FROM pos_order_push GROUP BY status")
    .all() as unknown as { status: string; n: number }[];
}

/* ------------------------------------------------------------------ *
 * G. Payments (order-level, as opposed to subscriptions)
 * ------------------------------------------------------------------ */

export function paymentsSummary(): Metric<{
  count: number;
  chargedCents: number;
  refundedCents: number;
  platformCents: number;
  failed: number;
}> {
  const n = count("SELECT COUNT(*) AS n FROM payments");
  if (n === 0) {
    return missing("No card payment has been taken — Stripe is not connected.");
  }
  const r = db()
    .prepare(
      `SELECT COALESCE(SUM(charge_cents),0)   AS charged,
              COALESCE(SUM(refunded_cents),0) AS refunded,
              COALESCE(SUM(platform_cents),0) AS platform,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM payments`,
    )
    .get() as { charged: number; refunded: number; platform: number; failed: number };
  return ok({
    count: n,
    chargedCents: r.charged,
    refundedCents: r.refunded,
    platformCents: r.platform,
    failed: r.failed,
  });
}

export function paymentWebhookLog(limit = 100) {
  return db()
    .prepare(
      `SELECT event_id, provider, event_type, intent_id, order_id, received_at
         FROM payment_events ORDER BY received_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as {
    event_id: string;
    provider: string;
    event_type: string;
    intent_id: string | null;
    order_id: string | null;
    received_at: string;
  }[];
}

/* ------------------------------------------------------------------ *
 * H. System
 * ------------------------------------------------------------------ */

/**
 * Which integrations are actually configured.
 *
 * Reports only whether a secret is PRESENT and its length — never the value,
 * not even a prefix. An admin screen that prints the first characters of a
 * live Stripe key has leaked it to every shoulder and every screenshot.
 */
export type IntegrationStatus = {
  key: string;
  label: string;
  configured: boolean;
  detail: string;
};

export function integrationStatus(): IntegrationStatus[] {
  const has = (name: string) => Boolean(process.env[name]?.trim());
  const mode = (name: string) => {
    const v = process.env[name]?.trim() ?? "";
    if (!v) return "not set";
    if (v.startsWith("sk_live") || v.startsWith("pk_live")) return "LIVE key set";
    if (v.startsWith("sk_test") || v.startsWith("pk_test")) return "test key set";
    return `set (${v.length} chars)`;
  };

  return [
    { key: "STRIPE_SECRET_KEY", label: "Stripe secret key", configured: has("STRIPE_SECRET_KEY"), detail: mode("STRIPE_SECRET_KEY") },
    { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhook signing secret", configured: has("STRIPE_WEBHOOK_SECRET"), detail: mode("STRIPE_WEBHOOK_SECRET") },
    { key: "DOORDASH_DEVELOPER_ID", label: "DoorDash developer id", configured: has("DOORDASH_DEVELOPER_ID"), detail: mode("DOORDASH_DEVELOPER_ID") },
    { key: "DOORDASH_KEY_ID", label: "DoorDash key id", configured: has("DOORDASH_KEY_ID"), detail: mode("DOORDASH_KEY_ID") },
    { key: "DOORDASH_SIGNING_SECRET", label: "DoorDash signing secret", configured: has("DOORDASH_SIGNING_SECRET"), detail: mode("DOORDASH_SIGNING_SECRET") },
    { key: "DOORDASH_WEBHOOK_SECRET", label: "DoorDash webhook secret", configured: has("DOORDASH_WEBHOOK_SECRET"), detail: mode("DOORDASH_WEBHOOK_SECRET") },
    { key: "MD_TOKEN_KEY", label: "POS token sealing key", configured: has("MD_TOKEN_KEY"), detail: mode("MD_TOKEN_KEY") },
    { key: "TWILIO_ACCOUNT_SID", label: "Twilio (SMS)", configured: has("TWILIO_ACCOUNT_SID"), detail: mode("TWILIO_ACCOUNT_SID") },
    { key: "RESEND_API_KEY", label: "Resend (email)", configured: has("RESEND_API_KEY"), detail: mode("RESEND_API_KEY") },
    { key: "NEXT_PUBLIC_MAPTILER_KEY", label: "Map tiles (MapTiler)", configured: has("NEXT_PUBLIC_MAPTILER_KEY"), detail: has("NEXT_PUBLIC_MAPTILER_KEY") ? "set — public by design, restrict it by origin" : "not set — tracking shows an illustrative route" },
    { key: "GEOCODE_API_KEY", label: "Geocoding (OpenCage)", configured: has("GEOCODE_API_KEY") || has("OPENCAGE_API_KEY") || has("MAPS_API_KEY"), detail: has("GEOCODE_API_KEY") ? mode("GEOCODE_API_KEY") : has("OPENCAGE_API_KEY") ? "set as OPENCAGE_API_KEY" : has("MAPS_API_KEY") ? "set as MAPS_API_KEY" : "not set — delivery fees fall back to a flat rate" },
    { key: "MD_DATA_DIR", label: "Persistent disk", configured: has("MD_DATA_DIR"), detail: has("MD_DATA_DIR") ? process.env.MD_DATA_DIR! : "EPHEMERAL — data is lost on restart" },
    { key: "MD_ADMIN_EMAILS", label: "Admin allowlist", configured: has("MD_ADMIN_EMAILS"), detail: has("MD_ADMIN_EMAILS") ? `${process.env.MD_ADMIN_EMAILS!.split(",").length} admin(s)` : "not set — nobody can administer in production" },
    { key: "MD_OTP_TEST_NUMBERS", label: "Pinned test numbers", configured: has("MD_OTP_TEST_NUMBERS"), detail: has("MD_OTP_TEST_NUMBERS") ? `${process.env.MD_OTP_TEST_NUMBERS!.split(",").length} number(s)` : "not set" },
  ];
}

/** Staff accounts across every restaurant, plus who holds platform admin. */
export function listAllStaff() {
  const admins = (process.env.MD_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return (
    db()
      .prepare(
        `SELECT s.staff_id, s.email, s.name, s.role, s.disabled, s.created_at,
                o.brand_name
           FROM staff s JOIN orgs o ON o.org_id = s.org_id
          ORDER BY o.brand_name, s.role`,
      )
      .all() as Record<string, unknown>[]
  ).map((r) => ({
    staffId: String(r.staff_id),
    email: String(r.email),
    name: String(r.name),
    role: String(r.role),
    brandName: String(r.brand_name),
    disabled: r.disabled === 1,
    createdAt: String(r.created_at),
    isPlatformAdmin: admins.includes(String(r.email).toLowerCase()),
  }));
}
