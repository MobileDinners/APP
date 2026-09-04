"use client";

import { useEffect, useState } from "react";
import type { OrderState } from "@/lib/types";
import { STATE_LABELS } from "@/lib/state-labels";

const STATE_TONE: Record<OrderState, string> = {
  DRAFT: "off",
  PENDING_PAYMENT: "warn",
  CONFIRMED: "accent",
  ACCEPTED: "cyan",
  IN_KITCHEN: "cyan",
  READY: "ok",
  AWAITING_PICKUP: "ok",
  COURIER_ASSIGNED: "cyan",
  IN_TRANSIT: "cyan",
  COMPLETED: "ok",
  SETTLED: "off",
  CANCELLED: "off",
  FAILED: "crit",
};

const TONE_CLASS: Record<string, string> = {
  off: "text-ink-3 bg-card-2 border-line-2",
  accent: "text-brand-strong bg-brand-soft border-brand",
  cyan: "text-blue bg-blue-soft border-blue",
  ok: "text-green bg-green-soft border-green",
  warn: "text-amber bg-amber-soft border-amber",
  crit: "text-red bg-red-soft border-red",
};

export function StatePill({ state }: { state: OrderState }) {
  return (
    <span className={`pill ${TONE_CLASS[STATE_TONE[state]]}`}>{STATE_LABELS[state]}</span>
  );
}

export function Tone({
  tone,
  children,
}: {
  tone: "off" | "accent" | "cyan" | "ok" | "warn" | "crit";
  children: React.ReactNode;
}) {
  return <span className={`pill ${TONE_CLASS[tone]}`}>{children}</span>;
}

/**
 * Live mm:ss since a timestamp.
 *
 * The clock starts at the server's render time so the first client render
 * matches the server markup exactly; the interval takes over after mount.
 * suppressHydrationWarning covers the sub-second drift between the two.
 */
export function Elapsed({ since, className = "" }: { since: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = new Date(since).getTime();
  const seconds = Math.max(0, Math.floor(((now ?? start) - start) / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return (
    <span className={`mono num ${className}`} suppressHydrationWarning>
      {`${mm}:${String(ss).padStart(2, "0")}`}
    </span>
  );
}

/**
 * Time against the promise. Negative means late — and we say "late", we don't
 * quietly keep counting up as if nothing happened.
 */
export function Remaining({ until }: { until: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = new Date(until).getTime();
  // Before mount there is no client clock yet; render the full window so the
  // markup is stable, then switch to the real countdown.
  const deltaSec = now === null ? null : Math.round((target - now) / 1000);
  const late = deltaSec !== null && deltaSec < 0;
  const abs = Math.abs(deltaSec ?? 0);
  const mm = Math.floor(abs / 60);
  const ss = abs % 60;

  return (
    <span
      className={`mono num font-semibold ${late ? "text-red" : "text-ink-2"}`}
      suppressHydrationWarning
    >
      {deltaSec === null
        ? "--:--"
        : `${late ? "+" : ""}${mm}:${String(ss).padStart(2, "0")}${late ? " late" : ""}`}
    </span>
  );
}

export function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className="label inline-flex items-center gap-1.5">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          connected ? "bg-green" : "bg-line-2"
        }`}
      />
      {connected ? "Live" : "Reconnecting"}
    </span>
  );
}
