"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Order, Restaurant, Station } from "@/lib/types";
import { useLive } from "./useLive";
import { Elapsed, LiveDot } from "./ui";
import { SignOut } from "./SignOut";

const STATIONS: (Station | "expo")[] = ["expo", "grill", "fry", "assembly", "cold", "bar"];

export function KdsClient({
  active,
  staff,
  orders,
  serverNow,
}: {
  active: Restaurant;
  staff: { name: string; role: string };
  orders: Order[];
  /** Render clock from the server, so the first client paint matches it. */
  serverNow: number;
}) {
  const router = useRouter();
  const { connected } = useLive({ orgId: active.orgId });
  const [, startTransition] = useTransition();
  const [station, setStation] = useState<Station | "expo">("expo");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Tickets waiting on the line — anything paid for and not yet handed off.
  const tickets = orders
    .filter((o) => ["CONFIRMED", "ACCEPTED", "IN_KITCHEN", "READY"].includes(o.state))
    .map((o) => ({
      ...o,
      lines:
        station === "expo" ? o.lines : o.lines.filter((l) => l.station === station),
    }))
    .filter((o) => o.lines.length > 0)
    .sort((a, b) => new Date(a.promisedAt).getTime() - new Date(b.promisedAt).getTime());

  const lateCount = tickets.filter(
    (t) => new Date(t.promisedAt).getTime() < now && t.state !== "READY",
  ).length;

  async function bump(orderId: string, lineNo: number) {
    setBusy(`${orderId}:${lineNo}`);
    await fetch("/api/kitchen/bump", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, lineNo }),
    });
    setBusy(null);
    startTransition(() => router.refresh());
  }

  async function bumpAll(order: Order) {
    setBusy(order.orderId);
    for (const line of order.lines.filter((l) => !l.bumpedAt)) {
      await fetch("/api/kitchen/bump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.orderId, lineNo: line.lineNo }),
      });
    }
    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <main className="min-h-[calc(100vh-45px)] bg-bg px-3 py-3 sm:px-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mono mr-1 text-[13px] font-bold">{active.brandName}</span>
          {STATIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStation(s)}
              className={`mono rounded-sm border px-3 py-1.5 text-[12px] uppercase tracking-[0.1em] ${
                station === s
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-card text-ink-3 hover:text-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <span className="label">
            {tickets.length} open
            {lateCount > 0 && (
              <span className="text-red font-semibold"> &middot; {lateCount} late</span>
            )}
          </span>
          <LiveDot connected={connected} />
          <SignOut name={staff.name} />
        </div>
      </div>


      {tickets.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-2 bg-card p-12 text-center">
          <p className="text-[1.1rem] font-semibold">Rail is clear</p>
          <p className="text-ink-2 mx-auto mt-2 max-w-[42ch] text-[15px]">
            Place an order from the{" "}
            <Link href="/" className="text-blue underline">
              marketplace
            </Link>{" "}
            and the ticket lands here in under a second &mdash; no refresh.
          </p>
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tickets.map((ticket) => {
            const promised = new Date(ticket.promisedAt).getTime();
            const secondsLeft = Math.round((promised - now) / 1000);
            const late = secondsLeft < 0;
            const warning = !late && secondsLeft < 120;
            const totalSeconds = Math.max(
              60,
              Math.round((promised - new Date(ticket.placedAt).getTime()) / 1000),
            );
            const pct = Math.max(
              0,
              Math.min(100, ((totalSeconds - secondsLeft) / totalSeconds) * 100),
            );
            const openLines = ticket.lines.filter((l) => !l.bumpedAt);

            return (
              <li
                key={ticket.orderId}
                className={`flex flex-col overflow-hidden rounded-md border-2 bg-card ${
                  late ? "border-red" : warning ? "border-amber" : "border-line"
                }`}
              >
                <header
                  className={`flex items-baseline justify-between gap-2 px-3 py-2 ${
                    late ? "bg-red-soft" : warning ? "bg-amber-soft" : "bg-card-2"
                  }`}
                >
                  <span className="mono text-[15px] font-bold">
                    #{ticket.orderId.slice(0, 6)}
                  </span>
                  <span className="mono num text-[13px] font-semibold">
                    <Elapsed since={ticket.placedAt} />
                  </span>
                </header>

                <div className="px-3 pb-1 pt-2">
                  <p className="label !text-[0.65rem]">
                    <span className="uppercase">{ticket.fulfillment}</span>
                    {late && (
                      <span className="text-red late-pulse font-bold"> &middot; LATE</span>
                    )}
                    {ticket.state === "READY" && (
                      <span className="text-green font-bold"> &middot; READY</span>
                    )}
                  </p>
                </div>

                <ul className="m-0 flex-1 list-none px-3 py-1">
                  {ticket.lines.map((line) => (
                    <li
                      key={line.lineNo}
                      className={`flex items-start gap-2 border-b border-line py-2 last:border-0 ${
                        line.bumpedAt ? "opacity-40" : ""
                      }`}
                    >
                      <span className="num mono w-6 shrink-0 text-[15px] font-bold">
                        {line.qty}&times;
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[15px] font-semibold leading-tight ${
                            line.bumpedAt ? "line-through" : ""
                          }`}
                        >
                          {line.name}
                        </p>
                        {line.optionsLabel && (
                          <p className="text-ink-2 mt-0.5 text-[13px] leading-tight">
                            {line.optionsLabel}
                          </p>
                        )}
                        {line.notes && (
                          <p className="text-brand-strong mt-0.5 text-[13px] font-semibold leading-tight">
                            &#9656; {line.notes}
                          </p>
                        )}
                      </div>
                      {!line.bumpedAt && (
                        <button
                          type="button"
                          onClick={() => bump(ticket.orderId, line.lineNo)}
                          disabled={busy === `${ticket.orderId}:${line.lineNo}`}
                          className="mono shrink-0 rounded-sm border border-line-2 px-2 py-1 text-[11px] uppercase tracking-wider hover:border-green hover:text-green disabled:opacity-40"
                        >
                          Bump
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="h-1.5 w-full bg-line">
                  <div
                    className={`h-full ${late ? "bg-red" : warning ? "bg-amber" : "bg-green"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => bumpAll(ticket)}
                  disabled={openLines.length === 0 || busy === ticket.orderId}
                  className="w-full bg-brand px-3 py-2.5 text-[13px] font-bold uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-3"
                >
                  {openLines.length === 0
                    ? "All bumped"
                    : busy === ticket.orderId
                      ? "Bumping…"
                      : `Bump all (${openLines.length})`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
