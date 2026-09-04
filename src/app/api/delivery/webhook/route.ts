import { NextResponse } from "next/server";
import { deliveryConfigured, getDeliveryProvider } from "@/lib/delivery";
import { applyCourierStatus } from "@/lib/delivery/dispatch";
import {
  claimDeliveryEvent,
  getByExternalId,
  updateFromProvider,
} from "@/lib/delivery/store";
import { publish } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DoorDash Drive status updates.
 *
 * Signature is verified before the body is treated as meaningful, and the
 * event is claimed before any state changes — courier webhooks are
 * at-least-once, so the same "picked up" can arrive three times and must
 * advance the order exactly once.
 *
 * Anything unverified gets a flat rejection with no detail, so probing this
 * endpoint teaches an attacker nothing.
 */
export async function POST(req: Request) {
  if (!deliveryConfigured()) {
    return NextResponse.json({ error: "Delivery is not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const signature =
    req.headers.get("x-doordash-signature") ?? req.headers.get("dd-signature");

  const provider = getDeliveryProvider();
  const event = provider.parseWebhook(raw, signature);
  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const fresh = claimDeliveryEvent({
    eventId: event.eventId,
    provider: provider.id,
    externalId: event.externalId,
    status: event.status,
    payload: raw,
  });
  // Already handled. A 200 tells DoorDash to stop retrying, which is correct.
  if (!fresh) return NextResponse.json({ ok: true, duplicate: true });

  const row = updateFromProvider({
    externalId: event.externalId,
    status: event.status,
    courierName: event.courierName,
    courierPhone: event.courierPhone,
    courierLat: event.courierLat,
    courierLng: event.courierLng,
    dropoffEta: event.dropoffEta,
    cancelReason: event.cancelReason,
  });

  const delivery = row ?? getByExternalId(event.externalId);
  if (!delivery) {
    // A status for a delivery we never booked. Recorded above, ignored here.
    return NextResponse.json({ ok: true, unknown: true });
  }

  applyCourierStatus(delivery.orderId, event.status);

  // Push the courier's position to the guest's tracking page immediately,
  // rather than waiting for them to reload.
  publish({
    type: "delivery.updated",
    orgId: delivery.orgId,
    orderId: delivery.orderId,
    status: event.status,
  });

  return NextResponse.json({ ok: true });
}
