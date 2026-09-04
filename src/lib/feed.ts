import type { Restaurant } from "./types";

/**
 * Marketplace feed: fulfilment mode, filters and sort.
 *
 * Pure and dependency-free so the same functions run on the server (where the
 * filtering actually happens) and in the client controls that build the links.
 * State lives entirely in the URL — that makes every view shareable, keeps the
 * back button honest, and means the chips work with JavaScript switched off.
 */

export type FeedMode = "delivery" | "pickup";
export type FeedSort = "picked" | "rating" | "time" | "fee";
export type FeedFilter = "offers" | "fast" | "top";

export type FeedCard = Restaurant & {
  /** Door-to-door, including the delivery leg. */
  etaLow: number;
  etaHigh: number;
  /** Ready-for-collection, which is the kitchen time alone. */
  pickupLow: number;
  pickupHigh: number;
  soldOut: number;
};

export type FeedQuery = {
  mode: FeedMode;
  sort: FeedSort;
  filters: FeedFilter[];
};

export const SORTS: { id: FeedSort; label: string }[] = [
  { id: "picked", label: "Picked for you" },
  { id: "rating", label: "Rating" },
  { id: "time", label: "Delivery time" },
  { id: "fee", label: "Delivery fee" },
];

export const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "offers", label: "Offers" },
  { id: "fast", label: "Under 30 min" },
  { id: "top", label: "Rating 4.5+" },
];

const MODES: FeedMode[] = ["delivery", "pickup"];
const SORT_IDS = SORTS.map((s) => s.id);
const FILTER_IDS = FILTERS.map((f) => f.id);

/** Anything unrecognised in the URL falls back to the default view. */
export function parseFeedQuery(params: {
  mode?: string;
  sort?: string;
  filter?: string | string[];
}): FeedQuery {
  const raw = params.filter;
  const list = (Array.isArray(raw) ? raw : raw ? raw.split(",") : [])
    .map((f) => f.trim())
    .filter((f): f is FeedFilter => (FILTER_IDS as string[]).includes(f));

  return {
    mode: (MODES as string[]).includes(params.mode ?? "")
      ? (params.mode as FeedMode)
      : "delivery",
    sort: (SORT_IDS as string[]).includes(params.sort ?? "")
      ? (params.sort as FeedSort)
      : "picked",
    filters: [...new Set(list)],
  };
}

/** Builds the href for a control, carrying the rest of the query along. */
export function feedHref(q: FeedQuery, patch: Partial<FeedQuery>): string {
  const next: FeedQuery = { ...q, ...patch };
  const parts: string[] = [];
  if (next.mode !== "delivery") parts.push(`mode=${next.mode}`);
  if (next.sort !== "picked") parts.push(`sort=${next.sort}`);
  if (next.filters.length > 0) parts.push(`filter=${next.filters.join(",")}`);
  return parts.length ? `/restaurants?${parts.join("&")}` : "/restaurants";
}

/** Toggling a chip adds or removes it, leaving everything else in place. */
export function toggleFilter(q: FeedQuery, f: FeedFilter): FeedQuery {
  return {
    ...q,
    filters: q.filters.includes(f)
      ? q.filters.filter((x) => x !== f)
      : [...q.filters, f],
  };
}

export function etaFor(card: FeedCard, mode: FeedMode): [number, number] {
  return mode === "pickup" ? [card.pickupLow, card.pickupHigh] : [card.etaLow, card.etaHigh];
}

export function applyFeed(cards: FeedCard[], q: FeedQuery): FeedCard[] {
  let out = cards;

  for (const f of q.filters) {
    if (f === "offers") out = out.filter((c) => Boolean(c.promo));
    if (f === "fast") out = out.filter((c) => etaFor(c, q.mode)[1] <= 30);
    if (f === "top") out = out.filter((c) => c.rating >= 4.5);
  }

  // Pickup has no delivery fee to sort by, so that sort degrades to time
  // rather than silently returning an arbitrary order.
  const sort = q.sort === "fee" && q.mode === "pickup" ? "time" : q.sort;

  const sorted = [...out];
  if (sort === "rating") sorted.sort((a, b) => b.rating - a.rating || a.distanceMi - b.distanceMi);
  if (sort === "time") sorted.sort((a, b) => etaFor(a, q.mode)[0] - etaFor(b, q.mode)[0]);
  if (sort === "fee") sorted.sort((a, b) => a.deliveryFeeCents - b.deliveryFeeCents);
  if (sort === "picked") {
    // Stand-in for the two-tower recommender: rating first, distance to break ties.
    sorted.sort((a, b) => b.rating - a.rating || a.distanceMi - b.distanceMi);
  }
  return sorted;
}

/** Human summary under the heading — states what is actually being shown. */
export function describeFeed(count: number, q: FeedQuery): string {
  const bits = [`${count} ${count === 1 ? "restaurant" : "restaurants"}`];
  bits.push(q.mode === "pickup" ? "ready for pickup" : "delivering now");
  for (const f of q.filters) {
    const label = FILTERS.find((x) => x.id === f)?.label;
    if (label) bits.push(label.toLowerCase());
  }
  return bits.join(" · ");
}
