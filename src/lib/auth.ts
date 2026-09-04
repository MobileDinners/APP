import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { hashPassword, verifyPassword } from "./password";

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

export async function setSessionCookie(token: string, ttlMs: number): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
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

export type OtpIssue = { ok: true; devCode?: string } | { ok: false; error: string };

export function issueOtp(phone: string): OtpIssue {
  const db = getDb();

  const recent = db
    .prepare(
      "SELECT COUNT(*) AS n FROM otp_codes WHERE phone_e164 = ? AND created_at > ?",
    )
    .get(phone, new Date(Date.now() - OTP_RATE_WINDOW_MS).toISOString()) as { n: number };
  if (recent.n >= OTP_RATE_MAX) {
    return { ok: false, error: "Too many codes requested. Wait a minute and try again." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
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

  // No SMS provider is wired up. In development the code is returned so the
  // flow is usable; in production this must go to Twilio Verify and NEVER
  // come back in the response body.
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
