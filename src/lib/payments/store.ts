import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import type { PaymentStatus } from "./types";

/**
 * The payments ledger.
 *
 * Deliberately separate from the order: a charge has its own lifecycle and can
 * be retried, partially refunded or disputed long after the food was eaten.
 * Folding that into the order row would mean overwriting history, which is
 * exactly what the order event log exists to prevent.
 */

export type PaymentRow = {
  paymentId: string;
  orderId: string;
  orgId: string;
  provider: string;
  intentId: string;
  status: PaymentStatus;
  chargeCents: number;
  restaurantCents: number;
  platformCents: number;
  tipCents: number;
  refundedCents: number;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type Raw = {
  payment_id: string; order_id: string; org_id: string; provider: string;
  intent_id: string; status: string; charge_cents: number;
  restaurant_cents: number; platform_cents: number; tip_cents: number;
  refunded_cents: number; failure_reason: string | null;
  created_at: string; updated_at: string;
};

function toRow(r: Raw): PaymentRow {
  return {
    paymentId: r.payment_id,
    orderId: r.order_id,
    orgId: r.org_id,
    provider: r.provider,
    intentId: r.intent_id,
    status: r.status as PaymentStatus,
    chargeCents: r.charge_cents,
    restaurantCents: r.restaurant_cents,
    platformCents: r.platform_cents,
    tipCents: r.tip_cents,
    refundedCents: r.refunded_cents,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function recordPayment(input: {
  orderId: string;
  orgId: string;
  provider: string;
  intentId: string;
  status: PaymentStatus;
  chargeCents: number;
  restaurantCents: number;
  platformCents: number;
  tipCents: number;
}): PaymentRow {
  const db = getDb();
  const now = new Date().toISOString();

  // A retried checkout reuses the same intent id, so this upserts rather than
  // creating a second row and double-counting the restaurant's revenue.
  const existing = db
    .prepare("SELECT * FROM payments WHERE intent_id = ?")
    .get(input.intentId) as Raw | undefined;

  if (existing) {
    db.prepare("UPDATE payments SET status = ?, updated_at = ? WHERE intent_id = ?")
      .run(input.status, now, input.intentId);
    return toRow({ ...existing, status: input.status, updated_at: now });
  }

  const paymentId = `pay_${randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO payments (
       payment_id, order_id, org_id, provider, intent_id, status,
       charge_cents, restaurant_cents, platform_cents, tip_cents,
       refunded_cents, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)`,
  ).run(
    paymentId, input.orderId, input.orgId, input.provider, input.intentId,
    input.status, input.chargeCents, input.restaurantCents, input.platformCents,
    input.tipCents, now, now,
  );

  return toRow(
    db.prepare("SELECT * FROM payments WHERE payment_id = ?").get(paymentId) as Raw,
  );
}

export function setPaymentStatus(
  intentId: string,
  status: PaymentStatus,
  failureReason?: string,
): PaymentRow | null {
  const db = getDb();
  db.prepare(
    "UPDATE payments SET status = ?, failure_reason = ?, updated_at = ? WHERE intent_id = ?",
  ).run(status, failureReason ?? null, new Date().toISOString(), intentId);
  return getPaymentByIntent(intentId);
}

/**
 * Sets the refunded total outright, rather than adding to it.
 *
 * This is what the webhook uses. Stripe reports the CUMULATIVE amount
 * refunded on a charge, and webhooks arrive more than once by design — an
 * increment would double-count every retry, and our own refund call plus the
 * webhook it triggers would double-count every refund. Setting an
 * authoritative total is idempotent whatever order things land in.
 */
export function setRefundedTotal(intentId: string, totalCents: number): void {
  getDb()
    .prepare(
      "UPDATE payments SET refunded_cents = ?, updated_at = ? WHERE intent_id = ?",
    )
    .run(totalCents, new Date().toISOString(), intentId);
}

export function addRefund(intentId: string, amountCents: number): void {
  getDb()
    .prepare(
      "UPDATE payments SET refunded_cents = refunded_cents + ?, updated_at = ? WHERE intent_id = ?",
    )
    .run(amountCents, new Date().toISOString(), intentId);
}

export function getPaymentByIntent(intentId: string): PaymentRow | null {
  const r = getDb()
    .prepare("SELECT * FROM payments WHERE intent_id = ?")
    .get(intentId) as Raw | undefined;
  return r ? toRow(r) : null;
}

export function getPaymentForOrder(orderId: string): PaymentRow | null {
  const r = getDb()
    .prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(orderId) as Raw | undefined;
  return r ? toRow(r) : null;
}

/**
 * Records a processor event before anything acts on it.
 * Returns false when we have seen this event id already — webhooks are
 * at-least-once, so the same success can arrive three times and must only
 * settle the order once.
 */
export function claimEvent(input: {
  eventId: string;
  provider: string;
  eventType: string;
  intentId: string | null;
  orderId: string | null;
  payload: string;
}): boolean {
  const db = getDb();
  const seen = db
    .prepare("SELECT event_id FROM payment_events WHERE event_id = ?")
    .get(input.eventId);
  if (seen) return false;

  db.prepare(
    `INSERT INTO payment_events (event_id, provider, event_type, intent_id, order_id, payload, received_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    input.eventId, input.provider, input.eventType, input.intentId,
    input.orderId, input.payload.slice(0, 20000), new Date().toISOString(),
  );
  return true;
}

/* ------------------------------------------------------------ connect ---- */

export type ConnectState = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  updatedAt: string | null;
};

export function getConnectState(orgId: string): ConnectState {
  const r = getDb()
    .prepare(
      "SELECT stripe_account_id, charges_enabled, payouts_enabled, payments_updated_at FROM orgs WHERE org_id = ?",
    )
    .get(orgId) as
    | {
        stripe_account_id: string | null;
        charges_enabled: number;
        payouts_enabled: number;
        payments_updated_at: string | null;
      }
    | undefined;

  return {
    accountId: r?.stripe_account_id ?? null,
    chargesEnabled: r?.charges_enabled === 1,
    payoutsEnabled: r?.payouts_enabled === 1,
    updatedAt: r?.payments_updated_at ?? null,
  };
}

export function saveConnectAccount(orgId: string, accountId: string): void {
  getDb()
    .prepare("UPDATE orgs SET stripe_account_id = ?, payments_updated_at = ? WHERE org_id = ?")
    .run(accountId, new Date().toISOString(), orgId);
}

export function saveConnectStatus(
  orgId: string,
  chargesEnabled: boolean,
  payoutsEnabled: boolean,
): void {
  getDb()
    .prepare(
      "UPDATE orgs SET charges_enabled = ?, payouts_enabled = ?, payments_updated_at = ? WHERE org_id = ?",
    )
    .run(chargesEnabled ? 1 : 0, payoutsEnabled ? 1 : 0, new Date().toISOString(), orgId);
}

/** Reverse lookup for `account.updated` webhooks, which carry no org id. */
export function orgIdForAccount(accountId: string): string | null {
  const r = getDb()
    .prepare("SELECT org_id FROM orgs WHERE stripe_account_id = ?")
    .get(accountId) as { org_id: string } | undefined;
  return r?.org_id ?? null;
}
