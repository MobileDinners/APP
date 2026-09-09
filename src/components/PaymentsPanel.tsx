"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import type { PaymentRow } from "@/lib/payments/store";
import { SignOut } from "./SignOut";

/**
 * Payout setup and the payments ledger.
 *
 * Two things an owner needs from this screen: whether they can be paid yet,
 * and what they were actually paid on each order. The second is a table with
 * every deduction itemized — a payout summary that only shows a net figure is
 * how processors hide their margin.
 */

export type PaymentsView = {
  brandName: string;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  mode: "live" | "test" | "none";
  isOwner: boolean;
  staffName: string;
  payments: PaymentRow[];
  totals: { gross: number; net: number; processing: number; refunded: number };
};

export function PaymentsPanel({ view }: { view: PaymentsView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = Boolean(view.accountId);
  const ready = view.chargesEnabled && view.payoutsEnabled;

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/payments/connect", { method: "POST" });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setBusy(false);
      setError(data.error ?? "Could not start onboarding");
      return;
    }
    // Full navigation, not a router push: this leaves for Stripe's domain.
    window.location.href = data.url;
  }

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">Payments</h1>
          <p className="mt-0.5 text-[14px] text-ink-2">{view.brandName}</p>
        </div>
        <SignOut name={view.staffName} />
      </div>

      {view.mode === "none" && (
        <p className="mt-5 rounded-[12px] bg-amber-soft px-4 py-3 text-[14px] font-semibold text-amber">
          No processor is connected on this deployment, so a local sandbox is
          standing in. Orders settle instantly and no money moves. Add
          <code className="mono mx-1">STRIPE_SECRET_KEY</code> to
          <code className="mono mx-1">.env.local</code> to switch to Stripe.
        </p>
      )}
      {view.mode === "test" && (
        <p className="mt-5 rounded-[12px] bg-blue-soft px-4 py-3 text-[14px] font-semibold text-blue">
          Stripe is in <strong>test mode</strong>. Cards are simulated and no real
          money moves. Swap in a live key when you are ready to take orders.
        </p>
      )}

      {/* ------------------------------------------------------- onboarding */}
      <section className="card mt-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[18px] font-extrabold">Payout account</h2>
            <p className="mt-1 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-2">
              {ready
                ? "Verified. Orders are charged to the diner and settled to your bank account, with the fee on every order itemized below."
                : connected
                  ? "Started, but Stripe still needs a few details before you can be paid. Pick up where you left off — it takes about five minutes."
                  : "Connect a bank account so orders can pay out to you. Stripe handles the verification; we never see or store your bank details."}
            </p>
          </div>
          <span
            className={
              ready
                ? "badge badge-green"
                : connected
                  ? "badge badge-amber"
                  : "badge badge-muted"
            }
          >
            {ready ? "Ready to take orders" : connected ? "Needs finishing" : "Not connected"}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Status label="Accept payments" on={view.chargesEnabled} />
          <Status label="Receive payouts" on={view.payoutsEnabled} />
          <div>
            <dt className="text-[12px] font-bold uppercase tracking-wider text-ink-3">
              Account
            </dt>
            <dd className="mono mt-1 truncate text-[13px] font-semibold">
              {view.accountId ?? "—"}
            </dd>
          </div>
        </dl>

        {error && (
          <p className="mt-4 rounded-[12px] bg-red-soft px-4 py-3 text-[14px] font-semibold text-red">
            {error}
          </p>
        )}

        {view.isOwner ? (
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="btn btn-primary mt-4"
          >
            {busy
              ? "Opening Stripe…"
              : ready
                ? "Update payout details"
                : connected
                  ? "Finish setup"
                  : "Connect a bank account"}
          </button>
        ) : (
          <p className="mt-4 text-[13.5px] text-ink-3">
            Only an owner can connect or change the payout account.
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------- totals */}
      <section className="mt-5 grid gap-3 sm:grid-cols-4">
        <Tile label="Charged to diners" value={formatCents(view.totals.gross)} />
        <Tile label="Paid to you" value={formatCents(view.totals.net)} strong />
        <Tile label="Card processing" value={formatCents(view.totals.processing)} />
        <Tile
          label="Commission taken"
          value="$0.00"
          note="Not a promotion — there is no commission code"
        />
      </section>

      {/* --------------------------------------------------------- ledger */}
      <section className="card mt-5 p-5">
        <h2 className="text-[18px] font-extrabold">Recent payments</h2>
        {view.payments.length === 0 ? (
          <p className="mt-3 text-[14.5px] text-ink-2">
            Nothing yet. Payments appear here the moment an order is charged.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line-2">
                  {["Order", "Status", "Charged", "Tip", "To you", "Refunded"].map((h) => (
                    <th
                      key={h}
                      className="pb-2.5 pr-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-ink-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.payments.map((p) => (
                  <tr key={p.paymentId} className="border-b border-line">
                    <td className="mono py-3 pr-3 text-[12.5px]">
                      {p.orderId.slice(0, 8)}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={
                          p.status === "succeeded"
                            ? "badge badge-green"
                            : p.status === "failed" || p.status === "canceled"
                              ? "badge badge-red"
                              : "badge badge-amber"
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="num py-3 pr-3 text-[14px]">
                      {formatCents(p.chargeCents)}
                    </td>
                    <td className="num py-3 pr-3 text-[14px] text-ink-2">
                      {formatCents(p.tipCents)}
                    </td>
                    <td className="num py-3 pr-3 text-[14px] font-bold">
                      {formatCents(p.restaurantCents)}
                    </td>
                    <td className="num py-3 pr-3 text-[14px] text-ink-2">
                      {p.refundedCents > 0 ? formatCents(p.refundedCents) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
          &ldquo;To you&rdquo; is the food and its tax, less card processing at 2.9% +
          30¢. Tips pass through to the courier in full and are never netted
          against anything. No percentage of any order is taken as commission.
        </p>
      </section>
    </main>
  );
}

function Status({ label, on }: { label: string; on: boolean }) {
  return (
    <div>
      <dt className="text-[12px] font-bold uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className={`mt-1 text-[14px] font-extrabold ${on ? "text-green" : "text-ink-3"}`}>
        {on ? "Enabled" : "Not yet"}
      </dd>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  strong,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-[12px] font-bold uppercase tracking-wider text-ink-3">{label}</p>
      <p
        className={`num mt-1.5 text-[24px] font-extrabold leading-none ${
          strong ? "text-green" : ""
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{note}</p>}
    </div>
  );
}
