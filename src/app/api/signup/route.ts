import { NextResponse } from "next/server";
import { loginStaff, setSessionCookie } from "@/lib/auth";
import { createRestaurant, SignupError } from "@/lib/signup";
import { LIMITS, clientKey, rateLimit } from "@/lib/ratelimit";
import { validateAddress } from "@/lib/geocode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Restaurant self-signup. Creates the org and owner account, then signs the
 * owner straight in — a signup that ends at a login form is a signup that
 * loses half its conversions.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  // Each signup writes an org, an owner and a menu draft, so an unthrottled
  // endpoint is a way to fill the database and the marketplace with junk.
  const limit = rateLimit(
    `signup:${clientKey(req)}`,
    LIMITS.signup.max,
    LIMITS.signup.windowMs,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many signups from this address. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  /**
   * Check the address before creating anything.
   *
   * A restaurant types this once and every delivery fee is measured from it
   * afterwards, so a vague or ambiguous one is a permanent defect that nothing
   * downstream can recover from — "1142 Mission St" resolves confidently to a
   * street 348 miles away, and the diner around the corner gets refused.
   *
   * Only the owner's mistakes block. If the geocoder is down, out of quota or
   * unconfigured, signup proceeds without coordinates: refusing a restaurant
   * because our provider is having a bad afternoon would be an absurd trade on
   * the highest-friction screen in the product.
   */
  const address = String(body.address ?? "").trim();

  // An empty address is a missing required field, not a geocoding failure, and
  // it belongs to createRestaurant's own validation so the caller gets the
  // same 400 and the same message as every other missing field. Only an
  // address somebody actually typed is worth a lookup.
  const check = address ? await validateAddress(address) : null;
  if (check && !check.ok && check.fixable) {
    return NextResponse.json(
      { error: check.reason, field: "address" },
      { status: 422 },
    );
  }
  if (check && !check.ok) {
    console.warn(`[signup] address not verified (${check.reason}) for "${address}"`);
  }

  try {
    const result = createRestaurant({
      brandName: String(body.brandName ?? ""),
      cuisine: String(body.cuisine ?? ""),
      address,
      ownerName: String(body.ownerName ?? ""),
      email,
      password,
      lat: check?.ok ? check.lat : null,
      lng: check?.ok ? check.lng : null,
    });

    const login = loginStaff(email, password);
    if (login.ok) await setSessionCookie(login.token, login.ttlMs);

    return NextResponse.json({
      ok: true,
      orgId: result.orgId,
      slug: result.slug,
      signedIn: login.ok,
      // What the geocoder actually recorded, so an owner can spot a wrong
      // match immediately rather than discovering it through odd fees.
      address: check?.ok ? check.formatted : address,
      addressVerified: check?.ok === true,
      next: "/ops/menu",
    });
  } catch (err) {
    if (err instanceof SignupError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: err.status },
      );
    }
    console.error("signup failed", err);
    return NextResponse.json(
      { error: "Could not create the account" },
      { status: 500 },
    );
  }
}
