import { randomUUID } from "node:crypto";
import type {
  AccountStatus,
  OnboardingLink,
  PaymentIntent,
  PaymentProvider,
  ProcessorEvent,
  RefundResult,
} from "./types";

/**
 * A local stand-in so the whole system runs with no Stripe keys.
 *
 * Same reasoning as the POS sandbox: a demo that dies without credentials is
 * a demo nobody can show. This settles instantly, charges nothing, and is
 * refused outright in production by index.ts — a fake processor in front of
 * real diners would be fraud, not a fallback.
 */

const accounts = new Map<string, AccountStatus>();
const intents = new Map<string, PaymentIntent & { orderId: string }>();

export const sandboxProvider: PaymentProvider = {
  id: "sandbox",

  async createAccount({ orgId }) {
    const id = `acct_sandbox_${orgId.slice(0, 10)}`;
    accounts.set(id, {
      accountId: id,
      // Deliberately not enabled on creation, so the onboarding screen has the
      // same two states it will have against the real thing.
      chargesEnabled: false,
      payoutsEnabled: false,
      requirements: ["external_account", "individual.verification.document"],
    });
    return id;
  },

  async onboardingLink({ accountId, returnUrl }): Promise<OnboardingLink> {
    // Completing the "hosted" step is just flipping the flags locally.
    accounts.set(accountId, {
      accountId,
      chargesEnabled: true,
      payoutsEnabled: true,
      requirements: [],
    });
    return {
      url: `${returnUrl}?sandbox=1`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
  },

  async accountStatus(accountId) {
    return (
      accounts.get(accountId) ?? {
        accountId,
        chargesEnabled: true,
        payoutsEnabled: true,
        requirements: [],
      }
    );
  },

  async createIntent(input): Promise<PaymentIntent> {
    const intentId = `pi_sandbox_${randomUUID().slice(0, 12)}`;
    const intent = {
      intentId,
      clientSecret: `${intentId}_secret_sandbox`,
      status: "succeeded" as const,
      amountCents: input.amountCents,
      orderId: input.orderId,
    };
    intents.set(intentId, intent);
    return intent;
  },

  async getIntent(intentId) {
    const found = intents.get(intentId);
    if (found) return found;
    return {
      intentId,
      clientSecret: `${intentId}_secret_sandbox`,
      status: "succeeded",
      amountCents: 0,
    };
  },

  async refund({ intentId, amountCents }): Promise<RefundResult> {
    return {
      refundId: `re_sandbox_${intentId.slice(-8)}`,
      amountCents: amountCents ?? intents.get(intentId)?.amountCents ?? 0,
      status: "succeeded",
    };
  },

  parseWebhook(): ProcessorEvent | null {
    // Nothing signs sandbox webhooks, so nothing may be trusted from one.
    return null;
  },
};
