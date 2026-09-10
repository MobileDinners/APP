/**
 * Pay for an order from the shell tests, the way a diner's browser would.
 *
 *   node scripts/pay-order.mjs <orderId> <cookieJar> [baseUrl]
 *
 * WHY THIS EXISTS
 *
 * With no processor configured, createOrder confirms the order itself and
 * every test downstream of "the order is paid" works without doing anything.
 * The moment real Stripe keys are present that stops being true, correctly:
 * an order waits at PENDING_PAYMENT until money actually moves. Fourteen tests
 * across payments and delivery were written before that was so, and they had
 * been failing ever since — which meant card payments, the commission split,
 * refund accounting and courier dispatch were covered by nothing at all. That
 * is precisely the code where a silent defect costs real money.
 *
 * Stripe's test mode can confirm a PaymentIntent server-side against a test
 * card, so the whole path is drivable without a browser: create the intent the
 * checkout would create, confirm it as the card form would, then hand the id
 * back to the app so it verifies with Stripe before believing anything.
 *
 * In sandbox mode this is a no-op that reports success, so one call in a test
 * does the right thing whether or not keys are configured.
 *
 * The key is read from the environment or .env.local and never printed. A live
 * key is refused outright: this confirms real charges, and the only thing
 * standing between a test run and a real customer's card is that check.
 */
import { readFileSync, existsSync } from "node:fs";

const [, , orderId, jarPath, baseArg] = process.argv;
const BASE = baseArg || process.env.MD_TEST_BASE || "http://localhost:3100";

if (!orderId || !jarPath) {
  console.error("usage: node scripts/pay-order.mjs <orderId> <cookieJar> [baseUrl]");
  process.exit(2);
}

/* ------------------------------------------------------------------ config */

function loadEnvLocal() {
  if (!existsSync(".env.local")) return {};
  const out = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const KEY = (process.env.STRIPE_SECRET_KEY || loadEnvLocal().STRIPE_SECRET_KEY || "").trim();

if (KEY.startsWith("sk_live")) {
  console.error("refusing to run: STRIPE_SECRET_KEY is a LIVE key and this confirms real charges");
  process.exit(1);
}

if (!KEY.startsWith("sk_test")) {
  // No processor. createOrder already confirmed the order, so there is nothing
  // to pay and the caller can carry on.
  console.log("sandbox");
  process.exit(0);
}

/* ------------------------------------------------------------------ cookies */

/**
 * curl writes its jar in Netscape format, and prefixes HttpOnly entries with
 * "#HttpOnly_" — which looks like a comment and is not one.
 */
function sessionCookie(path) {
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.startsWith("#HttpOnly_") ? raw.slice("#HttpOnly_".length) : raw;
    if (!line || line.startsWith("#")) continue;
    const f = line.split("\t");
    if (f.length >= 7 && f[5] === "md_session") return `md_session=${f[6]}`;
  }
  throw new Error(`no md_session cookie in ${path}`);
}

const cookie = sessionCookie(jarPath);

/* -------------------------------------------------------------------- calls */

async function app(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: r.status, json, text };
}

async function stripe(path, params) {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  return { status: r.status, json: await r.json() };
}

function die(what, detail) {
  console.error(`pay-order: ${what}${detail ? " — " + detail : ""}`);
  process.exit(1);
}

const intent = await app("POST", "/api/payments/intent", { orderId });
if (intent.status !== 200 || !intent.json?.intentId) {
  die("could not create a payment intent", `${intent.status} ${intent.text.slice(0, 160)}`);
}
const intentId = intent.json.intentId;

// pm_card_visa is Stripe's always-succeeds test card. return_url satisfies
// intents that would otherwise want a redirect for 3DS.
const confirmed = await stripe(`payment_intents/${intentId}/confirm`, {
  payment_method: "pm_card_visa",
  return_url: "https://example.invalid/return",
});
if (confirmed.json?.status !== "succeeded") {
  die(
    "Stripe did not confirm the card",
    confirmed.json?.error?.message || confirmed.json?.status || String(confirmed.status),
  );
}

// The app re-checks with Stripe rather than trusting this, which is the point.
const done = await app("PUT", "/api/payments/intent", { orderId, intentId });
if (done.status !== 200) {
  die("the app would not accept the confirmation", `${done.status} ${done.text.slice(0, 160)}`);
}

console.log(done.json?.order?.state ?? "paid");
