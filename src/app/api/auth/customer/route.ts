import { NextResponse } from "next/server";
import { createSessionFor, setSessionCookie } from "@/lib/auth";
import { CustomerError, signIn, signUp } from "@/lib/customer";
import { LIMITS, clientKey, rateLimit, resetLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PERSON_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Customer accounts: POST to register, PUT to sign in.
 *
 * Both throttled. Registration because an unthrottled endpoint fills the
 * database with junk accounts, and sign-in because a password endpoint without
 * a limiter is a free credential-stuffing service. Sign-in is limited by
 * address AND by the email being targeted, since either alone is defeatable —
 * the same reasoning as the staff login.
 */
export async function POST(req: Request) {
  const limit = rateLimit(
    `customer-signup:${clientKey(req)}`,
    LIMITS.signup.max,
    LIMITS.signup.windowMs,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many signups from this address. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const account = signUp({
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      phone: body.phone ? String(body.phone) : undefined,
      marketingEmail: body.marketingEmail === true,
    });

    // Signed in immediately. A signup that ends at a login form loses people
    // who have just proved who they are.
    const token = createSessionFor(account.personId, PERSON_TTL_MS);
    await setSessionCookie(token);

    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (err) {
    if (err instanceof CustomerError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: err.status },
      );
    }
    console.error("customer signup failed", err);
    return NextResponse.json({ error: "Could not create the account" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const byIp = rateLimit(
    `customer-login:${clientKey(req)}`,
    LIMITS.staffLogin.max,
    LIMITS.staffLogin.windowMs,
  );
  const byAccount = rateLimit(
    `customer-login-acct:${email}`,
    LIMITS.staffLoginAccount.max,
    LIMITS.staffLoginAccount.windowMs,
  );
  if (!byIp.ok || !byAccount.ok) {
    const retry = Math.max(byIp.retryAfter, byAccount.retryAfter);
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  const result = signIn(email, String(body.password ?? ""));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  // A correct password clears the counters, so somebody who mistyped twice is
  // not locked out of their own account for a quarter of an hour.
  resetLimit(`customer-login:${clientKey(req)}`);
  resetLimit(`customer-login-acct:${email}`);

  const token = createSessionFor(result.personId, PERSON_TTL_MS);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, displayName: result.displayName });
}
