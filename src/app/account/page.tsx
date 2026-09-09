import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { getAccount } from "@/lib/customer";
import { getWallet, listOrders, listRestaurants } from "@/lib/orders";
import { formatCents, pointsToCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Mobile Dinners Account" };

const TIERS = [
  { name: "bronze", orders: 0, perk: "1× points" },
  { name: "silver", orders: 12, perk: "1.25× points" },
  { name: "gold", orders: 24, perk: "1.5× points + early access" },
  { name: "platinum", orders: 48, perk: "2× points + priority prep" },
];

const DONE = new Set(["COMPLETED", "SETTLED"]);

/**
 * One page for everything a diner has with us: who they are, what they have
 * ordered, what those orders earned, and where they were delivered.
 *
 * Order history, points and delivery history all come from the same order
 * rows — they were never separate records, only separate questions asked of
 * the same table. Keeping them on one page is the difference between "my
 * account" and three unrelated screens.
 */
export default async function AccountPage() {
  const session = await getSession();
  if (session?.kind !== "person") redirect("/signin?next=/account");

  const account = getAccount(session.personId);
  const wallet = getWallet(session.personId);
  const orders = listOrders({ personId: session.personId, limit: 100 });
  const byOrg = new Map(listRestaurants({ includeHidden: true }).map((r) => [r.orgId, r]));

  const completed = orders.filter((o) => DONE.has(o.state));
  const lifetimeCents = completed.reduce((n, o) => n + o.totalCents, 0);
  const deliveries = orders.filter((o) => o.fulfillment === "delivery");
  const tierIndex = Math.max(0, TIERS.findIndex((t) => t.name === wallet.tier));
  const next = TIERS[tierIndex + 1];

  return (
    <main className="mx-auto max-w-[900px] px-4 py-8 md:px-6">
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">
        {account?.displayName || "Your account"}
      </h1>
      <p className="num mt-1 text-[13.5px] text-ink-3">
        {[account?.email, account?.phone].filter(Boolean).join(" · ") || "No contact details yet"}
      </p>

      {/* -------------------------------------------------------- headline */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Orders" value={String(completed.length)} />
        <Stat label="Lifetime spend" value={formatCents(lifetimeCents)} />
        <Stat
          label="Points"
          value={wallet.pointsBalance.toLocaleString()}
          sub={`worth ${formatCents(pointsToCents(wallet.pointsBalance))} off any order`}
        />
        <Stat label="Tier" value={wallet.tier} sub={TIERS[tierIndex]?.perk} />
      </div>

      {/* ---------------------------------------------------------- points */}
      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-[19px] font-extrabold tracking-[-0.02em]">Rewards</h2>
          <Link href="/rewards" className="text-[14px] font-extrabold text-brand-strong hover:underline">
            How points work
          </Link>
        </div>
        <div className="mt-3 rounded-[14px] border border-line bg-card p-5">
          {next ? (
            <>
              <p className="text-[14.5px]">
                <strong className="font-extrabold">
                  {next.orders - wallet.ordersCount} more order
                  {next.orders - wallet.ordersCount === 1 ? "" : "s"}
                </strong>{" "}
                to reach <span className="font-extrabold capitalize">{next.name}</span> — {next.perk}.
              </p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-card-2">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{
                    width: `${Math.min(100, Math.round((wallet.ordersCount / next.orders) * 100))}%`,
                  }}
                />
              </div>
              <p className="num mt-2 text-[12.5px] text-ink-3">
                {wallet.ordersCount} of {next.orders} orders
              </p>
            </>
          ) : (
            <p className="text-[14.5px]">
              You are <strong className="font-extrabold">platinum</strong> — the top tier. Every
              order earns 2× points.
            </p>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
            Points work at every restaurant on Mobile Dinners, not just the one that gave them
            to you. Redeem them at checkout.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- history */}
      <section className="mt-8">
        <h2 className="text-[19px] font-extrabold tracking-[-0.02em]">Order history</h2>
        {orders.length === 0 ? (
          <p className="mt-3 rounded-[14px] border border-dashed border-line-2 bg-card-2 p-6 text-center text-[14px] text-ink-3">
            No orders yet.{" "}
            <Link href="/restaurants" className="font-extrabold text-brand-strong hover:underline">
              Find something to eat →
            </Link>
          </p>
        ) : (
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {orders.map((o) => {
              const org = byOrg.get(o.orgId);
              return (
                <li key={o.orderId}>
                  <Link
                    href={`/track/${o.orderId}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-line bg-card px-4 py-3 transition-colors hover:border-line-2 hover:bg-card-2"
                  >
                    <span className="text-[15px] font-extrabold">
                      {org?.brandName ?? "Restaurant"}
                    </span>
                    <span className="num text-[13px] text-ink-3">
                      {new Date(o.placedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="rounded-full border border-line-2 bg-card-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-2">
                      {o.fulfillment}
                    </span>
                    {!DONE.has(o.state) && (
                      <span className="rounded-full border border-brand bg-brand-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-strong">
                        {o.state.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="num ml-auto text-[15px] font-extrabold">
                      {formatCents(o.totalCents)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* -------------------------------------------------------- delivery */}
      <section className="mt-8">
        <h2 className="text-[19px] font-extrabold tracking-[-0.02em]">Delivery history</h2>
        {deliveries.length === 0 ? (
          <p className="mt-3 rounded-[14px] border border-dashed border-line-2 bg-card-2 p-6 text-center text-[14px] text-ink-3">
            No deliveries yet — every order so far has been collected.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[14px] border border-line bg-card">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  <Th>Restaurant</Th>
                  <Th>Delivered to</Th>
                  <Th>When</Th>
                  <Th right>Delivery fee</Th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((o) => (
                  <tr key={o.orderId}>
                    <Td>{byOrg.get(o.orgId)?.brandName ?? "—"}</Td>
                    <Td>{o.address || "—"}</Td>
                    <Td mono>
                      {new Date(o.placedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </Td>
                    <Td right mono>
                      {formatCents(o.deliveryFeeCents)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-card p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-ink-3">{label}</p>
      <p className="num mt-1.5 text-[24px] font-extrabold capitalize leading-none tracking-[-0.03em]">
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{sub}</p>}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-3 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  mono,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={`border-b border-line px-3 py-2.5 ${right ? "text-right" : ""} ${mono ? "num" : ""}`}
    >
      {children}
    </td>
  );
}
