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
    // Three failures, three answers. Being throttled is the caller's doing and
    // retrying shortly will work, so 429. A carrier or provider failure is
    // ours and may clear, so 502. No provider configured at all will never
    // clear on its own, so 503 — and a client that backs off politely on a 429
    // would otherwise sit there waiting for a code that cannot be sent.
    const status =
      result.reason === "rate_limited" ? 429 : result.reason === "sms_unavailable" ? 503 : 502;
    return NextResponse.json({ error: result.error, code: result.reason }, { status });
  }

  // devCode is only ever populated outside production — see issueOtp.
  return NextResponse.json({ ok: true, phone, devCode: result.devCode });
}
