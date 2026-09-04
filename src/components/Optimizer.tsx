"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import type { ItemStats, OptimizerSummary, Proposal } from "@/lib/optimizer";
import type { Restaurant } from "@/lib/types";
import { SignOut } from "./SignOut";

const QUADRANT_LABEL: Record<ItemStats["quadrant"], string> = {
  star: "Star",
  "plow-horse": "Plow-horse",
  puzzle: "Puzzle",
  dog: "Dog",
};

const QUADRANT_HINT: Record<ItemStats["quadrant"], string> = {
  star: "Popular and profitable. Protect the price.",
  "plow-horse": "Sells well, earns little. Raise price or cut cost.",
  puzzle: "Good margin, few takers. Reposition or re-describe.",
  dog: "Neither popular nor profitable. Consider removing.",
};

const QUADRANT_TONE: Record<ItemStats["quadrant"], string> = {
  star: "border-green bg-green-soft text-green",
  "plow-horse": "border-amber bg-amber-soft text-amber",
  puzzle: "border-blue bg-blue-soft text-blue",
  dog: "border-red bg-red-soft text-red",
};

export function Optimizer({
  active,
  staff,
  summary,
  proposals,
  stats,
  pendingCount,
  liveVersion,
  decisions,
}: {
  active: Restaurant;
  staff: { name: string; role: string };
  summary: OptimizerSummary;
  proposals: Proposal[];
  stats: ItemStats[];
  pendingCount: number;
  liveVersion: number | null;
  decisions: { id: string; itemId: string; verdict: "accepted" | "dismissed"; name: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const canEdit = staff.role === "owner" || staff.role === "manager";

  async function decide(p: Proposal, verdict: "accepted" | "dismissed") {
    setBusy(p.itemId);
    setError(null);
    const res = await fetch("/api/optimizer/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: p.itemId, verdict }),
    });
    const data = (await res.json()) as { error?: string; applied?: boolean };
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Could not record that");
      return;
    }
    setFlash(
      verdict === "accepted"
        ? `${p.name} moved to ${formatCents(p.proposedPriceCents)} in the draft. Publish the menu to make it live.`
        : `Dismissed. That won't be suggested again this cycle.`,
    );
    startTransition(() => router.refresh());
  }

  const ranked = [...stats].sort((a, b) => b.units - a.units);

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-[1.4rem] font-extrabold tracking-tight">Menu optimizer</h1>
          <span className="pill border-line-2 bg-card-2 text-ink-3">{active.brandName}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ops/campaigns" className="label hover:text-ink">Marketing</Link>
          <Link href="/ops/customers" className="label hover:text-ink">Customers</Link>
          <Link href="/ops/menu" className="label hover:text-ink">Menu</Link>
          <Link href="/ops" className="label hover:text-ink">Orders</Link>
          <SignOut name={staff.name} />
        </div>
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Window" value={`${summary.windowDays} days`} hint={`${summary.ordersAnalyzed} settled orders`} />
        <Metric label="Units sold" value={summary.unitsAnalyzed.toLocaleString()} hint="Across all items" />
        <Metric label="Margin / month" value={formatCents(summary.monthlyMarginCents)} hint="Price minus food cost" />
        <Metric
          label="Opportunity"
          value={formatCents(summary.totalOpportunityCents)}
          hint="If every suggestion below lands"
          accent
        />
      </section>

      {flash && (
        <p className="mb-4 rounded-sm border border-green bg-green-soft px-3 py-2 text-sm font-semibold text-green">
          {flash}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-sm border border-red bg-red-soft px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}
      {pendingCount > 0 && (
        <p className="mb-4 rounded-sm border border-amber bg-amber-soft px-3 py-2 text-sm">
          <span className="font-semibold">{pendingCount} unpublished change{pendingCount === 1 ? "" : "s"}.</span>{" "}
          Guests still see {liveVersion ? `v${liveVersion}` : "the current menu"} until you{" "}
          <Link href="/ops/menu" className="font-bold underline">publish</Link>.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div>
          <h2 className="label mb-2.5 border-b border-line pb-1.5">
            Suggestions &middot; {proposals.length}
          </h2>

          {proposals.length === 0 && (
            <div className="rounded-md border border-dashed border-line-2 p-8 text-center">
              <p className="text-[15px] font-semibold">Nothing worth changing yet</p>
              <p className="mx-auto mt-2 max-w-[46ch] text-[14px] text-ink-2">
                Either there is not enough sales history, or every item already sits
                inside the guardrails. Run{" "}
                <code className="mono text-[13px]">npm run seed:history</code> to
                populate trailing sales for this demo.
              </p>
            </div>
          )}

          <ul className="m-0 grid list-none gap-3 p-0">
            {proposals.map((p) => {
              const up = p.proposedPriceCents > p.currentPriceCents;
              return (
                <li key={p.itemId} className="rounded-md border border-line bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[16px] font-extrabold">{p.name}</p>
                      <p className="mt-1 text-[15px] font-bold">
                        <span className="mono text-ink-3 line-through">
                          {formatCents(p.currentPriceCents)}
                        </span>
                        <span className="mx-2 text-ink-3">&rarr;</span>
                        <span className={`mono ${up ? "text-green" : "text-blue"}`}>
                          {formatCents(p.proposedPriceCents)}
                        </span>
                        <span className="ml-2 text-[13px] font-semibold text-ink-2">
                          {p.deltaPct > 0 ? "+" : ""}
                          {p.deltaPct}%
                        </span>
                      </p>
                    </div>
                    <span
                      className={`pill ${
                        p.confidence === "high"
                          ? "border-green bg-green-soft text-green"
                          : p.confidence === "medium"
                            ? "border-amber bg-amber-soft text-amber"
                            : "border-line-2 bg-card-2 text-ink-3"
                      }`}
                    >
                      {p.confidence} confidence
                    </span>
                  </div>

                  <div className="mt-3 rounded-sm bg-card-2 p-3">
                    <p className="text-[14px] font-bold">
                      Projected{" "}
                      <span className="text-green">
                        +{formatCents(p.projectedMonthlyMarginDeltaCents)}/mo
                      </span>{" "}
                      margin
                    </p>
                    <p className="mono mt-1 text-[12px] text-ink-2">
                      range {formatCents(p.lowCents)} to {formatCents(p.highCents)} &middot;{" "}
                      demand {p.expectedDemandChangePct > 0 ? "+" : ""}
                      {p.expectedDemandChangePct}% &middot; {p.unitsObserved} units observed
                    </p>
                  </div>

                  <p className="mt-2 text-[13px] text-ink-2">{p.rationale}</p>

                  {p.confidence === "low" && (
                    <p className="mt-2 text-[12px] font-semibold text-amber">
                      Thin data. This is a category prior, not a measurement &mdash; treat the
                      range as the real answer.
                    </p>
                  )}

                  {canEdit && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => decide(p, "accepted")}
                        disabled={busy === p.itemId}
                        className="rounded-sm bg-brand px-3.5 py-1.5 text-[13px] font-bold text-brand-ink disabled:opacity-50"
                      >
                        {busy === p.itemId ? "Applying…" : "Apply to draft"}
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(p, "dismissed")}
                        disabled={busy === p.itemId}
                        className="rounded-sm border border-line px-3.5 py-1.5 text-[13px] font-bold hover:border-line-2 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <h2 className="label mb-2.5 mt-7 border-b border-line pb-1.5">
            Menu engineering
          </h2>
          <div className="overflow-x-auto rounded-md border border-line bg-card">
            <table className="w-full min-w-[34rem] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-2 bg-card-2 text-left">
                  <th className="label px-3 py-2">Item</th>
                  <th className="label px-3 py-2 text-right">Units</th>
                  <th className="label px-3 py-2 text-right">Margin</th>
                  <th className="label px-3 py-2 text-right">Contribution</th>
                  <th className="label px-3 py-2">Class</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s) => (
                  <tr key={s.item.itemId} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-semibold">{s.item.name}</td>
                    <td className="num mono px-3 py-2 text-right">{s.units}</td>
                    <td className="num mono px-3 py-2 text-right">{s.marginPct}%</td>
                    <td className="num mono px-3 py-2 text-right">
                      {formatCents(s.marginCents)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`pill ${QUADRANT_TONE[s.quadrant]}`}>
                        {QUADRANT_LABEL[s.quadrant]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside>
          <h2 className="label mb-2 border-b border-line pb-1.5">How this works</h2>
          <ul className="m-0 list-none space-y-2 p-0 text-[12.5px] leading-relaxed text-ink-2">
            <li>
              Demand response uses a <span className="font-bold text-ink">pooled category
              elasticity</span>, widened when an item has thin sales history. It is a prior,
              not a measurement, and the interval says so.
            </li>
            <li>
              Price moves are capped at <span className="font-bold text-ink">&plusmn;8%</span>,
              at most <span className="font-bold text-ink">5 suggestions</span> per cycle, and
              never below a <span className="font-bold text-ink">45% margin</span> floor.
            </li>
            <li>
              The <span className="font-bold text-ink">top 3 traffic drivers</span> are never
              suggested for an increase &mdash; they are why people come.
            </li>
            <li>
              Accepting edits the <span className="font-bold text-ink">draft only</span>.
              Nothing reaches a guest until the menu is published.
            </li>
          </ul>

          <h2 className="label mb-2 mt-5 border-b border-line pb-1.5">Decision log</h2>
          {decisions.length === 0 ? (
            <p className="py-2 text-[12.5px] text-ink-3">No decisions recorded yet.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {decisions.map((d) => (
                <li key={d.id} className="border-b border-line py-1.5 text-[12.5px]">
                  <span
                    className={`pill mr-1.5 ${
                      d.verdict === "accepted"
                        ? "border-green bg-green-soft text-green"
                        : "border-line-2 bg-card-2 text-ink-3"
                    }`}
                  >
                    {d.verdict}
                  </span>
                  <span className="font-semibold">{d.name}</span>
                  <span className="mono ml-1 text-ink-3">
                    {new Date(d.createdAt).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-ink-3">
            Every proposal and verdict is logged. That log is what turns this into a model
            that can be evaluated instead of a black box.
          </p>
        </aside>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3.5 ${
        accent ? "border-green bg-green-soft" : "border-line bg-card"
      }`}
    >
      <p className="label">{label}</p>
      <p className="num mt-1 text-[1.5rem] font-extrabold leading-none tracking-tight">
        {value}
      </p>
      <p className="mt-1.5 text-[12.5px] text-ink-3">{hint}</p>
    </div>
  );
}
