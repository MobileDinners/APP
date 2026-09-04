"use client";

import Link from "next/link";
import { formatCents } from "@/lib/money";
import type { AffinityPair, UpsellStats } from "@/lib/upsell-types";
import type { Restaurant } from "@/lib/types";
import { SignOut } from "./SignOut";

export function UpsellPerformance({
  active,
  staff,
  stats,
  pairs,
}: {
  active: Restaurant;
  staff: { name: string; role: string };
  stats: UpsellStats;
  pairs: AffinityPair[];
}) {
  const enoughData = stats.treatedOrders > 1 && stats.holdoutOrders > 1;

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-[1.4rem] font-extrabold tracking-tight">Upsells</h1>
          <span className="pill border-line-2 bg-card-2 text-ink-3">{active.brandName}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ops/site" className="label hover:text-ink">Website</Link>
          <Link href="/ops/campaigns" className="label hover:text-ink">Marketing</Link>
          <Link href="/ops/customers" className="label hover:text-ink">Customers</Link>
          <Link href="/ops" className="label hover:text-ink">Orders</Link>
          <SignOut name={staff.name} />
        </div>
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Shown" value={stats.impressions.toLocaleString()} hint="Suggestions displayed" />
        <Metric label="Added" value={stats.accepts.toLocaleString()} hint="Guests took one" />
        <Metric label="Attach rate" value={`${stats.attachRatePct}%`} hint="Added / shown" />
        <Metric
          label="Upsell revenue"
          value={formatCents(stats.upsellRevenueCents)}
          hint="Value of added items"
          accent
        />
      </section>

      <section className="mb-6 rounded-md border border-line bg-card p-4">
        <h2 className="text-[16px] font-extrabold">Did it actually raise the ticket?</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
          One in ten carts is shown no suggestions at all. Comparing average ticket between
          the two groups is the only way to know whether suggestions added spend or just
          rearranged it.
        </p>

        {!enoughData ? (
          <p className="mt-3 rounded-sm border border-amber bg-amber-soft px-3 py-2.5 text-[13px] text-amber">
            Not enough orders in both groups yet &mdash; {stats.treatedOrders} shown
            suggestions, {stats.holdoutOrders} held back. Any comparison right now would be
            noise.
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Saw suggestions" value={String(stats.treatedOrders)} hint="Orders" small />
              <Metric label="Held back" value={String(stats.holdoutOrders)} hint="Orders" small />
              <Metric
                label="Avg ticket (shown)"
                value={formatCents(stats.treatedAovCents)}
                hint="Subtotal"
                small
              />
              <Metric
                label="Avg ticket (held)"
                value={formatCents(stats.holdoutAovCents)}
                hint="Subtotal"
                small
              />
            </div>

            <div className="mt-3 rounded-sm bg-card-2 p-3">
              <p className="text-[14px] font-bold">
                Difference{" "}
                <span className={stats.aovLiftCents >= 0 ? "text-green" : "text-red"}>
                  {stats.aovLiftCents >= 0 ? "+" : ""}
                  {formatCents(stats.aovLiftCents)}
                </span>{" "}
                per order
              </p>
              <p className="mono mt-1 text-[12px] text-ink-2">
                95% interval {formatCents(stats.lowCents)} to {formatCents(stats.highCents)}
              </p>
              {!stats.significant && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-amber">
                  The interval crosses zero. Suggestions have not been shown to raise the
                  ticket &mdash; which is a real finding, not a missing number.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      <h2 className="label mb-2.5 border-b border-line pb-1.5">
        What actually goes together
      </h2>
      <p className="mb-3 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-2">
        Ranked by <span className="font-bold text-ink">lift</span>, not by how often two
        items appear together. Chips show up alongside everything, so raw co-occurrence
        would just recommend chips forever. Lift asks whether the second item is{" "}
        <em>more</em> likely when the first is in the cart than it is in general.
      </p>

      {pairs.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-2 p-8 text-center">
          <p className="text-[15px] font-semibold">No reliable pairs yet</p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[14px] text-ink-2">
            A pair needs at least 8 co-purchases before it is trusted. Run{" "}
            <code className="mono text-[13px]">npm run seed:history</code> for a demo
            dataset.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-card">
          <table className="w-full min-w-[34rem] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-2 bg-card-2 text-left">
                <th className="label px-3 py-2">In the cart</th>
                <th className="label px-3 py-2">Suggest</th>
                <th className="label px-3 py-2 text-right">Lift</th>
                <th className="label px-3 py-2 text-right">Co-purchases</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p) => (
                <tr
                  key={`${p.anchorId}-${p.targetId}`}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-3 py-2 font-semibold">{p.anchorName}</td>
                  <td className="px-3 py-2">{p.targetName}</td>
                  <td className="num mono px-3 py-2 text-right">
                    <span className={p.lift >= 1.2 ? "text-green font-bold" : "text-ink-2"}>
                      {p.lift.toFixed(2)}&times;
                    </span>
                  </td>
                  <td className="num mono px-3 py-2 text-right text-ink-2">{p.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-6 rounded-md border border-line bg-card p-4">
        <h2 className="text-[16px] font-extrabold">What is never suggested</h2>
        <ul className="mt-2 list-none space-y-1.5 p-0 text-[13px] leading-relaxed text-ink-2">
          <li>Anything 86&rsquo;d, checked at request time rather than trusted from the page.</li>
          <li>
            Anything that would push the ticket more than two minutes past what the kitchen
            is already committed to.
          </li>
          <li>A third item from a category the cart already has two of.</li>
          <li>
            Any pair with lift below 1 &mdash; that is a substitute, and suggesting it moves
            spend sideways instead of adding it.
          </li>
          <li>
            Margin is the <span className="font-bold text-ink">last</span> tiebreak, never the
            first. Leading with margin pushes the same expensive side onto every cart until
            guests stop looking.
          </li>
        </ul>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
  accent,
  small,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3.5 ${
        accent ? "border-green bg-green-soft" : "border-line bg-card"
      }`}
    >
      <p className="label">{label}</p>
      <p
        className={`num mt-1 font-extrabold leading-none tracking-tight ${
          small ? "text-[1.15rem]" : "text-[1.5rem]"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[12.5px] text-ink-3">{hint}</p>
    </div>
  );
}
