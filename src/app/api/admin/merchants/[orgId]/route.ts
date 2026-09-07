import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/site-content";
import { getMerchant, setAcceptingOrders, setSponsored } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Platform controls for one restaurant.
 *
 * Note what is NOT here: the org id comes from the path, which is the one
 * place in this codebase where a caller may name a tenant other than their
 * own. That is the entire point of an admin endpoint, and it is exactly why
 * the guard below is not optional — without it this route would let any
 * signed-in restaurant owner hide a competitor.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (!isPlatformAdmin(session.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { orgId } = await params;
  if (!getMerchant(orgId)) {
    return NextResponse.json({ error: "No such restaurant" }, { status: 404 });
  }

  let body: { accepting?: unknown; sponsored?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  let touched = false;
  if (typeof body.accepting === "boolean") {
    setAcceptingOrders(orgId, body.accepting);
    touched = true;
  }
  if (typeof body.sponsored === "boolean") {
    setSponsored(orgId, body.sponsored);
    touched = true;
  }
  if (!touched) {
    return NextResponse.json(
      { error: "Send accepting and/or sponsored as booleans" },
      { status: 400 },
    );
  }

  // Log it: hiding a restaurant takes its revenue to zero, and "who did this"
  // is the first question asked when someone notices.
  console.info(
    `[admin] ${session.email} updated ${orgId}`,
    JSON.stringify({ accepting: body.accepting, sponsored: body.sponsored }),
  );

  return NextResponse.json({ merchant: getMerchant(orgId) });
}
