import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import { deleteItem, MenuError, updateItem } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "edit_menu")) {
    return NextResponse.json(
      { error: "Your role cannot edit the menu" },
      { status: 403 },
    );
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    updateItem(session.orgId, id, {
      name: body.name as string | undefined,
      description: body.description as string | undefined,
      priceCents: body.priceCents as number | undefined,
      costCents: body.costCents as number | undefined,
      prepSeconds: body.prepSeconds as number | undefined,
      section: body.section as string | undefined,
      station: body.station as string | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MenuError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("updateItem failed", err);
    return NextResponse.json({ error: "Could not save the change" }, { status: 500 });
  }
}

/** Removes a draft item. Refused for anything that has ever been ordered. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "edit_menu")) {
    return NextResponse.json(
      { error: "Your role cannot remove items from the menu" },
      { status: 403 },
    );
  }

  const { id } = await params;
  try {
    deleteItem(session.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MenuError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("deleteItem failed", err);
    return NextResponse.json({ error: "Could not remove the item" }, { status: 500 });
  }
}
