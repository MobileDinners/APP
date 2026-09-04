import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getItem } from "@/lib/orders";
import { record, suggestFor } from "@/lib/upsell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Suggestions for the cart currently on screen. Reads the cart from the query
 * rather than trusting a client-supplied slate, so the guest cannot be shown
 * an item the kitchen has already 86'd.
 */
export async function GET(req: Request) {
  const session = await getSession();
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId");
  const items = (url.searchParams.get("items") ?? "").split(",").filter(Boolean);

  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const personId = session?.kind === "person" ? session.personId : null;
  const slate = suggestFor(orgId, items, personId);

  // Impressions are logged here, not on the client, so an ad-blocker or a
  // failed beacon cannot quietly inflate the attach rate by losing the
  // denominator while accepts still arrive.
  if (slate.arm === "holdout") {
    record(orgId, personId, "holdout", "suppressed", null);
  } else {
    for (const s of slate.suggestions) {
      record(orgId, personId, "treated", "impression", s.itemId, s.priceCents);
    }
  }

  // Internal reasoning stays server-side; guests get the slate only.
  return NextResponse.json({
    arm: slate.arm,
    suggestions: slate.suggestions,
  });
}

/** Records that a guest actually added a suggested item. */
export async function POST(req: Request) {
  const session = await getSession();

  let body: { orgId?: string; itemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.orgId || !body.itemId) {
    return NextResponse.json({ error: "orgId and itemId are required" }, { status: 400 });
  }

  const item = getItem(body.itemId);
  if (!item || item.orgId !== body.orgId) {
    return NextResponse.json({ error: "Unknown item" }, { status: 404 });
  }

  record(
    body.orgId,
    session?.kind === "person" ? session.personId : null,
    "treated",
    "accepted",
    item.itemId,
    item.priceCents,
  );
  return NextResponse.json({ ok: true });
}
