import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";

/**
 * Restaurant self-signup.
 *
 * Creates the three things a restaurant cannot operate without: an org row, an
 * owner account, and a menu draft. Everything else — published menu, site,
 * campaigns, POS connection — is created later from inside /ops, because each
 * of those is a decision the owner has to make rather than a default we can
 * pick for them.
 *
 * A brand-new org is deliberately NOT visible on the marketplace: it has no
 * published menu, and the feed filters those out. Publishing is the act that
 * puts a restaurant on sale.
 */

export class SignupError extends Error {
  status: number;
  field: string;
  constructor(message: string, status = 400, field = "") {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export type SignupInput = {
  brandName: string;
  cuisine: string;
  address: string;
  ownerName: string;
  email: string;
  password: string;
};

export type SignupResult = {
  orgId: string;
  slug: string;
  staffId: string;
  itemsCreated: number;
};

/** URL-safe slug. Falls back to a random suffix if the name has no letters. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `restaurant-${randomUUID().slice(0, 6)}`;
}

/** Appends -2, -3, … until the slug is free. Slugs are a UNIQUE column. */
function uniqueSlug(name: string): string {
  const db = getDb();
  const base = slugify(name);
  const taken = db.prepare("SELECT slug FROM orgs WHERE slug = ? OR slug LIKE ?")
    .all(base, `${base}-%`) as unknown as Array<{ slug: string }>;
  const used = new Set(taken.map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * The starter draft. Three placeholder items in three sections so a new owner
 * lands on a menu editor that shows them the shape of the thing rather than an
 * empty page — they are priced at zero and clearly marked, so publishing them
 * by accident sells nothing.
 */
const STARTER_ITEMS: Array<{
  section: string;
  name: string;
  description: string;
  station: string;
}> = [
  {
    section: "Mains",
    name: "Your first dish",
    description: "Replace this with something you actually sell. Set a price and publish.",
    station: "grill",
  },
  {
    section: "Sides",
    name: "Your first side",
    description: "Sides carry margin. Add two or three before you publish.",
    station: "fry",
  },
  {
    section: "Drinks",
    name: "Your first drink",
    description: "Drinks are the cheapest way to lift an average ticket.",
    station: "assembly",
  },
];

export function createRestaurant(input: SignupInput): SignupResult {
  const db = getDb();

  const brandName = input.brandName?.trim() ?? "";
  const cuisine = input.cuisine?.trim() ?? "";
  const address = input.address?.trim() ?? "";
  const ownerName = input.ownerName?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const password = input.password ?? "";

  if (brandName.length < 2) {
    throw new SignupError("Restaurant name is required", 400, "brandName");
  }
  if (brandName.length > 80) {
    throw new SignupError("Restaurant name is too long", 400, "brandName");
  }
  if (!cuisine) throw new SignupError("Pick a cuisine", 400, "cuisine");
  if (address.length < 5) {
    throw new SignupError("A street address is required", 400, "address");
  }
  if (ownerName.length < 2) throw new SignupError("Your name is required", 400, "ownerName");
  if (!EMAIL_RE.test(email)) {
    throw new SignupError("That does not look like an email address", 400, "email");
  }
  if (password.length < 8) {
    throw new SignupError("Password must be at least 8 characters", 400, "password");
  }

  const clash = db.prepare("SELECT staff_id FROM staff WHERE email = ?").get(email);
  if (clash) {
    // Deliberately explicit: this is a signup form, and telling someone their
    // email is already registered is the only useful thing to say. Sign-in
    // itself stays generic.
    throw new SignupError("That email already has an account. Sign in instead.", 409, "email");
  }

  const orgId = `org_${randomUUID().slice(0, 12)}`;
  const slug = uniqueSlug(brandName);
  const staffId = `staff_${randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO orgs (
         org_id, slug, brand_name, cuisine, price_band, rating, rating_count,
         blurb, hero_hue, image_kw, promo, is_sponsored, distance_mi, address,
         prep_base_seconds, accepting_orders, delivery_fee_cents, points_multiplier
       ) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,0,?,?,?,1,?,1.0)`,
    ).run(
      orgId,
      slug,
      brandName,
      cuisine,
      "$$",
      0, // no rating until real guests leave one
      0,
      `${brandName} on Mobile Dinners.`,
      Math.floor(Math.random() * 360),
      cuisine.toLowerCase(),
      Number((0.4 + Math.random() * 2.6).toFixed(1)),
      address,
      480,
      99,
    );

    db.prepare(
      `INSERT INTO staff (staff_id, org_id, email, name, role, password_hash, created_at)
       VALUES (?,?,?,?,'owner',?,?)`,
    ).run(staffId, orgId, email, ownerName, hashPassword(password), now);

    STARTER_ITEMS.forEach((tpl, i) => {
      db.prepare(
        `INSERT INTO items (
           item_id, org_id, section, name, description, price_cents, cost_cents,
           prep_seconds, station, is_available, sort_order, image_kw, is_popular
         ) VALUES (?,?,?,?,?,0,0,300,?,1,?,?,0)`,
      ).run(
        `item_${randomUUID().slice(0, 12)}`,
        orgId,
        tpl.section,
        tpl.name,
        tpl.description,
        tpl.station,
        i,
        cuisine.toLowerCase(),
      );
    });

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { orgId, slug, staffId, itemsCreated: STARTER_ITEMS.length };
}
