import { NextResponse } from "next/server";
import { LIMITS, clientKey, rateLimit } from "@/lib/ratelimit";
import { normalizePhone, setSessionCookie, verifyOtp } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  const code = (body.code ?? "").trim();
  if (!phone || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit code" }, { status: 400 });
  }

  // The per-code attempt cap stops guessing ONE code. It does nothing about
  // spraying one guess across many phone numbers, which is what this catches.
  const limit = rateLimit(
    `otp:verify:${clientKey(req)}`,
    LIMITS.otpVerify.max,
    LIMITS.otpVerify.windowMs,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const result = verifyOtp(phone, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  await setSessionCookie(result.token);
  return NextResponse.json({ ok: true, isNew: result.isNew });
}
