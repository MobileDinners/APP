import { createHash, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { listMenu } from "./orders";
import { publishedMenu } from "./menu";
import type { MenuItem } from "./types";
import type {
  AffinityPair,
  Suggestion,
  UpsellSlate,
  UpsellStats,
} from "./upsell-types";

export * from "./upsell-types";

/**
 * Upsell engine — spec §2.B-06.
 *
 * The spec's priority order is deliberate and this code follows it exactly:
 * relevant, in stock, fast to prep, high margin. Margin is LAST. An engine that
 * optimises margin first pushes the same expensive side onto every cart, guests
 * learn to ignore it, and the attach rate decays to nothing.
 *
 * "Relevant" means co-purchase lift, not co-occurrence. Chips appear alongside
 * everything, so raw co-occurrence would recommend chips forever; lift asks
 * whether chips are MORE likely given this cart than in general.
 */

const MIN_SUPPORT = 8;          // co-purchases before an affinity is trusted
const MAX_SUGGESTIONS = 3;
const HOLDOUT_PCT = 10;
const CATEGORY_CAP = 2;         // don't push a third drink at someone
const PREP_SLACK_SECONDS = 120; // how much an add-on may extend the ticket

/* ------------------------------------------------------------------ *
 * Affinity
 * ------------------------------------------------------------------ */

type PairRow = { anchor: string; target: string; both: number };

/**
 * lift(A→B) = P(B | A) / P(B)
 *
 * Above 1 means B is more likely when A is in the cart than it is generally.
 * Below 1 means the pair is actually a substitute, and suggesting it is worse
 * than suggesting nothing.
 */
export function affinities(orgId: string): Map<string, Array<{ target: string; lift: number; support: number }>> {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT COUNT(DISTINCT o.order_id) AS n
       FROM orders o WHERE o.org_id = ? AND o.state = 'SETTLED'`,
    )
    .get(orgId) as { n: number };
  const totalOrders = totals.n || 1;

  const itemCounts = new Map(
    (
      db
        .prepare(
          `SELECT oi.item_id AS item_id, COUNT(DISTINCT o.order_id) AS n
           FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
           WHERE o.org_id = ? AND o.state = 'SETTLED'
           GROUP BY oi.item_id`,
        )
        .all(orgId) as unknown as Array<{ item_id: string; n: number }>
    ).map((r) => [r.item_id, r.n]),
  );

  // Self-join on order_id gives every ordered pair that appeared together.
  const pairs = db
    .prepare(
      `SELECT a.item_id AS anchor, b.item_id AS target, COUNT(*) AS both
       FROM order_items a
       JOIN order_items b ON b.order_id = a.order_id AND b.item_id != a.item_id
       JOIN orders o ON o.order_id = a.order_id
       WHERE o.org_id = ? AND o.state = 'SETTLED'
       GROUP BY a.item_id, b.item_id
       HAVING both >= ?`,
    )
    .all(orgId, MIN_SUPPORT) as unknown as PairRow[];

  const out = new Map<string, Array<{ target: string; lift: number; support: number }>>();
  for (const p of pairs) {
    const anchorN = itemCounts.get(p.anchor) ?? 0;
    const targetN = itemCounts.get(p.target) ?? 0;
    if (anchorN === 0 || targetN === 0) continue;

    const pGivenA = p.both / anchorN;
    const pB = targetN / totalOrders;
    const lift = pB > 0 ? pGivenA / pB : 0;

    const list = out.get(p.anchor) ?? [];
    list.push({ target: p.target, lift, support: p.both });
    out.set(p.anchor, list);
  }

  for (const list of out.values()) list.sort((a, b) => b.lift - a.lift);
  return out;
}

export function topPairs(orgId: string, limit = 12): AffinityPair[] {
  const menu = new Map(publishedMenu(orgId).map((i) => [i.itemId, i]));
  const rows: AffinityPair[] = [];

  for (const [anchorId, list] of affinities(orgId)) {
    const anchor = menu.get(anchorId);
    if (!anchor) continue;
    for (const t of list) {
      const target = menu.get(t.target);
      if (!target) continue;
      rows.push({
        anchorId,
        anchorName: anchor.name,
        targetId: t.target,
        targetName: target.name,
        lift: Math.round(t.lift * 100) / 100,
        support: t.support,
      });
    }
  }

  return rows.sort((a, b) => b.lift - a.lift).slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Slate
 * ------------------------------------------------------------------ */

/** Stable per person, so a guest's checkout does not flicker between visits. */
export function armFor(personId: string): "treated" | "holdout" {
  const h = createHash("sha256").update(`upsell:${personId}`).digest();
  return h.readUInt32BE(0) % 100 < HOLDOUT_PCT ? "holdout" : "treated";
}

function categoryOf(item: MenuItem): string {
  const s = item.section.toLowerCase();
  if (s.includes("drink")) return "drinks";
  if (s.includes("side") || s.includes("mezze") || s.includes("starter")) return "sides";
  return "mains";
}

export function suggestFor(
  orgId: string,
  cartItemIds: string[],
  personId: string | null,
): UpsellSlate {
  const notes: string[] = [];
  const arm = personId ? armFor(personId) : "treated";

  if (arm === "holdout") {
    return { arm, suggestions: [], notes: ["Holdout cart — suggestions withheld to measure lift."] };
  }
  if (cartItemIds.length === 0) {
    return { arm, suggestions: [], notes: ["Empty cart."] };
  }

  const menu = publishedMenu(orgId);
  const byId = new Map(menu.map((i) => [i.itemId, i]));
  const cart = cartItemIds.map((id) => byId.get(id)).filter((i): i is MenuItem => Boolean(i));
  if (cart.length === 0) return { arm, suggestions: [], notes: ["Cart items not on this menu."] };

  // How long the kitchen is already committed to. An add-on may extend that a
  // little, never a lot — blowing the promised time costs more than the upsell.
  const cartPrep = Math.max(...cart.map((i) => i.prepSeconds));
  const prepCeiling = cartPrep + PREP_SLACK_SECONDS;

  // Category saturation, so nobody is offered a third drink.
  const categoryCounts = new Map<string, number>();
  for (const i of cart) {
    const c = categoryOf(i);
    categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
  }

  const affinity = affinities(orgId);
  const inCart = new Set(cartItemIds);

  // Best lift across every anchor already in the cart.
  const best = new Map<string, { lift: number; support: number; anchor: string }>();
  for (const anchor of cart) {
    for (const t of affinity.get(anchor.itemId) ?? []) {
      if (inCart.has(t.target)) continue;
      const current = best.get(t.target);
      if (!current || t.lift > current.lift) {
        best.set(t.target, { lift: t.lift, support: t.support, anchor: anchor.name });
      }
    }
  }

  if (best.size === 0) notes.push(`No pair reached the minimum support of ${MIN_SUPPORT} co-purchases.`);

  const candidates: Suggestion[] = [];
  let blockedUnavailable = 0;
  let blockedPrep = 0;
  let blockedCategory = 0;
  let blockedSubstitute = 0;

  for (const [itemId, a] of best) {
    const item = byId.get(itemId);
    if (!item) continue;

    // Hard filters, in the spec's priority order.
    if (!item.isAvailable) { blockedUnavailable++; continue; }
    if (a.lift <= 1) { blockedSubstitute++; continue; }
    if (item.prepSeconds > prepCeiling) { blockedPrep++; continue; }

    const cat = categoryOf(item);
    if ((categoryCounts.get(cat) ?? 0) >= CATEGORY_CAP) { blockedCategory++; continue; }

    const marginPct = item.priceCents
      ? Math.round(((item.priceCents - item.costCents) / item.priceCents) * 100)
      : 0;

    candidates.push({
      itemId: item.itemId,
      name: item.name,
      description: item.description,
      priceCents: item.priceCents,
      imageKw: item.imageKw,
      prepSeconds: item.prepSeconds,
      lift: Math.round(a.lift * 100) / 100,
      support: a.support,
      marginPct,
      reason: `Often ordered with ${a.anchor}`,
    });
  }

  if (blockedUnavailable) notes.push(`${blockedUnavailable} suggestion(s) dropped: sold out.`);
  if (blockedPrep) notes.push(`${blockedPrep} dropped: would extend the ticket past the promise.`);
  if (blockedCategory) notes.push(`${blockedCategory} dropped: cart already has enough of that category.`);
  if (blockedSubstitute) notes.push(`${blockedSubstitute} dropped: lift below 1, a substitute rather than an add-on.`);

  // Relevance first, then prep speed, then margin — margin never leads.
  const maxLift = Math.max(1.01, ...candidates.map((c) => c.lift));
  const ranked = candidates
    .map((c) => {
      const relevance = c.lift / maxLift;
      const speed = 1 - Math.min(1, c.prepSeconds / Math.max(1, prepCeiling));
      const margin = Math.max(0, Math.min(1, c.marginPct / 100));
      return { c, score: relevance * 0.5 + speed * 0.3 + margin * 0.2 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
    .map((r) => r.c);

  return { arm, suggestions: ranked, notes };
}

/* ------------------------------------------------------------------ *
 * Telemetry
 * ------------------------------------------------------------------ */

export function record(
  orgId: string,
  personId: string | null,
  arm: "treated" | "holdout",
  action: "impression" | "accepted" | "suppressed",
  itemId: string | null,
  priceCents = 0,
): void {
  getDb()
    .prepare(
      `INSERT INTO upsell_events (event_id, org_id, person_id, item_id, arm,
                                  action, price_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), orgId, personId, itemId, arm, action, priceCents,
      new Date().toISOString());
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

/**
 * Attach rate, plus the comparison that actually matters: average ticket for
 * carts that saw suggestions versus carts deliberately shown none.
 */
export function stats(orgId: string): UpsellStats {
  const db = getDb();

  const ev = db
    .prepare(
      `SELECT action, COUNT(*) AS n, COALESCE(SUM(price_cents), 0) AS revenue
       FROM upsell_events WHERE org_id = ? GROUP BY action`,
    )
    .all(orgId) as unknown as Array<{ action: string; n: number; revenue: number }>;

  const impressions = ev.find((e) => e.action === "impression")?.n ?? 0;
  const accepts = ev.find((e) => e.action === "accepted")?.n ?? 0;
  const upsellRevenueCents = ev.find((e) => e.action === "accepted")?.revenue ?? 0;

  const arms = db
    .prepare(
      `SELECT upsell_arm AS arm, subtotal_cents AS subtotal
       FROM orders
       WHERE org_id = ? AND upsell_arm IS NOT NULL AND state IN ('SETTLED','COMPLETED')`,
    )
    .all(orgId) as unknown as Array<{ arm: string; subtotal: number }>;

  const treated = arms.filter((a) => a.arm === "treated").map((a) => a.subtotal);
  const holdout = arms.filter((a) => a.arm === "holdout").map((a) => a.subtotal);

  const tMean = mean(treated);
  const hMean = mean(holdout);
  const lift = tMean - hMean;
  const se = Math.sqrt(
    variance(treated) / Math.max(1, treated.length) +
    variance(holdout) / Math.max(1, holdout.length),
  );
  const margin = 1.96 * se;

  return {
    impressions,
    accepts,
    attachRatePct: impressions ? Math.round((accepts / impressions) * 1000) / 10 : 0,
    upsellRevenueCents,
    treatedOrders: treated.length,
    holdoutOrders: holdout.length,
    treatedAovCents: Math.round(tMean),
    holdoutAovCents: Math.round(hMean),
    aovLiftCents: Math.round(lift),
    lowCents: Math.round(lift - margin),
    highCents: Math.round(lift + margin),
    // Needs both arms represented before any claim is defensible.
    significant: treated.length > 1 && holdout.length > 1 && lift - margin > 0,
  };
}
