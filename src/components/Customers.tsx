"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import {
  SEGMENT_HINT,
  SEGMENT_LABEL,
  type CrmSummary,
  type PersonOrderRow,
  type Profile,
  type Segment,
} from "@/lib/crm-labels";
import type { Restaurant } from "@/lib/types";
import { SignOut } from "./SignOut";

const SEGMENT_TONE: Record<Segment, string> = {
  champion: "border-green bg-green-soft text-green",
  loyal: "border-blue bg-blue-soft text-blue",
  promising: "border-line-2 bg-card-2 text-ink-2",
  at_risk: "border-amber bg-amber-soft text-amber",
  lapsed: "border-red bg-red-soft text-red",
  one_time: "border-line-2 bg-card-2 text-ink-3",
};

type Selected = {
  profile: Profile;
  orders: PersonOrderRow[];
};

export function Customers({
  active,
  staff,
  summary,
  profiles,
  segment,
  query,
  selected,
}: {
  active: Restaurant;
  staff: { name: string; role: string };
  summary: CrmSummary;
  profiles: Profile[];
  segment: Segment | null;
  query: string;
  selected: Selected | null;
}) {
  const [sort, setSort] = useState<"value" | "risk" | "recent">("value");
  const [search, setSearch] = useState(query);

  const rows = useMemo(() => {
    let list = profiles;
    if (segment) list = list.filter((p) => p.segment === segment);
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(term) || p.phone.includes(term),
      );
    }
    const sorted = [...list];
    if (sort === "value") sorted.sort((a, b) => b.lifetimeCents - a.lifetimeCents);
    if (sort === "risk") sorted.sort((a, b) => b.churnRisk - a.churnRisk || b.lifetimeCents - a.lifetimeCents);
    if (sort === "recent") sorted.sort((a, b) => a.daysSinceLast - b.daysSinceLast);
    return sorted.slice(0, 100);
  }, [profiles, segment, search, sort]);

  const maxSegment = Math.max(1, ...summary.segments.map((s) => s.count));

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-[1.4rem] font-extrabold tracking-tight">Customers</h1>
          <span className="pill border-line-2 bg-card-2 text-ink-3">{active.brandName}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ops/upsell" className="label hover:text-ink">Upsells</Link>
          <Link href="/ops/campaigns" className="label hover:text-ink">Marketing</Link>
          <Link href="/ops/optimizer" className="label hover:text-ink">Optimizer</Link>
          <Link href="/ops/menu" className="label hover:text-ink">Menu</Link>
          <Link href="/ops" className="label hover:text-ink">Orders</Link>
          <SignOut name={staff.name} />
        </div>
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Customers" value={summary.total.toLocaleString()} hint="With a settled order" />
        <Metric label="Active" value={summary.active90.toLocaleString()} hint="Ordered in 90 days" />
        <Metric label="Repeat rate" value={`${summary.repeatRate}%`} hint="Ordered more than once" />
        <Metric label="Avg orders" value={String(summary.avgOrdersPerCustomer)} hint="Per customer" />
        <Metric
          label="Top 10%"
          value={`${summary.topDecileRevenueShare}%`}
          hint="Share of revenue"
          accent
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside>
          <h2 className="label mb-2 border-b border-line pb-1.5">Segments</h2>
          <ul className="m-0 list-none p-0">
            <li>
              <Link
                href="/ops/customers"
                className={`flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[13px] ${
                  !segment ? "bg-card-2 font-bold" : "hover:bg-card-2"
                }`}
              >
                <span>Everyone</span>
                <span className="num mono text-ink-3">{summary.total}</span>
              </Link>
            </li>
            {summary.segments.map((s) => (
              <li key={s.segment}>
                <Link
                  href={`/ops/customers?segment=${s.segment}`}
                  className={`block rounded-sm px-2 py-1.5 ${
                    segment === s.segment ? "bg-card-2" : "hover:bg-card-2"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 text-[13px]">
                    <span className={segment === s.segment ? "font-bold" : ""}>
                      {SEGMENT_LABEL[s.segment]}
                    </span>
                    <span className="num mono text-ink-3">{s.count}</span>
                  </span>
                  <span className="mt-1 block h-1 rounded-full bg-card-2">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${(s.count / maxSegment) * 100}%` }}
                    />
                  </span>
                  <span className="num mt-1 block text-[11px] text-ink-3">
                    {formatCents(s.revenueCents)} lifetime
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {segment && (
            <p className="mt-3 rounded-sm border border-line bg-card p-2.5 text-[12.5px] leading-relaxed text-ink-2">
              {SEGMENT_HINT[segment]}
            </p>
          )}

          <div className="mt-5 rounded-sm border border-line bg-card p-3">
            <p className="label mb-1.5">Privacy</p>
            <p className="text-[12px] leading-relaxed text-ink-2">
              This is your relationship with these guests only. Their orders at other
              Mobile Dinners restaurants are never shown here, in either direction.
            </p>
          </div>
        </aside>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
              aria-label="Search customers"
              className="min-w-[12rem] flex-1 rounded-sm border border-line bg-card-2 px-3 py-1.5 text-[13px] outline-none focus:border-brand"
            />
            {(["value", "risk", "recent"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={`mono rounded-sm border px-2.5 py-1.5 text-[11px] uppercase tracking-[0.08em] ${
                  sort === s
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-line text-ink-3 hover:text-ink"
                }`}
              >
                {s === "value" ? "By value" : s === "risk" ? "By risk" : "By recency"}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-md border border-line bg-card">
            <table className="w-full min-w-[46rem] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-2 bg-card-2 text-left">
                  <th className="label px-3 py-2">Customer</th>
                  <th className="label px-3 py-2">Segment</th>
                  <th className="label px-3 py-2 text-right">Orders</th>
                  <th className="label px-3 py-2 text-right">Lifetime</th>
                  <th className="label px-3 py-2 text-right">Cadence</th>
                  <th className="label px-3 py-2 text-right">Last</th>
                  <th className="label px-3 py-2 text-right">Churn</th>
                  <th className="label px-3 py-2 text-right">Pred. LTV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.personId}
                    className={`border-b border-line last:border-0 ${
                      selected?.profile.personId === p.personId ? "bg-brand-soft" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/ops/customers?${segment ? `segment=${segment}&` : ""}person=${p.personId}`}
                        className="font-semibold hover:text-brand-strong"
                      >
                        {p.name}
                      </Link>
                      <span className="mono block text-[11px] text-ink-3">{p.phone}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`pill ${SEGMENT_TONE[p.segment]}`}>
                        {SEGMENT_LABEL[p.segment]}
                      </span>
                    </td>
                    <td className="num mono px-3 py-2 text-right">{p.orderCount}</td>
                    <td className="num mono px-3 py-2 text-right">
                      {formatCents(p.lifetimeCents)}
                    </td>
                    <td className="num mono px-3 py-2 text-right text-ink-2">
                      {p.cadenceDays ? `${p.cadenceDays}d` : "—"}
                    </td>
                    <td className="num mono px-3 py-2 text-right text-ink-2">
                      {p.daysSinceLast}d
                    </td>
                    <td className="num mono px-3 py-2 text-right">
                      <span
                        className={
                          p.churnRisk >= 0.7
                            ? "text-red font-bold"
                            : p.churnRisk >= 0.4
                              ? "text-amber"
                              : "text-ink-3"
                        }
                      >
                        {p.churnRisk.toFixed(2)}
                      </span>
                    </td>
                    <td className="num mono px-3 py-2 text-right">
                      {formatCents(p.predictedLtvCents)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-ink-3">
                      No customers match that filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {profiles.length > rows.length && (
            <p className="mt-2 text-[12px] text-ink-3">
              Showing {rows.length} of {profiles.length}. Narrow with a segment or search.
            </p>
          )}

          {selected && <ProfileCard selected={selected} />}
        </section>
      </div>
    </main>
  );
}

function ProfileCard({ selected }: { selected: Selected }) {
  const { profile: p, orders } = selected;

  return (
    <section className="mt-5 rounded-md border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.15rem] font-extrabold">{p.name}</h2>
          <p className="mono text-[12px] text-ink-3">{p.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`pill ${SEGMENT_TONE[p.segment]}`}>{SEGMENT_LABEL[p.segment]}</span>
          <Link href="/ops/customers" className="label hover:text-ink">Close</Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Orders" value={String(p.orderCount)} />
        <Stat label="Lifetime" value={formatCents(p.lifetimeCents)} />
        <Stat label="Avg ticket" value={formatCents(p.aovCents)} />
        <Stat label="Margin to you" value={formatCents(p.marginCents)} />
      </div>

      <div className="mt-3 rounded-sm bg-card-2 p-3 text-[13px] leading-relaxed">
        Orders about every{" "}
        <span className="font-bold">{p.cadenceDays ? `${p.cadenceDays} days` : "—"}</span>, last
        seen <span className="font-bold">{p.daysSinceLast} days ago</span>.
        {p.cadenceDays && p.daysSinceLast > p.cadenceDays * 1.8 && (
          <span className="text-amber font-bold">
            {" "}
            That is well past their own rhythm.
          </span>
        )}
        <br />
        {p.favoriteItem && (
          <>
            Always orders <span className="font-bold">{p.favoriteItem}</span> ({p.favoriteCount}
            &times;). Treat that as a preference, not a coincidence.
            <br />
          </>
        )}
        {p.channelMix.pickup} pickup &middot; {p.channelMix.delivery} delivery.
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="pill border-line-2 bg-card-2 text-ink-3">
          Churn risk {p.churnRisk.toFixed(2)}
        </span>
        <span className="pill border-line-2 bg-card-2 text-ink-3">
          Predicted 12-mo margin {formatCents(p.predictedLtvCents)}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
        Both figures are heuristics from observed behaviour, not trained models: churn is
        recency measured against this guest&rsquo;s own cadence, and predicted value is expected
        future orders at their current margin, discounted by that risk.
      </p>

      <h3 className="label mt-4 mb-1.5 border-b border-line pb-1.5">Recent orders</h3>
      <ul className="m-0 list-none p-0">
        {orders.map((o) => (
          <li
            key={o.order_id}
            className="flex items-center gap-3 border-b border-line py-1.5 text-[12.5px] last:border-0"
          >
            <span className="mono text-ink-3">#{o.order_id.slice(0, 6)}</span>
            <span className="num text-ink-2">
              {new Date(o.placed_at).toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
            <span className="capitalize text-ink-3">{o.fulfillment}</span>
            <span className="num mono ml-auto font-semibold">{formatCents(o.total_cents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line p-2.5">
      <p className="label">{label}</p>
      <p className="num mt-0.5 text-[1.15rem] font-extrabold tracking-tight">{value}</p>
    </div>
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
      <p className="num mt-1 text-[1.5rem] font-extrabold leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-[12.5px] text-ink-3">{hint}</p>
    </div>
  );
}
