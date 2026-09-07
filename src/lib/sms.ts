/**
 * Twilio Programmable SMS.
 *
 * Raw REST rather than the SDK, matching the Stripe and DoorDash adapters in
 * this codebase: the whole surface we need is one form-encoded POST, and a
 * dependency that ships an HTTP client, a retry policy and a logger to make
 * that call is not worth auditing.
 *
 * WHY PROGRAMMABLE SMS AND NOT TWILIO VERIFY
 *
 * Verify would generate, store, expire and check the code for us. We already
 * do all four, carefully and under test: codes are SHA-256 hashed, expire in
 * ten minutes, cap at five attempts, are single-use, and are rate limited per
 * number. Adopting Verify would delete tested code, move the rate limit to a
 * second source of truth, and replace the pinned-test-number mechanism that
 * makes this flow testable before registration clears. So Twilio is a pipe
 * here, and the security stays in auth.ts where it can be read.
 *
 * If SMS pumping fraud ever becomes real, Verify's fraud controls are the
 * upgrade path and this module is the seam to swap. Until then, the cheaper
 * defence is geographic: restrict messaging to the countries you serve, in the
 * Twilio console. That is where the abuse economics die, and it needs no code.
 */

export type SmsResult = { ok: true; sid: string } | { ok: false; error: string };

function credentials(): { sid: string; token: string; from: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  // Either a number you own, or a Messaging Service SID (MG...), which is what
  // A2P 10DLC registration actually attaches a campaign to. Both go in the
  // same field on the API, so one variable covers both.
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

/** Whether an SMS can actually be sent, for status screens and boot checks. */
export function smsConfigured(): boolean {
  return credentials() !== null;
}

/**
 * Sends one message. Never throws — a failure here must surface as a message
 * to the person waiting for a code, not a 500 that tells them nothing.
 *
 * The body is never logged. An OTP in an application log is an OTP in every
 * log aggregator, backup and support screenshot downstream of it.
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const creds = credentials();
  if (!creds) return { ok: false, error: "SMS is not configured" };

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", body);
  // A Messaging Service SID goes in MessagingServiceSid, a plain number in From.
  if (creds.from.startsWith("MG")) form.set("MessagingServiceSid", creds.from);
  else form.set("From", creds.from);

  const auth = Buffer.from(`${creds.sid}:${creds.token}`).toString("base64");

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        // A sign-in is a person staring at a phone. Ten seconds is already a
        // long time to wait; past that, failing is kinder than hanging.
        signal: AbortSignal.timeout(10_000),
      },
    );

    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      code?: number;
    };

    if (!res.ok) {
      // Twilio's own message is logged for the operator but never returned to
      // the caller: "unverified number" or "blocked region" tells someone
      // probing the endpoint exactly which numbers are worth trying.
      console.error(`[sms] Twilio ${res.status}`, data.code, data.message);
      return { ok: false, error: "Could not send the message" };
    }

    return { ok: true, sid: data.sid ?? "" };
  } catch (err) {
    console.error("[sms] send failed", err);
    return { ok: false, error: "Could not reach the messaging provider" };
  }
}

/**
 * The one-time code message.
 *
 * Carriers reject A2P traffic that reads like phishing, so the shape matters:
 * name the brand, say what the code is for, and tell people nobody will ask
 * for it. The last line is not decoration — it is the single most effective
 * countermeasure against someone being talked into reading their code aloud.
 */
export function otpMessage(code: string): string {
  return `${code} is your Mobile Dinners code. It expires in 10 minutes. We will never ask you for it.`;
}
