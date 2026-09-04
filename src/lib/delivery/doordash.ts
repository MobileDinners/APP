import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DeliveryError,
  type Address,
  type Delivery,
  type DeliveryEvent,
  type DeliveryProvider,
  type DeliveryStatus,
  type Quote,
  type QuoteInput,
} from "./types";

/**
 * DoorDash Drive.
 *
 * Drive is DoorDash's white-label courier network: we create the delivery, a
 * Dasher collects and drops it, and the diner never leaves our app. It is not
 * the DoorDash marketplace — no listing, no commission, no customer handover.
 * That distinction is the entire reason it fits a zero-commission platform.
 *
 * Auth is a short-lived HS256 JWT rather than a bearer token, minted per
 * request from three credentials in the developer portal.
 */

const API = process.env.DOORDASH_API_BASE ?? "https://openapi.doordash.com";

function credentials(): { developerId: string; keyId: string; signingSecret: string } {
  const developerId = process.env.DOORDASH_DEVELOPER_ID;
  const keyId = process.env.DOORDASH_KEY_ID;
  const signingSecret = process.env.DOORDASH_SIGNING_SECRET;
  if (!developerId || !keyId || !signingSecret) {
    throw new DeliveryError(
      "DoorDash credentials are not set. Add DOORDASH_DEVELOPER_ID, " +
        "DOORDASH_KEY_ID and DOORDASH_SIGNING_SECRET to .env.local.",
      500,
      "not_configured",
    );
  }
  return { developerId, keyId, signingSecret };
}

const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * DoorDash's JWT dialect: a `dd-ver` header claim, and a signing secret that is
 * itself base64url — it must be decoded before use, not hashed as text.
 */
function mintJwt(): string {
  const { developerId, keyId, signingSecret } = credentials();
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", "dd-ver": "DD-JWT-V1" })),
  );
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        aud: "doordash",
        iss: developerId,
        kid: keyId,
        exp: now + 300,
        iat: now,
      }),
    ),
  );

  const secret = Buffer.from(
    signingSecret.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
  const signature = b64url(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

type DdDelivery = {
  external_delivery_id: string;
  delivery_id?: string;
  delivery_status?: string;
  fee?: number;
  currency?: string;
  pickup_time_estimated?: string;
  dropoff_time_estimated?: string;
  duration?: number;
  expires_at?: string;
  tracking_url?: string;
  support_reference?: string;
  dasher_name?: string;
  dasher_phone_number?: string;
  dasher_location?: { lat?: number; lng?: number };
};

async function call<T>(path: string, method: "GET" | "POST" | "PUT", body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${mintJwt()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new DeliveryError(`DoorDash returned a non-JSON response (${res.status})`, 502);
    }
  }

  if (!res.ok) {
    const err = json as { message?: string; code?: string; field_errors?: unknown };
    throw new DeliveryError(
      err.message ?? `DoorDash request failed (${res.status})`,
      // 422 usually means the address could not be delivered to, which is a
      // user-facing problem rather than an outage.
      res.status === 422 ? 422 : 502,
      err.code ?? "doordash_error",
    );
  }
  return json as T;
}

/** Their eight statuses collapse to the five the rest of the system knows. */
function toStatus(s: string | undefined): DeliveryStatus {
  switch (s) {
    case "created":
    case "confirmed":
    case "enroute_to_pickup":
    case "arrived_at_pickup":
      return "assigned";
    case "picked_up":
    case "enroute_to_dropoff":
    case "arrived_at_dropoff":
      return "picked_up";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "cancelled";
    default:
      return "quoted";
  }
}

function addressPayload(prefix: "pickup" | "dropoff", a: Address) {
  const out: Record<string, string> = {
    [`${prefix}_address`]: a.street,
    [`${prefix}_phone_number`]: a.phone,
  };
  if (a.businessName) out[`${prefix}_business_name`] = a.businessName;
  if (a.instructions) out[`${prefix}_instructions`] = a.instructions.slice(0, 500);
  if (prefix === "dropoff" && a.contactName) {
    out.dropoff_contact_given_name = a.contactName;
  }
  return out;
}

function quoteBody(input: QuoteInput) {
  return {
    external_delivery_id: input.externalId,
    ...addressPayload("pickup", input.pickup),
    ...addressPayload("dropoff", input.dropoff),
    order_value: input.orderValueCents,
    items: input.items.map((i) => ({ name: i.name, quantity: i.quantity })),
    // Telling them when the food is ready is what stops a Dasher standing in
    // the restaurant for ten minutes and the food going out cold.
    ...(input.readyAt ? { pickup_time: input.readyAt } : {}),
  };
}

function toDelivery(d: DdDelivery): Delivery {
  return {
    externalId: d.external_delivery_id,
    providerDeliveryId: d.delivery_id ?? d.external_delivery_id,
    status: toStatus(d.delivery_status),
    feeCents: d.fee ?? 0,
    courierName: d.dasher_name ?? null,
    courierPhone: d.dasher_phone_number ?? null,
    courierLat: d.dasher_location?.lat ?? null,
    courierLng: d.dasher_location?.lng ?? null,
    pickupEta: d.pickup_time_estimated ?? null,
    dropoffEta: d.dropoff_time_estimated ?? null,
    trackingUrl: d.tracking_url ?? null,
    supportReference: d.support_reference ?? null,
  };
}

export const doordashProvider: DeliveryProvider = {
  id: "doordash",

  async quote(input: QuoteInput): Promise<Quote> {
    const d = await call<DdDelivery>("/drive/v2/quotes", "POST", quoteBody(input));
    return {
      externalId: d.external_delivery_id,
      feeCents: d.fee ?? 0,
      currency: d.currency ?? "USD",
      pickupEta: d.pickup_time_estimated ?? null,
      dropoffEta: d.dropoff_time_estimated ?? null,
      durationSeconds: d.duration ?? null,
      expiresAt: d.expires_at ?? null,
    };
  },

  async accept(externalId) {
    const d = await call<DdDelivery>(
      `/drive/v2/quotes/${encodeURIComponent(externalId)}/accept`,
      "POST",
      {},
    );
    return toDelivery(d);
  },

  async createDelivery(input) {
    const d = await call<DdDelivery>("/drive/v2/deliveries", "POST", quoteBody(input));
    return toDelivery(d);
  },

  async get(externalId) {
    const d = await call<DdDelivery>(
      `/drive/v2/deliveries/${encodeURIComponent(externalId)}`,
      "GET",
    );
    return toDelivery(d);
  },

  async cancel(externalId, reason) {
    await call(`/drive/v2/deliveries/${encodeURIComponent(externalId)}/cancel`, "PUT", {
      cancellation_reason: reason.slice(0, 200),
    });
  },

  parseWebhook(rawBody, signature): DeliveryEvent | null {
    const secret = process.env.DOORDASH_WEBHOOK_SECRET;
    if (!secret || !signature) return null;

    // DoorDash signs the raw body with the webhook secret, base64url encoded.
    const expected = createHmac("sha256", Buffer.from(secret, "base64"))
      .update(rawBody)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature.trim(), "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let evt: {
      event_name?: string;
      external_delivery_id?: string;
      delivery_status?: string;
      dasher_name?: string;
      dasher_phone_number?: string;
      dasher_location?: { lat?: number; lng?: number };
      dropoff_time_estimated?: string;
      cancellation_reason?: string;
      event_id?: string;
    };
    try {
      evt = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!evt.external_delivery_id) return null;

    return {
      // DoorDash does not always send an id; fall back to something stable so
      // the same update cannot be applied twice.
      eventId:
        evt.event_id ??
        `${evt.external_delivery_id}:${evt.delivery_status ?? evt.event_name ?? "unknown"}`,
      externalId: evt.external_delivery_id,
      status: toStatus(evt.delivery_status),
      courierName: evt.dasher_name ?? null,
      courierPhone: evt.dasher_phone_number ?? null,
      courierLat: evt.dasher_location?.lat ?? null,
      courierLng: evt.dasher_location?.lng ?? null,
      dropoffEta: evt.dropoff_time_estimated ?? null,
      cancelReason: evt.cancellation_reason ?? null,
    };
  },
};
