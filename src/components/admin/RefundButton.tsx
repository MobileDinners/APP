"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCents } from "@/lib/money";

/**
 * Issuing a refund, from the order it belongs to.
 *
 * Deliberately a two-step: the amount and the reason are filled in before
 * anything can be pressed, and the confirm names the figure out loud. Spending
 * money should not be one click away from a list view.
 *
 * The amount defaults to everything still unrefunded, because a full refund is
 * the common case and making somebody type it invites a typo in the direction
 * of "too much".
 */
export function RefundButton({
  orderId,
  chargeCents,
  refundedCents,
  remainingCents,
  disabledReason,
}: {
  orderId: string;
  chargeCents: number;
  refundedCents: number;
  remainingCents: number;
  /** Set when a refund is impossible; the button explains instead of failing. */
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dollars, setDollars] = useState((remainingCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (disabledReason) {
    return (
      <p className="rounded-[10px] border border-dashed border-line-2 bg-card-2 px-4 py-3 text-[13.5px] text-ink-3">
        {disabledReason}
      </p>
    );
  }

  const cents = Math.round(Number(dollars) * 100);
  const valid =
    Number.isFinite(cents) && cents > 0 && cents <= remainingCents && reason.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, amountCents: cents, reason: reason.trim() }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      error?: string;
      amountCents?: number;
      totalRefundedCents?: number;
    };
    setBusy(false);
    if (!res.ok) {
      setError(d.error ?? "Could not issue the refund");
      return;
    }
    setDone(
      `Refunded ${formatCents(d.amountCents ?? cents)}. ` +
        `${formatCents(d.totalRefundedCents ?? cents)} of ${formatCents(chargeCents)} returned.`,
    );
    setOpen(false);
    router.refresh();
  }

  if (done) {
    return (
      <p className="rounded-[10px] border border-green bg-green-soft px-4 py-3 text-[13.5px] font-semibold text-green">
        {done}
      </p>
    );
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-[10px] border border-red px-5 py-2.5 text-[14px] font-extrabold text-red transition-colors hover:bg-red-soft"
        >
          Refund…
        </button>
        {refundedCents > 0 && (
          <p className="mt-2 text-[12.5px] text-ink-3">
            {formatCents(refundedCents)} of {formatCents(chargeCents)} already refunded.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-line bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
            Amount
          </span>
          <input
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            inputMode="decimal"
            aria-label="Refund amount in dollars"
            className="num w-full rounded-[8px] border border-line-2 bg-card px-3 py-2 text-[14px] outline-none focus:border-brand"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
            Reason
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Order never arrived"
            aria-label="Reason for the refund"
            className="w-full rounded-[8px] border border-line-2 bg-card px-3 py-2 text-[14px] outline-none focus:border-brand"
          />
        </label>
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
        Up to {formatCents(remainingCents)} can be refunded. The restaurant keeps its
        share, because Mobile Dinners absorbs this.
      </p>

      {error && (
        <p className="mt-3 rounded-[10px] border border-red bg-red-soft px-3 py-2.5 text-[13.5px] font-semibold text-red">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => void submit()}
          className="rounded-[10px] bg-red px-5 py-2.5 text-[14px] font-extrabold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy
            ? "Refunding…"
            : `Refund ${Number.isFinite(cents) && cents > 0 ? formatCents(cents) : "—"}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-[10px] border border-line-2 px-4 py-2.5 text-[14px] font-bold hover:bg-card-2 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
