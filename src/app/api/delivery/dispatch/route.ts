import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import { getOrder } from "@/lib/orders";
import { DeliveryError, deliveryMode } from "@/lib/delivery";
import { dispatchOrder, quoteDelivery, refreshDelivery } from "@/lib/delivery/dispatch";
import { getDeliveryForOrder } from "@/lib/delivery/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Current delivery for an order, refreshed from the courier on request. */
export async function GET(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }

  const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
  const order = getOrder(orderId);
  // Tenant scope from the session, never the query string. A wrong org is a
  // 404 so order ids cannot be probed.
  if (!order || order.orgId !== session.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const refreshed = await refreshDelivery(orderId);
    return NextResponse.json({
      delivery: refreshed ?? getDeliveryForOrder(orderId),
      mode: deliveryMode(),
    });
  } catch (err) {
    if (err instanceof DeliveryError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not read the delivery" }, { status: 502 });
  }
}

/**
 * Books a courier, or prices one first.
 *
 * `{ "quote": true }` returns what the courier would charge without committing.
 * Restricted to staff who can advance an order — dispatching is an operational
 * act with a real cost attached, not a read.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "advance_order")) {
    return NextResponse.json(
      { error: "Your role cannot dispatch a courier" },
      { status: 403 },
    );
  }

  let body: { orderId?: string; quote?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const order = getOrder(String(body.orderId ?? ""));
  if (!order || order.orgId !== session.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    if (body.quote) {
      const quote = await quoteDelivery(order.orderId);
      return NextResponse.json({
        quote,
        guestPaysCents: order.deliveryFeeCents,
        // The gap is stated rather than left to be discovered in a statement.
        netCents: order.deliveryFeeCents - quote.feeCents,
        mode: deliveryMode(),
      });
    }

    const delivery = await dispatchOrder(order.orderId);
    return NextResponse.json({ delivery, mode: deliveryMode() }, { status: 201 });
  } catch (err) {
    if (err instanceof DeliveryError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("dispatch failed", err);
    return NextResponse.json({ error: "Could not dispatch a courier" }, { status: 502 });
  }
}
