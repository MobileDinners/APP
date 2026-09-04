"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Real signup. Creates an org, an owner account and a starter menu draft, then
 * signs the owner in and drops them on the menu editor — the one screen where
 * a new restaurant has something useful to do.
 */

const CUISINES = [
  "Mexican", "Italian", "Chinese", "Japanese", "Thai", "Indian", "Korean",
  "Vietnamese", "Mediterranean", "Middle Eastern", "American", "Barbecue",
  "Burgers", "Pizza", "Sandwiches", "Seafood", "Breakfast", "Bakery",
  "Dessert", "Coffee", "Vegan", "Caribbean", "Ethiopian", "Peruvian",
];

type Field = "brandName" | "cuisine" | "address" | "ownerName" | "email" | "password";

export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<Field | null>(null);

  const [brandName, setBrandName] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [address, setAddress] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const stepOneReady =
    brandName.trim().length >= 2 && cuisine !== "" && address.trim().length >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setBadField(null);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandName, cuisine, address, ownerName, email, password }),
    });
    const data = (await res.json()) as {
      error?: string;
      field?: string;
      next?: string;
    };

    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "Could not create the account");
      setBadField((data.field as Field) || null);
      // Send them back to whichever step owns the bad field.
      if (data.field === "brandName" || data.field === "cuisine" || data.field === "address") {
        setStep(1);
      }
      return;
    }

    router.push(data.next ?? "/ops/menu");
    router.refresh();
  }

  const err = (f: Field) => (badField === f ? "border-red ring-1 ring-red" : "border-line");

  return (
    <form onSubmit={submit} className="rounded-[20px] border border-line bg-card p-6 md:p-7">
      <ol className="m-0 mb-6 flex list-none items-center gap-2 p-0" aria-label="Progress">
        {[1, 2].map((n) => (
          <li key={n} className="flex flex-1 items-center gap-2">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-extrabold ${
                step >= n ? "bg-brand text-brand-ink" : "bg-card-2 text-ink-3"
              }`}
            >
              {n}
            </span>
            <span
              className={`text-[13px] font-bold ${step >= n ? "text-ink" : "text-ink-3"}`}
            >
              {n === 1 ? "Your restaurant" : "Your account"}
            </span>
            {n === 1 && <span className="ml-1 h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="grid gap-4">
          <Labelled label="Restaurant name" hint="This is what diners will see.">
            <input
              type="text"
              required
              autoFocus
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Sunrise Taqueria"
              maxLength={80}
              className={`w-full rounded-[12px] border bg-bg px-4 py-3 text-[16px] outline-none ring-brand focus:ring-2 ${err("brandName")}`}
            />
          </Labelled>

          <Labelled label="Cuisine" hint="Used for search and category filters.">
            <select
              required
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              className={`w-full rounded-[12px] border bg-bg px-4 py-3 text-[16px] outline-none ring-brand focus:ring-2 ${err("cuisine")}`}
            >
              <option value="">Choose one…</option>
              {CUISINES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Labelled>

          <Labelled label="Street address" hint="Where the food is actually made.">
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="1180 Valencia St, San Francisco"
              className={`w-full rounded-[12px] border bg-bg px-4 py-3 text-[16px] outline-none ring-brand focus:ring-2 ${err("address")}`}
            />
          </Labelled>

          {error && <ErrorNote>{error}</ErrorNote>}

          <button
            type="button"
            disabled={!stepOneReady}
            onClick={() => {
              setError(null);
              setStep(2);
            }}
            className="btn btn-primary w-full"
          >
            Continue
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          <Labelled label="Your name" hint="You will be the owner on this account.">
            <input
              type="text"
              required
              autoFocus
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Alex Rivera"
              className={`w-full rounded-[12px] border bg-bg px-4 py-3 text-[16px] outline-none ring-brand focus:ring-2 ${err("ownerName")}`}
            />
          </Labelled>

          <Labelled label="Work email" hint="This is your sign-in.">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@sunrisetaqueria.com"
              className={`w-full rounded-[12px] border bg-bg px-4 py-3 text-[16px] outline-none ring-brand focus:ring-2 ${err("email")}`}
            />
          </Labelled>

          <Labelled label="Password" hint="At least 8 characters.">
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full rounded-[12px] border bg-bg px-4 py-3 text-[16px] outline-none ring-brand focus:ring-2 ${err("password")}`}
            />
          </Labelled>

          {error && <ErrorNote>{error}</ErrorNote>}

          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Creating your restaurant…" : "Create my restaurant"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setError(null);
            }}
            className="text-[14px] font-bold text-ink-3 hover:text-ink"
          >
            ← Back
          </button>
        </div>
      )}

      <p className="mt-5 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-3">
        No card required and nothing is charged today. By creating an account you
        agree to the{" "}
        <Link href="/terms" className="font-bold text-brand-strong">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-bold text-brand-strong">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13.5px] font-extrabold">{label}</span>
      <span className="mb-1.5 block text-[12.5px] text-ink-3">{hint}</span>
      {children}
    </label>
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
