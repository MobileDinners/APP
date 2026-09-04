import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import { PosError } from "@/lib/pos";
import { disconnect, getConnection, pushOrderToPos, syncCatalog } from "@/lib/pos/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Pulls the catalogue from the connected till. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "publish_menu")) {
    return NextResponse.json(
      { error: "Only an owner or manager can sync the menu" },
      { status: 403 },
    );
  }
  if (!getConnection(session.orgId)) {
    return NextResponse.json({ error: "No POS connected" }, { status: 409 });
  }

  let body: { retryOrderId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // No body is fine — a plain sync.
  }

  try {
    if (body.retryOrderId) {
      return NextResponse.json({ push: await pushOrderToPos(body.retryOrderId) });
    }
    return NextResponse.json({ result: await syncCatalog(session.orgId) });
  } catch (err) {
    if (err instanceof PosError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POS sync failed", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "publish_menu")) {
    return NextResponse.json(
      { error: "Only an owner or manager can disconnect a POS" },
      { status: 403 },
    );
  }
  disconnect(session.orgId);
  return NextResponse.json({ ok: true });
}
