import Link from "next/link";
import { formatCents } from "@/lib/money";
import { listMerchants } from "@/lib/admin";
import { PLANS } from "@/lib/billing";
import { Chip, Panel, Stat, TableWrap, Td, Th, timeAgo } from "@/components/admin/AdminUI";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Merchants" };

export default function MerchantsPage() {
  const rows = listMerchants();
  const mrr = rows.reduce((n, r) => n + r.mrrCents, 0);
  const live = rows.filter((r) => r.acceptingOrders).length;
  const noPlan = rows.filter((r) => !r.plan).length;
  const posConnected = rows.filter((r) => r.posProvider).length;

  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">Merchants</h1>
      <p className="mt-1 text-[14px] text-ink-3">
        Every restaurant on the platform, with its plan, POS and payout state.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Restaurants" value={String(rows.length)} sub={`${live} accepting orders`} />
        <Stat label="Combined MRR" value={formatCents(mrr)} tone="good" />
        <Stat
          label="Without a plan"
          value={String(noPlan)}
          sub={noPlan ? "signed up but never subscribed" : "everyone is on a plan"}
          tone={noPlan > 0 ? "warn" : "good"}
        />
        <Stat label="POS connected" value={`${posConnected}/${rows.length}`} />
      </div>

      <Panel title="All merchants" hint="Click a row for the full record.">
        <TableWrap>
          <thead>
            <tr>
              <Th>Restaurant</Th>
              <Th>Plan</Th>
              <Th right>MRR</Th>
              <Th>Marketplace</Th>
              <Th>POS</Th>
              <Th>Payouts</Th>
              <Th>Menu</Th>
              <Th right>Orders</Th>
              <Th right>GMV</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.orgId} className="hover:bg-card-2">
                <Td>
                  <Link
                    href={`/admin/merchants/${m.orgId}`}
                    className="font-bold hover:text-brand-strong hover:underline"
                  >
                    {m.brandName}
                  </Link>
                  <span className="block text-[12px] text-ink-3">{m.cuisine}</span>
                </Td>
                <Td>
                  {m.plan ? (
                    <>
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
                      <span className="ml-1.5 text-[12.5px] font-semibold">
                        {PLANS[m.plan as keyof typeof PLANS]?.label ?? m.plan}
                      </span>
                    </>
                  ) : (
                    <Chip tone="warn">no plan</Chip>
                  )}
                </Td>
                <Td right mono>
                  {m.mrrCents ? formatCents(m.mrrCents) : "—"}
                </Td>
                <Td>
                  {m.acceptingOrders ? (
                    <Chip tone="good">visible</Chip>
                  ) : (
                    <Chip tone="bad">hidden</Chip>
                  )}
                  {m.isSponsored && (
                    <span className="ml-1.5">
                      <Chip tone="info">featured</Chip>
                    </span>
                  )}
                </Td>
                <Td>
                  {m.posProvider ? (
                    <>
                      <Chip tone={m.posStatus === "connected" ? "good" : "bad"}>
                        {m.posProvider}
                      </Chip>
                      <span className="block text-[11.5px] text-ink-3">
                        synced {timeAgo(m.posLastSyncAt)}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </Td>
                <Td>
                  {!m.stripeAccountId ? (
                    <Chip tone="warn">not connected</Chip>
                  ) : m.chargesEnabled && m.payoutsEnabled ? (
                    <Chip tone="good">enabled</Chip>
                  ) : (
                    <Chip tone="bad">
                      {m.chargesEnabled ? "payouts off" : "charges off"}
                    </Chip>
                  )}
                </Td>
                <Td mono>
                  {m.menuItems} item{m.menuItems === 1 ? "" : "s"}
                  <span className="block text-[11.5px] text-ink-3">
                    {m.publishedVersion === null ? "unpublished" : `v${m.publishedVersion}`}
                  </span>
                </Td>
                <Td right mono>
                  {m.orders.toLocaleString()}
                </Td>
                <Td right mono>
                  {formatCents(m.gmvCents)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
    </>
  );
}
