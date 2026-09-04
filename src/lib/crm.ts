import { getDb } from "./db";
import type { CrmSummary, PersonOrderRow, Profile, Segment } from "./crm-labels";

/**
 * CRM — spec §2.B-02.
 *
 * Profiles are computed from settled orders rather than stored as a second
 * source of truth, so they can never drift from what actually happened.
 *
 * Two rules are structural, not cosmetic:
 *   1. Everything here is scoped to ONE org. A restaurant sees its own
 *      relationship with a guest and nothing about any other restaurant.
 *   2. Scores are heuristics computed from observable behaviour, and they are
 *      labelled as such. Calling a recency ratio a "churn model" would be a lie.
 */

export type {
  Segment,
  Profile,
  CrmSummary,
  PersonOrderRow,
} from "./crm-labels";
export { SEGMENT_LABEL, SEGMENT_HINT } from "./crm-labels";

type Row = {
  person_id: string;
  name: string;
  phone: string;
  order_count: number;
  lifetime_cents: number;
  margin_cents: number;
  first_at: string;
  last_at: string;
  delivery_count: number;
};

const DAY = 86_400_000;

/**
 * One pass over settled orders for this org. The margin join is what lets the
 * CRM rank customers by contribution instead of revenue — a guest who only
 * orders the cheapest high-margin item can be worth more than a bigger spender.
 */
function baseRows(orgId: string): Row[] {
  return getDb()
    .prepare(
      `SELECT o.person_id                                   AS person_id,
              COALESCE(MAX(p.display_name), '')             AS name,
              COALESCE(MAX(p.phone_e164), '')               AS phone,
              COUNT(*)                                      AS order_count,
              SUM(o.subtotal_cents)                         AS lifetime_cents,
              COALESCE(SUM(m.margin_cents), 0)              AS margin_cents,
              MIN(o.placed_at)                              AS first_at,
              MAX(o.placed_at)                              AS last_at,
              SUM(CASE WHEN o.fulfillment = 'delivery' THEN 1 ELSE 0 END) AS delivery_count
       FROM orders o
       JOIN persons p ON p.person_id = o.person_id
       LEFT JOIN (
         SELECT oi.order_id,
                SUM(oi.qty * (oi.unit_price_cents - COALESCE(i.cost_cents, 0))) AS margin_cents
         FROM order_items oi
         LEFT JOIN items i ON i.item_id = oi.item_id
         GROUP BY oi.order_id
       ) m ON m.order_id = o.order_id
       WHERE o.org_id = ? AND o.state = 'SETTLED' AND o.person_id IS NOT NULL
       GROUP BY o.person_id`,
    )
    .all(orgId) as unknown as Row[];
}

function favorites(orgId: string): Map<string, { name: string; count: number }> {
  const rows = getDb()
    .prepare(
      `SELECT o.person_id AS person_id, oi.name AS name, SUM(oi.qty) AS n
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       WHERE o.org_id = ? AND o.state = 'SETTLED' AND o.person_id IS NOT NULL
       GROUP BY o.person_id, oi.name`,
    )
    .all(orgId) as unknown as Array<{ person_id: string; name: string; n: number }>;

  const best = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    const current = best.get(r.person_id);
    if (!current || r.n > current.count) best.set(r.person_id, { name: r.name, count: r.n });
  }
  return best;
}

/**
 * Segment from behaviour, using the guest's OWN cadence as the yardstick.
 *
 * A guest who orders weekly and has been silent for three weeks is at risk. A
 * guest who orders every two months and was here last month is fine. A fixed
 * "lapsed after 30 days" rule gets both of those wrong, which is how most
 * restaurant CRMs end up spamming their best customers.
 */
function classify(orderCount: number, daysSinceLast: number, cadence: number | null): Segment {
  if (orderCount === 1) {
    return daysSinceLast > 45 ? "one_time" : "promising";
  }

  const overdue = cadence ? daysSinceLast / cadence : daysSinceLast / 30;

  if (overdue > 4) return "lapsed";
  if (overdue > 1.8) return "at_risk";
  if (orderCount >= 8 && overdue <= 1.2) return "champion";
  if (orderCount >= 3) return "loyal";
  return "promising";
}

/** Recency against personal cadence, squashed into 0..1. A heuristic, not a model. */
function churnRisk(daysSinceLast: number, cadence: number | null, orderCount: number): number {
  const expected = cadence ?? 30;
  const overdue = daysSinceLast / expected;
  // Logistic curve centred on "twice their normal gap".
  const raw = 1 / (1 + Math.exp(-1.6 * (overdue - 2)));
  // A single data point tells you very little; pull those toward the base rate.
  const confidence = Math.min(1, orderCount / 5);
  return Math.round((raw * confidence + 0.5 * (1 - confidence)) * 100) / 100;
}

export function profiles(orgId: string): Profile[] {
  const fav = favorites(orgId);
  const now = Date.now();

  return baseRows(orgId).map((r): Profile => {
    const first = new Date(r.first_at).getTime();
    const last = new Date(r.last_at).getTime();
    const daysSinceLast = Math.floor((now - last) / DAY);

    // Average gap between orders, only meaningful with at least two.
    const cadenceDays =
      r.order_count > 1 ? Math.max(1, Math.round((last - first) / DAY / (r.order_count - 1))) : null;

    const segment = classify(r.order_count, daysSinceLast, cadenceDays);
    const risk = churnRisk(daysSinceLast, cadenceDays, r.order_count);
    const aov = Math.round(r.lifetime_cents / r.order_count);
    const marginPerOrder = Math.round(r.margin_cents / r.order_count);

    // Expected future orders over the next year, discounted by churn risk.
    const ordersPerYear = cadenceDays ? 365 / cadenceDays : 2;
    const predictedLtvCents = Math.round(ordersPerYear * marginPerOrder * (1 - risk));

    const f = fav.get(r.person_id);

    return {
      personId: r.person_id,
      name: r.name || "Guest",
      phone: r.phone,
      orderCount: r.order_count,
      lifetimeCents: r.lifetime_cents,
      aovCents: aov,
      marginCents: r.margin_cents,
      firstOrderAt: r.first_at,
      lastOrderAt: r.last_at,
      daysSinceLast,
      cadenceDays,
      segment,
      churnRisk: risk,
      predictedLtvCents: Math.max(0, predictedLtvCents),
      favoriteItem: f?.name ?? null,
      favoriteCount: f?.count ?? 0,
      channelMix: {
        delivery: r.delivery_count,
        pickup: r.order_count - r.delivery_count,
      },
    };
  });
}

export function summarize(all: Profile[]): CrmSummary {
  const total = all.length;
  if (total === 0) {
    return {
      total: 0, active90: 0, repeatRate: 0, avgOrdersPerCustomer: 0,
      aovCents: 0, topDecileRevenueShare: 0, segments: [],
    };
  }

  const revenue = all.reduce((n, p) => n + p.lifetimeCents, 0);
  const orders = all.reduce((n, p) => n + p.orderCount, 0);
  const repeat = all.filter((p) => p.orderCount > 1).length;

  const sorted = [...all].sort((a, b) => b.lifetimeCents - a.lifetimeCents);
  const decile = Math.max(1, Math.round(total * 0.1));
  const topRevenue = sorted.slice(0, decile).reduce((n, p) => n + p.lifetimeCents, 0);

  const bySegment = new Map<Segment, { count: number; revenueCents: number }>();
  for (const p of all) {
    const s = bySegment.get(p.segment) ?? { count: 0, revenueCents: 0 };
    s.count++;
    s.revenueCents += p.lifetimeCents;
    bySegment.set(p.segment, s);
  }

  const order: Segment[] = ["champion", "loyal", "promising", "at_risk", "lapsed", "one_time"];

  return {
    total,
    active90: all.filter((p) => p.daysSinceLast <= 90).length,
    repeatRate: Math.round((repeat / total) * 100),
    avgOrdersPerCustomer: Math.round((orders / total) * 10) / 10,
    aovCents: orders ? Math.round(revenue / orders) : 0,
    topDecileRevenueShare: revenue ? Math.round((topRevenue / revenue) * 100) : 0,
    segments: order
      .map((segment) => ({ segment, ...(bySegment.get(segment) ?? { count: 0, revenueCents: 0 }) }))
      .filter((s) => s.count > 0),
  };
}

/**
 * Full order history for one guest at one restaurant.
 *
 * The rows are mapped into plain objects on purpose: node:sqlite returns
 * null-prototype objects, and React refuses to serialise those across the
 * server/client boundary. Returning them raw throws at render time.
 */
export function personOrders(orgId: string, personId: string): PersonOrderRow[] {
  const rows = getDb()
    .prepare(
      `SELECT order_id, placed_at, fulfillment, subtotal_cents, total_cents, state
       FROM orders
       WHERE org_id = ? AND person_id = ? AND state = 'SETTLED'
       ORDER BY placed_at DESC LIMIT 25`,
    )
    .all(orgId, personId) as unknown as PersonOrderRow[];

  return rows.map((r) => ({
    order_id: r.order_id,
    placed_at: r.placed_at,
    fulfillment: r.fulfillment,
    subtotal_cents: r.subtotal_cents,
    total_cents: r.total_cents,
    state: r.state,
  }));
}

export function getProfile(orgId: string, personId: string): Profile | null {
  return profiles(orgId).find((p) => p.personId === personId) ?? null;
}
