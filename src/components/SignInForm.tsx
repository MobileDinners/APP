"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackIcon } from "./icons";

/**
 * Customer sign-in, by phone code or by email and password.
 *
 * Both exist for a practical reason as much as a philosophical one. A phone
 * number is the right primary identity for a food app — it is what the
 * restaurant rings when an order goes wrong — but sending a code needs carrier
 * registration that takes weeks, so a phone-only sign-in means a live site
 * nobody can get into. Email and password need nothing from a carrier.
 *
 * Phone stays the default because it is one step and no password to forget.
 * Email is one tap away for anyone who cannot receive a text, or who would
 * rather have an account they can reach from a new number.
 */

type Mode = "phone" | "code" | "email" | "register";

const INPUT =
  "rounded-[12px] bg-card-2 px-4 py-3.5 text-[17px] outline-none ring-brand focus:ring-2";

export function SignInForm({
  next,
  demoPhone,
}: {
  next: string;
  demoPhone: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("phone");
  const [phone, setPhone] = useState(demoPhone ?? "");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function go() {
    router.push(next);
    router.refresh();
  }

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
    setMode("code");
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
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "That code isn't right");
      return;
    }
    go();
  }

  async function emailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/customer", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "That email or password is not right");
      return;
    }
    go();
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        // Optional: given here it merges with an existing phone-only account
        // rather than splitting one diner's history across two records.
        phone: phone || undefined,
        marketingEmail: marketing,
      }),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create your account");
      return;
    }
    go();
  }

  const heading =
    mode === "phone"
      ? "Enter your phone number"
      : mode === "code"
        ? "Enter the 6-digit code"
        : mode === "email"
          ? "Sign in"
          : "Create your account";

  const lede =
    mode === "phone"
      ? "We'll text you a code. No password to remember."
      : mode === "code"
        ? `Sent to ${phone}`
        : mode === "email"
          ? "With the email and password you signed up with."
          : "Your orders, your points and your delivery history, in one place.";

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-[420px] flex-col justify-center px-5">
      {mode === "phone" ? (
        <Link
          href="/"
          className="mb-5 grid h-9 w-9 place-items-center rounded-full bg-card-2"
          aria-label="Back"
        >
          <BackIcon className="h-[18px] w-[18px]" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            setMode(mode === "code" ? "phone" : "phone");
            setError(null);
          }}
          className="mb-5 grid h-9 w-9 place-items-center rounded-full bg-card-2"
          aria-label="Back"
        >
          <BackIcon className="h-[18px] w-[18px]" />
        </button>
      )}

      <h1 className="text-[28px] font-extrabold">{heading}</h1>
      <p className="mt-1.5 text-[15px] text-ink-2">{lede}</p>

      {mode === "phone" && (
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
            className={INPUT}
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      )}

      {mode === "code" && (
        <form onSubmit={verify} className="mt-6 grid gap-3">
          <input
            type="text"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            aria-label="6-digit code"
            className={`${INPUT} num text-center tracking-[0.4em]`}
          />
          {devCode && (
            <p className="rounded-[12px] bg-card-2 px-4 py-2.5 text-[13px] text-ink-2">
              Development only — your code is{" "}
              <span className="num font-bold">{devCode}</span>
            </p>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Checking…" : "Verify and continue"}
          </button>
        </form>
      )}

      {mode === "email" && (
        <form onSubmit={emailSignIn} className="mt-6 grid gap-3">
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email"
            className={INPUT}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className={INPUT}
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}

      {mode === "register" && (
        <form onSubmit={register} className="mt-6 grid gap-3">
          <input
            type="text"
            required
            autoFocus
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            className={INPUT}
          />
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email"
            className={INPUT}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (8 characters or more)"
            aria-label="Password"
            className={INPUT}
          />
          <input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional — for order updates)"
            aria-label="Phone number, optional"
            className={INPUT}
          />
          <label className="flex items-start gap-2.5 px-1 text-[13.5px] leading-snug text-ink-2">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
            />
            Email me offers from restaurants I order from. You can stop this at any time.
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      {/* ------------------------------------------------- switching paths */}
      <div className="mt-6 grid gap-2 text-center text-[14px]">
        {mode === "phone" && (
          <>
            <button
              type="button"
              onClick={() => {
                setMode("email");
                setError(null);
              }}
              className="font-extrabold text-brand-strong hover:underline"
            >
              Sign in with email instead
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className="text-ink-2 hover:text-ink"
            >
              New here? <span className="font-extrabold">Create an account</span>
            </button>
          </>
        )}
        {mode === "email" && (
          <>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className="font-extrabold text-brand-strong hover:underline"
            >
              Create an account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("phone");
                setError(null);
              }}
              className="text-ink-2 hover:text-ink"
            >
              Use a phone code instead
            </button>
          </>
        )}
        {mode === "register" && (
          <button
            type="button"
            onClick={() => {
              setMode("email");
              setError(null);
            }}
            className="text-ink-2 hover:text-ink"
          >
            Already have an account? <span className="font-extrabold">Sign in</span>
          </button>
        )}
      </div>

      <p className="mt-8 text-center text-[13px] text-ink-3">
        Run a restaurant?{" "}
        <Link href="/staff/login" className="font-bold text-brand-strong hover:underline">
          Staff sign in
        </Link>
      </p>
    </main>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[12px] bg-red-soft px-4 py-3 text-[14px] font-semibold text-red">
      {children}
    </p>
  );
}
