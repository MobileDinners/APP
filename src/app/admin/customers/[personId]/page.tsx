import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCents } from "@/lib/money";
import { customerEngagement, listAllOrders, listCustomers } from "@/lib/admin";
import { getWallet } from "@/lib/orders";
import { getDb } from "@/lib/db";
import { Chip, Panel, Stat, TableWrap, Td, Th, shortDate } from "@/components/admin/AdminUI";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;

  const row = getDb()
    .prepare(
      `SELECT person_id, display_name, phone_e164, email, created_at,
              marketing_sms, marketing_email, consent_at, opted_out_at
         FROM persons WHERE person_id = ?`,
    )
    .get(personId) as Record<string, unknown> | undefined;
  if (!row) notFound();

  const wallet = getWallet(personId);
  const orders = listAllOrders({ limit: 100 });
  const mine = orders.rows.filter((o) => o.personId === personId);
  const sends = customerEngagement(personId);

  // The list query already computes spend; reuse it rather than a second sum.
  const summary = listCustomers({ q: String(row.phone_e164 ?? ""), limit: 1 }).rows[0];

  const deliveries = mine.filter((o) => o.fulfillment === "delivery");

  return (
    <>
      <p className="text-[13px] text-ink-3">
        <Link href="/admin/customers" className="font-semibold hover:text-ink hover:underline">
          Customers
        </Link>{" "}
        / {String(row.display_name ?? personId)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">
          {String(row.display_name ?? "—")}
        </h1>
        {row.opted_out_at ? (
          <Chip tone="bad">opted out of marketing</Chip>
        ) : (
          <>
            {row.marketing_sms === 1 && <Chip tone="good">sms</Chip>}
            {row.marketing_email === 1 && <Chip tone="good">email</Chip>}
          </>
        )}
      </div>
      <p className="num mt-1 text-[13px] text-ink-3">
        {String(row.phone_e164 ?? "")}
        {row.email ? ` · ${String(row.email)}` : ""} · joined{" "}
        {shortDate(String(row.created_at))}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Orders" value={String(summary?.orders ?? mine.length)} />
        <Stat label="Lifetime spend" value={formatCents(summary?.spendCents ?? 0)} />
        <Stat
          label="Points balance"
          value={wallet.pointsBalance.toLocaleString()}
          sub={`worth ${formatCents(wallet.pointsBalance)}`}
        />
        <Stat label="Tier" value={wallet.tier} sub={`${wallet.ordersCount} lifetime orders`} />
      </div>

      <Panel title="Order history" hint="Most recent 100 orders across the platform.">
        <TableWrap>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Restaurant</Th>
              <Th>Placed</Th>
              <Th>State</Th>
              <Th>Fulfilment</Th>
              <Th right>Total</Th>
            </tr>
          </thead>
          <tbody>
            {mine.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                  No orders in the last 100 placed platform-wide.
                </td>
              </tr>
            ) : (
              mine.map((o) => (
                <tr key={o.orderId}>
                  <Td mono>{o.orderId.slice(-8)}</Td>
                  <Td>{o.brandName}</Td>
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
              ))
            )}
          </tbody>
        </TableWrap>
        <p className="mt-2 text-[12.5px] text-ink-3">
          {deliveries.length} of these were delivery orders.
        </p>
      </Panel>

      <Panel
        title="Messaging history"
        hint="Every campaign this customer was included in, and why any were suppressed."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Campaign</Th>
              <Th>Channel</Th>
              <Th>Arm</Th>
              <Th>Sent</Th>
              <Th>Outcome</Th>
            </tr>
          </thead>
          <tbody>
            {sends.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                  This customer has never been messaged.
                </td>
              </tr>
            ) : (
              sends.map((s, i) => (
                <tr key={i}>
                  <Td>{s.name}</Td>
                  <Td>{s.channel}</Td>
                  <Td>
                    <Chip tone={s.arm === "holdout" ? "info" : "plain"}>{s.arm}</Chip>
                  </Td>
                  <Td mono>{shortDate(s.sent_at)}</Td>
                  <Td>
                    {s.suppressed_reason ? (
                      <Chip tone="warn">{s.suppressed_reason}</Chip>
                    ) : (
                      <Chip tone="good">sent</Chip>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Panel>
    </>
  );
}
