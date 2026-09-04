/**
 * The delivery boundary.
 *
 * Same discipline as the POS and payment adapters: everything courier-specific
 * lives behind this interface, so adding Uber Direct later means writing one
 * file rather than touching the order state machine.
 *
 * The model is white-label fulfilment — we own the customer, the menu and the
 * receipt; the courier network only moves the bag. That is why nothing here
 * exposes a marketplace listing, a commission, or a customer relationship.
 */

export type DeliveryProviderId = "doordash" | "sandbox";

/**
 * Courier-side status, normalised.
 *
 * DoorDash reports eight of these; Uber reports a different eight. Mapping
 * them here means the tracking page and the state machine only ever learn
 * about these five.
 */
export type DeliveryStatus =
  | "quoted"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled";

export type Address = {
  street: string;
  businessName: string;
  phone: string;
  instructions: string;
  contactName: string;
};

export type QuoteInput = {
  /** Our order id. Couriers key on this, so it must be stable and unique. */
  externalId: string;
  pickup: Address;
  dropoff: Address;
  /** Order value in cents, for the courier's insurance and handling rules. */
  orderValueCents: number;
  items: { name: string; quantity: number }[];
  /** ISO time the food will be ready, so the courier arrives with it. */
  readyAt: string | null;
};

export type Quote = {
  externalId: string;
  /**
   * What the courier charges US, in cents. Not what the diner pays — those are
   * different numbers and conflating them is how a marketplace loses money
   * quietly on every order.
   */
  feeCents: number;
  currency: string;
  /** Estimated pickup and dropoff, ISO. */
  pickupEta: string | null;
  dropoffEta: string | null;
  durationSeconds: number | null;
  /** Quotes expire. Accepting a stale one is an error, not a silent re-quote. */
  expiresAt: string | null;
};

export type Delivery = {
  externalId: string;
  /** The courier's own id, for support calls. */
  providerDeliveryId: string;
  status: DeliveryStatus;
  feeCents: number;
  courierName: string | null;
  courierPhone: string | null;
  /** Live position when the courier reports one. Null before pickup. */
  courierLat: number | null;
  courierLng: number | null;
  pickupEta: string | null;
  dropoffEta: string | null;
  /** A reference the restaurant can quote to the courier's support line. */
  trackingUrl: string | null;
  supportReference: string | null;
};

/** A verified inbound status update from the courier. */
export type DeliveryEvent = {
  eventId: string;
  externalId: string;
  status: DeliveryStatus;
  courierName: string | null;
  courierPhone: string | null;
  courierLat: number | null;
  courierLng: number | null;
  dropoffEta: string | null;
  cancelReason: string | null;
};

export interface DeliveryProvider {
  readonly id: DeliveryProviderId;

  /** Prices a delivery without committing to it. */
  quote(input: QuoteInput): Promise<Quote>;

  /** Commits a previously returned quote. Dispatches a courier. */
  accept(externalId: string): Promise<Delivery>;

  /** Quote and accept in one call, for when there is nothing to decide. */
  createDelivery(input: QuoteInput): Promise<Delivery>;

  get(externalId: string): Promise<Delivery>;

  cancel(externalId: string, reason: string): Promise<void>;

  /**
   * Verifies a webhook signature and normalises the payload.
   * Returns null when the signature does not check out — the caller must treat
   * that as hostile, not as a parse failure.
   */
  parseWebhook(rawBody: string, signature: string | null): DeliveryEvent | null;
}

export class DeliveryError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "delivery_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
