import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import type { Delivery, DeliveryStatus } from "./types";

/**
 * The delivery ledger.
 *
 * Stores what the courier charged us alongside what the diner paid, on every
 * row. That pairing is the point: Drive costs real money and the flat fee a
 * diner pays does not always cover it. A schema that only recorded the guest
 * fee would let the shortfall accumulate invisibly until someone reconciled a
 * bank statement.
 */

export type DeliveryRow = {
  deliveryId: string;
  orderId: string;
  orgId: string;
  provider: string;
  externalId: string;
  providerRef: string | null;
  status: DeliveryStatus;
  courierFeeCents: number;
  guestFeeCents: number;
  courierName: string | null;
  courierPhone: string | null;
  courierLat: number | null;
  courierLng: number | null;
  pickupEta: string | null;
  dropoffEta: string | null;
  trackingUrl: string | null;
  supportRef: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type Raw = Record<string, string | number | null>;

function toRow(r: Raw): DeliveryRow {
  return {
    deliveryId: String(r.delivery_id),
    orderId: String(r.order_id),
    orgId: String(r.org_id),
    provider: String(r.provider),
    externalId: String(r.external_id),
    providerRef: r.provider_ref === null ? null : String(r.provider_ref),
    status: String(r.status) as DeliveryStatus,
    courierFeeCents: Number(r.courier_fee_cents),
    guestFeeCents: Number(r.guest_fee_cents),
    courierName: r.courier_name === null ? null : String(r.courier_name),
    courierPhone: r.courier_phone === null ? null : String(r.courier_phone),
    courierLat: r.courier_lat === null ? null : Number(r.courier_lat),
    courierLng: r.courier_lng === null ? null : Number(r.courier_lng),
    pickupEta: r.pickup_eta === null ? null : String(r.pickup_eta),
    dropoffEta: r.dropoff_eta === null ? null : String(r.dropoff_eta),
    trackingUrl: r.tracking_url === null ? null : String(r.tracking_url),
    supportRef: r.support_ref === null ? null : String(r.support_ref),
    cancelReason: r.cancel_reason === null ? null : String(r.cancel_reason),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function recordDelivery(input: {
  orderId: string;
  orgId: string;
  provider: string;
  guestFeeCents: number;
  delivery: Delivery;
}): DeliveryRow {
  const db = getDb();
  const now = new Date().toISOString();
  const d = input.delivery;

  // Dispatch is retried on failure, so this upserts rather than booking a
  // second Dasher for the same bag.
  const existing = db
    .prepare("SELECT * FROM deliveries WHERE external_id = ?")
    .get(d.externalId) as Raw | undefined;

  if (existing) {
    updateFromProvider(d);
    return getByExternalId(d.externalId)!;
  }

  const deliveryId = `dlv_${randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO deliveries (
       delivery_id, order_id, org_id, provider, external_id, provider_ref, status,
       courier_fee_cents, guest_fee_cents, courier_name, courier_phone,
       courier_lat, courier_lng, pickup_eta, dropoff_eta, tracking_url,
       support_ref, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    deliveryId, input.orderId, input.orgId, input.provider, d.externalId,
    d.providerDeliveryId, d.status, d.feeCents, input.guestFeeCents,
    d.courierName, d.courierPhone, d.courierLat, d.courierLng,
    d.pickupEta, d.dropoffEta, d.trackingUrl, d.supportReference, now, now,
  );

  return toRow(
    db.prepare("SELECT * FROM deliveries WHERE delivery_id = ?").get(deliveryId) as Raw,
  );
}

/** Applies a status update. Only overwrites fields the courier actually sent. */
export function updateFromProvider(d: {
  externalId: string;
  status: DeliveryStatus;
  courierName?: string | null;
  courierPhone?: string | null;
  courierLat?: number | null;
  courierLng?: number | null;
  dropoffEta?: string | null;
  feeCents?: number;
  cancelReason?: string | null;
}): DeliveryRow | null {
  const db = getDb();
  const current = getByExternalId(d.externalId);
  if (!current) return null;

  db.prepare(
    `UPDATE deliveries SET
       status = ?, courier_name = ?, courier_phone = ?,
       courier_lat = ?, courier_lng = ?, dropoff_eta = ?,
       courier_fee_cents = ?, cancel_reason = ?, updated_at = ?
     WHERE external_id = ?`,
  ).run(
    d.status,
    d.courierName ?? current.courierName,
    d.courierPhone ?? current.courierPhone,
    d.courierLat ?? current.courierLat,
    d.courierLng ?? current.courierLng,
    d.dropoffEta ?? current.dropoffEta,
    d.feeCents ?? current.courierFeeCents,
    d.cancelReason ?? current.cancelReason,
    new Date().toISOString(),
    d.externalId,
  );
  return getByExternalId(d.externalId);
}

export function getByExternalId(externalId: string): DeliveryRow | null {
  const r = getDb()
    .prepare("SELECT * FROM deliveries WHERE external_id = ?")
    .get(externalId) as Raw | undefined;
  return r ? toRow(r) : null;
}

export function getDeliveryForOrder(orderId: string): DeliveryRow | null {
  const r = getDb()
    .prepare("SELECT * FROM deliveries WHERE order_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(orderId) as Raw | undefined;
  return r ? toRow(r) : null;
}

export function listDeliveries(orgId: string, limit = 50): DeliveryRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM deliveries WHERE org_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(orgId, limit) as Raw[];
  return rows.map(toRow);
}

/**
 * Records a courier event before anything acts on it.
 * Returns false when we have seen this event already — courier webhooks are
 * at-least-once, so the same "picked up" can arrive three times and must only
 * advance the order once.
 */
export function claimDeliveryEvent(input: {
  eventId: string;
  provider: string;
  externalId: string;
  status: string;
  payload: string;
}): boolean {
  const db = getDb();
  const seen = db
    .prepare("SELECT event_id FROM delivery_events WHERE event_id = ?")
    .get(input.eventId);
  if (seen) return false;

  db.prepare(
    `INSERT INTO delivery_events (event_id, provider, external_id, status, payload, received_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(
    input.eventId, input.provider, input.externalId, input.status,
    input.payload.slice(0, 20000), new Date().toISOString(),
  );
  return true;
}

/** What delivery actually cost this restaurant's orders, against what was charged. */
export function deliveryEconomics(orgId: string): {
  count: number;
  courierCents: number;
  guestCents: number;
  netCents: number;
} {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(courier_fee_cents), 0) AS courier,
              COALESCE(SUM(guest_fee_cents), 0) AS guest
         FROM deliveries
        WHERE org_id = ? AND status != 'cancelled'`,
    )
    .get(orgId) as { n: number; courier: number; guest: number };

  return {
    count: Number(r.n),
    courierCents: Number(r.courier),
    guestCents: Number(r.guest),
    netCents: Number(r.guest) - Number(r.courier),
  };
}
