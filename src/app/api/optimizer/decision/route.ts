import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { MenuError, updateItem } from "@/lib/menu";
import { buildProposals } from "@/lib/optimizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Accept or dismiss one optimizer proposal.
 *
 * An accepted price is re-derived from the live proposal set rather than taken
 * from the request body — otherwise this endpoint would be an arbitrary
 * price-setting API wearing an optimizer costume.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "edit_menu")) {
    return NextResponse.json({ error: "Your role cannot change prices" }, { status: 403 });
  }

  let body: { itemId?: string; verdict?: "accepted" | "dismissed" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!body.itemId || (body.verdict !== "accepted" && body.verdict !== "dismissed")) {
    return NextResponse.json(
      { error: "itemId and verdict are required" },
      { status: 400 },
    );
  }

  const proposal = buildProposals(session.orgId).find((p) => p.itemId === body.itemId);
  if (!proposal) {
    return NextResponse.json(
      { error: "That suggestion is no longer current. Reload to see fresh ones." },
      { status: 409 },
    );
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO ai_decisions (decision_id, org_id, kind, item_id, proposal_json,
                               verdict, actor, created_at)
     VALUES (?, ?, 'menu_price', ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), session.orgId, proposal.itemId, JSON.stringify(proposal),
    body.verdict, session.staffId, new Date().toISOString(),
  );

  if (body.verdict === "dismissed") {
    return NextResponse.json({ ok: true, applied: false });
  }

  try {
    // Applies to the draft only. It reaches guests when the menu is published.
    updateItem(session.orgId, proposal.itemId, { priceCents: proposal.proposedPriceCents });
    return NextResponse.json({ ok: true, applied: true, proposal });
  } catch (err) {
    if (err instanceof MenuError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("optimizer accept failed", err);
    return NextResponse.json({ error: "Could not apply the change" }, { status: 500 });
  }
}
