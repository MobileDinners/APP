import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { otpMessage, sendSms, smsConfigured } from "./sms";

export { hashPassword, verifyPassword };

/**
 * Authentication for three different subjects — see the three-model design:
 *
 *   customers → phone + one-time code, no password, ~90 day session
 *   staff     → email + password, 12h session, role-scoped to one org
 *   devices   → (next phase) long-lived device credential + staff PIN
 *
 * Implementation notes that matter for review:
 *   · passwords use scrypt with a per-password salt; never a bare hash
 *   · session tokens are 32 random bytes; only their SHA-256 is stored, so a
 *     database leak cannot be replayed as a login
 *   · every comparison of a secret uses timingSafeEqual
 *   · OTPs are hashed, expire in 10 minutes, and cap at 5 attempts
 *
 * For production, move this to a dedicated provider. It is deliberately small
 * and readable so it can be audited, not because hand-rolled auth is the goal.
 */

const SESSION_COOKIE = "md_session";
const PERSON_TTL_DAYS = 90;
const STAFF_TTL_HOURS = 12;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_WINDOW_MS = 60_000;
const OTP_RATE_MAX = 3;

export type Role = "owner" | "manager" | "shift_lead";

export type Session =
  | { kind: "person"; personId: string; displayName: string; phone: string | null }
  | { kind: "staff"; staffId: string; orgId: string; name: string; email: string; role: Role };

/* ---------------------------- primitives ---------------------------- */

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** E.164-ish normalisation. Good enough for US demo numbers. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/* ---------------------------- sessions ---------------------------- */

function createSession(
  subjectType: "person" | "staff",
  subjectId: string,
  orgId: string | null,
  ttlMs: number,
): string {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, subject_type, subject_id, org_id,
                             created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sha256(token),
      subjectType,
      subjectId,
      orgId,
      now.toISOString(),
      new Date(now.getTime() + ttlMs).toISOString(),
      now.toISOString(),
    );
  return token;
}

/**
 * A SESSION cookie: no Max-Age and no Expires, so the browser drops it when it
 * closes and the next person to open it starts signed out.
 *
 * It used to carry Max-Age, which made it persistent — a staff member who shut
 * the browser stayed signed in for twelve hours, so whoever opened it next was
 * working as them. On a terminal that several people share across a shift that
 * is not a convenience, it is an unattributable till. Diners had the same thing
 * for ninety days, on devices that get handed around.
 *
 * This no longer takes a lifetime, and that is the point. The session row in
 * the database still expires — PERSON_TTL_DAYS and STAFF_TTL_HOURS bound it in
 * createSession — so the cookie decides when the BROWSER forgets the token and
 * the row decides when the SERVER stops honouring it. Handing a duration to
 * this function again would only be useful for putting Max-Age back.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Intentionally no maxAge. See above; adding one back makes the cookie
    // persistent again and undoes the whole point of this.
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  }
  jar.delete(SESSION_COOKIE);
}

/** Resolves the current session, or null. Expired rows are deleted on read. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM sessions WHERE token_hash = ?")
    .get(sha256(token)) as
    | {
        token_hash: string;
        subject_type: "person" | "staff";
        subject_id: string;
        org_id: string | null;
        expires_at: string;
      }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(row.token_hash);
    return null;
  }

  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
    .run(new Date().toISOString(), row.token_hash);

  if (row.subject_type === "person") {
    const p = db
      .prepare("SELECT person_id, display_name, phone_e164 FROM persons WHERE person_id = ?")
      .get(row.subject_id) as
      | { person_id: string; display_name: string; phone_e164: string | null }
      | undefined;
    if (!p) return null;
    return {
      kind: "person",
      personId: p.person_id,
      displayName: p.display_name,
      phone: p.phone_e164,
    };
  }

  const s = db
    .prepare("SELECT staff_id, org_id, name, email, role, disabled FROM staff WHERE staff_id = ?")
    .get(row.subject_id) as
    | { staff_id: string; org_id: string; name: string; email: string; role: Role; disabled: number }
    | undefined;
  if (!s || s.disabled === 1) return null;

  return {
    kind: "staff",
    staffId: s.staff_id,
    orgId: s.org_id,
    name: s.name,
    email: s.email,
    role: s.role,
  };
}

/**
 * A customer session, for a person who has just proved who they are by some
 * means other than a one-time code — today, an email and a password.
 *
 * Narrow on purpose: it only ever mints a `person` session and takes no org,
 * so it cannot accidentally be used to hand out staff access.
 */
export function createSessionFor(personId: string, ttlMs: number): string {
  return createSession("person", personId, null, ttlMs);
}

export async function requireStaff(): Promise<Extract<Session, { kind: "staff" }>> {
  const session = await getSession();
  if (session?.kind !== "staff") throw new AuthError("Staff sign-in required", 401);
  return session;
}

export async function requirePerson(): Promise<Extract<Session, { kind: "person" }>> {
  const session = await getSession();
  if (session?.kind !== "person") throw new AuthError("Sign in to continue", 401);
  return session;
}

export class AuthError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
  }
}

/** Roles that may take money-moving actions. Refunds and payouts need more. */
export function can(role: Role, action: "advance_order" | "edit_menu" | "publish_menu" | "refund"): boolean {
  switch (action) {
    case "advance_order": return true; // any signed-in staff
    case "edit_menu": return role === "owner" || role === "manager";
    case "publish_menu": return role === "owner" || role === "manager";
    case "refund": return role === "owner";
  }
}

/* ---------------------------- customer OTP ---------------------------- */

/**
 * Why a failure carries a machine-readable reason as well as a message.
 *
 * These three fail in genuinely different ways and the caller has to act
 * differently on each: being throttled is the caller's own doing and retrying
 * shortly will work, a provider failure is ours and retrying might work, and
 * an unconfigured provider will NEVER work no matter how long anyone waits —
 * that one has to send the customer somewhere else entirely. Sniffing the
 * message text to tell them apart, which is what this used to do, breaks the
 * moment the wording changes.
 */
export type OtpFailure = "rate_limited" | "sms_unavailable" | "send_failed";

export type OtpIssue =
  | { ok: true; devCode?: string }
  | { ok: false; error: string; reason: OtpFailure };

/**
 * Test numbers, for staging a live site before an SMS provider exists.
 *
 * Twilio A2P 10DLC registration takes one to three weeks, and until it clears
 * `issueOtp` mints a code and sends it precisely nowhere — so on a deployed
 * site nobody can sign in and no order can be placed. That makes the whole
 * consumer flow untestable exactly when it most needs testing.
 *
 * MD_OTP_TEST_NUMBERS="+15555550100:424242,+15555550101:314159" pins a fixed
 * code to a specific phone number. This is the same mechanism Firebase Auth
 * and Twilio Verify both ship for the same reason.
 *
 * What it is NOT is a bypass. The number must be listed by whoever holds the
 * environment, the code still goes through the same hash, the same ten-minute
 * expiry, the same five-attempt cap and the same rate limit, and nothing is
 * returned in the response body. An attacker reading this file — and it is a
 * public repository — learns the mechanism but not the numbers, which is the
 * only part that matters. Use numbers in the 555 range that nobody can own.
 */
function testCodeFor(phone: string): string | null {
  const raw = process.env.MD_OTP_TEST_NUMBERS;
  if (!raw) return null;
  for (const entry of raw.split(",")) {
    const [num, code] = entry.split(":").map((x) => x.trim());
    // A malformed entry is skipped rather than throwing: a typo in one pair
    // must not take sign-in down for every real customer.
    if (!num || !/^\d{6}$/.test(code ?? "")) continue;
    // Normalise the configured number the same way the caller's was, so
    // "555-555-0100" in the environment still matches "+15555550100".
    if (normalizePhone(num) === phone) return code!;
  }
  return null;
}

export async function issueOtp(phone: string): Promise<OtpIssue> {
  const db = getDb();

  const recent = db
    .prepare(
      "SELECT COUNT(*) AS n FROM otp_codes WHERE phone_e164 = ? AND created_at > ?",
    )
    .get(phone, new Date(Date.now() - OTP_RATE_WINDOW_MS).toISOString()) as { n: number };
  if (recent.n >= OTP_RATE_MAX) {
    return {
      ok: false,
      error: "Too many codes requested. Wait a minute and try again.",
      reason: "rate_limited",
    };
  }

  const code = testCodeFor(phone) ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  db.prepare(
    `INSERT INTO otp_codes (otp_id, phone_e164, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    phone,
    sha256(code),
    new Date(now.getTime() + OTP_TTL_MINUTES * 60_000).toISOString(),
    now.toISOString(),
  );

  // A pinned test number is fictional. Sending to it would fail at the carrier
  // and cost money to do so, and the tester already knows the code — that is
  // the entire point of pinning it.
  const pinned = testCodeFor(phone) !== null;

  if (!pinned) {
    if (!smsConfigured()) {
      // No provider, so nothing was sent and nothing ever will be. This used
      // to fall through and report success, which is the worst of the options
      // available: the customer sits on the code screen waiting for a text
      // that does not exist, and the deployment looks healthy from the
      // outside because every request returns 200.
      //
      // Outside production the code is handed back below instead, so local
      // development and the test suite keep working without a carrier.
      if (process.env.NODE_ENV === "production") {
        return {
          ok: false,
          error:
            "We cannot text a code right now. Sign in with your email and password instead.",
          reason: "sms_unavailable",
        };
      }
    } else {
      const sent = await sendSms(phone, otpMessage(code));
      if (!sent.ok) {
        // The row stays: it expires on its own, and deleting it here would let
        // an attacker clear their own rate-limit history by forcing failures.
        // Say plainly that nothing was sent, so nobody waits for a text that is
        // never coming.
        return {
          ok: false,
          error: "We could not send your code. Try again in a moment.",
          reason: "send_failed",
        };
      }
    }
  }

  // devCode is returned OUTSIDE PRODUCTION ONLY, and only when no SMS went
  // out. In production it is withheld even on the pinned-number path, so the
  // response is identical whether or not a number is pinned — otherwise this
  // endpoint would tell anyone which numbers are test numbers.
  return process.env.NODE_ENV === "production"
    ? { ok: true }
    : { ok: true, devCode: code };
}

export type OtpResult =
  | { ok: true; token: string; ttlMs: number; personId: string; isNew: boolean }
  | { ok: false; error: string };

export function verifyOtp(phone: string, code: string): OtpResult {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM otp_codes
       WHERE phone_e164 = ? AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(phone) as
    | { otp_id: string; code_hash: string; attempts: number; expires_at: string }
    | undefined;

  if (!row) return { ok: false, error: "Request a new code" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "That code expired. Request a new one." };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new code." };
  }

  if (!safeEqualHex(sha256(code), row.code_hash)) {
    db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE otp_id = ?").run(row.otp_id);
    return { ok: false, error: "That code isn't right" };
  }

  db.prepare("UPDATE otp_codes SET consumed_at = ? WHERE otp_id = ?")
    .run(new Date().toISOString(), row.otp_id);

  // Materialise the person on first verified sign-in, and give them a wallet.
  let person = db
    .prepare("SELECT person_id FROM persons WHERE phone_e164 = ?")
    .get(phone) as { person_id: string } | undefined;

  const isNew = !person;
  if (!person) {
    const personId = `person_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO persons (person_id, phone_e164, display_name, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(personId, phone, "", now);
    db.prepare(
      `INSERT INTO wallet (person_id, display_name, points_balance, tier, orders_count)
       VALUES (?, '', 0, 'bronze', 0)`,
    ).run(personId);
    person = { person_id: personId };
  }

  const ttlMs = PERSON_TTL_DAYS * 24 * 60 * 60 * 1000;
  return {
    ok: true,
    token: createSession("person", person.person_id, null, ttlMs),
    ttlMs,
    personId: person.person_id,
    isNew,
  };
}

/* ---------------------------- staff login ---------------------------- */

export type StaffLoginResult =
  | { ok: true; token: string; ttlMs: number; orgId: string }
  | { ok: false; error: string };

export function loginStaff(email: string, password: string): StaffLoginResult {
  const row = getDb()
    .prepare("SELECT staff_id, org_id, password_hash, disabled FROM staff WHERE email = ?")
    .get(email.trim().toLowerCase()) as
    | { staff_id: string; org_id: string; password_hash: string; disabled: number }
    | undefined;

  // Same message and comparable work either way, so the response can't be used
  // to discover which email addresses exist.
  const stored = row?.password_hash ?? hashPassword("no-such-account");
  const passwordOk = verifyPassword(password, stored);

  if (!row || row.disabled === 1 || !passwordOk) {
    return { ok: false, error: "Email or password is incorrect" };
  }

  const ttlMs = STAFF_TTL_HOURS * 60 * 60 * 1000;
  return {
    ok: true,
    token: createSession("staff", row.staff_id, row.org_id, ttlMs),
    ttlMs,
    orgId: row.org_id,
  };
}
