/**
 * Creates (or resets the password of) the platform administrator account.
 *
 *   MD_ADMIN_PASSWORD='...' node scripts/create-admin.cjs
 *   node scripts/create-admin.cjs            # generates a strong one and prints it once
 *
 * admin@mobiledinners.com is a platform administrator wherever it signs in —
 * that is hard-coded, and this repository is public, so the address is known
 * to anyone who cares to look. Nothing stands between that fact and the whole
 * platform except this password.
 *
 * So this script will not help you make a bad one:
 *   · it refuses the published demo password outright
 *   · it refuses anything under 12 characters
 *   · it refuses to run in production without MD_ADMIN_PASSWORD, rather than
 *     inventing a password nobody will write down
 *   · it prints the password exactly once, and never stores it anywhere but as
 *     a scrypt hash
 *
 * Passwords are scrypt with a per-password salt, matching src/lib/password.ts.
 */
const { DatabaseSync } = require("node:sqlite");
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

const EMAIL = "admin@mobiledinners.com";
const ORG_ID = "org_platform";
const ORG_SLUG = "mobile-dinners-platform";
const DEMO_PASSWORD = "dinner1234";
const MIN_LENGTH = 12;

/* ------------------------------------------------------------------ *
 * Password
 * ------------------------------------------------------------------ */

function generate() {
  // 24 base64url characters ≈ 143 bits. Long enough that nobody will guess it
  // and short enough that somebody will actually paste it into a manager.
  return randomBytes(18).toString("base64url");
}

const supplied = process.env.MD_ADMIN_PASSWORD;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !supplied) {
  console.error(
    "Refusing to run.\n\n" +
      "  NODE_ENV=production and MD_ADMIN_PASSWORD is not set. Generating a\n" +
      "  password here would print it into a deploy log, which is not a place\n" +
      "  a credential should live. Set MD_ADMIN_PASSWORD and run again.",
  );
  process.exit(1);
}

const password = supplied ?? generate();

// The demo check comes first. It is shorter than the minimum, so a length
// message would fire instead and send someone off to add two characters to a
// password that is published in the source — the wrong lesson entirely.
if (password === DEMO_PASSWORD) {
  console.error(
    "Refusing: that is the demo password, and it is printed in this repository's\n" +
      "source. It would make the platform administrator account public.",
  );
  process.exit(1);
}
if (password.length < MIN_LENGTH) {
  console.error(
    `Refusing: MD_ADMIN_PASSWORD is ${password.length} characters; the minimum is ${MIN_LENGTH}.`,
  );
  process.exit(1);
}

/** scrypt with a random salt — the same format src/lib/password.ts verifies. */
function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/* ------------------------------------------------------------------ *
 * Write
 * ------------------------------------------------------------------ */

const dir = process.env.MD_DATA_DIR || "./data";
const db = new DatabaseSync(`${dir}/mobile-dinners.db`);
db.exec("PRAGMA foreign_keys = ON");

const now = new Date().toISOString();

// staff.org_id is NOT NULL, so the administrator needs an org. This one is
// deliberately not a restaurant: accepting_orders = 0 keeps it out of every
// consumer surface, and listMerchants() filters it out of the admin views.
const orgExists = db
  .prepare("SELECT COUNT(*) AS n FROM orgs WHERE org_id = ?")
  .get(ORG_ID).n;

if (!orgExists) {
  db.prepare(
    `INSERT INTO orgs (org_id, slug, brand_name, cuisine, price_band, rating,
                       rating_count, blurb, hero_hue, image_kw, promo, is_sponsored,
                       distance_mi, address, prep_base_seconds, accepting_orders,
                       delivery_fee_cents, points_multiplier)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, 'food', NULL, 0, 0, ?, 0, 0, 0, 1.0)`,
  ).run(
    ORG_ID, ORG_SLUG, "Mobile Dinners", "Platform", "$",
    "The platform itself. Not a restaurant, and not listed anywhere.",
    "—",
  );
  console.log(`  created the platform org (${ORG_ID})`);
}

const existing = db.prepare("SELECT staff_id FROM staff WHERE email = ?").get(EMAIL);
const hash = hashPassword(password);

if (existing) {
  db.prepare("UPDATE staff SET password_hash = ?, disabled = 0 WHERE email = ?")
    .run(hash, EMAIL);
  console.log(`  reset the password for ${EMAIL}`);
} else {
  db.prepare(
    `INSERT INTO staff (staff_id, org_id, email, name, role, password_hash, created_at)
     VALUES (?, ?, ?, ?, 'owner', ?, ?)`,
  ).run("staff_platform_admin", ORG_ID, EMAIL, "Mobile Dinners Admin", hash, now);
  console.log(`  created ${EMAIL}`);
}

// Prove the stored hash actually verifies, rather than trusting the format.
// A password that cannot be used is worse than no password: you find out at
// the moment you need to get in.
const stored = db.prepare("SELECT password_hash FROM staff WHERE email = ?").get(EMAIL)
  .password_hash;
const [, saltHex, wantHex] = stored.split("$");
const got = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
const want = Buffer.from(wantHex, "hex");
if (got.length !== want.length || !timingSafeEqual(got, want)) {
  console.error("  the stored hash does not verify — refusing to report success");
  process.exit(1);
}

console.log("  verified: the stored hash accepts this password");
console.log("");
if (supplied) {
  console.log("  Sign in at /staff/login, then open /admin.");
} else {
  console.log("  ------------------------------------------------------------");
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${password}`);
  console.log("  ------------------------------------------------------------");
  console.log("  This is shown ONCE. Put it in a password manager now — it is");
  console.log("  stored only as a hash and cannot be recovered, only reset.");
  console.log("");
  console.log("  Sign in at /staff/login, then open /admin.");
}
