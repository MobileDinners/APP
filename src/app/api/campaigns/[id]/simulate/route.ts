import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getCampaign, measure } from "@/lib/campaigns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DEVELOPMENT ONLY. Fabricates post-send orders with a KNOWN true effect so the
 * incrementality estimator can be checked against an answer we already have.
 *
 * Both arms get a baseline order rate; the treated arm gets an extra lift on
 * top. If the reported interval does not contain the injected effect, the
 * estimator is wrong — which is the entire point of having this endpoint.
 *
 * It refuses to run in production, because it writes fake revenue.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = getCampaign(session.orgId, id);
  if (!campaign || !campaign.activatedAt) {
    return NextResponse.json({ error: "Unknown campaign" }, { status: 404 });
  }

  let body: { baseRate?: number; treatedLift?: number; ticketCents?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const baseRate = Math.min(0.9, Math.max(0, body.baseRate ?? 0.10));
  const treatedLift = Math.min(0.9, Math.max(0, body.treatedLift ?? 0.06));
  const ticketCents = Math.max(100, Math.round(body.ticketCents ?? 2200));

  const db = getDb();
  const arms = db
    .prepare(
      `SELECT person_id, arm FROM campaign_sends
       WHERE campaign_id = ? AND suppressed_reason IS NULL`,
    )
    .all(id) as unknown as Array<{ person_id: string; arm: "treated" | "holdout" }>;

  const version = db
    .prepare(
      "SELECT menu_version_id FROM menu_versions WHERE org_id = ? ORDER BY version_no DESC LIMIT 1",
    )
    .get(session.orgId) as { menu_version_id: string } | undefined;

  const item = db
    .prepare("SELECT * FROM items WHERE org_id = ? AND is_available = 1 LIMIT 1")
    .get(session.orgId) as
    | { item_id: string; name: string; station: string; prep_seconds: number }
    | undefined;
  if (!item) {
    return NextResponse.json({ error: "No available items to simulate with" }, { status: 409 });
  }

  const insertOrder = db.prepare(
    `INSERT INTO orders (order_id, org_id, person_id, menu_version_id, channel, fulfillment,
       state, subtotal_cents, discount_cents, tax_cents, tip_cents, delivery_fee_cents,
       service_fee_cents, total_cents, points_earned, points_redeemed,
       guest_name, guest_phone, address, placed_at, promised_at, idempotency_key)
     VALUES (?, ?, ?, ?, 'marketplace', 'pickup', 'SETTLED', ?, 0, ?, 0, 0, 0, ?, 0, 0,
             'Simulated', '', '', ?, ?, ?)`,
  );
  const insertLine = db.prepare(
    `INSERT INTO order_items (order_id, line_no, item_id, name, qty, unit_price_cents,
       options_label, notes, station, prep_seconds, bumped_at)
     VALUES (?, 1, ?, ?, 1, ?, '', '', ?, ?, ?)`,
  );

  let treatedOrders = 0;
  let holdoutOrders = 0;
  const after = new Date(campaign.activatedAt).getTime() + 60_000;

  db.exec("BEGIN");
  try {
    for (const a of arms) {
      const rate = a.arm === "treated" ? baseRate + treatedLift : baseRate;
      if (Math.random() >= rate) continue;

      const placed = new Date(after + Math.floor(Math.random() * 3600_000)).toISOString();
      const tax = Math.round(ticketCents * 0.0875);
      const orderId = randomUUID();

      insertOrder.run(
        orderId, session.orgId, a.person_id, version?.menu_version_id ?? null,
        ticketCents, tax, ticketCents + tax, placed, placed, `sim-${orderId}`,
      );
      insertLine.run(orderId, item.item_id, item.name, ticketCents, item.station,
        item.prep_seconds, placed);

      if (a.arm === "treated") treatedOrders++;
      else holdoutOrders++;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  // The true incremental revenue we injected, for comparison with the estimate.
  const treatedN = arms.filter((a) => a.arm === "treated").length;
  const trueIncrementalCents = Math.round(treatedLift * ticketCents * treatedN);

  return NextResponse.json({
    ok: true,
    simulated: { treatedOrders, holdoutOrders, baseRate, treatedLift, ticketCents },
    trueIncrementalCents,
    measured: measure(session.orgId, id),
  });
}
