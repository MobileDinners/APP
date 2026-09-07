import Link from "next/link";
import { formatCents } from "@/lib/money";
import { listAllOrders, listMerchants, orderStateCounts, posPushHealth } from "@/lib/admin";
import { Chip, Panel, Stat, TableWrap, Td, Th, shortDate } from "@/components/admin/AdminUI";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders — Admin" };

const PAGE = 50;

const TERMINAL_GOOD = new Set(["COMPLETED", "SETTLED"]);
const TERMINAL_BAD = new Set(["CANCELLED", "FAILED"]);

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; orgId?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const state = sp.state?.trim() || undefined;
  const orgId = sp.orgId?.trim() || undefined;
  const q = sp.q?.trim() || undefined;

  const { rows, total } = listAllOrders({
    state,
    orgId,
    q,
    limit: PAGE,
    offset: (page - 1) * PAGE,
  });
  const states = orderStateCounts();
  const merchants = listMerchants();
  const push = posPushHealth();
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const params = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ state, orgId, q, ...over })) {
      if (v) p.set(k, v);
    }
    return `/admin/orders?${p}`;
  };

  const pushFailed = push.find((p) => p.status === "failed")?.n ?? 0;
  const pushPending = push.find((p) => p.status === "pending")?.n ?? 0;
  const pushed = push.find((p) => p.status === "pushed")?.n ?? 0;

  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">Orders</h1>
      <p className="mt-1 text-[14px] text-ink-3">
        Every order on the platform, with its payment, delivery and POS state.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Matching orders" value={total.toLocaleString()} />
        <Stat label="Pushed to a POS" value={pushed.toLocaleString()} tone="good" />
        <Stat
          label="POS push failed"
          value={pushFailed.toLocaleString()}
          sub={pushFailed ? "these tickets never printed" : undefined}
          tone={pushFailed ? "bad" : "plain"}
        />
        <Stat
          label="POS push pending"
          value={pushPending.toLocaleString()}
          tone={pushPending ? "warn" : "plain"}
        />
      </div>

      {/* --------------------------------------------------------- filters */}
      <Panel title="Filter">
        <div className="rounded-[12px] border border-line bg-card p-4">
          <form action="/admin/orders" className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
                Search
              </span>
              <input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Order id, name or phone"
                className="w-56 rounded-[8px] border border-line-2 bg-card px-3 py-2 text-[13.5px] outline-none focus:border-brand"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
                State
              </span>
              <select
                name="state"
                defaultValue={state ?? ""}
                className="rounded-[8px] border border-line-2 bg-card px-3 py-2 text-[13.5px] outline-none focus:border-brand"
              >
                <option value="">All states</option>
                {states.map((s) => (
                  <option key={s.state} value={s.state}>
                    {s.state} ({s.n.toLocaleString()})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
                Restaurant
              </span>
              <select
                name="orgId"
                defaultValue={orgId ?? ""}
                className="rounded-[8px] border border-line-2 bg-card px-3 py-2 text-[13.5px] outline-none focus:border-brand"
              >
                <option value="">All restaurants</option>
                {merchants.map((m) => (
                  <option key={m.orgId} value={m.orgId}>
                    {m.brandName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-[8px] bg-ink px-4 py-2 text-[13.5px] font-bold text-bg"
            >
              Apply
            </button>
            {(state || orgId || q) && (
              <Link
                href="/admin/orders"
                className="text-[13.5px] font-bold text-ink-3 hover:text-ink hover:underline"
              >
                Clear
              </Link>
            )}
          </form>
        </div>
      </Panel>

      <Panel title="Results">
        <TableWrap>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Restaurant</Th>
              <Th>Customer</Th>
              <Th>Placed</Th>
              <Th>State</Th>
              <Th>Payment</Th>
              <Th>Delivery</Th>
              <Th>POS</Th>
              <Th right>Total</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                  No orders match those filters.
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <tr key={o.orderId} className="hover:bg-card-2">
                  <Td mono>
                    <Link
                      href={`/admin/orders/${o.orderId}`}
                      className="font-bold hover:text-brand-strong hover:underline"
                    >
                      {o.orderId.slice(-8)}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/merchants/${o.orgId}`}
                      className="hover:text-brand-strong hover:underline"
                    >
                      {o.brandName}
                    </Link>
                  </Td>
                  <Td>
                    {o.personId ? (
                      <Link
                        href={`/admin/customers/${o.personId}`}
                        className="hover:text-brand-strong hover:underline"
                      >
                        {o.guestName || "—"}
                      </Link>
                    ) : (
                      o.guestName || "—"
                    )}
                    <span className="num block text-[11.5px] text-ink-3">{o.guestPhone}</span>
                  </Td>
                  <Td mono>{shortDate(o.placedAt)}</Td>
                  <Td>
                    <Chip
                      tone={
                        TERMINAL_GOOD.has(o.state)
                          ? "good"
                          : TERMINAL_BAD.has(o.state)
                            ? "bad"
                            : "plain"
                      }
                    >
                      {o.state}
                    </Chip>
                  </Td>
                  <Td>
                    {o.paymentStatus ? (
                      <Chip tone={o.paymentStatus === "succeeded" ? "good" : "bad"}>
                        {o.paymentStatus}
                      </Chip>
                    ) : (
                      <span className="text-[12px] text-ink-3">no record</span>
                    )}
                  </Td>
                  <Td>
                    {o.fulfillment === "pickup" ? (
                      <span className="text-[12px] text-ink-3">pickup</span>
                    ) : o.deliveryStatus ? (
                      <Chip tone={o.deliveryStatus === "delivered" ? "good" : "info"}>
                        {o.deliveryStatus}
                      </Chip>
                    ) : (
                      <span className="text-[12px] text-ink-3">not booked</span>
                    )}
                  </Td>
                  <Td>
                    {o.posPushStatus ? (
                      <Chip
                        tone={
                          o.posPushStatus === "pushed"
                            ? "good"
                            : o.posPushStatus === "failed"
                              ? "bad"
                              : "warn"
                        }
                      >
                        {o.posPushStatus}
                      </Chip>
                    ) : (
                      <span className="text-[12px] text-ink-3">—</span>
                    )}
                  </Td>
                  <Td right mono>{formatCents(o.totalCents)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>

        {pages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-[13.5px]">
            {page > 1 && (
              <Link
                href={params({ page: String(page - 1) })}
                className="font-bold hover:text-brand-strong hover:underline"
              >
                ← Previous
              </Link>
            )}
            <span className="num text-ink-3">
              Page {page} of {pages.toLocaleString()}
            </span>
            {page < pages && (
              <Link
                href={params({ page: String(page + 1) })}
                className="font-bold hover:text-brand-strong hover:underline"
              >
                Next →
              </Link>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
