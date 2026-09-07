/**
 * The payments boundary.
 *
 * Same discipline as the POS adapters: everything processor-specific lives
 * behind this interface, so adding Adyen later means writing one file rather
 * than touching checkout.
 *
 * Two rules this interface exists to enforce:
 *   · No card number ever enters this system. The client talks to the
 *     processor directly with a short-lived client secret; we only ever see
 *     identifiers and amounts.
 *   · Every amount is integer cents, end to end.
 */

export type PaymentProviderId = "stripe" | "sandbox";

/** Where a restaurant is in the onboarding process. */
export type AccountStatus = {
  accountId: string;
  /** Can they take payments yet? False until Stripe finishes verification. */
  chargesEnabled: boolean;
  /** Can we pay them out yet? Needs bank details and identity checks. */
  payoutsEnabled: boolean;
  /** What Stripe is still waiting on, in plain words, for the ops dashboard. */
  requirements: string[];
};

/** A hosted onboarding link. Short-lived by design — Stripe's expire quickly. */
export type OnboardingLink = {
  url: string;
  expiresAt: string;
};

export type CreateIntentInput = {
  orderId: string;
  /** Total charged to the diner. */
  amountCents: number;
  /** Our share, transferred out of the charge. Never negative. */
  applicationFeeCents: number;
  /** The restaurant's connected account. */
  destinationAccountId: string;
  currency: string;
  /** Shown on the diner's statement. */
  statementDescriptor: string;
  /** Carried through to the webhook so we can reconcile without a lookup. */
  metadata: Record<string, string>;
};

export type PaymentIntent = {
  intentId: string;
  /** Handed to the browser to complete the payment. Not a secret we store. */
  clientSecret: string;
  status: PaymentStatus;
  amountCents: number;
};

export type PaymentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "processing"
  | "succeeded"
  | "canceled"
  | "failed";

export type RefundResult = {
  refundId: string;
  amountCents: number;
  status: "pending" | "succeeded" | "failed";
};

/** A verified inbound event from the processor. */
export type ProcessorEvent = {
  eventId: string;
  type: string;
  intentId: string | null;
  orderId: string | null;
  amountCents: number | null;
  /**
   * For charge.refunded: the CUMULATIVE amount refunded on that charge, which
   * is what Stripe reports and the only figure safe to act on. The per-refund
   * amount is not enough — a webhook can arrive twice, or out of order, and
   * adding a delta each time double-counts.
   */
  amountRefundedCents: number | null;
  status: PaymentStatus | null;
};

export interface PaymentProvider {
  readonly id: PaymentProviderId;

  /** Creates a connected account for a restaurant that has none. */
  createAccount(input: {
    orgId: string;
    brandName: string;
    email: string;
    country: string;
  }): Promise<string>;

  /** A Stripe-hosted link the owner completes to verify their business. */
  onboardingLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<OnboardingLink>;

  accountStatus(accountId: string): Promise<AccountStatus>;

  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;

  getIntent(intentId: string): Promise<PaymentIntent>;

  refund(input: {
    intentId: string;
    amountCents: number | null;
    reason: string;
  }): Promise<RefundResult>;

  /**
   * Verifies a webhook signature and normalises the payload.
   * Returns null when the signature does not check out — the caller must treat
   * that as hostile, not as a parse failure.
   */
  parseWebhook(rawBody: string, signature: string | null): ProcessorEvent | null;
}

export class PaymentError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "payment_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
