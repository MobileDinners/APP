export type OrderState =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "ACCEPTED"
  | "IN_KITCHEN"
  | "READY"
  | "AWAITING_PICKUP"
  | "COURIER_ASSIGNED"
  | "IN_TRANSIT"
  | "COMPLETED"
  | "SETTLED"
  | "CANCELLED"
  | "FAILED";

export type Fulfillment = "pickup" | "delivery";
export type Channel = "marketplace" | "pos" | "web" | "phone";
export type Station = "grill" | "fry" | "assembly" | "bar" | "cold";

export type OptionChoice = {
  id: string;
  label: string;
  priceCents: number;
};

export type OptionGroup = {
  id: string;
  name: string;
  /** "single" renders radios, "multi" renders checkboxes. */
  select: "single" | "multi";
  required: boolean;
  choices: OptionChoice[];
};

export type Restaurant = {
  orgId: string;
  slug: string;
  brandName: string;
  cuisine: string;
  priceBand: string;
  rating: number;
  ratingCount: number;
  blurb: string;
  heroHue: number;
  imageKw: string;
  promo: string | null;
  isSponsored: boolean;
  distanceMi: number;
  prepBaseSeconds: number;
  acceptingOrders: boolean;
  deliveryFeeCents: number;
  pointsMultiplier: number;
  address: string;
};

export type MenuItem = {
  itemId: string;
  orgId: string;
  section: string;
  name: string;
  description: string;
  priceCents: number;
  costCents: number;
  prepSeconds: number;
  station: Station;
  isAvailable: boolean;
  imageKw: string;
  isPopular: boolean;
  optionGroups: OptionGroup[];
};

export type CartLine = {
  lineId: string;
  itemId: string;
  qty: number;
  choiceIds: string[];
  notes: string;
};

export type OrderLine = {
  lineNo: number;
  itemId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  optionsLabel: string;
  notes: string;
  station: Station;
  prepSeconds: number;
  bumpedAt: string | null;
};

export type Order = {
  orderId: string;
  orgId: string;
  personId: string | null;
  menuVersionId: string | null;
  brandName: string;
  slug: string;
  channel: Channel;
  fulfillment: Fulfillment;
  state: OrderState;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  totalCents: number;
  pointsEarned: number;
  pointsRedeemed: number;
  guestName: string;
  guestPhone: string;
  address: string;
  placedAt: string;
  promisedAt: string;
  lines: OrderLine[];
  events: OrderEvent[];
};

export type OrderEvent = {
  seq: number;
  orderId: string;
  eventType: string;
  payload: Record<string, unknown>;
  actor: string;
  source: string;
  occurredAt: string;
};

export type Wallet = {
  personId: string;
  displayName: string;
  pointsBalance: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  ordersCount: number;
};

/** Payload pushed over SSE to /ops, /kds and guest tracking. */
export type BusEvent =
  | { type: "order.created"; orgId: string; orderId: string }
  | { type: "order.transitioned"; orgId: string; orderId: string; state: OrderState }
  | { type: "order.line.bumped"; orgId: string; orderId: string; lineNo: number }
  | { type: "menu.availability"; orgId: string; itemId: string; isAvailable: boolean }
  | { type: "menu.published"; orgId: string; menuVersionId: string; versionNo: number }
  // A courier moved. Carries no position: the tracking page re-reads the
  // delivery, so a bus event never becomes a second source of truth for where
  // someone's dinner is.
  | {
      type: "delivery.updated";
      orgId: string;
      orderId: string;
      status: "quoted" | "assigned" | "picked_up" | "delivered" | "cancelled";
    };

export type MenuVersion = {
  menuVersionId: string;
  orgId: string;
  versionNo: number;
  contentHash: string;
  itemCount: number;
  source: "seed" | "console" | "ai_optimizer" | "pos_sync";
  publishedBy: string | null;
  publishedAt: string;
};

/** A single field-level difference between the draft and the live menu. */
export type MenuChange = {
  itemId: string;
  name: string;
  kind: "added" | "removed" | "changed";
  fields: { field: string; from: string; to: string }[];
};
