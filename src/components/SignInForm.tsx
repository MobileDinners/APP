"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackIcon } from "./icons";

export function SignInForm({
  next,
  demoPhone,
}: {
  next: string;
  demoPhone: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(demoPhone ?? "");
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
    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-[420px] flex-col justify-center px-5">
      {step === "code" ? (
        <button
          type="button"
          onClick={() => {
            setStep("phone");
            setError(null);
          }}
          className="mb-5 grid h-9 w-9 place-items-center rounded-full bg-card-2"
          aria-label="Back"
        >
          <BackIcon className="h-[18px] w-[18px]" />
        </button>
      ) : (
        <Link
          href="/"
          className="mb-5 grid h-9 w-9 place-items-center rounded-full bg-card-2"
          aria-label="Back"
        >
          <BackIcon className="h-[18px] w-[18px]" />
        </Link>
      )}

      <h1 className="text-[28px] font-extrabold">
        {step === "phone" ? "Enter your phone number" : "Enter the 6-digit code"}
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-2">
        {step === "phone"
          ? "We'll text you a code. No password to remember."
          : `Sent to ${phone}`}
      </p>

      {step === "phone" ? (
        <form onSubmit={requestCode} className="mt-6 grid gap-3">
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
          {error && (
            <p className="rounded-[12px] bg-red-soft px-4 py-3 text-[14px] font-semibold text-red">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-6 grid gap-3">
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
          {error && (
            <p className="rounded-[12px] bg-red-soft px-4 py-3 text-[14px] font-semibold text-red">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Checking…" : "Verify and continue"}
          </button>
          <button
            type="button"
            onClick={requestCode}
            className="text-[14px] font-bold text-ink-3 hover:text-ink"
          >
            Send a new code
          </button>
        </form>
      )}

      <p className="mt-8 text-[13px] text-ink-3">
        Run a restaurant?{" "}
        <Link href="/staff/login" className="font-bold text-brand-strong">
          Staff sign in
        </Link>
      </p>
    </main>
  );
}
