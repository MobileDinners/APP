import { NextResponse } from "next/server";
import { can, getSession } from "@/lib/auth";
import { MenuError, publishMenu } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Freezes the draft into a new immutable menu version. Orders placed from this
 * moment reference the new version; orders already placed keep the old one.
 */
export async function POST() {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!can(session.role, "publish_menu")) {
    return NextResponse.json(
      { error: "Only an owner or manager can publish the menu" },
      { status: 403 },
    );
  }

  try {
    const version = publishMenu(session.orgId, "console", session.staffId);
    return NextResponse.json({ version });
  } catch (err) {
    if (err instanceof MenuError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("publishMenu failed", err);
    return NextResponse.json({ error: "Could not publish the menu" }, { status: 500 });
  }
}
