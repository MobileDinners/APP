import { sandboxProvider } from "./sandbox";
import { stripeProvider } from "./stripe";
import { PaymentError, type PaymentProvider } from "./types";

export * from "./types";
export * from "./split";

/** True once real Stripe credentials are present. */
export function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Picks the processor.
 *
 * With keys: Stripe. Without keys: the sandbox, but only outside production —
 * shipping a fake processor to real diners would be taking orders we cannot
 * charge for, so the app refuses to start that way instead of degrading
 * quietly into fraud.
 */
export function getPaymentProvider(): PaymentProvider {
  if (paymentsConfigured()) return stripeProvider;

  if (process.env.NODE_ENV === "production") {
    throw new PaymentError(
      "STRIPE_SECRET_KEY is not set. Refusing to run the sandbox processor in " +
        "production — orders would be accepted without ever being charged.",
      500,
      "not_configured",
    );
  }
  return sandboxProvider;
}

/** Which mode the Stripe key is for. Shown in ops so nobody ships test keys. */
export function stripeMode(): "live" | "test" | "none" {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return "none";
  return key.startsWith("sk_live_") ? "live" : "test";
}
