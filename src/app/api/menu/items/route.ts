import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import { createItem, MenuError } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Adds an item to the draft menu. Not orderable until the menu is published. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "edit_menu")) {
    return NextResponse.json(
      { error: "Your role cannot add items to the menu" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const itemId = createItem(session.orgId, {
      name: String(body.name ?? ""),
      description: String(body.description ?? ""),
      priceCents: Number(body.priceCents ?? 0),
      costCents: Number(body.costCents ?? 0),
      prepSeconds: Number(body.prepSeconds ?? 300),
      section: String(body.section ?? ""),
      station: String(body.station ?? "assembly"),
      imageKw: String(body.imageKw ?? "food"),
    });
    return NextResponse.json({ itemId }, { status: 201 });
  } catch (err) {
    if (err instanceof MenuError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("createItem failed", err);
    return NextResponse.json({ error: "Could not add the item" }, { status: 500 });
  }
}
