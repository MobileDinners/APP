import Link from "next/link";
import { formatCents } from "@/lib/money";
import { listMerchants, paymentsSummary, paymentWebhookLog } from "@/lib/admin";
import { billingTotals, computeMrr, listInvoices, PLANS } from "@/lib/billing";
import {
  BarChart, Chip, MetricStat, Panel, Stat, TableWrap, Td, Th, shortDate, timeAgo,
} from "@/components/admin/AdminUI";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments & billing — Admin" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status as "paid" | "failed" | "refunded" | "open" | undefined;

  const mrr = computeMrr();
  const months = billingTotals(12);
  const invoices = listInvoices({ status, limit: 200 });
  const merchants = listMerchants();
  const orderPayments = paymentsSummary();
  const hooks = paymentWebhookLog(25);

  const byOrg = new Map(merchants.map((m) => [m.orgId, m.brandName]));

  const collected12 = months.reduce((n, m) => n + m.collectedCents, 0);
  const failedAll = listInvoices({ status: "failed", limit: 500 });
  const refundedTotal = listInvoices({ limit: 500 }).reduce((n, i) => n + i.refundedCents, 0);

  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">Payments &amp; billing</h1>
      <p className="mt-1 text-[14px] text-ink-3">
        Subscriptions are the platform&apos;s revenue — Mobile Dinners takes 0% of a ticket.
      </p>

      {/* ------------------------------------------------------------ MRR */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="MRR"
          value={formatCents(mrr.mrrCents)}
          sub={`${mrr.counts.active} active + ${mrr.counts.past_due} past due`}
          tone="good"
        />
        <Stat label="ARR" value={formatCents(mrr.arrCents)} sub="MRR × 12" />
        <Stat
          label="At risk"
          value={formatCents(mrr.pastDueCents)}
          sub="past due — card failed, contract alive"
          tone={mrr.pastDueCents > 0 ? "bad" : "plain"}
        />
        <Stat
          label="In trial"
          value={formatCents(mrr.trialingCents)}
          sub={`${mrr.counts.trialing} restaurant(s) — NOT counted in MRR`}
          tone="plain"
        />
      </div>

      <Panel
        title="Collected by month"
        hint="Net of refunds. Twelve trailing months of subscription invoices."
      >
        {months.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-line-2 bg-card-2 p-6 text-center text-[13.5px] text-ink-3">
            No invoices yet.
          </p>
        ) : (
          <>
            <BarChart
              data={months.map((m) => ({ label: m.month.slice(2), value: m.collectedCents }))}
              format={(n) => `$${Math.round(n / 100)}`}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Stat label="Collected, 12 months" value={formatCents(collected12)} tone="good" />
              <Stat
                label="Failed attempts"
                value={String(failedAll.length)}
                sub={formatCents(failedAll.reduce((n, i) => n + i.amountCents, 0))}
                tone={failedAll.length ? "bad" : "plain"}
              />
              <Stat label="Refunded" value={formatCents(refundedTotal)} />
            </div>
          </>
        )}
      </Panel>

      {/* -------------------------------------------------- subscriptions */}
      <Panel title="Subscriptions" hint="One per restaurant. Price is the monthly equivalent.">
        <TableWrap>
          <thead>
            <tr>
              <Th>Restaurant</Th>
              <Th>Plan</Th>
              <Th>Status</Th>
              <Th right>Monthly</Th>
              <Th right>Counts toward MRR</Th>
            </tr>
          </thead>
          <tbody>
            {merchants.map((m) => (
              <tr key={m.orgId}>
                <Td>
                  <Link
                    href={`/admin/merchants/${m.orgId}`}
                    className="font-bold hover:text-brand-strong hover:underline"
                  >
                    {m.brandName}
                  </Link>
                </Td>
                <Td>
                  {m.plan ? (PLANS[m.plan as keyof typeof PLANS]?.label ?? m.plan) : "—"}
                </Td>
                <Td>
                  {m.subStatus ? (
                    <Chip
                      tone={
                        m.subStatus === "active"
                          ? "good"
                          : m.subStatus === "past_due"
                            ? "bad"
                            : m.subStatus === "trialing"
                              ? "info"
                              : "plain"
                      }
                    >
                      {m.subStatus}
                    </Chip>
                  ) : (
                    <Chip tone="warn">no plan</Chip>
                  )}
                </Td>
                <Td right mono>{m.mrrCents ? formatCents(m.mrrCents) : "—"}</Td>
                <Td right>
                  {m.mrrCents ? (
                    <Chip tone="good">yes</Chip>
                  ) : (
                    <span className="text-[12.5px] text-ink-3">no</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>

      {/* ------------------------------------------------------- invoices */}
      <Panel
        title="Invoices"
        hint={status ? `Filtered to ${status}.` : "Newest first, across every restaurant."}
        action={
          <div className="flex gap-2 text-[13px]">
            {["", "paid", "failed", "refunded"].map((s) => (
              <Link
                key={s || "all"}
                href={s ? `/admin/billing?status=${s}` : "/admin/billing"}
                className={`rounded-full border px-3 py-1 font-bold ${
                  (status ?? "") === s
                    ? "border-ink bg-ink text-bg"
                    : "border-line-2 text-ink-2 hover:bg-card-2"
                }`}
              >
                {s || "All"}
              </Link>
            ))}
          </div>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Restaurant</Th>
              <Th>Period</Th>
              <Th>Status</Th>
              <Th right>Amount</Th>
              <Th right>Refunded</Th>
              <Th>Failure reason</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                  No invoices{status ? ` with status “${status}”` : ""}.
                </td>
              </tr>
            ) : (
              invoices.map((i) => (
                <tr key={i.invoiceId}>
                  <Td mono>{i.invoiceId.slice(-8)}</Td>
                  <Td>
                    <Link
                      href={`/admin/merchants/${i.orgId}`}
                      className="hover:text-brand-strong hover:underline"
                    >
                      {byOrg.get(i.orgId) ?? i.orgId}
                    </Link>
                  </Td>
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

      {/* ------------------------------------------- order-level payments */}
      <Panel
        title="Order payments"
        hint="Card charges on diner orders — a different thing from subscriptions."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricStat
            label="Charges taken"
            metric={orderPayments}
            render={(v) => ({ value: v.count.toLocaleString(), sub: formatCents(v.chargedCents) })}
          />
          <MetricStat
            label="Platform share"
            metric={orderPayments}
            render={(v) => ({ value: formatCents(v.platformCents), tone: "good" })}
          />
          <MetricStat
            label="Refunded"
            metric={orderPayments}
            render={(v) => ({ value: formatCents(v.refundedCents) })}
          />
          <MetricStat
            label="Failed charges"
            metric={orderPayments}
            render={(v) => ({ value: String(v.failed), tone: v.failed ? "bad" : "plain" })}
          />
        </div>
      </Panel>

      <Panel title="Stripe webhook log" hint="Signed events we have accepted from Stripe.">
        <TableWrap>
          <thead>
            <tr>
              <Th>Received</Th>
              <Th>Provider</Th>
              <Th>Event</Th>
              <Th>Intent</Th>
              <Th>Order</Th>
            </tr>
          </thead>
          <tbody>
            {hooks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                  No webhook has ever arrived. Stripe is not connected — set
                  STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, and point an endpoint at
                  /api/payments/webhook.
                </td>
              </tr>
            ) : (
              hooks.map((h) => (
                <tr key={h.event_id}>
                  <Td mono>{timeAgo(h.received_at)}</Td>
                  <Td>{h.provider}</Td>
                  <Td mono>{h.event_type}</Td>
                  <Td mono>{h.intent_id ?? "—"}</Td>
                  <Td mono>{h.order_id ? h.order_id.slice(-8) : "—"}</Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Panel>
    </>
  );
}
