import { randomUUID } from "node:crypto";
import { splitPayment } from "./payments/split";
import { getDb } from "./db";
import { publish } from "./events";
import { computeTotals } from "./money";
import { currentPublished, getPublishedItem } from "./menu";
import { armFor as upsellArmFor } from "./upsell";
import type {
  Fulfillment,
  MenuItem,
  OptionGroup,
  Order,
  OrderEvent,
  OrderLine,
  OrderState,
  Restaurant,
  Station,
  Wallet,
} from "./types";

/* ------------------------------------------------------------------ *
 * State machine — spec §1.4
 * ------------------------------------------------------------------ */

export const TRANSITIONS: Record<OrderState, OrderState[]> = {
  DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["CONFIRMED", "FAILED"],
  CONFIRMED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["IN_KITCHEN", "CANCELLED"],
  IN_KITCHEN: ["READY"],
  READY: ["AWAITING_PICKUP", "COURIER_ASSIGNED", "COMPLETED"],
  AWAITING_PICKUP: ["COMPLETED"],
  COURIER_ASSIGNED: ["IN_TRANSIT"],
  IN_TRANSIT: ["COMPLETED"],
  COMPLETED: ["SETTLED"],
  SETTLED: [],
  CANCELLED: [],
  FAILED: [],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** The next step an operator would take, used to label the primary button. */
export function nextOperatorState(
  state: OrderState,
  fulfillment: Fulfillment,
): OrderState | null {
  switch (state) {
    case "CONFIRMED": return "ACCEPTED";
    case "ACCEPTED": return "IN_KITCHEN";
    case "IN_KITCHEN": return "READY";
    case "READY": return fulfillment === "delivery" ? "COURIER_ASSIGNED" : "AWAITING_PICKUP";
    case "COURIER_ASSIGNED": return "IN_TRANSIT";
    case "IN_TRANSIT": return "COMPLETED";
    case "AWAITING_PICKUP": return "COMPLETED";
    case "COMPLETED": return "SETTLED";
    default: return null;
  }
}

export { STATE_LABELS } from "./state-labels";

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

type OrgRow = {
  org_id: string; slug: string; brand_name: string; cuisine: string;
  price_band: string; rating: number; rating_count: number; blurb: string;
  hero_hue: number; image_kw: string; promo: string | null; is_sponsored: number;
  distance_mi: number; address: string; prep_base_seconds: number;
  accepting_orders: number; delivery_fee_cents: number; points_multiplier: number;
};

function toRestaurant(r: OrgRow): Restaurant {
  return {
    orgId: r.org_id, slug: r.slug, brandName: r.brand_name, cuisine: r.cuisine,
    priceBand: r.price_band, rating: r.rating, ratingCount: r.rating_count,
    blurb: r.blurb, heroHue: r.hero_hue, imageKw: r.image_kw, promo: r.promo,
    isSponsored: r.is_sponsored === 1,
    distanceMi: r.distance_mi, address: r.address, prepBaseSeconds: r.prep_base_seconds,
    acceptingOrders: r.accepting_orders === 1, deliveryFeeCents: r.delivery_fee_cents,
    pointsMultiplier: r.points_multiplier,
  };
}

type ItemRow = {
  item_id: string; org_id: string; section: string; name: string; description: string;
  price_cents: number; cost_cents: number; prep_seconds: number; station: string;
  is_available: number; image_kw: string; is_popular: number; options_json: string;
};

function toItem(r: ItemRow): MenuItem {
  return {
    itemId: r.item_id, orgId: r.org_id, section: r.section, name: r.name,
    description: r.description, priceCents: r.price_cents, costCents: r.cost_cents,
    prepSeconds: r.prep_seconds, station: r.station as Station,
    isAvailable: r.is_available === 1, imageKw: r.image_kw,
    isPopular: r.is_popular === 1,
    optionGroups: JSON.parse(r.options_json) as OptionGroup[],
  };
}

export function listRestaurants(): Restaurant[] {
  const rows = getDb()
    .prepare("SELECT * FROM orgs ORDER BY distance_mi ASC")
    .all() as unknown as OrgRow[];
  return rows.map(toRestaurant);
}

export function getRestaurant(slug: string): Restaurant | null {
  const row = getDb()
    .prepare("SELECT * FROM orgs WHERE slug = ?")
    .get(slug) as unknown as OrgRow | undefined;
  return row ? toRestaurant(row) : null;
}

export function getRestaurantById(orgId: string): Restaurant | null {
  const row = getDb()
    .prepare("SELECT * FROM orgs WHERE org_id = ?")
    .get(orgId) as unknown as OrgRow | undefined;
  return row ? toRestaurant(row) : null;
}

export function listMenu(orgId: string): MenuItem[] {
  const rows = getDb()
    .prepare("SELECT * FROM items WHERE org_id = ? ORDER BY sort_order ASC")
    .all(orgId) as unknown as ItemRow[];
  return rows.map(toItem);
}

export function getItem(itemId: string): MenuItem | null {
  const row = getDb()
    .prepare("SELECT * FROM items WHERE item_id = ?")
    .get(itemId) as unknown as ItemRow | undefined;
  return row ? toItem(row) : null;
}

export function setAvailability(itemId: string, isAvailable: boolean): void {
  const item = getItem(itemId);
  if (!item) throw new Error(`Unknown item ${itemId}`);
  getDb()
    .prepare("UPDATE items SET is_available = ? WHERE item_id = ?")
    .run(isAvailable ? 1 : 0, itemId);
  publish({ type: "menu.availability", orgId: item.orgId, itemId, isAvailable });
}

export function getWallet(personId: string): Wallet {
  const row = getDb()
    .prepare("SELECT * FROM wallet WHERE person_id = ?")
    .get(personId) as unknown as {
      person_id: string; display_name: string; points_balance: number;
      tier: string; orders_count: number;
    } | undefined;
  if (!row) {
    return { personId, displayName: "", pointsBalance: 0, tier: "bronze", ordersCount: 0 };
  }
  return {
    personId: row.person_id, displayName: row.display_name,
    pointsBalance: row.points_balance, tier: row.tier as Wallet["tier"],
    ordersCount: row.orders_count,
  };
}

/* ------------------------------------------------------------------ *
 * Order assembly
 * ------------------------------------------------------------------ */

export type IncomingLine = {
  itemId: string;
  qty: number;
  choiceIds: string[];
  notes?: string;
};

export type CreateOrderInput = {
  orgId: string;
  personId: string;
  fulfillment: Fulfillment;
  lines: IncomingLine[];
  tipCents: number;
  pointsToRedeem: number;
  guestName: string;
  guestPhone: string;
  address: string;
  idempotencyKey: string;
};

export class OrderError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "invalid_request") {
    super(message);
  }
}

/**
 * Prices are resolved from the menu of record on the server. Whatever totals the
 * client computed are advisory only — spec §1.6.
 */
function priceLines(orgId: string, incoming: IncomingLine[]) {
  if (incoming.length === 0) throw new OrderError("Cart is empty");

  const priced: Omit<OrderLine, "bumpedAt">[] = [];
  let subtotalCents = 0;

  incoming.forEach((line, i) => {
    // Priced from the PUBLISHED menu. Reading the draft here would charge a
    // guest a price the restaurant was still only considering.
    const item = getPublishedItem(orgId, line.itemId);
    if (!item) throw new OrderError(`Unknown item ${line.itemId}`, 404, "unknown_item");
    if (!item.isAvailable) {
      throw new OrderError(`${item.name} just went 86 — remove it to continue`, 409, "item_unavailable");
    }
    const qty = Math.max(1, Math.min(20, Math.floor(line.qty)));

    const choices = item.optionGroups.flatMap((g) =>
      g.choices.filter((c) => line.choiceIds.includes(c.id)),
    );
    const optionCents = choices.reduce((sum, c) => sum + c.priceCents, 0);
    const unitPriceCents = item.priceCents + optionCents;

    subtotalCents += unitPriceCents * qty;
    priced.push({
      lineNo: i + 1,
      itemId: item.itemId,
      name: item.name,
      qty,
      unitPriceCents,
      optionsLabel: choices.map((c) => c.label).join(", "),
      notes: (line.notes ?? "").slice(0, 140),
      station: item.station,
      prepSeconds: item.prepSeconds,
    });
  });

  return { priced, subtotalCents };
}

/**
 * Stations work in parallel, so kitchen time is the slowest station's queue —
 * not the sum of every item. Delivery adds a drive leg. We quote the wide end.
 */
function estimateReadySeconds(
  orgId: string,
  lines: Omit<OrderLine, "bumpedAt">[],
  fulfillment: Fulfillment,
): number {
  const org = getRestaurantById(orgId);
  const base = org?.prepBaseSeconds ?? 420;

  const byStation = new Map<string, number>();
  for (const l of lines) {
    byStation.set(l.station, (byStation.get(l.station) ?? 0) + l.prepSeconds * l.qty);
  }
  const slowestStation = Math.max(0, ...byStation.values());

  const openOrders = (getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM orders
       WHERE org_id = ? AND state IN ('CONFIRMED','ACCEPTED','IN_KITCHEN')`,
    )
    .get(orgId) as { n: number }).n;

  const queuePenalty = openOrders * 45;
  const driveLeg = fulfillment === "delivery" ? 540 : 0;

  return Math.round(base * 0.5 + slowestStation + queuePenalty + driveLeg);
}

export function createOrder(input: CreateOrderInput): Order {
  const db = getDb();

  const existing = db
    .prepare("SELECT order_id FROM orders WHERE idempotency_key = ?")
    .get(input.idempotencyKey) as { order_id: string } | undefined;
  if (existing) return getOrder(existing.order_id)!; // replayed submit, same result

  const org = getRestaurantById(input.orgId);
  if (!org) throw new OrderError("Unknown restaurant", 404, "unknown_org");
  if (!org.acceptingOrders) {
    throw new OrderError(`${org.brandName} has paused orders`, 409, "org_paused");
  }

  const { priced, subtotalCents } = priceLines(input.orgId, input.lines);

  const wallet = getWallet(input.personId);
  const pointsToRedeem = Math.max(0, Math.min(input.pointsToRedeem, wallet.pointsBalance));
  const tipCents = Math.max(0, Math.floor(input.tipCents));

  const totals = computeTotals({
    subtotalCents,
    fulfillment: input.fulfillment,
    deliveryFeeCents: org.deliveryFeeCents,
    tipCents,
    pointsToRedeem,
    tierMultiplier: org.pointsMultiplier,
  });

  // Pin the exact published menu this order was priced against.
  const menuVersion = currentPublished(input.orgId);
  if (!menuVersion) {
    throw new OrderError(`${org.brandName} has not published a menu yet`, 409, "no_menu");
  }

  const orderId = randomUUID();
  const now = new Date();
  const promised = new Date(
    now.getTime() + estimateReadySeconds(input.orgId, priced, input.fulfillment) * 1000,
  );

  db.exec("BEGIN");
  try {
    db.prepare(`
      INSERT INTO orders (order_id, org_id, person_id, menu_version_id, upsell_arm, channel, fulfillment, state,
        subtotal_cents, discount_cents, tax_cents, tip_cents, delivery_fee_cents,
        service_fee_cents, total_cents, points_earned, points_redeemed,
        guest_name, guest_phone, address, placed_at, promised_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'marketplace', ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId, input.orgId, input.personId, menuVersion.menuVersionId,
      upsellArmFor(input.personId), input.fulfillment,
      totals.subtotalCents, totals.discountCents, totals.taxCents, totals.tipCents,
      totals.deliveryFeeCents, totals.serviceFeeCents, totals.totalCents,
      totals.pointsEarned, totals.pointsRedeemed,
      input.guestName.slice(0, 80), input.guestPhone.slice(0, 32),
      input.address.slice(0, 160), now.toISOString(), promised.toISOString(),
      input.idempotencyKey,
    );

    const insertLine = db.prepare(`
      INSERT INTO order_items (order_id, line_no, item_id, name, qty,
        unit_price_cents, options_label, notes, station, prep_seconds, bumped_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);
    for (const l of priced) {
      insertLine.run(orderId, l.lineNo, l.itemId, l.name, l.qty,
        l.unitPriceCents, l.optionsLabel, l.notes, l.station, l.prepSeconds);
    }

    // Points are reserved at order time, granted at settle.
    if (totals.pointsRedeemed > 0) {
      db.prepare("UPDATE wallet SET points_balance = points_balance - ? WHERE person_id = ?")
        .run(totals.pointsRedeemed, input.personId);
      db.prepare(`
        INSERT INTO loyalty_entries (person_id, org_id, order_id, delta, reason, created_at)
        VALUES (?, ?, ?, ?, 'redeem', ?)
      `).run(input.personId, input.orgId, orderId, -totals.pointsRedeemed, now.toISOString());
    }

    appendEvent(orderId, "order.created", {
      total_cents: totals.totalCents,
      fulfillment: input.fulfillment,
      lines: priced.length,
    }, "guest", "MKT");
    // The split is computed and recorded at creation, inside the same
    // transaction as the order, so the ledger can never disagree with the
    // receipt. Actually charging the card happens after this returns — the
    // intent is created against the order id, which is why it has to exist
    // first.
    const split = splitPayment(totals);
    appendEvent(
      orderId,
      "payment.authorized",
      {
        amount_cents: totals.totalCents,
        to_restaurant_cents: split.restaurantCents,
        to_driver_cents: split.driverTipCents,
        platform_cents: split.platformCents,
        commission_cents: 0,
      },
      "system",
      "SYSTEM",
    );
    appendEvent(orderId, "order.confirmed", { state: "CONFIRMED" }, "system", "SYSTEM");

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  publish({ type: "order.created", orgId: input.orgId, orderId });
  return getOrder(orderId)!;
}

function appendEvent(
  orderId: string,
  eventType: string,
  payload: Record<string, unknown>,
  actor: string,
  source: string,
): void {
  const db = getDb();
  const row = db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS s FROM order_events WHERE order_id = ?")
    .get(orderId) as { s: number };
  db.prepare(`
    INSERT INTO order_events (order_id, seq, event_type, payload, actor, source, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, row.s + 1, eventType, JSON.stringify(payload), actor, source,
    new Date().toISOString());
}

/* ------------------------------------------------------------------ *
 * Transitions
 * ------------------------------------------------------------------ */

export function transition(
  orderId: string,
  to: OrderState,
  actor = "operator",
  source = "OPS",
): Order {
  const db = getDb();
  const order = getOrder(orderId);
  if (!order) throw new OrderError("Unknown order", 404, "unknown_order");

  if (order.state === to) return order; // idempotent re-send
  if (!canTransition(order.state, to)) {
    throw new OrderError(
      `Cannot go from ${order.state} to ${to}`,
      409,
      "invalid_transition",
    );
  }

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE orders SET state = ? WHERE order_id = ?").run(to, orderId);
    appendEvent(orderId, `order.${to.toLowerCase()}`, { from: order.state, to }, actor, source);

    // Settlement grants the points the guest earned on this order.
    if (to === "SETTLED" && order.pointsEarned > 0 && order.personId) {
      db.prepare(`
        UPDATE wallet SET points_balance = points_balance + ?, orders_count = orders_count + 1
        WHERE person_id = ?
      `).run(order.pointsEarned, order.personId);
      db.prepare(`
        INSERT INTO loyalty_entries (person_id, org_id, order_id, delta, reason, created_at)
        VALUES (?, ?, ?, ?, 'earn', ?)
      `).run(order.personId, order.orgId, orderId, order.pointsEarned,
        new Date().toISOString());
    }

    // Points reserved at checkout are returned if the order never happens.
    if ((to === "CANCELLED" || to === "FAILED") && order.pointsRedeemed > 0 && order.personId) {
      db.prepare("UPDATE wallet SET points_balance = points_balance + ? WHERE person_id = ?")
        .run(order.pointsRedeemed, order.personId);
      db.prepare(`
        INSERT INTO loyalty_entries (person_id, org_id, order_id, delta, reason, created_at)
        VALUES (?, ?, ?, ?, 'redeem_reversed', ?)
      `).run(order.personId, order.orgId, orderId, order.pointsRedeemed,
        new Date().toISOString());
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  publish({ type: "order.transitioned", orgId: order.orgId, orderId, state: to });
  return getOrder(orderId)!;
}

/** Bumping the last open line on a ticket moves the whole order to READY. */
export function bumpLine(orderId: string, lineNo: number): Order {
  const db = getDb();
  const order = getOrder(orderId);
  if (!order) throw new OrderError("Unknown order", 404, "unknown_order");

  db.prepare("UPDATE order_items SET bumped_at = ? WHERE order_id = ? AND line_no = ?")
    .run(new Date().toISOString(), orderId, lineNo);
  appendEvent(orderId, "kitchen.line.bumped", { line_no: lineNo }, "kitchen", "KDS");
  publish({ type: "order.line.bumped", orgId: order.orgId, orderId, lineNo });

  if (order.state === "CONFIRMED") transition(orderId, "ACCEPTED", "kitchen", "KDS");
  const mid = getOrder(orderId)!;
  if (mid.state === "ACCEPTED") transition(orderId, "IN_KITCHEN", "kitchen", "KDS");

  const after = getOrder(orderId)!;
  const allBumped = after.lines.every((l) => l.bumpedAt !== null);
  if (allBumped && after.state === "IN_KITCHEN") {
    return transition(orderId, "READY", "kitchen", "KDS");
  }
  return after;
}

/* ------------------------------------------------------------------ *
 * Order reads
 * ------------------------------------------------------------------ */

type OrderRow = {
  order_id: string; org_id: string; person_id: string | null;
  menu_version_id: string | null; channel: string; fulfillment: string; state: string;
  subtotal_cents: number; discount_cents: number; tax_cents: number; tip_cents: number;
  delivery_fee_cents: number; service_fee_cents: number; total_cents: number;
  points_earned: number; points_redeemed: number; guest_name: string;
  guest_phone: string; address: string; placed_at: string; promised_at: string;
  brand_name: string; slug: string;
};

function hydrate(r: OrderRow): Order {
  const db = getDb();
  const lines = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY line_no")
    .all(r.order_id) as unknown as Array<{
      line_no: number; item_id: string; name: string; qty: number;
      unit_price_cents: number; options_label: string; notes: string;
      station: string; prep_seconds: number; bumped_at: string | null;
    }>;

  const events = db
    .prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY seq")
    .all(r.order_id) as unknown as Array<{
      seq: number; event_type: string; payload: string; actor: string;
      source: string; occurred_at: string;
    }>;

  return {
    orderId: r.order_id, orgId: r.org_id, personId: r.person_id,
    menuVersionId: r.menu_version_id,
    brandName: r.brand_name, slug: r.slug,
    channel: r.channel as Order["channel"],
    fulfillment: r.fulfillment as Fulfillment,
    state: r.state as OrderState,
    subtotalCents: r.subtotal_cents, discountCents: r.discount_cents,
    taxCents: r.tax_cents, tipCents: r.tip_cents,
    deliveryFeeCents: r.delivery_fee_cents, serviceFeeCents: r.service_fee_cents,
    totalCents: r.total_cents, pointsEarned: r.points_earned,
    pointsRedeemed: r.points_redeemed, guestName: r.guest_name,
    guestPhone: r.guest_phone, address: r.address,
    placedAt: r.placed_at, promisedAt: r.promised_at,
    lines: lines.map((l): OrderLine => ({
      lineNo: l.line_no, itemId: l.item_id, name: l.name, qty: l.qty,
      unitPriceCents: l.unit_price_cents, optionsLabel: l.options_label,
      notes: l.notes, station: l.station as Station,
      prepSeconds: l.prep_seconds, bumpedAt: l.bumped_at,
    })),
    events: events.map((e): OrderEvent => ({
      seq: e.seq, orderId: r.order_id, eventType: e.event_type,
      payload: JSON.parse(e.payload), actor: e.actor, source: e.source,
      occurredAt: e.occurred_at,
    })),
  };
}

const ORDER_SELECT = `
  SELECT o.*, g.brand_name, g.slug
  FROM orders o JOIN orgs g ON g.org_id = o.org_id
`;

export function getOrder(orderId: string): Order | null {
  const row = getDb()
    .prepare(`${ORDER_SELECT} WHERE o.order_id = ?`)
    .get(orderId) as unknown as OrderRow | undefined;
  return row ? hydrate(row) : null;
}

export type DayStats = {
  salesCents: number;
  orderCount: number;
  avgTicketCents: number;
  onTimePct: number;
};

/** Metrics for the current local day, not "the last N rows". */
export function dayStats(orgId: string): DayStats {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(subtotal_cents), 0) AS sales,
              COALESCE(SUM(CASE WHEN promised_at >= placed_at THEN 1 ELSE 0 END), 0) AS on_time
       FROM orders
       WHERE org_id = ? AND placed_at >= ? AND state IN ('SETTLED','COMPLETED')`,
    )
    .get(orgId, start.toISOString()) as { n: number; sales: number; on_time: number };

  return {
    salesCents: row.sales,
    orderCount: row.n,
    avgTicketCents: row.n ? Math.round(row.sales / row.n) : 0,
    onTimePct: row.n ? Math.round((row.on_time / row.n) * 100) : 100,
  };
}

export function listOrders(
  opts: { orgId?: string; personId?: string; open?: boolean; limit?: number } = {},
): Order[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.orgId) { clauses.push("o.org_id = ?"); params.push(opts.orgId); }
  if (opts.personId) { clauses.push("o.person_id = ?"); params.push(opts.personId); }
  if (opts.open) {
    clauses.push("o.state NOT IN ('SETTLED','CANCELLED','FAILED')");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`${ORDER_SELECT} ${where} ORDER BY o.placed_at DESC LIMIT ?`)
    .all(...(params as never[]), opts.limit ?? 60) as unknown as OrderRow[];
  return rows.map(hydrate);
}
