import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import { getOrder } from "@/lib/orders";
import { isPlatformAdmin } from "@/lib/site-content";
import { refundOrder, refundableAmount } from "@/lib/payments/refunds";
import { PaymentError } from "@/lib/payments/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Issuing a refund.
 *
 * Two kinds of caller are allowed and they see different scopes. A platform
 * administrator can refund any order, because that is what support is for. A
 * restaurant OWNER can refund their own orders and nobody else's — the same
 * `can(role, "refund")` rule the cancel path already uses, which keeps a shift
 * lead from handing money back on a busy Friday.
 *
 * The platform absorbs the cost either way, so the restaurant is never out of
 * pocket for a refund they did not authorise. That also means this endpoint
 * spends OUR money, which is why it is logged with who called it.
 */
/**
 * Is this anybody at all? Called before the request body is even parsed.
 *
 * Authorisation used to run after input validation, so an anonymous caller
 * posting an empty body got a 400 telling them which field was missing. No
 * data leaked and no refund was reachable, but an endpoint that spends the
 * platform's money should not answer questions for strangers at all — the
 * first thing it does is establish who is asking.
 */
async function requireStaff() {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return { error: NextResponse.json({ error: "Staff sign-in required" }, { status: 401 }) };
  }
  return { session };
}

async function authorise(orderId: string) {
  const gate = await requireStaff();
  if (gate.error) return { error: gate.error };
  const session = gate.session;

  const order = getOrder(orderId);
  if (!order) {
    return { error: NextResponse.json({ error: "No such order" }, { status: 404 }) };
  }

  if (isPlatformAdmin(session.email)) {
    return { session, order };
  }

  // Not an admin: it has to be their own restaurant, and they have to be the
  // owner. Not-found and not-yours give the same answer.
  if (order.orgId !== session.orgId) {
    return { error: NextResponse.json({ error: "No such order" }, { status: 404 }) };
  }
  if (!can(session.role, "refund")) {
    return {
      error: NextResponse.json(
        { error: "Only an owner can issue a refund" },
        { status: 403 },
      ),
    };
  }
  return { session, order };
}

/** What can be refunded, so the UI never offers a button that will fail. */
export async function GET(req: Request) {
  const staff = await requireStaff();
  if (staff.error) return staff.error;

  const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }
  const gate = await authorise(orderId);
  if (gate.error) return gate.error;

  return NextResponse.json(refundableAmount(orderId));
}

export async function POST(req: Request) {
  // Who is asking, before anything they sent is even read.
  const staff = await requireStaff();
  if (staff.error) return staff.error;

  let body: { orderId?: string; amountCents?: unknown; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const gate = await authorise(body.orderId);
  if (gate.error) return gate.error;

  // A refund with no reason is a refund nobody can explain a month later.
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3) {
    return NextResponse.json(
      { error: "Give a reason for the refund", field: "reason" },
      { status: 400 },
    );
  }

  const amountCents =
    body.amountCents === null || body.amountCents === undefined
      ? null
      : Number(body.amountCents);
  if (amountCents !== null && !Number.isFinite(amountCents)) {
    return NextResponse.json({ error: "Amount must be a number of cents" }, { status: 400 });
  }

  try {
    const result = await refundOrder({
      orderId: body.orderId,
      amountCents,
      reason,
      actor: gate.session.email,
    });

    console.info(
      `[refund] ${gate.session.email} refunded ${result.amountCents}c on ` +
        `${body.orderId} (${reason}) — absorbed by the platform`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("refund failed", err);
    return NextResponse.json({ error: "Could not issue the refund" }, { status: 502 });
  }
}
