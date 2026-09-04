import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRestaurantById } from "@/lib/orders";
import { getPaymentProvider, PaymentError, stripeMode } from "@/lib/payments";
import {
  getConnectState,
  saveConnectAccount,
  saveConnectStatus,
} from "@/lib/payments/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function publicUrl(req: Request): string {
  return process.env.MD_PUBLIC_URL ?? new URL(req.url).origin;
}

/** Current connection status for the signed-in restaurant. */
export async function GET() {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  return NextResponse.json({
    ...getConnectState(session.orgId),
    mode: stripeMode(),
  });
}

/**
 * Starts or resumes Stripe Express onboarding.
 *
 * Owners only: connecting a payout destination decides where this restaurant's
 * money lands, which is not a decision a shift lead gets to make.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.kind !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  if (session.role !== "owner") {
    return NextResponse.json(
      { error: "Only an owner can connect a payout account" },
      { status: 403 },
    );
  }

  const org = getRestaurantById(session.orgId);
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const provider = getPaymentProvider();
    const state = getConnectState(session.orgId);

    let accountId = state.accountId;
    if (!accountId) {
      accountId = await provider.createAccount({
        orgId: session.orgId,
        brandName: org.brandName,
        email: session.email,
        country: process.env.MD_COUNTRY ?? "US",
      });
      saveConnectAccount(session.orgId, accountId);
    }

    const base = publicUrl(req);
    const link = await provider.onboardingLink({
      accountId,
      refreshUrl: `${base}/ops/payments?refresh=1`,
      returnUrl: `${base}/ops/payments?done=1`,
    });

    // The sandbox completes onboarding synchronously; ask once so the dashboard
    // is right immediately rather than after a webhook that never comes.
    const status = await provider.accountStatus(accountId);
    saveConnectStatus(session.orgId, status.chargesEnabled, status.payoutsEnabled);

    return NextResponse.json({ url: link.url, expiresAt: link.expiresAt, accountId });
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("connect failed", err);
    return NextResponse.json({ error: "Could not start onboarding" }, { status: 500 });
  }
}
