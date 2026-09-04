/**
 * Money is ALWAYS integer minor units (cents). No floats anywhere in the
 * pricing, tax, tip, or payout path — see spec principle 3.
 */

export const TAX_RATE_BPS = 875; // 8.75%, basis points
export const POINTS_PER_DOLLAR = 10; // 10 pts per $1 of eligible subtotal
export const CENTS_PER_POINT = 1; // 100 pts = $1.00

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Banker-free, deterministic: tax is computed on the discounted subtotal. */
export function taxOn(subtotalCents: number): number {
  return Math.round((subtotalCents * TAX_RATE_BPS) / 10000);
}

/** Points are earned on subtotal only — never on tax, tip, or delivery fee. */
export function pointsEarnedOn(subtotalCents: number, multiplier = 1): number {
  return Math.floor((subtotalCents / 100) * POINTS_PER_DOLLAR * multiplier);
}

export function pointsToCents(points: number): number {
  return points * CENTS_PER_POINT;
}

export function centsToPoints(cents: number): number {
  return Math.ceil(cents / CENTS_PER_POINT);
}

export type Totals = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  tipCents: number;
  totalCents: number;
  pointsRedeemed: number;
  pointsEarned: number;
};

export function computeTotals(opts: {
  subtotalCents: number;
  fulfillment: "pickup" | "delivery";
  deliveryFeeCents: number;
  tipCents: number;
  pointsToRedeem: number;
  tierMultiplier?: number;
}): Totals {
  const { subtotalCents, fulfillment, tipCents, pointsToRedeem } = opts;

  // Points can never discount more than the subtotal itself.
  const maxDiscount = subtotalCents;
  const requested = pointsToCents(pointsToRedeem);
  const discountCents = Math.min(requested, maxDiscount);
  const pointsRedeemed = centsToPoints(discountCents);

  const taxable = subtotalCents - discountCents;
  const taxCents = taxOn(taxable);
  const deliveryFeeCents = fulfillment === "delivery" ? opts.deliveryFeeCents : 0;

  // The whole pitch: zero service fee, and we show it as zero rather than hiding it.
  const serviceFeeCents = 0;

  const totalCents =
    taxable + taxCents + deliveryFeeCents + serviceFeeCents + tipCents;

  return {
    subtotalCents,
    discountCents,
    taxCents,
    deliveryFeeCents,
    serviceFeeCents,
    tipCents,
    totalCents,
    pointsRedeemed,
    pointsEarned: pointsEarnedOn(taxable, opts.tierMultiplier ?? 1),
  };
}
