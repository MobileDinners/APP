import { NextResponse } from "next/server";
import { markOrderPaid } from "@/lib/payments/checkout";
import { getPaymentProvider, paymentsConfigured } from "@/lib/payments";
import { addRefund, claimEvent, getPaymentByIntent, orgIdForAccount, saveConnectStatus, setPaymentStatus } from "@/lib/payments/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe webhooks.
 *
 * The signature is verified before the body is parsed as anything meaningful,
 * and the event id is claimed before any state changes — webhooks are
 * at-least-once, so the same success can arrive three times and must settle an
 * order exactly once.
 *
 * Anything unverified is a 400 with no detail. An attacker probing this
 * endpoint learns nothing about why they failed.
 */
export async function POST(req: Request) {
  if (!paymentsConfigured()) {
    return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");

  const provider = getPaymentProvider();
  const event = provider.parseWebhook(raw, signature);
  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const fresh = claimEvent({
    eventId: event.eventId,
    provider: provider.id,
    eventType: event.type,
    intentId: event.intentId,
    orderId: event.orderId,
    payload: raw,
  });
  // Already handled. Stripe treats a 200 as "stop retrying", which is correct.
  if (!fresh) return NextResponse.json({ ok: true, duplicate: true });

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        if (event.intentId) {
          // The webhook is the authoritative signal, and the only one that
          // arrives when the diner's browser dies between confirming the card
          // and telling us. markOrderPaid is idempotent, so the common case —
          // both this and the client callback firing — confirms once.
          const orderId = event.orderId ?? getPaymentByIntent(event.intentId)?.orderId;
          if (orderId) markOrderPaid(orderId, event.intentId);
          else setPaymentStatus(event.intentId, "succeeded");
        }
        break;

      case "payment_intent.payment_failed":
        if (event.intentId) {
          setPaymentStatus(event.intentId, "failed", "Card declined by the issuer");
        }
        break;

      case "charge.refunded":
        if (event.intentId && event.amountCents !== null) {
          addRefund(event.intentId, event.amountCents);
        }
        break;

      case "account.updated": {
        // Carries the connected account, not an order — look the org up by id.
        const payload = JSON.parse(raw) as {
          data?: { object?: { id?: string; charges_enabled?: boolean; payouts_enabled?: boolean } };
        };
        const acct = payload.data?.object;
        const orgId = acct?.id ? orgIdForAccount(acct.id) : null;
        if (orgId) {
          saveConnectStatus(
            orgId,
            acct?.charges_enabled === true,
            acct?.payouts_enabled === true,
          );
        }
        break;
      }

      default:
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("webhook handling failed", event.type, err);
    // A 500 makes Stripe retry, which is what we want for a transient failure.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
