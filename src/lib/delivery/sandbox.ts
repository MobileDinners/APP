import { randomUUID } from "node:crypto";
import type {
  Delivery,
  DeliveryEvent,
  DeliveryProvider,
  Quote,
  QuoteInput,
} from "./types";

/**
 * A local courier stand-in so the whole flow runs with no DoorDash credentials.
 *
 * Same reasoning as the POS and payment sandboxes: a demo that dies without
 * keys is a demo nobody can show. Refused in production by index.ts — telling
 * a diner a Dasher is coming when none was ever booked is not a fallback.
 *
 * The fee it quotes is deliberately realistic rather than flattering. Drive
 * costs real money, and a sandbox that returns $1.99 would hide the fact that
 * the diner's delivery fee does not cover it.
 */

const deliveries = new Map<string, Delivery>();

/** Roughly Drive's US pricing: a base plus distance, floored. */
function estimateFeeCents(orderValueCents: number): number {
  const base = 699;
  const surcharge = orderValueCents > 5000 ? 150 : 0;
  return base + surcharge;
}

export const sandboxDeliveryProvider: DeliveryProvider = {
  id: "sandbox",

  async quote(input: QuoteInput): Promise<Quote> {
    const now = Date.now();
    return {
      externalId: input.externalId,
      feeCents: estimateFeeCents(input.orderValueCents),
      currency: "USD",
      pickupEta: new Date(now + 8 * 60_000).toISOString(),
      dropoffEta: new Date(now + 26 * 60_000).toISOString(),
      durationSeconds: 26 * 60,
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
    };
  },

  async accept(externalId) {
    return this.createDelivery({
      externalId,
      pickup: { street: "", businessName: "", phone: "", instructions: "", contactName: "" },
      dropoff: { street: "", businessName: "", phone: "", instructions: "", contactName: "" },
      orderValueCents: 0,
      items: [],
      readyAt: null,
    });
  },

  async createDelivery(input): Promise<Delivery> {
    const now = Date.now();
    const delivery: Delivery = {
      externalId: input.externalId,
      providerDeliveryId: `dd_sandbox_${randomUUID().slice(0, 10)}`,
      status: "assigned",
      feeCents: estimateFeeCents(input.orderValueCents),
      courierName: "Marcus C.",
      courierPhone: "+14155550123",
      courierLat: null,
      courierLng: null,
      pickupEta: new Date(now + 8 * 60_000).toISOString(),
      dropoffEta: new Date(now + 26 * 60_000).toISOString(),
      trackingUrl: null,
      supportReference: `SANDBOX-${input.externalId.slice(0, 8)}`,
    };
    deliveries.set(input.externalId, delivery);
    return delivery;
  },

  async get(externalId) {
    const found = deliveries.get(externalId);
    if (found) return found;
    throw Object.assign(new Error("Unknown delivery"), { status: 404 });
  },

  async cancel(externalId) {
    const found = deliveries.get(externalId);
    if (found) deliveries.set(externalId, { ...found, status: "cancelled" });
  },

  parseWebhook(): DeliveryEvent | null {
    // Nothing signs sandbox webhooks, so nothing may be trusted from one.
    return null;
  },
};
