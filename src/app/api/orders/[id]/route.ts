import { NextResponse } from "next/server";
import { getOrder } from "@/lib/orders";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  const { id } = await params;
  const order = getOrder(id);

  // A customer may read their own order; staff may read their restaurant's.
  const allowed =
    order &&
    (session.kind === "staff"
      ? order.orgId === session.orgId
      : order.personId === session.personId);

  if (!allowed) return NextResponse.json({ error: "Unknown order" }, { status: 404 });
  return NextResponse.json({ order });
}
