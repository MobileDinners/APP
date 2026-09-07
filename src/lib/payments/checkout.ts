import { getOrder, transition } from "../orders";
import { getPaymentForOrder, getConnectState, recordPayment, setPaymentStatus } from "./store";
import { getPaymentProvider, paymentsConfigured } from "./index";
import { splitPayment } from "./split";
import { PaymentError } from "./types";

/**
 * Charging a diner's card, and the one place an order becomes paid.
 *
 * Two things can tell us a payment succeeded: the browser, which confirmed the
 * card and then called us, and Stripe's webhook, which is authoritative but
 * can arrive first, late, twice, or never if the endpoint is not reachable.
 * Both funnel through `markOrderPaid` below so they cannot disagree, and it is
 * idempotent because in practice both usually fire.
 *
 * The rule that matters: we never take the browser's word for it. A client
 * saying "the payment worked" is a claim from a machine we do not control, and
 * treating it as fact is how you ship an app that gives away food for free.
 * `confirmFromClient` re-reads the intent from Stripe before believing it.
 */

export type IntentForOrder = {
  intentId: string;
  clientSecret: string;
  amountCents: number;
  publishableKey: string;
};

/**
 * Creates (or returns) the payment intent for an order awaiting payment.
 *
 * Idempotent by way of the provider: the intent is keyed on the order id, so a
 * diner who reloads checkout gets the same intent rather than a second one.
 */
export async function intentForOrder(orderId: string): Promise<IntentForOrder> {
  if (!paymentsConfigured()) {
    throw new PaymentError("No card processor is configured", 400, "not_configured");
  }

  const order = getOrder(orderId);
  if (!order) throw new PaymentError("No such order", 404, "not_found");
  if (order.state !== "PENDING_PAYMENT") {
    throw new PaymentError(
      `This order is ${order.state}, not awaiting payment`,
      409,
      "not_payable",
    );
  }

  const connect = getConnectState(order.orgId);
  if (!connect.accountId) {
    // Deliberately blunt. A restaurant with no connected account cannot be
    // paid, and taking the diner's money into a platform account with no route
    // onward is how you end up holding funds you have no agreement to hold.
    throw new PaymentError(
      "This restaurant has not finished setting up payouts yet",
      409,
      "restaurant_not_onboarded",
    );
  }

  const totals = {
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    taxCents: order.taxCents,
    tipCents: order.tipCents,
    deliveryFeeCents: order.deliveryFeeCents,
    serviceFeeCents: order.serviceFeeCents,
    totalCents: order.totalCents,
    pointsRedeemed: order.pointsRedeemed,
    pointsEarned: order.pointsEarned,
  };
  const split = splitPayment(totals);

  const provider = getPaymentProvider();

  /**
   * Reuse an intent we already made for this order, rather than asking Stripe
   * for another one.
   *
   * The original code relied on a fixed idempotency key (`pi-<orderId>`) to
   * make retries safe. That works for a retried SUCCESS and fails badly for a
   * retried FAILURE: Stripe replays the saved error for 24 hours, so an intent
   * that failed once for a transient reason — a capability not yet active, a
   * blip — can never be created again, and the order becomes permanently
   * unpayable. That happened here: the first attempt failed because the
   * connected account lacked the transfers capability, and every retry
   * afterwards replayed the same error long after the capability was live.
   *
   * So: an existing usable intent is fetched and returned, and a genuinely new
   * attempt gets a fresh key. Creating a second intent is not a double charge —
   * only one is ever stored against the order and only a stored one can be
   * confirmed.
   */
  const existing = getPaymentForOrder(orderId);
  if (existing && existing.status !== "failed" && existing.status !== "canceled") {
    try {
      const found = await provider.getIntent(existing.intentId);
      if (found.status !== "canceled" && found.clientSecret) {
        return {
          intentId: found.intentId,
          clientSecret: found.clientSecret,
          amountCents: found.amountCents,
          publishableKey: requirePublishableKey(),
        };
      }
    } catch {
      // Fall through and make a new one. An intent we cannot read is no use,
      // and refusing to proceed would strand the order for the same reason
      // the fixed idempotency key did.
    }
  }

  const intent = await provider.createIntent({
    orderId,
    amountCents: split.chargeCents,
    currency: "usd",
    destinationAccountId: connect.accountId,
    applicationFeeCents: split.platformCents > 0 ? split.platformCents : 0,
    statementDescriptor: order.brandName ?? "Mobile Dinners",
    metadata: { org_id: order.orgId, person_id: order.personId ?? "" },
  });

  recordPayment({
    orderId,
    orgId: order.orgId,
    provider: provider.id,
    intentId: intent.intentId,
    status: intent.status,
    chargeCents: split.chargeCents,
    restaurantCents: split.restaurantCents,
    platformCents: split.platformCents,
    tipCents: split.driverTipCents,
  });

  return {
    intentId: intent.intentId,
    clientSecret: intent.clientSecret,
    amountCents: intent.amountCents,
    publishableKey: requirePublishableKey(),
  };
}

/** The browser cannot mount a card form without this, so fail loudly. */
function requirePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!key) {
    throw new PaymentError(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set, so the card form cannot load",
      500,
      "not_configured",
    );
  }
  return key;
}

/**
 * Moves a paid order to CONFIRMED. Safe to call repeatedly and out of order.
 *
 * Called by the client callback and by the webhook, which race by design. The
 * first one through does the work; the rest are no-ops. Returns true only when
 * this call is the one that confirmed it, so a caller can tell the difference
 * between "paid" and "paid, and I am the one who noticed".
 */
export function markOrderPaid(orderId: string, intentId: string): boolean {
  const order = getOrder(orderId);
  if (!order) return false;

  setPaymentStatus(intentId, "succeeded");

  // Already moved on — a webhook arriving after the kitchen accepted must not
  // drag the order backwards.
  if (order.state !== "PENDING_PAYMENT") return false;

  // transition() appends its own order.transitioned event. The money detail
  // lives on the payments row written when the intent was created, which is
  // where the ledger reads it from — duplicating it into the event payload
  // would create a second version of the same fact.
  transition(orderId, "CONFIRMED", "system", "SYSTEM");
  return true;
}

/**
 * The browser says the card cleared. Verify that with Stripe before believing
 * it, then confirm the order.
 */
export async function confirmFromClient(
  orderId: string,
  intentId: string,
): Promise<{ confirmed: boolean; status: string }> {
  const order = getOrder(orderId);
  if (!order) throw new PaymentError("No such order", 404, "not_found");

  const payment = getPaymentForOrder(orderId);
  // The intent must be the one WE created for THIS order. Without this check a
  // caller could confirm their order by quoting somebody else's successful
  // payment — including a one-cent payment of their own.
  if (!payment || payment.intentId !== intentId) {
    throw new PaymentError("That payment does not belong to this order", 403, "mismatch");
  }

  const provider = getPaymentProvider();
  const { status } = await provider.getIntent(intentId);

  if (status !== "succeeded") {
    if (status === "failed") {
      setPaymentStatus(intentId, "failed", "Card was declined");
    }
    return { confirmed: false, status };
  }

  markOrderPaid(orderId, intentId);
  return { confirmed: true, status };
}
