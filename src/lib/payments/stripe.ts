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

  /**
   * A live key outside production is refused.
   *
   * This is the mirror of the rule the sandbox providers follow — they refuse
   * to run IN production — and it exists because the mistake is so easy and so
   * expensive. A live key in .env.local means a laptop running `npm run dev`,
   * with test data and deliberately broken states, is wired to an account that
   * moves real money off real cards. It has already happened once on this
   * project: the first keys pasted in were pk_live/sk_live on a verified
   * entity with charges enabled.
   *
   * Nothing about the code can tell a test charge from a real one at that
   * point. The only safe moment to catch it is here, before the first call.
   */
  if (key.startsWith("sk_live_") && process.env.NODE_ENV !== "production") {
    throw new PaymentError(
      "Refusing to use a LIVE Stripe key outside production. This would charge " +
        "real cards from a development environment. Use the sk_test_… key from " +
        "the dashboard with Test mode on, or set NODE_ENV=production if this " +
        "really is your production deployment.",
      500,
      "live_key_in_development",
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

/**
 * The Accounts v2 API.
 *
 * Different enough from v1 to need its own caller: JSON rather than form
 * encoding, and a pinned Stripe-Version, because v2 is versioned by date and
 * an unpinned request would change shape underneath us on Stripe's schedule.
 *
 * Why v2 at all: Stripe now refuses v1 account creation for new Connect
 * integrations. There is a compatibility switch in the dashboard, but it did
 * not apply to sandbox environments and it is a shim on a deprecated path —
 * building a launch on it would mean doing this migration later, under time
 * pressure, instead of now.
 *
 * Only account creation and status moved. Account links still take a v2
 * account id on the v1 endpoint, so onboarding is untouched, and PaymentIntents
 * with transfer_data[destination] are unaffected — which is why the split
 * logic, the card form and the checkout flow needed no changes at all.
 */
const V2_VERSION = "2026-08-26.dahlia";

async function callV2<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
    "Stripe-Version": V2_VERSION,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`https://api.stripe.com/v2${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PaymentError(`Stripe returned a non-JSON response (${res.status})`, 502);
  }

  if (!res.ok) {
    // v2 nests the error the same way v1 does, but some failures come back
    // flat, so both shapes are read rather than assuming one.
    const body = json as { error?: { message?: string; code?: string }; message?: string; code?: string };
    throw new PaymentError(
      body.error?.message ?? body.message ?? `Stripe request failed (${res.status})`,
      res.status === 402 ? 402 : 502,
      body.error?.code ?? body.code ?? "stripe_error",
    );
  }
  return json as T;
}

/** The slice of a v2 account this integration reads. */
type V2Account = {
  id: string;
  dashboard?: string;
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: { status?: string };
        stripe_balance?: { payouts?: { status?: string } };
      };
    };
    recipient?: {
      capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } };
    };
  };
  requirements?: { entries?: { description?: string; awaiting_action_from?: string }[] };
};

function v2Status(acct: V2Account): AccountStatus {
  const caps = acct.configuration?.merchant?.capabilities;
  const transfers =
    acct.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  return {
    accountId: acct.id,
    chargesEnabled: caps?.card_payments?.status === "active",
    // "Can we pay them?" is the transfers capability, not the payouts one.
    // payouts covers money leaving Stripe for their bank, which lags and is
    // not what checkout depends on.
    payoutsEnabled: transfers === "active",
    // v2 returns structured requirement entries rather than v1's flat strings.
    requirements: (acct.requirements?.entries ?? [])
      .map((e) => e.description)
      .filter((d): d is string => Boolean(d)),
  };
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
    const acct = await callV2<V2Account>("/core/accounts", {
      method: "POST",
      body: {
        contact_email: email,
        display_name: brandName,
        identity: { country: country.toLowerCase(), entity_type: "company" },
        configuration: {
          // merchant lets the account be charged; recipient lets it be PAID.
          // Both are needed, and the second is easy to miss: without
          // stripe_transfers, creating the PaymentIntent fails at checkout
          // with insufficient_capabilities_for_transfer — long after
          // onboarding looked complete and every requirement was cleared.
          merchant: { capabilities: { card_payments: { requested: true } } },
          recipient: {
            capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
          },
        },
        // Express dashboards require the platform to own fees and losses.
        // Stripe rejects the combination outright otherwise, which is a
        // reasonable thing to be strict about: it decides who pays for a
        // chargeback.
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        dashboard: "express",
        metadata: { org_id: orgId },
        include: ["configuration.merchant", "configuration.recipient", "requirements"],
      },
      // The key carries the request SHAPE, not just the org.
      //
      // Stripe refuses a reused key whose parameters have changed, and it
      // refuses it forever. A key of `acct-<orgId>` was therefore permanently
      // poisoned by the v1-to-v2 migration: the org could never get an account
      // again, on an endpoint whose whole job is creating one.
      //
      // Duplicate accounts are already prevented a level up — the route only
      // calls this when no account id is stored — so this key exists to make a
      // concurrent double-submit safe, and bumping the version when the body
      // changes keeps it from becoming a permanent lock.
      idempotencyKey: `acct-v2-${orgId}`,
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
    const acct = await callV2<V2Account>(
      `/core/accounts/${accountId}?include=configuration.merchant` +
        "&include=configuration.recipient&include=requirements",
      { method: "GET" },
    );
    return v2Status(acct);
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
      // A fresh key per attempt. Reuse of an existing intent is handled a
      // level up in checkout.ts, which can tell "the same request again" from
      // "a new attempt after a failure" — Stripe cannot, and replays a saved
      // error for 24 hours, which strands the order.
      idempotencyKey: `pi-${input.orderId}-${Date.now().toString(36)}`,
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
