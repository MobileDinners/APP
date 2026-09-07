import Link from "next/link";
import { formatCents } from "@/lib/money";
import { engagementSummary, ordersByDay, orderStateCounts, overview, posPushHealth } from "@/lib/admin";
import { billingTotals } from "@/lib/billing";
import { BarChart, Chip, MetricStat, Panel, Stat, TableWrap, Td, Th, timeAgo } from "@/components/admin/AdminUI";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin — Mobile Dinners" };

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function AdminHome() {
  const o = overview();
  const days = ordersByDay(14);
  const months = billingTotals(12);
  const states = orderStateCounts();
  const push = posPushHealth();
  const eng = engagementSummary();

  const pushFailed = push.find((p) => p.status === "failed")?.n ?? 0;
  const pushPending = push.find((p) => p.status === "pending")?.n ?? 0;

  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">Platform overview</h1>
      <p className="mt-1 text-[14px] text-ink-3">
        Every restaurant, customer and order on Mobile Dinners.
      </p>

      {/* ------------------------------------------------------- headline */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Monthly recurring revenue"
          value={formatCents(o.mrr.mrrCents)}
          sub={`${o.mrr.counts.active} active · ${o.mrr.counts.past_due} past due · ${o.mrr.counts.trialing} trialing (excluded)`}
          tone="good"
          href="/admin/billing"
        />
        <Stat
          label="Annual run rate"
          value={formatCents(o.mrr.arrCents)}
          sub="MRR × 12, at today's committed subscriptions"
          href="/admin/billing"
        />
        <Stat
          label="Restaurants"
          value={String(o.restaurants)}
          sub={`${o.restaurantsAccepting} accepting orders · ${o.newMerchants30d} new in 30d`}
          href="/admin/merchants"
        />
        <Stat
          label="Customers"
          value={o.customers.toLocaleString()}
          sub={`${o.newCustomers30d.toLocaleString()} new in 30 days`}
          href="/admin/customers"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Orders, all time"
          value={o.orders.toLocaleString()}
          sub={`${o.ordersToday.toLocaleString()} placed today`}
          href="/admin/orders"
        />
        <Stat
          label="Gross merchandise value"
          value={formatCents(o.gmvCents)}
          sub="What diners paid on completed orders — not platform revenue"
        />
        <MetricStat
          label="Delivery success rate"
          metric={o.deliverySuccess}
          render={(v) => ({
            value: pct(v.rate),
            sub: `${v.delivered} of ${v.attempted} trips delivered`,
            tone: v.rate >= 0.95 ? "good" : v.rate >= 0.85 ? "warn" : "bad",
          })}
        />
        <MetricStat
          label="POS connections"
          metric={o.posSync}
          render={(v) => ({
            value: `${v.ok}/${v.connected}`,
            sub: `last sync ${timeAgo(v.lastSyncAt)}${v.failing ? ` · ${v.failing} failing` : ""}`,
            tone: v.failing === 0 ? "good" : "bad",
          })}
        />
      </div>

      {/* --------------------------------------------------------- charts */}
      <div className="mt-7 grid gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 text-[17px] font-extrabold tracking-[-0.02em]">
            Orders, last 14 days
          </h2>
          {days.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-line-2 bg-card-2 p-6 text-center text-[13.5px] text-ink-3">
              No orders in the last 14 days.
            </p>
          ) : (
            <BarChart
              data={days.map((d) => ({ label: d.day.slice(5), value: d.orders }))}
              format={(n) => String(n)}
            />
          )}
        </div>

        <div>
          <h2 className="mb-3 text-[17px] font-extrabold tracking-[-0.02em]">
            Subscription revenue collected, by month
          </h2>
          {months.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-line-2 bg-card-2 p-6 text-center text-[13.5px] text-ink-3">
              No invoices yet.
            </p>
          ) : (
            <BarChart
              data={months.map((m) => ({ label: m.month.slice(2), value: m.collectedCents }))}
              format={(n) => `$${Math.round(n / 100)}`}
            />
          )}
        </div>
      </div>

      {/* ------------------------------------------------ needs attention */}
      <Panel
        title="Needs attention"
        hint="Only the things that are actually wrong. An empty list here is the goal."
      >
        <div className="grid gap-2">
          {o.mrr.counts.past_due > 0 && (
            <Alert tone="bad" href="/admin/billing?status=failed">
              {o.mrr.counts.past_due} subscription
              {o.mrr.counts.past_due === 1 ? " is" : "s are"} past due —{" "}
              {formatCents(o.mrr.pastDueCents)} of MRR at risk.
            </Alert>
          )}
          {pushFailed > 0 && (
            <Alert tone="bad" href="/admin/orders">
              {pushFailed} order{pushFailed === 1 ? "" : "s"} failed to reach a restaurant&apos;s
              POS. Those tickets did not print.
            </Alert>
          )}
          {pushPending > 0 && (
            <Alert tone="warn" href="/admin/orders">
              {pushPending} POS push{pushPending === 1 ? "" : "es"} still pending.
            </Alert>
          )}
          {!o.posSync.available && (
            <Alert tone="warn" href="/admin/merchants">
              {o.posSync.reason}
            </Alert>
          )}
          {!o.deliverySuccess.available && (
            <Alert tone="warn" href="/admin/delivery">
              {o.deliverySuccess.reason}
            </Alert>
          )}
          {o.restaurants - o.restaurantsAccepting > 0 && (
            <Alert tone="warn" href="/admin/merchants">
              {o.restaurants - o.restaurantsAccepting} restaurant
              {o.restaurants - o.restaurantsAccepting === 1 ? " is" : "s are"} not accepting
              orders.
            </Alert>
          )}
        </div>
      </Panel>

      {/* ----------------------------------------------------- breakdowns */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Orders by state" hint="Every order ever placed, folded from its events.">
          <TableWrap>
            <thead>
              <tr>
                <Th>State</Th>
                <Th right>Orders</Th>
                <Th right>Share</Th>
              </tr>
            </thead>
            <tbody>
              {states.map((s) => (
                <tr key={s.state}>
                  <Td>
                    <Chip
                      tone={
                        s.state === "SETTLED" || s.state === "COMPLETED"
                          ? "good"
                          : s.state === "CANCELLED" || s.state === "FAILED"
                            ? "bad"
                            : "plain"
                      }
                    >
                      {s.state}
                    </Chip>
                  </Td>
                  <Td right mono>
                    {s.n.toLocaleString()}
                  </Td>
                  <Td right mono>
                    {o.orders ? pct(s.n / o.orders) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>

        <Panel title="Marketing reach" hint="Campaign delivery and consent, platform-wide.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Campaigns" value={String(eng.campaigns)} />
            <Stat label="Messages sent" value={eng.sends.toLocaleString()} />
            <Stat
              label="Suppressed"
              value={eng.suppressed.toLocaleString()}
              sub="frequency cap or consent"
              tone={eng.suppressed > 0 ? "warn" : "plain"}
            />
            <Stat label="SMS opt-in" value={eng.smsOptIn.toLocaleString()} />
            <Stat label="Email opt-in" value={eng.emailOptIn.toLocaleString()} />
            <Stat
              label="Opted out"
              value={eng.optedOut.toLocaleString()}
              tone={eng.optedOut > 0 ? "warn" : "plain"}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}

function Alert({
  tone,
  href,
  children,
}: {
  tone: "warn" | "bad";
  href: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "bad"
      ? "border-red bg-red-soft text-red"
      : "border-amber bg-amber-soft text-amber";
  return (
    <Link
      href={href}
      className={`block rounded-[10px] border px-4 py-3 text-[13.5px] font-semibold leading-snug ${cls} hover:underline`}
    >
      {children}
    </Link>
  );
}
