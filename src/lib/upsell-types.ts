/**
 * Client-safe half of the upsell engine. The checkout is a "use client"
 * component, so it must not import anything that reaches the database.
 */

export type Suggestion = {
  itemId: string;
  name: string;
  description: string;
  priceCents: number;
  imageKw: string;
  prepSeconds: number;
  /** How much more likely this item is when the cart's anchor is present. */
  lift: number;
  /** Orders the affinity was computed from. Low support means low confidence. */
  support: number;
  marginPct: number;
  reason: string;
};

export type UpsellSlate = {
  arm: "treated" | "holdout";
  suggestions: Suggestion[];
  /** Why a slate came back empty or short — shown in ops, not to the guest. */
  notes: string[];
};

export type UpsellStats = {
  impressions: number;
  accepts: number;
  attachRatePct: number;
  upsellRevenueCents: number;
  treatedOrders: number;
  holdoutOrders: number;
  treatedAovCents: number;
  holdoutAovCents: number;
  aovLiftCents: number;
  /** 95% interval on the AOV difference. Crosses zero when it should. */
  lowCents: number;
  highCents: number;
  significant: boolean;
};

export type AffinityPair = {
  anchorId: string;
  anchorName: string;
  targetId: string;
  targetName: string;
  lift: number;
  support: number;
};
