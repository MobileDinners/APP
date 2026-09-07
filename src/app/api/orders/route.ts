import { NextResponse } from "next/server";
import { createOrder, listOrders, OrderError } from "@/lib/orders";
import { getSession } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/ratelimit";
import { pushOrderToPos } from "@/lib/pos/sync";
import { deliveryQuote } from "@/lib/geocode";
import { getRestaurantById } from "@/lib/orders";
import type { Fulfillment } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  const url = new URL(req.url);
  const open = url.searchParams.get("open") === "1";

  // Staff see their own restaurant's orders; customers see only their own.
  // The scope comes from the session, never from a query parameter.
  if (session.kind === "staff") {
    return NextResponse.json({ orders: listOrders({ orgId: session.orgId, open }) });
  }
  return NextResponse.json({ orders: listOrders({ personId: session.personId, open }) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "person") {
    return NextResponse.json(
      { error: "Sign in to place an order", code: "auth_required" },
      { status: 401 },
    );
  }

  // Keyed on the diner, not the address: a household or an office behind one
  // NAT should not throttle each other, and the session is the harder thing to
  // forge anyway.
  const limit = rateLimit(
    `orders:${session.personId}`,
    LIMITS.orders.max,
    LIMITS.orders.windowMs,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That is a lot of orders. Give it a few minutes.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  // Idempotency-Key is required on every mutating endpoint — spec principle 5.
  const idempotencyKey =
    req.headers.get("Idempotency-Key") ?? (body.idempotencyKey as string | undefined);
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "Idempotency-Key header is required" },
      { status: 400 },
    );
  }

  const fulfillment = (body.fulfillment as Fulfillment) ?? "pickup";
  const address = String(body.address ?? "742 Elm St, Apt 4B");

  /**
   * Quote the delivery fee from the real distance before the order exists.
   *
   * This is the promise on /how-it-works and the partner pricing page — a fee
   * "worked out from how far your address is from the restaurant". It has to
   * happen out here because it makes a network call, and createOrder runs in a
   * transaction where an HTTP request does not belong.
   *
   * Out of range refuses the order rather than quietly charging the cap. The
   * published maximum is a promise about a short trip, not about any trip.
   */
  let quotedDeliveryFeeCents: number | undefined;
  if (fulfillment === "delivery") {
    const org = getRestaurantById(String(body.orgId ?? ""));
    if (org) {
      const quote = await deliveryQuote({
        restaurant: {
          lat: org.lat,
          lng: org.lng,
          address: org.address,
          deliveryFeeCents: org.deliveryFeeCents,
        },
        address,
      });
      if (quote.outOfRange) {
        return NextResponse.json(
          { error: quote.reason, code: "out_of_range" },
          { status: 422 },
        );
      }
      quotedDeliveryFeeCents = quote.feeCents;
    }
  }

  try {
    const order = createOrder({
      quotedDeliveryFeeCents,
      orgId: String(body.orgId ?? ""),
      personId: session.personId,
      fulfillment,
      lines: Array.isArray(body.lines) ? (body.lines as never[]) : [],
      tipCents: Number(body.tipCents ?? 0),
      pointsToRedeem: Number(body.pointsToRedeem ?? 0),
      guestName: session.displayName || "Guest",
      guestPhone: session.phone ?? "",
      address,
      idempotencyKey,
    });
    // If the restaurant runs its own till, the ticket belongs there too. This
    // is deliberately not awaited: the guest has paid and the order exists
    // whether or not Square is reachable this second. Failures are queued and
    // shown to the operator on /ops/pos.
    void pushOrderToPos(order.orderId).catch((err) => {
      console.error("POS push failed", order.orderId, err);
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("createOrder failed", err);
    return NextResponse.json({ error: "Could not place the order" }, { status: 500 });
  }
}
