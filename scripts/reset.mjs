/**
 * Wipes orders and resets the demo wallet, leaving restaurants and menus in
 * place. Run with: npm run reset
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

const path = "./data/mobile-dinners.db";
if (!existsSync(path)) {
  console.log("No database yet — it is created on first page load.");
  process.exit(0);
}

const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON");

const before = db.prepare("SELECT COUNT(*) AS n FROM orders").get();

db.exec("BEGIN");
db.exec("DELETE FROM order_events");
db.exec("DELETE FROM order_items");
db.exec("DELETE FROM orders");
db.exec("DELETE FROM loyalty_entries");
db.exec("UPDATE items SET is_available = 1");
db.prepare(
  "UPDATE wallet SET points_balance = 2847, tier = 'gold', orders_count = 22",
).run();
db.prepare(
  `INSERT INTO loyalty_entries (person_id, org_id, order_id, delta, reason, created_at)
   VALUES ('person_demo', NULL, NULL, 2847, 'opening_balance', ?)`,
).run(new Date().toISOString());
db.exec("COMMIT");

console.log(`Cleared ${before.n} orders. Wallet reset to 2,847 points. Full menu available.`);
