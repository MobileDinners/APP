/**
 * Client-safe half of the CRM module: types and display copy only.
 *
 * crm.ts reaches the database, which reaches node:crypto through the seed.
 * Importing a runtime value from it inside a "use client" component drags that
 * whole graph into the browser bundle and the build fails. Keeping the labels
 * here is what lets the UI name a segment without importing the server.
 */

export type Segment =
  | "champion"
  | "loyal"
  | "promising"
  | "at_risk"
  | "lapsed"
  | "one_time";

export const SEGMENT_LABEL: Record<Segment, string> = {
  champion: "Champion",
  loyal: "Loyal",
  promising: "Promising",
  at_risk: "At risk",
  lapsed: "Lapsed",
  one_time: "One-time",
};

export const SEGMENT_HINT: Record<Segment, string> = {
  champion: "Frequent, recent, high value. Protect these.",
  loyal: "Orders regularly. Keep them warm.",
  promising: "New but already coming back.",
  at_risk: "Was regular, now overdue against their own cadence.",
  lapsed: "Long gone. Win-back or let go.",
  one_time: "Ordered once and never returned.",
};

export type Profile = {
  personId: string;
  name: string;
  phone: string;
  orderCount: number;
  lifetimeCents: number;
  aovCents: number;
  marginCents: number;
  firstOrderAt: string;
  lastOrderAt: string;
  daysSinceLast: number;
  cadenceDays: number | null;
  segment: Segment;
  churnRisk: number;
  predictedLtvCents: number;
  favoriteItem: string | null;
  favoriteCount: number;
  channelMix: { delivery: number; pickup: number };
};

export type CrmSummary = {
  total: number;
  active90: number;
  repeatRate: number;
  avgOrdersPerCustomer: number;
  aovCents: number;
  topDecileRevenueShare: number;
  segments: { segment: Segment; count: number; revenueCents: number }[];
};

export type PersonOrderRow = {
  order_id: string;
  placed_at: string;
  fulfillment: string;
  subtotal_cents: number;
  total_cents: number;
  state: string;
};
