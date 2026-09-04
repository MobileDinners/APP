"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "./Logo";

const DEMO_ACCOUNTS = [
  { email: "owner@sunrise-taqueria.test", label: "Owner · Sunrise Taqueria" },
  { email: "manager@sunrise-taqueria.test", label: "Manager · Sunrise Taqueria" },
  { email: "lead@sunrise-taqueria.test", label: "Shift lead · Sunrise Taqueria" },
  { email: "owner@bao-haus.test", label: "Owner · Bao Haus" },
];

export function StaffLoginForm({
  next,
  demoPassword,
}: {
  next: string;
  demoPassword: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Could not sign in");
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-[420px] flex-col justify-center px-5">
      <div className="mb-6">
        <LogoMark className="h-12 w-auto" />
        <h1 className="mt-4 text-[28px] font-extrabold">Restaurant sign in</h1>
        <p className="mt-1.5 text-[15px] text-ink-2">
          For owners and staff. Customers sign in with their phone number.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-[14px] font-bold">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-[12px] bg-card-2 px-4 py-3 outline-none ring-brand focus:ring-2"
            placeholder="owner@restaurant.test"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[14px] font-bold">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-[12px] bg-card-2 px-4 py-3 outline-none ring-brand focus:ring-2"
          />
        </label>

        {error && (
          <p className="rounded-[12px] bg-red-soft px-4 py-3 text-[14px] font-semibold text-red">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary mt-1 w-full">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {demoPassword && (
        <div className="mt-8 rounded-[14px] border border-line p-4">
          <p className="text-[13px] font-extrabold uppercase tracking-wider text-ink-3">
            Demo accounts
          </p>
          <p className="mt-1 text-[13px] text-ink-2">
            Password for all of them: <code className="font-bold text-ink">{demoPassword}</code>
          </p>
          <div className="mt-3 grid gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(demoPassword);
                }}
                className="rounded-[10px] bg-card-2 px-3 py-2 text-left text-[13px] hover:bg-line"
              >
                <span className="font-bold">{a.label}</span>
                <br />
                <span className="text-ink-3">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
