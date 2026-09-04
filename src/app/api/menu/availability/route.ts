import { NextResponse } from "next/server";
import { getItem, setAvailability } from "@/lib/orders";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 86 an item, or bring it back. Propagates to the marketplace over SSE. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }

  let body: { itemId?: string; isAvailable?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.itemId || typeof body.isAvailable !== "boolean") {
    return NextResponse.json(
      { error: "itemId and isAvailable are required" },
      { status: 400 },
    );
  }

  const item = getItem(body.itemId);
  if (!item || item.orgId !== session.orgId) {
    return NextResponse.json({ error: "Unknown item" }, { status: 404 });
  }

  // Any signed-in staff can 86 something — that's a line-cook action, and
  // blocking it would just mean selling food the kitchen doesn't have.
  try {
    setAvailability(body.itemId, body.isAvailable);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("availability failed", err);
    return NextResponse.json({ error: "Could not update availability" }, { status: 500 });
  }
}
