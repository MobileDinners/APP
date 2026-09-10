import { NextResponse } from "next/server";
import { loginStaff, setSessionCookie } from "@/lib/auth";
import { LIMITS, clientKey, rateLimit, resetLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // Two buckets, because either one alone is defeatable. Limiting by IP only
  // loses to a botnet; limiting by account only lets one IP grind through every
  // account in turn. An attacker has to beat both.
  const ip = clientKey(req);
  const account = body.email.trim().toLowerCase();
  const byIp = rateLimit(`login:ip:${ip}`, LIMITS.staffLogin.max, LIMITS.staffLogin.windowMs);
  const byAccount = rateLimit(
    `login:acct:${account}`,
    LIMITS.staffLoginAccount.max,
    LIMITS.staffLoginAccount.windowMs,
  );

  if (!byIp.ok || !byAccount.ok) {
    const retryAfter = Math.max(byIp.retryAfter, byAccount.retryAfter);
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const result = loginStaff(body.email, body.password);
  if (!result.ok) {
    // The message stays generic — which account exists is not something a
    // failed login should reveal.
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  // A correct password clears the counters, so a person who mistyped twice and
  // then got it right is not locked out of their own restaurant mid-service.
  resetLimit(`login:ip:${ip}`);
  resetLimit(`login:acct:${account}`);

  await setSessionCookie(result.token);
  return NextResponse.json({ ok: true });
}
