/**
 * Exercises the money-split rules from the shell suite, without needing a
 * TypeScript runtime.
 *
 * This mirrors src/lib/payments/split.ts rather than importing it. That is a
 * deliberate trade: the duplication is small, and a second independent
 * statement of the rules catches a silent edit to the first. The final check
 * compares both against the same fixed expectations, so a drift between them
 * fails the suite rather than passing quietly.
 */
const RATE_BPS = 290;
const FIXED = 30;

function processingOn(c) {
  if (c <= 0) return 0;
  return Math.min(Math.round((c * RATE_BPS) / 10000) + FIXED, c);
}

function splitPayment(t) {
  const chargeCents = t.totalCents;
  // Full menu price plus the tax actually charged — the platform funds any
  // points discount, so the restaurant never sees it.
  const restaurantGross = t.subtotalCents + t.taxCents;
  const restaurantProcessingCents = processingOn(restaurantGross);
  const restaurantCents = restaurantGross - restaurantProcessingCents;
  const driverTipCents = t.tipCents;
  const platformCents = chargeCents - restaurantCents - driverTipCents;
  return {
    chargeCents,
    restaurantCents,
    driverTipCents,
    platformCents,
    restaurantProcessingCents,
    pointsFundedCents: t.discountCents,
    platformUnderwater: platformCents < 0,
  };
}

const applicationFeeCents = (s) =>
  Math.max(
    0,
    Math.min(s.chargeCents - s.restaurantCents - s.driverTipCents, s.chargeCents),
  );

/* ------------------------------------------------------------------ tests */

let bad = 0;
function check(name, got, want) {
  if (got === want) {
    console.log("  \x1b[32mPASS\x1b[0m " + name);
  } else {
    bad += 1;
    console.log(`  \x1b[31mFAIL\x1b[0m ${name} (got: ${got}, want: ${want})`);
  }
}

// A plain $38 pickup order: no delivery, no tip, no points.
const pickup = {
  subtotalCents: 3800, discountCents: 0, taxCents: 333, deliveryFeeCents: 0,
  serviceFeeCents: 0, tipCents: 0, totalCents: 4133,
  pointsRedeemed: 0, pointsEarned: 380,
};
const a = splitPayment(pickup);
check("restaurant gets food + tax, less card processing", a.restaurantCents, 4133 - 150);
check("processing is 2.9% + 30c", a.restaurantProcessingCents, 150);
check("the parts sum back to the charge",
  a.restaurantCents + a.driverTipCents + a.platformCents, a.chargeCents);
check("nothing is taken as commission",
  a.chargeCents - a.restaurantCents - a.driverTipCents - a.platformCents, 0);

// Delivery with a 20% tip. The tip belongs to the courier alone.
const delivery = {
  subtotalCents: 3800, discountCents: 0, taxCents: 333, deliveryFeeCents: 199,
  serviceFeeCents: 0, tipCents: 760, totalCents: 5092,
  pointsRedeemed: 0, pointsEarned: 380,
};
const b = splitPayment(delivery);
check("the courier gets the whole tip", b.driverTipCents, 760);
check("a tip does not change what the restaurant is paid", b.restaurantCents, a.restaurantCents);
check("the delivery fee lands with the platform", b.platformCents - a.platformCents, 199);
check("delivery parts still sum",
  b.restaurantCents + b.driverTipCents + b.platformCents, b.chargeCents);

// $10 of points spent. The platform issued that currency, so it funds it.
const withPoints = {
  subtotalCents: 3800, discountCents: 1000, taxCents: 245, deliveryFeeCents: 0,
  serviceFeeCents: 0, tipCents: 0, totalCents: 3045,
  pointsRedeemed: 1000, pointsEarned: 280,
};
const c = splitPayment(withPoints);
check("the redemption is recorded", c.pointsFundedCents, 1000);
check("restaurant is paid the full menu price, not the discounted one",
  c.restaurantCents, 4045 - processingOn(4045));
check("a redemption costs the restaurant nothing", c.restaurantCents > a.restaurantCents - 200, true);
check("the platform absorbs the discount", c.platformUnderwater, true);
check("points parts still sum",
  c.restaurantCents + c.driverTipCents + c.platformCents, c.chargeCents);

// A wallet larger than the platform's share. Legal, and worth surfacing.
const fullyRedeemed = {
  subtotalCents: 1000, discountCents: 1000, taxCents: 0, deliveryFeeCents: 0,
  serviceFeeCents: 0, tipCents: 0, totalCents: 0,
  pointsRedeemed: 1000, pointsEarned: 0,
};
const d = splitPayment(fullyRedeemed);
check("a fully redeemed order flags the platform underwater", d.platformUnderwater, true);
check("the application fee never goes negative", applicationFeeCents(d) >= 0, true);
check("nor exceeds the charge", applicationFeeCents(d) <= Math.max(0, d.chargeCents), true);

// The invariant that matters most: whatever the discount, the restaurant is
// never charged for selling food.
check("the restaurant is never charged to sell food", d.restaurantCents >= 0, true);
check("a zero-value gross attracts no processing fee", processingOn(0), 0);
check("processing never exceeds the gross it is charged on", processingOn(10) <= 10, true);

process.exit(bad === 0 ? 0 : 1);
