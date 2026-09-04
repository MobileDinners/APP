/**
 * Generates a realistic customer population and their order history, so the
 * CRM and the menu optimizer have something real to reason about.
 *
 * Without this the app has a handful of demo orders belonging to one person,
 * and every segment, churn score and price suggestion is noise.
 *
 *   node scripts/generate-history.mjs [days]
 */
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

const DAYS = Number(process.argv[2] ?? 70);
const PATH = "./data/mobile-dinners.db";

if (!existsSync(PATH)) {
  console.error("No database yet. Start the app once (npm run dev) and load a page first.");
  process.exit(1);
}

const db = new DatabaseSync(PATH);
db.exec("PRAGMA foreign_keys = ON");

const orgs = db.prepare(
  "SELECT org_id, brand_name, points_multiplier, delivery_fee_cents FROM orgs",
).all();

// Deterministic PRNG so repeated runs produce a comparable dataset.
let seed = 20260902;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/** Weekly shape: Fri/Sat busiest, Mon quietest. */
const DOW_WEIGHT = [0.72, 0.62, 0.7, 0.8, 0.95, 1.35, 1.25];

const FIRST = ["Alex","Sam","Jordan","Riley","Casey","Morgan","Avery","Quinn","Taylor","Devon",
  "Noor","Amara","Diego","Priya","Kenji","Luca","Ines","Mateo","Zara","Omar","Freya","Idris",
  "Talia","Rafa","Mina","Hugo","Nadia","Emeka","Yara","Theo","Sana","Bruno","Lila","Kwame"];
const LAST = ["Rivera","Okonkwo","Lindqvist","Ramirez","Chen","Haddad","Novak","Osei","Kaur",
  "Moreau","Ibrahim","Silva","Nakamura","Fitzgerald","Duarte","Petrov","Aliyev","Bautista",
  "Mensah","Kowalski","Rossi","Tran","Bergstrom","Ferrari","Adeyemi","Costa"];

/**
 * Customer mix. Real restaurant customer bases are extremely top-heavy: a small
 * core of regulars produces most of the revenue, and a long tail orders once
 * and is never seen again. A flat distribution would make every RFM segment
 * look identical, which would make the CRM appear to work when it does not.
 */
const ARCHETYPES = [
  { kind: "regular",  share: 0.08, ordersPerMonth: [6, 14],    churnChance: 0.03 },
  { kind: "frequent", share: 0.17, ordersPerMonth: [2.5, 5],   churnChance: 0.10 },
  { kind: "casual",   share: 0.33, ordersPerMonth: [0.8, 2],   churnChance: 0.25 },
  { kind: "rare",     share: 0.22, ordersPerMonth: [0.3, 0.7], churnChance: 0.40 },
  { kind: "onetime",  share: 0.20, ordersPerMonth: [0, 0],     churnChance: 1.0 },
];

// Consent is per channel and timestamped. Roughly two thirds opt in to SMS,
// fewer to email, and a small share have actively opted out - which is what
// makes the suppression counts in a campaign preview non-trivial.
const insertPerson = db.prepare(`
  INSERT OR IGNORE INTO persons
    (person_id, phone_e164, display_name, created_at,
     marketing_sms, marketing_email, consent_at, opted_out_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertWallet = db.prepare(`
  INSERT OR IGNORE INTO wallet (person_id, display_name, points_balance, tier, orders_count)
  VALUES (?, ?, 0, 'bronze', 0)
`);
const insertOrder = db.prepare(`
  INSERT INTO orders (order_id, org_id, person_id, menu_version_id, channel, fulfillment, state,
    subtotal_cents, discount_cents, tax_cents, tip_cents, delivery_fee_cents,
    service_fee_cents, total_cents, points_earned, points_redeemed,
    guest_name, guest_phone, address, placed_at, promised_at, idempotency_key)
  VALUES (?, ?, ?, ?, 'marketplace', ?, 'SETTLED', ?, 0, ?, ?, ?, 0, ?, ?, 0, ?, ?, '', ?, ?, ?)
`);
const insertLine = db.prepare(`
  INSERT INTO order_items (order_id, line_no, item_id, name, qty, unit_price_cents,
    options_label, notes, station, prep_seconds, bumped_at)
  VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, ?)
`);
const insertEvent = db.prepare(`
  INSERT INTO order_events (order_id, seq, event_type, payload, actor, source, occurred_at)
  VALUES (?, 1, 'order.settled', '{}', 'system', 'BACKFILL', ?)
`);

// ---- build the customer population -------------------------------------
// Sized so the six restaurants together trade at a believable ~90 orders/day
// each. Too few customers and every optimizer suggestion collapses into noise;
// too few orders per customer and the RFM segments stop separating.
const POPULATION = 9000;
const people = [];
for (let i = 0; i < POPULATION; i++) {
  let r = rnd();
  let archetype = ARCHETYPES[ARCHETYPES.length - 1];
  for (const a of ARCHETYPES) {
    if (r < a.share) { archetype = a; break; }
    r -= a.share;
  }

  const name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`;
  const phone = `+1415${String(2000000 + i)}`;
  const personId = `person_gen_${i}`;

  // Some customers stopped ordering partway through the window. That is what
  // creates a real "at risk" and "lapsed" population instead of a synthetic one.
  const lapsedAfterDay = rnd() < archetype.churnChance
    ? Math.floor(rnd() * DAYS * 0.8) + 5
    : 0;

  // Most people stick to one or two restaurants; a minority roam.
  const homeOrg = orgs[Math.floor(rnd() * orgs.length)];
  const roams = rnd() < 0.28;

  const smsOk = rnd() < 0.66 ? 1 : 0;
  const emailOk = rnd() < 0.44 ? 1 : 0;
  const optedOut = rnd() < 0.05;

  people.push({
    personId, name, phone, archetype, lapsedAfterDay, homeOrg, roams,
    smsOk, emailOk, optedOut,
  });
}

let ordersMade = 0;
let peopleMade = 0;

db.exec("BEGIN");
try {
  const now = Date.now();

  for (const p of people) {
    const createdAt = new Date(now - (DAYS + 5) * 86400000).toISOString();
    insertPerson.run(
      p.personId, p.phone, p.name, createdAt,
      p.smsOk, p.emailOk, createdAt,
      p.optedOut ? new Date(now - Math.floor(rnd() * DAYS) * 86400000).toISOString() : null,
    );
    insertWallet.run(p.personId, p.name);
    peopleMade++;
  }

  // Per-restaurant menus and popularity curves.
  const menus = new Map();
  for (const org of orgs) {
    const items = db
      .prepare("SELECT * FROM items WHERE org_id = ? AND is_available = 1")
      .all(org.org_id);
    const version = db
      .prepare(
        "SELECT menu_version_id FROM menu_versions WHERE org_id = ? ORDER BY version_no LIMIT 1",
      )
      .get(org.org_id);
    const weights = items.map((it, i) => (it.is_popular ? 3.2 : 1) * Math.pow(0.85, i) + 0.05);
    const total = weights.reduce((n, w) => n + w, 0);

    // Real baskets have structure: a main, and often a specific drink or side
    // that goes with THAT main. Drawing every line independently produces
    // co-purchase lift of ~1.0 across the board, which makes the upsell engine
    // look broken when it is actually reporting the truth about the data.
    const cat = (it) => {
      const sec = (it.section || "").toLowerCase();
      if (sec.includes("drink")) return "drinks";
      if (sec.includes("side") || sec.includes("mezze") || sec.includes("starter")) return "sides";
      return "mains";
    };
    const mains = items.filter((i) => cat(i) === "mains");
    const sides = items.filter((i) => cat(i) === "sides");
    const drinks = items.filter((i) => cat(i) === "drinks");

    // Each main has a signature pairing, so specific pairs beat the base rate.
    const pairedSide = new Map();
    const pairedDrink = new Map();
    mains.forEach((m, i) => {
      if (sides.length) pairedSide.set(m.item_id, sides[i % sides.length]);
      if (drinks.length) pairedDrink.set(m.item_id, drinks[i % drinks.length]);
    });

    menus.set(org.org_id, {
      items, weights, total, mains, sides, drinks, pairedSide, pairedDrink,
      versionId: version?.menu_version_id ?? null,
    });
  }

  const drawItem = (orgId) => {
    const m = menus.get(orgId);
    let r = rnd() * m.total;
    for (let i = 0; i < m.items.length; i++) {
      r -= m.weights[i];
      if (r <= 0) return m.items[i];
    }
    return m.items[0];
  };

  for (const p of people) {
    const [lo, hi] = p.archetype.ordersPerMonth;
    const perMonth = lo + rnd() * (hi - lo);
    // One-timers still place exactly one order; that is what makes them a
    // distinct segment rather than an absence of rows.
    const count = p.archetype.kind === "onetime" ? 1 : Math.round((perMonth * DAYS) / 30);
    if (count === 0) continue;

    for (let n = 0; n < count; n++) {
      let dayAgo = Math.floor(rnd() * DAYS) + 1;
      if (p.lapsedAfterDay > 0 && dayAgo < p.lapsedAfterDay) {
        // Everything after they lapsed simply did not happen.
        dayAgo = p.lapsedAfterDay + Math.floor(rnd() * (DAYS - p.lapsedAfterDay));
      }

      const day = new Date(now - dayAgo * 86400000);
      if (rnd() > DOW_WEIGHT[day.getDay()] / 1.35) continue; // weekly shape

      const org = p.roams && rnd() < 0.35
        ? orgs[Math.floor(rnd() * orgs.length)]
        : p.homeOrg;
      const menu = menus.get(org.org_id);
      if (!menu || menu.items.length === 0) continue;

      const hour = rnd() < 0.42 ? 11 + Math.floor(rnd() * 3) : 17 + Math.floor(rnd() * 4);
      const placed = new Date(day);
      placed.setHours(hour, Math.floor(rnd() * 60), 0, 0);

      // Anchor on a main, then attach a drink and/or a side. 70% of the time
      // the attachment is that main's signature pairing, which is what creates
      // co-purchase lift above 1 instead of noise around it.
      const m = menus.get(org.org_id);
      const chosen = [];
      const anchor = m.mains.length
        ? m.mains[Math.floor(rnd() * m.mains.length)]
        : drawItem(org.org_id);
      chosen.push(anchor);

      if (m.drinks.length && rnd() < 0.42) {
        const paired = m.pairedDrink.get(anchor.item_id);
        const drink = paired && rnd() < 0.7
          ? paired
          : m.drinks[Math.floor(rnd() * m.drinks.length)];
        if (!chosen.some((c) => c.item_id === drink.item_id)) chosen.push(drink);
      }
      if (m.sides.length && rnd() < 0.34) {
        const paired = m.pairedSide.get(anchor.item_id);
        const side = paired && rnd() < 0.7
          ? paired
          : m.sides[Math.floor(rnd() * m.sides.length)];
        if (!chosen.some((c) => c.item_id === side.item_id)) chosen.push(side);
      }
      if (m.mains.length > 1 && rnd() < 0.14) {
        const second = m.mains[Math.floor(rnd() * m.mains.length)];
        if (!chosen.some((c) => c.item_id === second.item_id)) chosen.push(second);
      }

      let subtotal = 0;
      const lines = chosen.map((item, i) => {
        const qty = rnd() < 0.82 ? 1 : 2;
        subtotal += item.price_cents * qty;
        return { item, qty, lineNo: i + 1 };
      });

      const fulfillment = rnd() < 0.58 ? "delivery" : "pickup";
      const tax = Math.round(subtotal * 0.0875);
      const tip = fulfillment === "delivery" ? Math.round(subtotal * 0.2) : 0;
      const fee = fulfillment === "delivery" ? org.delivery_fee_cents : 0;
      const total = subtotal + tax + tip + fee;
      const points = Math.floor((subtotal / 100) * 10 * org.points_multiplier);

      const orderId = randomUUID();
      insertOrder.run(
        orderId, org.org_id, p.personId, menu.versionId, fulfillment,
        subtotal, tax, tip, fee, total, points, p.name, p.phone,
        placed.toISOString(),
        new Date(placed.getTime() + 20 * 60000).toISOString(),
        `backfill-${orderId}`,
      );
      lines.forEach((l) =>
        insertLine.run(
          orderId, l.lineNo, l.item.item_id, l.item.name, l.qty,
          l.item.price_cents, l.item.station, l.item.prep_seconds,
          new Date(placed.getTime() + 8 * 60000).toISOString(),
        ),
      );
      insertEvent.run(orderId, placed.toISOString());
      ordersMade++;
    }
  }

  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const t = db.prepare(
  "SELECT COUNT(*) n, SUM(subtotal_cents) rev FROM orders WHERE state = 'SETTLED'",
).get();
const customers = db.prepare(
  "SELECT COUNT(DISTINCT person_id) n FROM orders WHERE state = 'SETTLED'",
).get();

console.log(`Created ${peopleMade} customers and ${ordersMade} settled orders over ${DAYS} days.`);
console.log(`Database now holds ${t.n} settled orders from ${customers.n} customers, $${(t.rev / 100).toFixed(2)} of sales.`);
console.log("Wallet points are NOT credited for backfilled orders - this is history, not activity.");
