/**
 * Tiny read-only query helper for the shell test scripts.
 * Prints the first column of the first row, so bash can capture it.
 *
 *   node scripts/db-query.mjs "SELECT price_cents FROM items WHERE item_id='it_street'"
 */
import { DatabaseSync } from "node:sqlite";

const sql = process.argv[2];
if (!sql) {
  console.error("usage: node scripts/db-query.mjs \"<select ...>\"");
  process.exit(1);
}
if (!/^\s*select/i.test(sql)) {
  console.error("read-only: only SELECT is allowed here");
  process.exit(1);
}

const db = new DatabaseSync("./data/mobile-dinners.db", { readOnly: true });
const row = db.prepare(sql).get();
console.log(row ? Object.values(row)[0] : "");
