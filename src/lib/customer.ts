import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { normalizePhone } from "./auth";

/**
 * Customer accounts with an email and a password.
 *
 * Until now a diner could only be a phone number and a one-time code. That is
 * a good primary identity for a food app — it is what a restaurant calls when
 * an order goes wrong — but as the ONLY identity it has three problems:
 *
 *   1. It does not work. SMS needs carrier registration that takes weeks, so
 *      on a live deployment nobody can sign in at all. An email and a password
 *      need nothing from a carrier.
 *   2. There is nowhere to send a receipt.
 *   3. People change numbers, and an account reachable only by a number that
 *      now belongs to a stranger is an account that has been given away.
 *
 * So both paths exist and either one signs the same person in. A person may
 * hold a phone, a password, or both, and `signUp` deliberately MERGES onto an
 * existing phone account rather than creating a second one — a diner who
 * ordered by phone last week and registers properly today is one customer with
 * one order history, not two with none.
 */

export class CustomerError extends Error {
  constructor(message: string, readonly status = 400, readonly field?: string) {
    super(message);
  }
}

export type CustomerAccount = {
  personId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
};

const MIN_PASSWORD = 8;

/** Same shape the staff login uses; deliberately not a strength meter. */
function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD) {
    throw new CustomerError(
      `Use at least ${MIN_PASSWORD} characters`,
      400,
      "password",
    );
  }
  if (password.length > 200) {
    throw new CustomerError("That password is too long", 400, "password");
  }
}

/** Deliberately loose. Rejecting valid addresses is worse than accepting odd ones. */
function cleanEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CustomerError("Enter a valid email address", 400, "email");
  }
  return email;
}

export function signUp(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  marketingEmail?: boolean;
}): CustomerAccount {
  const db = getDb();
  const name = input.name.trim();
  if (name.length < 2) throw new CustomerError("Enter your name", 400, "name");
  if (name.length > 80) throw new CustomerError("That name is too long", 400, "name");

  const email = cleanEmail(input.email);
  assertPassword(input.password);
  const phone = input.phone ? normalizePhone(input.phone) : null;

  const taken = db
    .prepare("SELECT person_id FROM persons WHERE email = ?")
    .get(email) as { person_id: string } | undefined;
  if (taken) {
    // Says the address is in use, which is unavoidable on a signup form — the
    // alternative is letting someone discover it by failing to sign in later.
    throw new CustomerError("That email already has an account", 409, "email");
  }

  const hash = hashPassword(input.password);
  const now = new Date().toISOString();

  // A diner who has ordered by phone before is the SAME person. Attaching the
  // email and password to that row keeps their order history and their points;
  // creating a second row would silently strip both.
  const existingByPhone = phone
    ? (db
        .prepare("SELECT person_id, password_hash FROM persons WHERE phone_e164 = ?")
        .get(phone) as { person_id: string; password_hash: string | null } | undefined)
    : undefined;

  if (existingByPhone) {
    if (existingByPhone.password_hash) {
      throw new CustomerError(
        "That phone number already has an account. Sign in instead.",
        409,
        "phone",
      );
    }
    db.prepare(
      `UPDATE persons
          SET email = ?, password_hash = ?, display_name = ?,
              marketing_email = ?, consent_at = COALESCE(consent_at, ?)
        WHERE person_id = ?`,
    ).run(
      email,
      hash,
      name,
      input.marketingEmail ? 1 : 0,
      input.marketingEmail ? now : null,
      existingByPhone.person_id,
    );
    db.prepare("UPDATE wallet SET display_name = ? WHERE person_id = ?").run(
      name,
      existingByPhone.person_id,
    );
    return { personId: existingByPhone.person_id, displayName: name, email, phone };
  }

  const personId = `person_${randomUUID().slice(0, 8)}`;
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO persons (person_id, phone_e164, email, display_name, password_hash,
                            created_at, marketing_email, consent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      personId,
      phone,
      email,
      name,
      hash,
      now,
      input.marketingEmail ? 1 : 0,
      input.marketingEmail ? now : null,
    );
    db.prepare(
      `INSERT INTO wallet (person_id, display_name, points_balance, tier, orders_count)
       VALUES (?, ?, 0, 'bronze', 0)`,
    ).run(personId, name);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { personId, displayName: name, email, phone };
}

export type CustomerLogin =
  | { ok: true; personId: string; displayName: string }
  | { ok: false; error: string };

/**
 * Email and password sign-in.
 *
 * A wrong email and a wrong password return the same message, and an account
 * with no password set — one created by phone — is treated as a wrong
 * password rather than saying "this account exists but has no password", which
 * would confirm the address to anyone guessing.
 */
export function signIn(email: string, password: string): CustomerLogin {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT person_id, display_name, password_hash FROM persons WHERE email = ?",
    )
    .get(email.trim().toLowerCase()) as
    | { person_id: string; display_name: string; password_hash: string | null }
    | undefined;

  const WRONG = { ok: false as const, error: "That email or password is not right" };
  if (!row?.password_hash) return WRONG;
  if (!verifyPassword(password, row.password_hash)) return WRONG;

  return { ok: true, personId: row.person_id, displayName: row.display_name };
}

/** Everything the account page needs about one customer. */
export function getAccount(personId: string): CustomerAccount | null {
  const r = getDb()
    .prepare("SELECT person_id, display_name, email, phone_e164 FROM persons WHERE person_id = ?")
    .get(personId) as
    | { person_id: string; display_name: string; email: string | null; phone_e164: string | null }
    | undefined;
  return r
    ? {
        personId: r.person_id,
        displayName: r.display_name,
        email: r.email,
        phone: r.phone_e164,
      }
    : null;
}
