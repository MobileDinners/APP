import { NextResponse } from "next/server";
import { bumpLine, getOrder, OrderError } from "@/lib/orders";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }

  let body: { orderId?: string; lineNo?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.orderId || typeof body.lineNo !== "number") {
    return NextResponse.json({ error: "orderId and lineNo are required" }, { status: 400 });
  }

  const order = getOrder(body.orderId);
  if (!order || order.orgId !== session.orgId) {
    return NextResponse.json({ error: "Unknown order" }, { status: 404 });
  }

  try {
    return NextResponse.json({ order: bumpLine(body.orderId, body.lineNo) });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("bump failed", err);
    return NextResponse.json({ error: "Could not bump the ticket" }, { status: 500 });
  }
}
