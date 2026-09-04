/** Clears campaigns and simulated orders so the campaign tests are repeatable. */
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("./data/mobile-dinners.db");
db.exec("PRAGMA foreign_keys = ON");
db.exec("BEGIN");
db.exec("DELETE FROM order_events WHERE order_id IN (SELECT order_id FROM orders WHERE idempotency_key LIKE 'sim-%')");
db.exec("DELETE FROM order_items  WHERE order_id IN (SELECT order_id FROM orders WHERE idempotency_key LIKE 'sim-%')");
db.exec("DELETE FROM orders WHERE idempotency_key LIKE 'sim-%'");
db.exec("DELETE FROM campaign_sends");
db.exec("DELETE FROM campaigns");
db.exec("COMMIT");
console.log("campaigns, sends and simulated orders cleared");
