"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import { SEGMENT_LABEL, type Segment } from "@/lib/crm-labels";
import {
  offerLabel,
  type AudiencePreview,
  type Campaign,
  type CampaignResult,
  type Template,
} from "@/lib/campaign-templates";
import type { Restaurant } from "@/lib/types";
import { SignOut } from "./SignOut";

export function Campaigns({
  active,
  staff,
  templates,
  segmentSizes,
  previews,
  campaigns,
  results,
}: {
  active: Restaurant;
  staff: { name: string; role: string };
  templates: Template[];
  segmentSizes: Record<string, number>;
  previews: Record<string, AudiencePreview>;
  campaigns: Campaign[];
  results: Record<string, CampaignResult | null>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const canSend = staff.role === "owner" || staff.role === "manager";

  async function send(t: Template) {
    setBusy(t.id);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: t.id, holdoutPct: 10 }),
    });
    const data = (await res.json()) as { error?: string; preview?: AudiencePreview };
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Could not start the campaign");
      return;
    }
    setFlash(
      `${t.name} sent to ${data.preview?.treated ?? 0} guests. ${data.preview?.holdout ?? 0} were deliberately held back so lift can be measured.`,
    );
    setOpen(null);
    startTransition(() => router.refresh());
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-[1.4rem] font-extrabold tracking-tight">Marketing</h1>
          <span className="pill border-line-2 bg-card-2 text-ink-3">{active.brandName}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ops/site" className="label hover:text-ink">Website</Link>
          <Link href="/ops/upsell" className="label hover:text-ink">Upsells</Link>
          <Link href="/ops/customers" className="label hover:text-ink">Customers</Link>
          <Link href="/ops/optimizer" className="label hover:text-ink">Optimizer</Link>
          <Link href="/ops" className="label hover:text-ink">Orders</Link>
          <SignOut name={staff.name} />
        </div>
      </div>

      <section className="mb-5 rounded-md border border-blue bg-blue-soft p-3.5">
        <p className="label !text-blue mb-1">How results are counted here</p>
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Every campaign holds back a random 10% of the audience and sends them nothing.
          Revenue is reported as the difference between the two groups, not as
          &ldquo;everyone who ordered afterwards&rdquo;. The numbers come out smaller than
          the marketing tools you are used to, because most of the people who order after a
          text were going to order anyway.
        </p>
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
      {!canSend && (
        <p className="mb-4 rounded-sm border border-line bg-card-2 px-3 py-2 text-sm text-ink-2">
          Your role ({staff.role.replace("_", " ")}) can read campaigns but not send them.
        </p>
      )}

      <h2 className="label mb-2.5 border-b border-line pb-1.5">Ready to send</h2>
      <ul className="m-0 mb-7 grid list-none gap-3 p-0 lg:grid-cols-2">
        {templates.map((t) => {
          const p = previews[t.id];
          const size = segmentSizes[t.segment] ?? 0;
          const expanded = open === t.id;
          return (
            <li key={t.id} className="rounded-md border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold">{t.name}</p>
                  <p className="mt-0.5 text-[13px] text-ink-2">{t.purpose}</p>
                </div>
                <span className="pill border-line-2 bg-card-2 text-ink-3">
                  {SEGMENT_LABEL[t.segment as Segment]} &middot; {size}
                </span>
              </div>

              <p className="mt-3 rounded-sm bg-card-2 p-2.5 text-[13px] italic text-ink-2">
                &ldquo;{t.message.replace("{restaurant}", active.brandName)}&rdquo;
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Mini label="Will send" value={String(p?.treated ?? 0)} />
                <Mini label="Held back" value={String(p?.holdout ?? 0)} />
                <Mini
                  label="Send cost"
                  value={formatCents(p?.estimatedCostCents ?? 0)}
                />
              </div>

              <p className="mt-2 text-[12.5px] text-ink-3">
                {offerLabel(t.offerType, t.offerValue)}
                {t.offerType !== "none" && p && (
                  <> &middot; up to {formatCents(p.estimatedOfferCostCents)} in discounts if
                  everyone redeems</>
                )}
              </p>

              {p && p.eligible > 0 && p.holdout < 30 && (
                <p className="mt-2 rounded-sm border border-amber bg-amber-soft px-2.5 py-2 text-[12.5px] leading-relaxed text-amber">
                  Only {p.holdout} guests held back. That is too few to measure lift &mdash;
                  you will get a result, but it will not be able to tell a real effect from
                  noise. Worth waiting until this segment is larger.
                </p>
              )}

              <button
                type="button"
                onClick={() => setOpen(expanded ? null : t.id)}
                className="label mt-2 hover:text-ink"
              >
                {expanded ? "Hide details" : `Why these ${p?.eligible ?? 0} guests?`}
              </button>

              {expanded && (
                <div className="mt-2 rounded-sm border border-line p-3">
                  <p className="text-[12.5px] leading-relaxed text-ink-2">{t.rationale}</p>
                  <p className="label mt-3 mb-1">Excluded from the {p?.segmentSize ?? 0} in this segment</p>
                  {p && p.suppressions.length === 0 ? (
                    <p className="text-[12.5px] text-ink-3">Nobody excluded.</p>
                  ) : (
                    <ul className="m-0 list-none p-0">
                      {p?.suppressions.map((s) => (
                        <li key={s.reason} className="border-b border-line py-1.5 last:border-0">
                          <span className="num mono text-[12px] font-bold">{s.count}</span>{" "}
                          <span className="text-[12.5px] text-ink-2">{s.explanation}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {canSend && (
                <button
                  type="button"
                  onClick={() => send(t)}
                  disabled={busy === t.id || (p?.eligible ?? 0) === 0}
                  className="btn btn-primary mt-3 w-full py-2.5 text-[14px] disabled:opacity-40"
                >
                  {busy === t.id
                    ? "Sending…"
                    : (p?.eligible ?? 0) === 0
                      ? "Nobody eligible right now"
                      : `Send to ${p?.treated ?? 0} guests`}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="label mb-2.5 border-b border-line pb-1.5">
        Sent &middot; {campaigns.length}
      </h2>
      {campaigns.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-2 p-8 text-center">
          <p className="text-[15px] font-semibold">Nothing sent yet</p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[14px] text-ink-2">
            Results appear here once a campaign has been out long enough for its
            measurement window to mean anything.
          </p>
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {campaigns.map((c) => {
            const r = results[c.campaignId];
            return (
              <li key={c.campaignId} className="rounded-md border border-line bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-extrabold">{c.name}</p>
                    <p className="label mt-0.5">
                      {SEGMENT_LABEL[c.segment as Segment]} &middot; {c.channel} &middot;{" "}
                      {offerLabel(c.offerType, c.offerValue)} &middot; {c.holdoutPct}% holdout
                      &middot;{" "}
                      {new Date(c.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  {r && (
                    <span
                      className={`pill ${
                        r.significant
                          ? "border-green bg-green-soft text-green"
                          : "border-line-2 bg-card-2 text-ink-3"
                      }`}
                    >
                      {r.significant ? "Lift detected" : "No effect proven"}
                    </span>
                  )}
                </div>

                {r && (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Mini label="Sent" value={String(r.treatedCount)} />
                      <Mini label="Held back" value={String(r.holdoutCount)} />
                      <Mini
                        label="Ordered (sent)"
                        value={`${r.treatedCount ? Math.round((r.treatedConverted / r.treatedCount) * 100) : 0}%`}
                      />
                      <Mini
                        label="Ordered (held)"
                        value={`${r.holdoutCount ? Math.round((r.holdoutConverted / r.holdoutCount) * 100) : 0}%`}
                      />
                    </div>

                    <div className="mt-3 rounded-sm bg-card-2 p-3">
                      <p className="text-[14px] font-bold">
                        Incremental revenue{" "}
                        <span className={r.incrementalRevenueCents >= 0 ? "text-green" : "text-red"}>
                          {r.incrementalRevenueCents >= 0 ? "+" : ""}
                          {formatCents(r.incrementalRevenueCents)}
                        </span>
                      </p>
                      <p className="mono mt-1 text-[12px] text-ink-2">
                        95% interval {formatCents(r.lowCents)} to {formatCents(r.highCents)}
                        {" "}&middot; send cost {formatCents(r.sendCostCents)}
                      </p>
                      <p className="mono mt-1 text-[12px] text-ink-3">
                        revenue per person: sent {formatCents(r.treatedRppCents)} vs held{" "}
                        {formatCents(r.holdoutRppCents)} &middot; day {r.daysElapsed} of{" "}
                        {r.windowDays}
                      </p>
                    </div>

                    {!r.significant && (
                      <p className="mt-2 text-[12.5px] leading-relaxed text-amber">
                        The interval crosses zero, so this campaign has not been shown to
                        work. That is a real result, not a loading state &mdash; with an
                        audience this size, only a large effect would be detectable.
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line p-2">
      <p className="label">{label}</p>
      <p className="num mt-0.5 text-[1rem] font-extrabold">{value}</p>
    </div>
  );
}
