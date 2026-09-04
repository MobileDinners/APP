/**
 * Resets what the POS suite created.
 *
 * Leaving POS-created items and the sandbox catalog behind is what let the
 * duplication compound across runs: the catalog re-seeds from the live menu,
 * so every leftover item became another till item on the next run.
 *
 * Only touches items created by a sync (`pos_` prefix) or by this suite's own
 * fixtures, and never touches anything with order history.
 */
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("./data/mobile-dinners.db");
db.exec("PRAGMA foreign_keys = ON");

const ordered = new Set(
  db.prepare("SELECT DISTINCT item_id FROM order_items").all().map((r) => r.item_id),
);

let removed = 0;
let kept = 0;

const candidates = db
  .prepare(
    `SELECT item_id FROM items
      WHERE item_id LIKE 'pos\\_%' ESCAPE '\\'
         OR item_id = 'it_ambig2'
         OR name = 'Ambiguous Plate'`,
  )
  .all();

db.exec("BEGIN");
try {
  for (const r of candidates) {
    if (ordered.has(r.item_id)) {
      kept += 1;
      continue;
    }
    db.prepare("DELETE FROM pos_item_map WHERE item_id = ?").run(r.item_id);
    db.prepare("DELETE FROM items WHERE item_id = ?").run(r.item_id);
    removed += 1;
  }
  db.prepare("DELETE FROM pos_sandbox_catalog").run();
  db.prepare("DELETE FROM pos_sandbox_orders").run();
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

console.log(
  `  removed ${removed} POS/test item(s), cleared the sandbox catalog` +
    (kept > 0 ? `, kept ${kept} with order history` : ""),
);
