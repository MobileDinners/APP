import { NextResponse } from "next/server";
import { issueOtp, normalizePhone } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) {
    return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
  }

  const result = await issueOtp(phone);
  if (!result.ok) {
    // Two different failures used to share a 429. Being throttled is the
    // caller's doing and retrying soon will work; a carrier or provider
    // failure is ours, and a client that backs off politely on a 429 would
    // wait for a code that is never coming. 502 says "not your fault".
    const throttled = result.error.startsWith("Too many");
    return NextResponse.json(
      { error: result.error, code: throttled ? "rate_limited" : "send_failed" },
      { status: throttled ? 429 : 502 },
    );
  }

  // devCode is only ever populated outside production — see issueOtp.
  return NextResponse.json({ ok: true, phone, devCode: result.devCode });
}
