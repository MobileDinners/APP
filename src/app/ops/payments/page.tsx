import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getRestaurantById } from "@/lib/orders";
import { stripeMode } from "@/lib/payments";
import { getConnectState, type PaymentRow } from "@/lib/payments/store";
import { PaymentsPanel } from "@/components/PaymentsPanel";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/payments");

  const org = getRestaurantById(session.orgId);
  if (!org) redirect("/staff/login");

  const state = getConnectState(session.orgId);

  // node:sqlite hands back null-prototype rows, which React refuses to pass to
  // a client component — map them into plain object literals.
  const rows = getDb()
    .prepare(
      `SELECT payment_id, order_id, org_id, provider, intent_id, status,
              charge_cents, restaurant_cents, platform_cents, tip_cents,
              refunded_cents, failure_reason, created_at, updated_at
         FROM payments WHERE org_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(session.orgId) as Array<Record<string, string | number | null>>;

  const payments: PaymentRow[] = rows.map((r) => ({
    paymentId: String(r.payment_id),
    orderId: String(r.order_id),
    orgId: String(r.org_id),
    provider: String(r.provider),
    intentId: String(r.intent_id),
    status: String(r.status) as PaymentRow["status"],
    chargeCents: Number(r.charge_cents),
    restaurantCents: Number(r.restaurant_cents),
    platformCents: Number(r.platform_cents),
    tipCents: Number(r.tip_cents),
    refundedCents: Number(r.refunded_cents),
    failureReason: r.failure_reason === null ? null : String(r.failure_reason),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));

  const settled = payments.filter((p) => p.status === "succeeded");
  const totals = {
    gross: settled.reduce((n, p) => n + p.chargeCents, 0),
    net: settled.reduce((n, p) => n + p.restaurantCents, 0),
    processing: settled.reduce(
      (n, p) => n + (p.chargeCents - p.restaurantCents - p.platformCents - p.tipCents),
      0,
    ),
    refunded: payments.reduce((n, p) => n + p.refundedCents, 0),
  };

  return (
    <PaymentsPanel
      view={{
        brandName: org.brandName,
        accountId: state.accountId,
        chargesEnabled: state.chargesEnabled,
        payoutsEnabled: state.payoutsEnabled,
        mode: stripeMode(),
        isOwner: session.role === "owner",
        staffName: session.name,
        payments,
        totals,
      }}
    />
  );
}
