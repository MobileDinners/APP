import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM orgs").get() as { n: number };
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
