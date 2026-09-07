/** Removes the payments suite's test diner, their orders, and the sandbox account. */
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("./data/mobile-dinners.db");
db.exec("PRAGMA foreign_keys = OFF");

const person = db
  .prepare("SELECT person_id FROM persons WHERE phone_e164 = ?")
  .get("+14155550177");

let removed = 0;
if (person) {
  const orders = db
    .prepare("SELECT order_id FROM orders WHERE person_id = ?")
    .all(person.person_id);

  for (const o of orders) {
    for (const t of ["order_events", "order_items", "payments", "upsell_events", "pos_order_push"]) {
      try {
        db.prepare(`DELETE FROM ${t} WHERE order_id = ?`).run(o.order_id);
      } catch {
        /* table may not carry an order_id */
      }
    }
    db.prepare("DELETE FROM orders WHERE order_id = ?").run(o.order_id);
    removed += 1;
  }

  for (const t of ["loyalty_entries", "wallet", "sessions", "otp_codes", "upsell_events"]) {
    try {
      db.prepare(`DELETE FROM ${t} WHERE person_id = ?`).run(person.person_id);
    } catch {
      /* table may not carry a person_id */
    }
  }
  db.prepare("DELETE FROM persons WHERE person_id = ?").run(person.person_id);
}

/**
 * Clear SANDBOX payout accounts only.
 *
 * This used to be an unqualified UPDATE across every org. A sandbox account id
 * is meaningless outside its run and leaving it set makes the ops screen claim
 * a payout account that does not exist — that part was right. But the same
 * statement also deleted REAL Stripe Connect account ids, which are neither
 * meaningless nor recreatable: re-establishing one means the restaurant owner
 * completing Stripe's hosted onboarding again, with their identity documents
 * and bank details.
 *
 * In practice it meant the test suite and any hands-on payment testing could
 * not share a database. Running `npm test` silently unlinked a restaurant that
 * had been onboarded minutes earlier, and the next checkout failed with
 * "This restaurant has not finished setting up payouts yet" — an error that
 * points at the restaurant rather than at the test run that caused it. That
 * cost three separate debugging detours before anyone noticed the connection.
 *
 * The sandbox provider prefixes its ids with `acct_sandbox_`, so the two are
 * trivially distinguishable and only the disposable ones are cleared.
 */
const cleared = db
  .prepare(
    `UPDATE orgs
        SET stripe_account_id = NULL, charges_enabled = 0, payouts_enabled = 0
      WHERE stripe_account_id LIKE 'acct_sandbox_%'`,
  )
  .run();

// Payment events are per-run webhook noise and carry no id worth keeping.
db.prepare("DELETE FROM payment_events").run();

const kept = db
  .prepare(
    "SELECT COUNT(*) AS n FROM orgs WHERE stripe_account_id IS NOT NULL",
  )
  .get().n;

console.log(
  `  removed ${removed} test order(s), cleared ${cleared.changes} sandbox payout account(s)` +
    (kept > 0 ? `, kept ${kept} real Stripe account(s)` : ""),
);
