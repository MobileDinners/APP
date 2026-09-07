import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrder } from "@/lib/orders";
import { confirmFromClient, intentForOrder } from "@/lib/payments/checkout";
import { PaymentError } from "@/lib/payments/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The diner's own payment for their own order.
 *
 * Both handlers check that the signed-in person owns the order. The order id
 * is guessable enough that "knows the id" cannot be the authorisation — that
 * would let anyone who saw a tracking link pay, or confirm, somebody else's
 * order.
 */
async function ownedOrder(orderId: string) {
  const session = await getSession();
  if (session?.kind !== "person") {
    return { error: NextResponse.json({ error: "Sign in to continue" }, { status: 401 }) };
  }
  const order = getOrder(orderId);
  // Not-found and not-yours give the same answer, so this cannot be used to
  // discover which order ids exist.
  if (!order || order.personId !== session.personId) {
    return { error: NextResponse.json({ error: "No such order" }, { status: 404 }) };
  }
  return { order };
}

/** Creates or returns the payment intent for an order awaiting payment. */
export async function POST(req: Request) {
  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const gate = await ownedOrder(body.orderId);
  if (gate.error) return gate.error;

  try {
    const intent = await intentForOrder(body.orderId);
    return NextResponse.json(intent);
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("intent creation failed", err);
    return NextResponse.json({ error: "Could not start the payment" }, { status: 502 });
  }
}

/**
 * The browser reports that the card cleared.
 *
 * This does NOT trust that report. It re-reads the intent from Stripe and only
 * confirms the order if Stripe says the money moved.
 */
export async function PUT(req: Request) {
  let body: { orderId?: string; intentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.orderId || !body.intentId) {
    return NextResponse.json({ error: "orderId and intentId are required" }, { status: 400 });
  }

  const gate = await ownedOrder(body.orderId);
  if (gate.error) return gate.error;

  try {
    const result = await confirmFromClient(body.orderId, body.intentId);
    if (!result.confirmed) {
      return NextResponse.json(
        {
          error:
            result.status === "failed"
              ? "That card was declined. Try another card."
              : "The payment has not completed yet.",
          status: result.status,
        },
        { status: 402 },
      );
    }
    return NextResponse.json({ ok: true, order: getOrder(body.orderId) });
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("payment confirmation failed", err);
    return NextResponse.json({ error: "Could not confirm the payment" }, { status: 502 });
  }
}
