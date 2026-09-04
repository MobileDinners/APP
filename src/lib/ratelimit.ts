/**
 * Request throttling.
 *
 * The OTP flow has its own limiter built on the `otp_codes` table, which works
 * because every request there leaves a row. Nothing else does, so this is the
 * general one: a fixed-window counter keyed by whatever the caller considers
 * the actor.
 *
 * IN MEMORY, AND THAT IS A REAL LIMIT. It protects one process. The app already
 * runs as a single instance because SQLite lives on one mounted disk, so this
 * matches the deployment — but the day a second instance appears, an attacker
 * gets one bucket per instance and this has to move to Redis. That is the same
 * day the database has to move to Postgres, so the two migrations travel
 * together.
 *
 * Fixed window rather than sliding: an attacker can burst at a boundary and get
 * up to 2x the limit across two windows. For login and signup that is
 * irrelevant — the point is to turn thousands of attempts per minute into a
 * handful, not to be exact.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stops the map growing without bound on a long-running process. */
function sweep(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimit = {
  ok: boolean;
  /** Requests left in this window. */
  remaining: number;
  /** Seconds until the window resets — goes straight into Retry-After. */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimit {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    ok: existing.count <= max,
    remaining: Math.max(0, max - existing.count),
    retryAfter,
  };
}

/** Clears a bucket — call after a success so a legitimate user is not punished. */
export function resetLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Best-effort client address.
 *
 * Behind Render, Fly or any proxy the socket address is the proxy, so the real
 * client is the FIRST entry of x-forwarded-for. That header is trivially
 * spoofable when nothing sits in front, which is why this is never used alone
 * for anything that matters — login is limited by IP *and* by the account being
 * targeted, so forging the header only defeats half the limit.
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** The limits, in one place so they can be read without hunting through routes. */
export const LIMITS = {
  /** Staff sign-in. Guards the menu, the customer list and the payout account. */
  staffLogin: { max: 8, windowMs: 15 * 60_000 },
  /** Per account, so one targeted email cannot be ground down from many IPs. */
  staffLoginAccount: { max: 12, windowMs: 15 * 60_000 },
  /**
   * Restaurant signup. Counts every attempt, including ones refused for a bad
   * email or a short password — so the ceiling has to leave room for a person
   * fumbling the form. Five was low enough to lock a real owner out mid-signup.
   */
  signup: { max: 20, windowMs: 60 * 60_000 },
  /** Order creation, per diner. Generous: a real person orders a few times a day. */
  orders: { max: 30, windowMs: 60 * 60_000 },
  /** OTP verification attempts by IP, on top of the per-code attempt cap. */
  otpVerify: { max: 20, windowMs: 15 * 60_000 },
} as const;
