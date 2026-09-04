"use client";

import { useState } from "react";

/**
 * Phone verification, inline at checkout.
 *
 * This is the only identity step a diner ever hits, and it sits at the last
 * possible moment — after they have chosen the food, seen the total and decided
 * to buy. Asking earlier costs orders from people who have not yet been given a
 * reason to care who we are.
 *
 * The number is not account admin: it is how the restaurant reaches them about
 * this order and where the tracking link goes. Framing it that way is why the
 * copy talks about the order, never about "creating an account".
 */
export function VerifySheet({
  totalLabel,
  pointsEarned,
  onVerified,
  onCancel,
}: {
  totalLabel: string;
  pointsEarned: number;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = (await res.json()) as { error?: string; devCode?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not send a code");
      return;
    }
    setDevCode(data.devCode ?? null);
    setCode(data.devCode ?? "");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Could not verify that code");
      setBusy(false);
      return;
    }
    // Straight on to placing the order — a confirmation screen here would make
    // the person tap twice to buy the thing they already decided to buy.
    onVerified();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-title"
    >
      <div className="w-full max-w-[440px] rounded-t-[22px] bg-card p-6 shadow-[var(--shadow-lg)] sm:rounded-[22px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="verify-title" className="text-[22px] font-extrabold tracking-[-0.02em]">
              {step === "phone" ? "Where should we text updates?" : "Enter the 6-digit code"}
            </h2>
            <p className="mt-1.5 text-[14.5px] leading-snug text-ink-2">
              {step === "phone"
                ? "The restaurant uses this to reach you about the order, and it is where your tracking link goes."
                : `Sent to ${phone}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card-2 text-[17px] font-bold text-ink-2 hover:bg-line"
          >
            ×
          </button>
        </div>

        {step === "phone" ? (
          <form onSubmit={requestCode} className="mt-5 grid gap-3">
            <input
              type="tel"
              required
              autoFocus
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(415) 555-0142"
              aria-label="Phone number"
              className="rounded-[12px] bg-card-2 px-4 py-3.5 text-[17px] outline-none ring-brand focus:ring-2"
            />
            {error && <ErrorNote>{error}</ErrorNote>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full">
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-5 grid gap-3">
            <input
              type="text"
              required
              autoFocus
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              aria-label="6-digit code"
              className="num rounded-[12px] bg-card-2 px-4 py-3.5 text-center text-[26px] font-extrabold tracking-[0.35em] outline-none ring-brand focus:ring-2"
            />
            {devCode && (
              <p className="rounded-[12px] bg-amber-soft px-4 py-3 text-[13px] font-semibold text-amber">
                No SMS provider is connected, so the code is shown here in
                development: <span className="num font-extrabold">{devCode}</span>
              </p>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full">
              {busy ? "Placing your order…" : `Verify and place order · ${totalLabel}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
              className="text-[14px] font-bold text-ink-3 hover:text-ink"
            >
              ← Use a different number
            </button>
          </form>
        )}

        {pointsEarned > 0 && (
          <p className="mt-4 rounded-[12px] bg-green-soft px-4 py-3 text-[13.5px] font-semibold text-green">
            You&rsquo;ll earn <span className="num font-extrabold">{pointsEarned}</span> points
            on this order — they spend at any restaurant on Mobile Dinners.
          </p>
        )}

        <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
          No password to create. We text a code, and that number becomes your
          account.
        </p>
      </div>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[12px] bg-red-soft px-4 py-3 text-[14px] font-semibold text-red"
    >
      {children}
    </p>
  );
}
