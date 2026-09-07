import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCents } from "@/lib/money";
import { getMerchant, listAllOrders, merchantInvoices, posSyncLog } from "@/lib/admin";
import { PLANS } from "@/lib/billing";
import { getRestaurantById } from "@/lib/orders";
import { Chip, Panel, Stat, TableWrap, Td, Th, shortDate, timeAgo } from "@/components/admin/AdminUI";
import { VisibilityToggle } from "@/components/admin/VisibilityToggle";

export const dynamic = "force-dynamic";

export default async function MerchantDetail({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const m = getMerchant(orgId);
  if (!m) notFound();

  const r = getRestaurantById(orgId);
  const invoices = merchantInvoices(orgId);
  const syncs = posSyncLog(orgId, 10);
  const recent = listAllOrders({ orgId, limit: 10 });

  const paid = invoices.filter((i) => i.status === "paid" || i.status === "refunded");
  const collected = paid.reduce((n, i) => n + i.amountCents - i.refundedCents, 0);
  const failed = invoices.filter((i) => i.status === "failed");

  return (
    <>
      <p className="text-[13px] text-ink-3">
        <Link href="/admin/merchants" className="font-semibold hover:text-ink hover:underline">
          Merchants
        </Link>{" "}
        / {m.brandName}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">{m.brandName}</h1>
        <Chip tone={m.acceptingOrders ? "good" : "bad"}>
          {m.acceptingOrders ? "visible" : "hidden"}
        </Chip>
        {m.isSponsored && <Chip tone="info">featured</Chip>}
        <Link
          href={`/r/${m.slug}`}
          target="_blank"
          className="text-[13.5px] font-extrabold text-brand-strong hover:underline"
        >
          View storefront →
        </Link>
      </div>
      <p className="mt-1 num text-[13px] text-ink-3">
        {m.orgId} · {r?.address ?? "no address"}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Plan"
          value={m.plan ? (PLANS[m.plan as keyof typeof PLANS]?.label ?? m.plan) : "None"}
          sub={m.subStatus ?? "never subscribed"}
          tone={m.subStatus === "active" ? "good" : m.subStatus === "past_due" ? "bad" : "plain"}
        />
        <Stat
          label="Contributes to MRR"
          value={m.mrrCents ? formatCents(m.mrrCents) : "—"}
          sub={m.subStatus === "trialing" ? "trial — not counted" : undefined}
        />
        <Stat label="Orders" value={m.orders.toLocaleString()} />
        <Stat label="GMV" value={formatCents(m.gmvCents)} sub="completed orders only" />
      </div>

      {/* ------------------------------------------------------- controls */}
      <Panel
        title="Marketplace visibility"
        hint="Hiding a restaurant removes it from the feed, search and its storefront immediately."
      >
        <VisibilityToggle
          orgId={m.orgId}
          brandName={m.brandName}
          accepting={m.acceptingOrders}
          sponsored={m.isSponsored}
        />
      </Panel>

      {/* ------------------------------------------------ integrations */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="POS connection" hint="Menu sync and order injection.">
          {!m.posProvider ? (
            <p className="rounded-[12px] border border-dashed border-line-2 bg-card-2 p-5 text-[13.5px] text-ink-3">
              No POS connected. This restaurant runs entirely on Mobile Dinners.
            </p>
          ) : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <Stat label="Provider" value={m.posProvider} />
                <Stat
                  label="Status"
                  value={m.posStatus ?? "unknown"}
                  tone={m.posStatus === "connected" ? "good" : "bad"}
                />
                <Stat label="Last sync" value={timeAgo(m.posLastSyncAt)} />
              </div>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th right>Created</Th>
                    <Th right>Updated</Th>
                    <Th right>Unchanged</Th>
                    <Th right>Flagged</Th>
                    <Th>Result</Th>
                  </tr>
                </thead>
                <tbody>
                  {syncs.map((s, i) => (
                    <tr key={i}>
                      <Td mono>{timeAgo(s.created_at)}</Td>
                      <Td right mono>{s.created}</Td>
                      <Td right mono>{s.updated}</Td>
                      <Td right mono>{s.unchanged}</Td>
                      <Td right mono>
                        {s.flagged > 0 ? (
                          <span className="font-bold text-amber">{s.flagged}</span>
                        ) : (
                          0
                        )}
                      </Td>
                      <Td>
                        {s.ok === 1 ? (
                          <Chip tone="good">ok</Chip>
                        ) : (
                          <Chip tone="bad">{s.error ?? "failed"}</Chip>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </>
          )}
        </Panel>

        <Panel title="Payouts" hint="Stripe Connect Express account for this restaurant.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Connected"
              value={m.stripeAccountId ? "Yes" : "No"}
              tone={m.stripeAccountId ? "good" : "warn"}
            />
            <Stat
              label="Charges"
              value={m.chargesEnabled ? "Enabled" : "Off"}
              tone={m.chargesEnabled ? "good" : "bad"}
            />
            <Stat
              label="Payouts"
              value={m.payoutsEnabled ? "Enabled" : "Off"}
              tone={m.payoutsEnabled ? "good" : "bad"}
            />
          </div>
          {m.stripeAccountId && (
            <p className="mt-3 num text-[12.5px] text-ink-3">account {m.stripeAccountId}</p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Delivery fee" value={formatCents(r?.deliveryFeeCents ?? 0)} sub="base, before distance" />
            <Stat label="Points multiplier" value={`${r?.pointsMultiplier ?? 1}×`} />
            <Stat label="Prep base" value={`${Math.round((r?.prepBaseSeconds ?? 0) / 60)} min`} />
          </div>
        </Panel>
      </div>

      {/* ---------------------------------------------- payment history */}
      <Panel
        title="Payment history"
        hint="Subscription invoices. This is what the restaurant pays us."
      >
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Collected" value={formatCents(collected)} tone="good" />
          <Stat
            label="Failed"
            value={String(failed.length)}
            tone={failed.length ? "bad" : "plain"}
          />
          <Stat
            label="Refunded"
            value={formatCents(invoices.reduce((n, i) => n + i.refundedCents, 0))}
          />
        </div>
        <TableWrap>
          <thead>
            <tr>
              <Th>Period</Th>
              <Th>Status</Th>
              <Th right>Amount</Th>
              <Th right>Refunded</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                  No invoices — this restaurant has never been billed.
                </td>
              </tr>
            ) : (
              invoices.map((i) => (
                <tr key={i.invoiceId}>
                  <Td mono>{shortDate(i.periodStart)}</Td>
                  <Td>
                    <Chip
                      tone={
                        i.status === "paid"
                          ? "good"
                          : i.status === "failed"
                            ? "bad"
                            : i.status === "refunded"
                              ? "warn"
                              : "plain"
                      }
                    >
                      {i.status}
                    </Chip>
                  </Td>
                  <Td right mono>{formatCents(i.amountCents)}</Td>
                  <Td right mono>{i.refundedCents ? formatCents(i.refundedCents) : "—"}</Td>
                  <Td>
                    <span className="text-[12.5px] text-ink-3">{i.failureReason ?? "—"}</span>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Panel>

      <Panel
        title="Recent orders"
        action={
          <Link
            href={`/admin/orders?orgId=${m.orgId}`}
            className="text-[13.5px] font-extrabold text-brand-strong hover:underline"
          >
            All {m.orders.toLocaleString()} orders →
          </Link>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Placed</Th>
              <Th>State</Th>
              <Th>Fulfilment</Th>
              <Th right>Total</Th>
            </tr>
          </thead>
          <tbody>
            {recent.rows.map((o) => (
              <tr key={o.orderId}>
                <Td mono>{o.orderId.slice(-8)}</Td>
                <Td mono>{shortDate(o.placedAt)}</Td>
                <Td>
                  <Chip
                    tone={
                      o.state === "SETTLED" || o.state === "COMPLETED"
                        ? "good"
                        : o.state === "CANCELLED" || o.state === "FAILED"
                          ? "bad"
                          : "plain"
                    }
                  >
                    {o.state}
                  </Chip>
                </Td>
                <Td>{o.fulfillment}</Td>
                <Td right mono>{formatCents(o.totalCents)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
    </>
  );
}
