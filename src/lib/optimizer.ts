import { getDb } from "./db";
import { listMenu } from "./orders";
import type { MenuItem } from "./types";

/**
 * Menu optimizer — spec §4.3.
 *
 * This is deliberately NOT "an LLM that suggests prices". It is a constrained
 * search over an estimated demand model, so every proposal can be defended to a
 * sceptical operator with the arithmetic that produced it. Language work
 * (rewriting a name or description) is a separate, later layer.
 *
 * Honesty rules baked in:
 *   · elasticity is a pooled prior widened by how little data an item has
 *   · every projection carries an interval, and thin data says so
 *   · guardrails cap how much can move, and how often
 */

/** Own-price elasticity priors by rough category. Negative = demand falls. */
const CATEGORY_ELASTICITY: Record<string, number> = {
  // Drinks are famously inelastic in restaurants: the decision is "do I want a
  // drink", not "is this drink 40 cents dearer". Sides sit in between. Mains
  // are the most price-aware but still well under retail elasticity, because
  // the guest has already chosen the restaurant by the time they see a price.
  drinks: -0.55,
  sides: -0.85,
  mains: -1.0,
  default: -0.9,
};

const GUARDRAILS = {
  maxPriceMovePct: 8,
  maxProposals: 5,
  minMarginPct: 45,
  minUnitsForConfidence: 40,
  protectTopTrafficDrivers: 3,
};

export type ItemStats = {
  item: MenuItem;
  units: number;
  revenueCents: number;
  marginCents: number;
  marginPct: number;
  unitShare: number;
  quadrant: "star" | "plow-horse" | "puzzle" | "dog";
};

export type Proposal = {
  itemId: string;
  name: string;
  currentPriceCents: number;
  proposedPriceCents: number;
  deltaPct: number;
  projectedMonthlyMarginDeltaCents: number;
  lowCents: number;
  highCents: number;
  confidence: "high" | "medium" | "low";
  unitsObserved: number;
  expectedDemandChangePct: number;
  rationale: string;
};

function categoryOf(item: MenuItem): string {
  const s = item.section.toLowerCase();
  if (s.includes("drink")) return "drinks";
  if (s.includes("side") || s.includes("mezze") || s.includes("starter")) return "sides";
  return "mains";
}

/** Sales for the trailing window, straight from settled orders. */
export function itemStats(orgId: string, days = 60): ItemStats[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT oi.item_id AS item_id,
              SUM(oi.qty) AS units,
              SUM(oi.qty * oi.unit_price_cents) AS revenue
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       WHERE o.org_id = ? AND o.state = 'SETTLED' AND o.placed_at >= ?
       GROUP BY oi.item_id`,
    )
    .all(orgId, since) as unknown as Array<{ item_id: string; units: number; revenue: number }>;

  const sold = new Map(rows.map((r) => [r.item_id, r]));
  const menu = listMenu(orgId);
  const totalUnits = rows.reduce((n, r) => n + r.units, 0) || 1;

  const base = menu.map((item) => {
    const s = sold.get(item.itemId);
    const units = s?.units ?? 0;
    const revenueCents = s?.revenue ?? 0;
    const marginCents = units * (item.priceCents - item.costCents);
    return {
      item,
      units,
      revenueCents,
      marginCents,
      marginPct: item.priceCents
        ? Math.round(((item.priceCents - item.costCents) / item.priceCents) * 100)
        : 0,
      unitShare: units / totalUnits,
    };
  });

  // Quadrant is relative to this restaurant's own median, not an absolute.
  const medianUnits = median(base.map((b) => b.units));
  const medianMargin = median(base.map((b) => b.marginPct));

  return base.map((b) => ({
    ...b,
    quadrant:
      b.units >= medianUnits
        ? b.marginPct >= medianMargin
          ? ("star" as const)
          : ("plow-horse" as const)
        : b.marginPct >= medianMargin
          ? ("puzzle" as const)
          : ("dog" as const),
  }));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Prices ending in .99/.95/.49 are load-bearing. Crossing a whole dollar is a
 * real behavioural threshold, so proposals snap to a sensible ending rather
 * than suggesting $14.27.
 */
function snapPrice(cents: number): number {
  const dollars = Math.floor(cents / 100);
  const options = [dollars * 100 + 25, dollars * 100 + 50, dollars * 100 + 75, (dollars + 1) * 100];
  return options.reduce((best, o) => (Math.abs(o - cents) < Math.abs(best - cents) ? o : best));
}

export function buildProposals(orgId: string, days = 60): Proposal[] {
  const stats = itemStats(orgId, days);
  const window = Math.max(1, days) / 30; // months of data
  const proposals: Proposal[] = [];

  // Never raise the price of the items that bring people in the door.
  const trafficDrivers = new Set(
    [...stats]
      .sort((a, b) => b.units - a.units)
      .slice(0, GUARDRAILS.protectTopTrafficDrivers)
      .map((s) => s.item.itemId),
  );

  for (const s of stats) {
    const { item, units } = s;
    if (item.costCents <= 0) continue; // no cost data, no defensible proposal
    if (units === 0) continue;

    const monthlyUnits = units / window;
    const beta = CATEGORY_ELASTICITY[categoryOf(item)] ?? CATEGORY_ELASTICITY.default;

    // Uncertainty shrinks with observed volume. This is a stand-in for the
    // posterior width of a hierarchical model, not the model itself.
    const confidence: Proposal["confidence"] =
      units >= GUARDRAILS.minUnitsForConfidence * 2
        ? "high"
        : units >= GUARDRAILS.minUnitsForConfidence
          ? "medium"
          : "low";
    const betaSpread = confidence === "high" ? 0.35 : confidence === "medium" ? 0.6 : 1.0;

    let best: Proposal | null = null;

    for (const pct of [-8, -5, -3, 3, 5, 8]) {
      if (pct > 0 && trafficDrivers.has(item.itemId)) continue;

      const raw = Math.round(item.priceCents * (1 + pct / 100));
      const proposed = snapPrice(raw);
      const actualPct = ((proposed - item.priceCents) / item.priceCents) * 100;
      if (proposed === item.priceCents) continue;
      if (Math.abs(actualPct) > GUARDRAILS.maxPriceMovePct) continue;

      const newMarginPct = ((proposed - item.costCents) / proposed) * 100;
      if (newMarginPct < GUARDRAILS.minMarginPct) continue;

      const project = (b: number) => {
        const demandFactor = 1 + b * (actualPct / 100);
        if (demandFactor <= 0) return -Infinity;
        const newUnits = monthlyUnits * demandFactor;
        return (
          newUnits * (proposed - item.costCents) -
          monthlyUnits * (item.priceCents - item.costCents)
        );
      };

      const mid = project(beta);
      if (!Number.isFinite(mid) || mid <= 0) continue;

      const a = project(beta - betaSpread);
      const b = project(beta + betaSpread);
      const low = Math.min(a, b);
      const high = Math.max(a, b);

      const candidate: Proposal = {
        itemId: item.itemId,
        name: item.name,
        currentPriceCents: item.priceCents,
        proposedPriceCents: proposed,
        deltaPct: Math.round(actualPct * 10) / 10,
        projectedMonthlyMarginDeltaCents: Math.round(mid),
        lowCents: Math.round(low),
        highCents: Math.round(high),
        confidence,
        unitsObserved: units,
        expectedDemandChangePct: Math.round(beta * actualPct * 10) / 10,
        rationale:
          actualPct > 0
            ? `${s.quadrant === "plow-horse" ? "Sells well but earns little" : "Margin headroom"} at ${s.marginPct}% margin on ${Math.round(monthlyUnits)} units/mo.`
            : `Lower price to buy volume: ${s.quadrant === "puzzle" ? "high margin, few takers" : "slow mover"} at ${Math.round(monthlyUnits)} units/mo.`,
      };

      if (!best || candidate.projectedMonthlyMarginDeltaCents > best.projectedMonthlyMarginDeltaCents) {
        best = candidate;
      }
    }

    if (best) proposals.push(best);
  }

  return proposals
    .sort(
      (a, b) => b.projectedMonthlyMarginDeltaCents - a.projectedMonthlyMarginDeltaCents,
    )
    .slice(0, GUARDRAILS.maxProposals);
}

export type OptimizerSummary = {
  windowDays: number;
  ordersAnalyzed: number;
  unitsAnalyzed: number;
  monthlyMarginCents: number;
  totalOpportunityCents: number;
};

export function summarize(orgId: string, days = 60): OptimizerSummary {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT o.order_id) AS orders
       FROM orders o WHERE o.org_id = ? AND o.state = 'SETTLED' AND o.placed_at >= ?`,
    )
    .get(orgId, since) as { orders: number };

  const stats = itemStats(orgId, days);
  const window = Math.max(1, days) / 30;

  return {
    windowDays: days,
    ordersAnalyzed: row.orders,
    unitsAnalyzed: stats.reduce((n, s) => n + s.units, 0),
    monthlyMarginCents: Math.round(stats.reduce((n, s) => n + s.marginCents, 0) / window),
    totalOpportunityCents: buildProposals(orgId, days).reduce(
      (n, p) => n + p.projectedMonthlyMarginDeltaCents,
      0,
    ),
  };
}

export const OPTIMIZER_GUARDRAILS = GUARDRAILS;
