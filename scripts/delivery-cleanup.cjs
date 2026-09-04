/** Removes the delivery suite's test diner, their orders and any bookings. */
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("./data/mobile-dinners.db");
db.exec("PRAGMA foreign_keys = OFF");

const person = db
  .prepare("SELECT person_id FROM persons WHERE phone_e164 = ?")
  .get("+14155550166");

let removed = 0;
if (person) {
  const orders = db
    .prepare("SELECT order_id FROM orders WHERE person_id = ?")
    .all(person.person_id);

  for (const o of orders) {
    const childTables = [
      "order_events",
      "order_items",
      "payments",
      "deliveries",
      "upsell_events",
      "pos_order_push",
    ];
    for (const t of childTables) {
      try {
        db.prepare("DELETE FROM " + t + " WHERE order_id = ?").run(o.order_id);
      } catch {
        // Not every table carries an order_id; skip the ones that do not.
      }
    }
    db.prepare("DELETE FROM orders WHERE order_id = ?").run(o.order_id);
    removed += 1;
  }

  for (const t of ["loyalty_entries", "wallet", "sessions", "otp_codes", "upsell_events"]) {
    try {
      db.prepare("DELETE FROM " + t + " WHERE person_id = ?").run(person.person_id);
    } catch {
      // Same: not every table is keyed by person.
    }
  }
  db.prepare("DELETE FROM persons WHERE person_id = ?").run(person.person_id);
}

db.prepare("DELETE FROM delivery_events").run();
console.log("  removed " + removed + " test order(s) and their deliveries");
