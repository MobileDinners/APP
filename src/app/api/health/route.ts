import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PLATFORM_ORG_ID } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness + readiness in one. It touches the database on purpose: a process
 * that is up but cannot read its data is not healthy, and a health check that
 * only proves the process is running will happily keep a broken app in
 * rotation.
 */
export async function GET() {
  try {
    // Excludes the platform's own org, which exists to own the administrator
    // account and is not a restaurant. Counting it made a brand-new deployment
    // report one restaurant before anybody had signed up.
    const row = getDb()
      .prepare("SELECT COUNT(*) AS n FROM orgs WHERE org_id != ?")
      .get(PLATFORM_ORG_ID) as { n: number };
    return NextResponse.json({
      ok: true,
      restaurants: row.n,
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("health check failed", err);
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
