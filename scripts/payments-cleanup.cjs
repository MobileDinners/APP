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

// The sandbox account id is meaningless outside this run, and leaving it set
// would make the ops screen claim a payout account that does not exist.
db.prepare(
  "UPDATE orgs SET stripe_account_id = NULL, charges_enabled = 0, payouts_enabled = 0",
).run();
db.prepare("DELETE FROM payment_events").run();

console.log(`  removed ${removed} test order(s) and cleared the sandbox account`);
