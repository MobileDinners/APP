"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import { STATE_LABELS } from "@/lib/state-labels";
import type { MenuItem, Order, OrderState, Restaurant } from "@/lib/types";
import { useLive } from "./useLive";
import { Elapsed, LiveDot, Remaining, StatePill } from "./ui";
import { SignOut } from "./SignOut";

/** Mirrors nextOperatorState on the server — the one-tap action per state. */
function nextState(state: OrderState, fulfillment: string): OrderState | null {
  switch (state) {
    case "CONFIRMED": return "ACCEPTED";
    case "ACCEPTED": return "IN_KITCHEN";
    case "IN_KITCHEN": return "READY";
    case "READY": return fulfillment === "delivery" ? "COURIER_ASSIGNED" : "AWAITING_PICKUP";
    case "COURIER_ASSIGNED": return "IN_TRANSIT";
    case "IN_TRANSIT": return "COMPLETED";
    case "AWAITING_PICKUP": return "COMPLETED";
    case "COMPLETED": return "SETTLED";
    default: return null;
  }
}

export function OpsClient({
  active,
  staff,
  isPlatformAdmin = false,
  orders,
  menu,
  stats,
}: {
  active: Restaurant;
  staff: { name: string; role: string };
  /** Platform staff only: edits the marketplace header and footer. */
  isPlatformAdmin?: boolean;
  orders: Order[];
  menu: MenuItem[];
  stats: {
    salesCents: number;
    orderCount: number;
    avgTicketCents: number;
    onTimePct: number;
  };
}) {
  const router = useRouter();
  const { connected } = useLive({ orgId: active.orgId });
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = orders.filter(
    (o) => !["SETTLED", "CANCELLED", "FAILED"].includes(o.state),
  );
  const closed = orders.filter((o) =>
    ["SETTLED", "CANCELLED", "FAILED"].includes(o.state),
  );
  const soldOut = menu.filter((m) => !m.isAvailable);

  async function advance(order: Order) {
    const to = nextState(order.state, order.fulfillment);
    if (!to) return;
    setBusy(order.orderId);
    setError(null);
    const res = await fetch(`/api/orders/${order.orderId}/transitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Could not update the order");
    }
    setBusy(null);
    startTransition(() => router.refresh());
  }

  async function toggleItem(item: MenuItem) {
    setBusy(item.itemId);
    await fetch("/api/menu/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.itemId, isAvailable: !item.isAvailable }),
    });
    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-[1.4rem] font-extrabold tracking-tight">
            {active.brandName}
          </h1>
          <span className="pill border-line-2 bg-card-2 text-ink-3 capitalize">
            {staff.role.replace("_", " ")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/ops/delivery"
            className="mono rounded-sm border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:border-line-2 hover:text-ink"
          >
            Delivery
          </Link>
          <Link
            href="/ops/payments"
            className="mono rounded-sm border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:border-line-2 hover:text-ink"
          >
            Payments
          </Link>
          <Link
            href="/ops/pos"
            className="mono rounded-sm border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:border-line-2 hover:text-ink"
          >
            POS
          </Link>
          <Link
            href="/ops/site"
            className="mono rounded-sm border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:border-line-2 hover:text-ink"
          >
            Website
          </Link>
          <Link
            href="/ops/upsell"
            className="mono rounded-sm border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:border-line-2 hover:text-ink"
          >
            Upsells
          </Link>
          <Link
            href="/ops/campaigns"
            className="mono rounded-sm border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:border-line-2 hover:text-ink"
          >
            Marketing
          </Link>
          <Link
            href="/ops/customers"
            className="mono rounded-sm border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:border-line-2 hover:text-ink"
          >
            Customers
          </Link>
          <Link
            href="/ops/optimizer"
            className="mono rounded-sm border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:border-line-2 hover:text-ink"
          >
            Optimizer
          </Link>
          <Link
            href="/ops/menu"
            className="mono rounded-sm border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:border-line-2 hover:text-ink"
          >
            Menu
          </Link>
          {/* Not a restaurant tool — this edits the marketplace chrome every
              restaurant's customers see, so only platform staff get the link
              and only they can open the page. */}
          {isPlatformAdmin && (
            <Link
              href="/ops/content"
              className="mono rounded-sm border border-brand px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-brand-strong hover:bg-brand-soft"
            >
              Site content
            </Link>
          )}
          <LiveDot connected={connected} />
          <SignOut name={staff.name} />
        </div>
      </div>

      {/* Needs-you block. Collapses to one calm line when nothing is wrong. */}
      <section
        className={`mb-5 rounded-md border p-3.5 ${
          soldOut.length > 0 ? "border-amber bg-amber-soft" : "border-line bg-card"
        }`}
      >
        <p className="label !text-ink-2 mb-1">Needs you</p>
        {soldOut.length === 0 ? (
          <p className="text-sm">
            <span className="text-green font-semibold">All clear.</span> Full menu available,
            no late tickets.
          </p>
        ) : (
          <p className="text-sm">
            <span className="font-semibold">{soldOut.length} items 86&rsquo;d</span> —{" "}
            {soldOut.map((m) => m.name).join(", ")}. They are hidden from the marketplace
            right now.
          </p>
        )}
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Sales" value={formatCents(stats.salesCents)} hint="Settled today" />
        <Metric label="Orders" value={String(stats.orderCount)} hint="Settled today" />
        <Metric
          label="Avg ticket"
          value={formatCents(stats.avgTicketCents)}
          hint="Subtotal per order today"
        />
        <Metric label="On time" value={`${stats.onTimePct}%`} hint="Against promise" />
      </section>

      {error && (
        <p className="mb-4 rounded-sm border border-red bg-red-soft px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="label mb-2.5 border-b border-line pb-1.5">
            Live orders &middot; {open.length}
          </h2>

          {open.length === 0 && (
            <div className="rounded-md border border-dashed border-line-2 p-8 text-center">
              <p className="text-ink-2 text-[15px]">
                No open orders. Place one from the{" "}
                <Link href="/" className="text-blue underline">
                  marketplace
                </Link>{" "}
                and it will appear here the moment it is paid for.
              </p>
            </div>
          )}

          <ul className="m-0 grid list-none gap-2.5 p-0">
            {open.map((order) => {
              const to = nextState(order.state, order.fulfillment);
              return (
                <li
                  key={order.orderId}
                  className="rounded-md border border-line bg-card p-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono text-sm font-semibold">
                          #{order.orderId.slice(0, 6)}
                        </span>
                        <StatePill state={order.state} />
                        <span className="pill border-line-2 bg-card-2 text-ink-3 capitalize">
                          {order.fulfillment}
                        </span>
                      </div>
                      <p className="label mt-1.5">
                        {order.guestName} &middot; placed{" "}
                        <Elapsed since={order.placedAt} /> ago
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num mono text-sm font-bold">
                        {formatCents(order.totalCents)}
                      </p>
                      <p className="label mt-0.5">
                        <Remaining until={order.promisedAt} />
                      </p>
                    </div>
                  </div>

                  <ul className="m-0 mt-2.5 list-none border-t border-line p-0 pt-2">
                    {order.lines.map((l) => (
                      <li key={l.lineNo} className="flex gap-2.5 py-0.5 text-[13px]">
                        <span className="num mono text-ink-3 w-6 shrink-0">{l.qty}&times;</span>
                        <span className="flex-1">
                          {l.name}
                          {l.optionsLabel && (
                            <span className="text-ink-3"> &middot; {l.optionsLabel}</span>
                          )}
                          {l.notes && (
                            <span className="text-brand-strong italic"> &ldquo;{l.notes}&rdquo;</span>
                          )}
                        </span>
                        <span className="pill border-line-2 bg-card-2 text-ink-3">
                          {l.station}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {to && (
                      <button
                        type="button"
                        onClick={() => advance(order)}
                        disabled={busy === order.orderId || pending}
                        className="rounded-sm bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        {busy === order.orderId ? "Working…" : `Mark ${STATE_LABELS[to].toLowerCase()}`}
                      </button>
                    )}
                    <Link
                      href={`/track/${order.orderId}`}
                      className="rounded-sm border border-line px-3.5 py-1.5 text-[13px] font-semibold hover:border-line-2"
                    >
                      Guest view
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>

          {closed.length > 0 && (
            <>
              <h2 className="label mt-7 mb-2.5 border-b border-line pb-1.5">
                Closed &middot; {closed.length}
              </h2>
              <ul className="m-0 list-none p-0">
                {closed.map((o) => (
                  <li
                    key={o.orderId}
                    className="flex items-center gap-3 border-b border-line py-2 text-[13px]"
                  >
                    <span className="mono text-ink-3">#{o.orderId.slice(0, 6)}</span>
                    <StatePill state={o.state} />
                    <span className="text-ink-2 flex-1 truncate">
                      {o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                    </span>
                    <span className="num mono font-semibold">{formatCents(o.totalCents)}</span>
                    {o.pointsEarned > 0 && o.state === "SETTLED" && (
                      <span className="num mono text-green text-xs">+{o.pointsEarned} pts</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside>
          <h2 className="label mb-2.5 border-b border-line pb-1.5">
            Menu availability
          </h2>
          <p className="text-ink-2 mb-3 text-[14px] leading-snug">
            86 an item and it disappears from the marketplace immediately &mdash; open the feed
            in another tab and watch.
          </p>
          <ul className="m-0 list-none p-0">
            {menu.map((item) => (
              <li
                key={item.itemId}
                className="flex items-center gap-2 border-b border-line py-1.5"
              >
                <span
                  className={`flex-1 text-[13px] ${
                    item.isAvailable ? "" : "text-ink-3 line-through"
                  }`}
                >
                  {item.name}
                </span>
                <button
                  type="button"
                  onClick={() => toggleItem(item)}
                  disabled={busy === item.itemId}
                  className={`pill ${
                    item.isAvailable
                      ? "border-line-2 bg-card-2 text-ink-3 hover:border-red hover:text-red"
                      : "border-red bg-red-soft text-red"
                  } disabled:opacity-50`}
                >
                  {item.isAvailable ? "86 it" : "Bring back"}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-md border border-line bg-card p-3.5">
      <p className="label">{label}</p>
      <p className="num mt-1 text-[1.6rem] font-extrabold leading-none tracking-tight">
        {value}
      </p>
      <p className="text-ink-3 mt-1.5 text-[13px]">{hint}</p>
    </div>
  );
}
