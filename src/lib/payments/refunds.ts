import { getOrder } from "../orders";
import { getPaymentForOrder, setRefundedTotal } from "./store";
import { getPaymentProvider, paymentsConfigured } from "./index";
import { PaymentError } from "./types";
import { getDb } from "../db";

/**
 * Refunding a diner.
 *
 * The platform absorbs it: the diner gets their money back, the restaurant
 * keeps what was transferred to them, and the difference comes out of our
 * balance. See the refund call in stripe.ts for why — a restaurant that loses
 * the ingredients, the labour AND the money because a diner complained has
 * been made to underwrite our customer service.
 *
 * Two consequences worth being clear-eyed about. This costs real money and it
 * scales with volume, so refund abuse is a genuine risk rather than a
 * theoretical one. And every refund is recorded with who authorised it,
 * because "who refunded this" is the first question asked when the number
 * looks wrong at the end of a month.
 */

export type RefundOutcome = {
  refundId: string;
  amountCents: number;
  /** Total refunded against this order, including earlier partial refunds. */
  totalRefundedCents: number;
  chargeCents: number;
  status: string;
};

export async function refundOrder(input: {
  orderId: string;
  /** Null refunds whatever remains unrefunded. */
  amountCents: number | null;
  reason: string;
  /** Who authorised it — an email, recorded on the order's event log. */
  actor: string;
}): Promise<RefundOutcome> {
  if (!paymentsConfigured()) {
    throw new PaymentError("No card processor is configured", 400, "not_configured");
  }

  const order = getOrder(input.orderId);
  if (!order) throw new PaymentError("No such order", 404, "not_found");

  const payment = getPaymentForOrder(input.orderId);
  if (!payment) {
    throw new PaymentError(
      "This order has no card payment to refund",
      409,
      "no_payment",
    );
  }
  if (payment.status !== "succeeded") {
    // Refunding a charge that never succeeded would either fail at Stripe or,
    // worse, succeed against some other charge.
    throw new PaymentError(
      `That payment is ${payment.status}, not a completed charge`,
      409,
      "not_refundable",
    );
  }

  const remaining = payment.chargeCents - payment.refundedCents;
  if (remaining <= 0) {
    throw new PaymentError("This order is already fully refunded", 409, "already_refunded");
  }

  const amount = input.amountCents ?? remaining;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new PaymentError("Refund amount must be a positive number of cents", 400, "bad_amount");
  }
  if (amount > remaining) {
    // The single most expensive mistake this endpoint could make is refunding
    // more than was charged, repeatedly, because nobody checked the running
    // total against earlier partial refunds.
    throw new PaymentError(
      `Only ${(remaining / 100).toFixed(2)} of this order remains unrefunded`,
      409,
      "exceeds_remaining",
    );
  }

  const reason = input.reason.trim().slice(0, 200) || "No reason given";

  const provider = getPaymentProvider();
  const result = await provider.refund({
    intentId: payment.intentId,
    amountCents: amount,
    reason,
  });

  if (result.status === "failed") {
    throw new PaymentError("The processor refused the refund", 502, "refund_failed");
  }

  // Record the new TOTAL, not a delta. The charge.refunded webhook lands
  // moments later carrying Stripe's own cumulative figure and sets the same
  // value, so the two agree however they interleave. Adding a delta here and
  // again there would double every refund.
  setRefundedTotal(payment.intentId, payment.refundedCents + amount);

  appendRefundEvent(input.orderId, {
    refund_id: result.refundId,
    amount_cents: amount,
    reason,
    absorbed_by: "platform",
    actor: input.actor,
  });

  const after = getPaymentForOrder(input.orderId);
  return {
    refundId: result.refundId,
    amountCents: amount,
    totalRefundedCents: after?.refundedCents ?? amount,
    chargeCents: payment.chargeCents,
    status: result.status,
  };
}

/**
 * Appends to the order's event log directly.
 *
 * Not a state transition: an order can be COMPLETED and refunded, and forcing
 * a refund to move the order backwards through the state machine would break
 * the kitchen's view of work it has already done.
 */
function appendRefundEvent(orderId: string, payload: Record<string, unknown>): void {
  const db = getDb();
  const row = db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS s FROM order_events WHERE order_id = ?")
    .get(orderId) as { s: number };
  db.prepare(
    `INSERT INTO order_events (order_id, seq, event_type, payload, actor, source, occurred_at)
     VALUES (?, ?, 'payment.refunded', ?, ?, 'OPS', ?)`,
  ).run(
    orderId,
    row.s + 1,
    JSON.stringify(payload),
    String(payload.actor ?? "system"),
    new Date().toISOString(),
  );
}

/** What the UI needs to show before anyone presses the button. */
export function refundableAmount(orderId: string): {
  refundable: boolean;
  chargeCents: number;
  refundedCents: number;
  remainingCents: number;
  reason: string | null;
} {
  const payment = getPaymentForOrder(orderId);
  if (!payment) {
    return {
      refundable: false,
      chargeCents: 0,
      refundedCents: 0,
      remainingCents: 0,
      reason: "No card payment was taken for this order",
    };
  }
  if (payment.status !== "succeeded") {
    return {
      refundable: false,
      chargeCents: payment.chargeCents,
      refundedCents: payment.refundedCents,
      remainingCents: 0,
      reason: `The payment is ${payment.status}, not a completed charge`,
    };
  }
  const remaining = payment.chargeCents - payment.refundedCents;
  return {
    refundable: remaining > 0,
    chargeCents: payment.chargeCents,
    refundedCents: payment.refundedCents,
    remainingCents: Math.max(0, remaining),
    reason: remaining > 0 ? null : "Already fully refunded",
  };
}
