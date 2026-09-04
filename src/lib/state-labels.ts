import type { OrderState } from "./types";

/**
 * Client-safe copy of the state labels. Kept out of orders.ts so client
 * components never pull node:sqlite into the browser bundle.
 */
export const STATE_LABELS: Record<OrderState, string> = {
  DRAFT: "Draft",
  PENDING_PAYMENT: "Taking payment",
  CONFIRMED: "New order",
  ACCEPTED: "Accepted",
  IN_KITCHEN: "In the kitchen",
  READY: "Ready",
  AWAITING_PICKUP: "Awaiting pickup",
  COURIER_ASSIGNED: "Driver assigned",
  IN_TRANSIT: "On the way",
  COMPLETED: "Delivered",
  SETTLED: "Settled",
  CANCELLED: "Cancelled",
  FAILED: "Payment failed",
};

/** Guest-facing wording differs from operator wording on purpose. */
export const GUEST_STEPS: { state: OrderState; label: string }[] = [
  { state: "CONFIRMED", label: "Order placed" },
  { state: "IN_KITCHEN", label: "Kitchen started" },
  { state: "READY", label: "Food ready" },
  { state: "IN_TRANSIT", label: "On the way" },
  { state: "COMPLETED", label: "Delivered" },
];

export const GUEST_STEPS_PICKUP: { state: OrderState; label: string }[] = [
  { state: "CONFIRMED", label: "Order placed" },
  { state: "IN_KITCHEN", label: "Kitchen started" },
  { state: "READY", label: "Ready for pickup" },
  { state: "COMPLETED", label: "Picked up" },
];
