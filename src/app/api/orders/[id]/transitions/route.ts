import { NextResponse } from "next/server";
import { getOrder, OrderError, transition } from "@/lib/orders";
import { can, getSession } from "@/lib/auth";
import type { OrderState } from "@/lib/types";
import { deliveryConfigured, DeliveryError } from "@/lib/delivery";
import { dispatchOrder } from "@/lib/delivery/dispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }

  const { id } = await params;
  const order = getOrder(id);

  // Not-found and not-yours return the same response, so the endpoint can't be
  // used to discover which order ids exist at other restaurants.
  if (!order || order.orgId !== session.orgId) {
    return NextResponse.json({ error: "Unknown order" }, { status: 404 });
  }

  let body: { to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.to) {
    return NextResponse.json({ error: "Field 'to' is required" }, { status: 400 });
  }

  if (body.to === "CANCELLED" && !can(session.role, "refund")) {
    return NextResponse.json(
      { error: "Only an owner can cancel a paid order" },
      { status: 403 },
    );
  }

  try {
    // Moving a delivery order to COURIER_ASSIGNED by hand would claim a driver
    // exists. Book a real one instead, and let dispatch make the transition.
    if (body.to === "COURIER_ASSIGNED" && order.fulfillment === "delivery") {
      try {
        const delivery = await dispatchOrder(id);
        return NextResponse.json({ order: getOrder(id), delivery });
      } catch (err) {
        if (err instanceof DeliveryError) {
          return NextResponse.json(
            {
              error: err.message,
              code: err.code,
              // The kitchen still needs a way forward when no courier can be
              // had — the food is cooked either way.
              hint: deliveryConfigured()
                ? "The courier could not be booked. The order stays READY so you can retry or switch it to pickup."
                : "No courier network is connected on this deployment.",
            },
            { status: err.status },
          );
        }
        throw err;
      }
    }

    const updated = transition(id, body.to as OrderState, session.staffId, "OPS");
    return NextResponse.json({ order: updated });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("transition failed", err);
    return NextResponse.json({ error: "Could not update the order" }, { status: 500 });
  }
}
