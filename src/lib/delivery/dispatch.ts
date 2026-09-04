import { getRestaurantById, getOrder, transition } from "../orders";
import { getDeliveryProvider } from "./index";
import {
  getDeliveryForOrder,
  recordDelivery,
  updateFromProvider,
  type DeliveryRow,
} from "./store";
import { DeliveryError, type DeliveryStatus, type QuoteInput } from "./types";

/**
 * Booking a courier, and keeping the order in step with them.
 *
 * Dispatch happens when the food is READY, not when the order is placed. A
 * Dasher summoned at checkout stands in the kitchen for fifteen minutes and
 * leaves with cold food; one summoned at ready arrives as it comes off the
 * pass. The courier is told the ready time either way so they can route.
 */

/** Builds the courier's view of an order. */
function quoteInputFor(orderId: string): QuoteInput {
  const order = getOrder(orderId);
  if (!order) throw new DeliveryError("Unknown order", 404, "unknown_order");
  if (order.fulfillment !== "delivery") {
    throw new DeliveryError("This is a pickup order", 409, "not_delivery");
  }

  const restaurant = getRestaurantById(order.orgId);
  if (!restaurant) throw new DeliveryError("Unknown restaurant", 404, "unknown_org");

  if (!order.address.trim()) {
    throw new DeliveryError(
      "This order has no delivery address",
      422,
      "no_address",
    );
  }

  return {
    externalId: order.orderId,
    pickup: {
      street: restaurant.address,
      businessName: restaurant.brandName,
      // The courier calls the restaurant, not us, when they are outside.
      phone: process.env.MD_SUPPORT_PHONE ?? "+14155550111",
      instructions: "Collect the Mobile Dinners order at the counter.",
      contactName: restaurant.brandName,
    },
    dropoff: {
      street: order.address,
      businessName: "",
      phone: order.guestPhone,
      instructions: "",
      contactName: order.guestName || "Guest",
    },
    orderValueCents: order.subtotalCents,
    items: order.lines.map((l) => ({ name: l.name, quantity: l.qty })),
    readyAt: order.promisedAt,
  };
}

/** Prices a delivery without booking it. Used before dispatch and in ops. */
export async function quoteDelivery(orderId: string) {
  const provider = getDeliveryProvider();
  return provider.quote(quoteInputFor(orderId));
}

/**
 * Books a courier for an order and moves it to COURIER_ASSIGNED.
 *
 * Idempotent: an order that already has a live delivery returns it rather than
 * booking a second Dasher, because the retry path here is a human pressing a
 * button again when the first press looked slow.
 */
export async function dispatchOrder(orderId: string): Promise<DeliveryRow> {
  const existing = getDeliveryForOrder(orderId);
  if (existing && existing.status !== "cancelled") return existing;

  const order = getOrder(orderId);
  if (!order) throw new DeliveryError("Unknown order", 404, "unknown_order");

  // Dispatching before the food exists is how a courier ends up waiting.
  if (order.state !== "READY") {
    throw new DeliveryError(
      `Dispatch needs the order to be READY, not ${order.state}`,
      409,
      "not_ready",
    );
  }

  const provider = getDeliveryProvider();
  const delivery = await provider.createDelivery(quoteInputFor(orderId));

  const row = recordDelivery({
    orderId,
    orgId: order.orgId,
    provider: provider.id,
    guestFeeCents: order.deliveryFeeCents,
    delivery,
  });

  transition(orderId, "COURIER_ASSIGNED", "courier", "DRIVE");
  return row;
}

/**
 * Applies a courier status to the order.
 *
 * The mapping is deliberately narrow — the courier drives the order forward,
 * never backward, and never past COMPLETED. A confused or replayed webhook
 * should be a no-op, not a state machine violation.
 */
export function applyCourierStatus(
  orderId: string,
  status: DeliveryStatus,
): void {
  const order = getOrder(orderId);
  if (!order) return;

  const target =
    status === "picked_up"
      ? "IN_TRANSIT"
      : status === "delivered"
        ? "COMPLETED"
        : status === "assigned"
          ? "COURIER_ASSIGNED"
          : null;
  if (!target) return;
  if (order.state === target) return;

  try {
    transition(orderId, target, "courier", "DRIVE");
  } catch {
    // An out-of-order update (delivered arriving before picked_up) is normal
    // on an at-least-once webhook. Ignore it rather than failing the request,
    // or DoorDash retries forever against a state we will never accept.
  }
}

/** Re-reads a delivery from the courier. Used when a webhook has been missed. */
export async function refreshDelivery(orderId: string): Promise<DeliveryRow | null> {
  const row = getDeliveryForOrder(orderId);
  if (!row) return null;

  const provider = getDeliveryProvider();
  const live = await provider.get(row.externalId);

  const updated = updateFromProvider({
    externalId: live.externalId,
    status: live.status,
    courierName: live.courierName,
    courierPhone: live.courierPhone,
    courierLat: live.courierLat,
    courierLng: live.courierLng,
    dropoffEta: live.dropoffEta,
    feeCents: live.feeCents,
  });
  applyCourierStatus(orderId, live.status);
  return updated;
}
