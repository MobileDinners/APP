import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PaymentError,
  type AccountStatus,
  type CreateIntentInput,
  type OnboardingLink,
  type PaymentIntent,
  type PaymentProvider,
  type PaymentStatus,
  type ProcessorEvent,
  type RefundResult,
} from "./types";

/**
 * Stripe Connect (Express), over the REST API directly.
 *
 * No SDK, for the same reason the POS adapters use raw fetch: one fewer
 * dependency to keep current, and the wire format is form-encoded POSTs that
 * are easier to read than a wrapper.
 *
 * Express means Stripe hosts the restaurant's onboarding and does their
 * identity and bank verification. We hold an account id per restaurant and
 * nothing else about them — no bank details ever land in our database.
 */

const API = process.env.STRIPE_API_BASE ?? "https://api.stripe.com/v1";

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new PaymentError(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local.",
      500,
      "not_configured",
    );
  }
  return key;
}

/**
 * Stripe takes form encoding, and nests with square brackets:
 *   metadata[order_id]=abc  transfer_data[destination]=acct_123
 */
function form(params: Record<string, string | number | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.append(k, String(v));
  }
  return body.toString();
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: string; idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // Stripe replays the original response for a repeated key, which is what
  // makes a retried checkout safe rather than a double charge.
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers,
    body: init.body,
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PaymentError(`Stripe returned a non-JSON response (${res.status})`, 502);
  }

  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string } }).error;
    throw new PaymentError(
      err?.message ?? `Stripe request failed (${res.status})`,
      res.status === 402 ? 402 : 502,
      err?.code ?? "stripe_error",
    );
  }
  return json as T;
}

/** Stripe's intent statuses map almost one-to-one; `requires_action` is ours. */
function toStatus(s: string): PaymentStatus {
  switch (s) {
    case "requires_payment_method":
    case "requires_confirmation":
    case "processing":
    case "succeeded":
    case "canceled":
      return s;
    case "requires_action":
    case "requires_capture":
      return "requires_confirmation";
    default:
      return "failed";
  }
}

type StripeAccount = {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements?: { currently_due?: string[]; past_due?: string[] };
};

type StripeIntent = {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  metadata?: Record<string, string>;
};

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  async createAccount({ orgId, brandName, email, country }) {
    const acct = await call<StripeAccount>("/accounts", {
      method: "POST",
      body: form({
        type: "express",
        country,
        email,
        "business_profile[name]": brandName,
        "business_profile[product_description]": "Restaurant food orders",
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "metadata[org_id]": orgId,
      }),
      idempotencyKey: `acct-${orgId}`,
    });
    return acct.id;
  },

  async onboardingLink({ accountId, refreshUrl, returnUrl }) {
    const link = await call<{ url: string; expires_at: number }>("/account_links", {
      method: "POST",
      body: form({
        account: accountId,
        type: "account_onboarding",
        refresh_url: refreshUrl,
        return_url: returnUrl,
      }),
    });
    return {
      url: link.url,
      expiresAt: new Date(link.expires_at * 1000).toISOString(),
    };
  },

  async accountStatus(accountId): Promise<AccountStatus> {
    const acct = await call<StripeAccount>(`/accounts/${accountId}`, { method: "GET" });
    return {
      accountId: acct.id,
      chargesEnabled: acct.charges_enabled,
      payoutsEnabled: acct.payouts_enabled,
      requirements: [
        ...(acct.requirements?.past_due ?? []),
        ...(acct.requirements?.currently_due ?? []),
      ],
    };
  },

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const meta: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.metadata)) {
      meta[`metadata[${k}]`] = v;
    }

    const intent = await call<StripeIntent>("/payment_intents", {
      method: "POST",
      body: form({
        amount: input.amountCents,
        currency: input.currency,
        "automatic_payment_methods[enabled]": "true",
        application_fee_amount: input.applicationFeeCents,
        "transfer_data[destination]": input.destinationAccountId,
        // The charge shows the restaurant's name, because that is who the
        // diner thinks they bought from.
        statement_descriptor_suffix: input.statementDescriptor.slice(0, 22),
        "metadata[order_id]": input.orderId,
        ...meta,
      }),
      // Keyed on the order, so a retried checkout returns the same intent
      // instead of creating a second one.
      idempotencyKey: `pi-${input.orderId}`,
    });

    return {
      intentId: intent.id,
      clientSecret: intent.client_secret,
      status: toStatus(intent.status),
      amountCents: intent.amount,
    };
  },

  async getIntent(intentId) {
    const intent = await call<StripeIntent>(`/payment_intents/${intentId}`, {
      method: "GET",
    });
    return {
      intentId: intent.id,
      clientSecret: intent.client_secret,
      status: toStatus(intent.status),
      amountCents: intent.amount,
    };
  },

  async refund({ intentId, amountCents, reason }): Promise<RefundResult> {
    const refund = await call<{ id: string; amount: number; status: string }>(
      "/refunds",
      {
        method: "POST",
        body: form({
          payment_intent: intentId,
          amount: amountCents ?? undefined,
          // Refunding the application fee too means a refunded order costs the
          // restaurant nothing, which is the only defensible behaviour.
          refund_application_fee: "true",
          reverse_transfer: "true",
          "metadata[reason]": reason,
        }),
      },
    );
    return {
      refundId: refund.id,
      amountCents: refund.amount,
      status:
        refund.status === "succeeded"
          ? "succeeded"
          : refund.status === "pending"
            ? "pending"
            : "failed",
    };
  },

  parseWebhook(rawBody, signature): ProcessorEvent | null {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signature) return null;
    if (!verifySignature(rawBody, signature, secret)) return null;

    let evt: {
      id: string;
      type: string;
      data?: { object?: StripeIntent };
    };
    try {
      evt = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const obj = evt.data?.object;
    return {
      eventId: evt.id,
      type: evt.type,
      intentId: obj?.id ?? null,
      orderId: obj?.metadata?.order_id ?? null,
      amountCents: typeof obj?.amount === "number" ? obj.amount : null,
      status: obj?.status ? toStatus(obj.status) : null,
    };
  },
};

/**
 * Stripe signs webhooks as `t=<timestamp>,v1=<hmac>` over "timestamp.body".
 * Rejecting old timestamps is what stops a captured request being replayed at
 * us later; comparing in constant time is what stops the signature being
 * guessed a byte at a time.
 */
function verifySignature(body: string, header: string, secret: string): boolean {
  const parts = new Map(
    header.split(",").map((p) => {
      const [k, ...rest] = p.split("=");
      return [k.trim(), rest.join("=")] as const;
    }),
  );
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
