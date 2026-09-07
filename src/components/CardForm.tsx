"use client";

import { useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/money";

/**
 * The card form.
 *
 * Stripe.js is loaded from js.stripe.com rather than bundled, because Stripe
 * requires it — PCI compliance depends on the script coming from them, and a
 * self-hosted copy would put this application in scope for a far heavier audit.
 * That is also why the card fields render inside Stripe's iframe: the number
 * never touches our page, our server or our database. We hold an intent id and
 * nothing else.
 *
 * No npm package either. The Payment Element is a handful of calls on a global
 * Stripe.js already provides, and the rest of this codebase talks to Stripe,
 * DoorDash and the POS providers over raw REST for the same reason.
 */

/** Minimal shape of the bits of Stripe.js used here. */
type StripeElement = { mount: (selector: string | HTMLElement) => void; destroy: () => void };
type StripeElements = { create: (type: string, opts?: unknown) => StripeElement };
type StripeJs = {
  elements: (opts: { clientSecret: string; appearance?: unknown }) => StripeElements;
  confirmPayment: (opts: {
    elements: StripeElements;
    redirect: "if_required";
  }) => Promise<{ error?: { message?: string; type?: string }; paymentIntent?: { id: string; status: string } }>;
};
declare global {
  interface Window {
    Stripe?: (key: string) => StripeJs;
  }
}

const SCRIPT_SRC = "https://js.stripe.com/v3/";

/** Loads Stripe.js once per page, however many times this mounts. */
function loadStripeJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Stripe) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Stripe.js failed to load")));
    });
  }

  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Stripe.js failed to load"));
    document.head.appendChild(el);
  });
}

export type CardFormProps = {
  orderId: string;
  amountCents: number;
  clientSecret: string;
  publishableKey: string;
  onPaid: () => void;
  onCancel: () => void;
};

export function CardForm({
  orderId,
  amountCents,
  clientSecret,
  publishableKey,
  onPaid,
  onCancel,
}: CardFormProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const stripeRef = useRef<StripeJs | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let element: StripeElement | null = null;

    void (async () => {
      try {
        await loadStripeJs();
        if (cancelled || !window.Stripe || !mountRef.current) return;

        const stripe = window.Stripe(publishableKey);
        const elements = stripe.elements({
          clientSecret,
          // Inherit the page rather than shipping Stripe's default blue.
          appearance: {
            theme: "stripe",
            variables: {
              colorPrimary: "#e23744",
              borderRadius: "10px",
              fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            },
          },
        });
        element = elements.create("payment", { layout: "tabs" });
        element.mount(mountRef.current);

        stripeRef.current = stripe;
        elementsRef.current = elements;
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError("The payment form could not load. Check your connection.");
      }
    })();

    return () => {
      cancelled = true;
      // Unmount Stripe's iframe explicitly; React does not own it.
      try {
        element?.destroy();
      } catch {
        /* already gone */
      }
    };
  }, [clientSecret, publishableKey]);

  async function pay() {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return;

    setBusy(true);
    setError(null);

    // redirect: "if_required" keeps the diner on this page for ordinary cards
    // and still allows the 3D Secure step-up when the issuer demands one.
    const result = await stripe.confirmPayment({ elements, redirect: "if_required" });

    if (result.error) {
      setError(result.error.message ?? "That card was declined.");
      setBusy(false);
      return;
    }

    const intent = result.paymentIntent;
    if (!intent || intent.status !== "succeeded") {
      setError("The payment did not complete. Nothing has been charged.");
      setBusy(false);
      return;
    }

    // Stripe says it worked; our server verifies that with Stripe before the
    // order moves. The browser's word is not enough to release food.
    const res = await fetch("/api/payments/intent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, intentId: intent.id }),
    });

    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      // The card DID clear here — the webhook will confirm the order shortly.
      // Saying "payment failed" would be false and would invite a second
      // attempt at a card that has already been charged.
      setError(
        (d.error ?? "We could not confirm your order") +
          " Your card was charged and this will resolve itself shortly — do not pay again.",
      );
      setBusy(false);
      return;
    }

    onPaid();
  }

  return (
    <div className="rounded-[14px] border border-line bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[16px] font-extrabold">Pay {formatCents(amountCents)}</h2>
        <span className="text-[12px] text-ink-3">Secured by Stripe</span>
      </div>

      <div ref={mountRef} />

      {error && (
        <p className="mt-3 rounded-[10px] border border-red bg-red-soft px-3 py-2.5 text-[13.5px] font-semibold leading-snug text-red">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void pay()}
          disabled={!ready || busy}
          className="flex-1 rounded-[10px] bg-brand px-5 py-3 text-[15px] font-extrabold text-brand-ink transition-colors hover:bg-brand-press disabled:opacity-40"
        >
          {busy ? "Paying…" : ready ? `Pay ${formatCents(amountCents)}` : "Loading…"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-[10px] border border-line-2 px-4 py-3 text-[15px] font-bold hover:bg-card-2 disabled:opacity-40"
        >
          Back
        </button>
      </div>

      <p className="mt-3 text-[12px] leading-snug text-ink-3">
        Your card details go straight to Stripe and never reach Mobile Dinners. We
        store a payment reference and nothing else — no card number, ever.
      </p>
    </div>
  );
}
