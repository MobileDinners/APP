/**
 * Repairs the runaway POS duplication.
 *
 * A sync that could not match an ambiguous name created a new item instead of
 * flagging it. Each new item became another candidate, so the next sync matched
 * even less and created more — doubling every run until one restaurant held
 * 196,607 copies of a single dessert.
 *
 * The code path is fixed. This clears the wreckage it left behind.
 *
 * Safety: only removes POS-created items (`pos_` prefix) that duplicate a name
 * already held by an ORIGINAL item, keeping the oldest of each name. Anything a
 * human typed, and anything that has ever been ordered, is left alone —
 * deleting an ordered item would break receipts.
 */
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("./data/mobile-dinners.db");
db.exec("PRAGMA foreign_keys = ON");

const before = db.prepare("SELECT COUNT(*) AS n FROM items").get().n;
const catalogBefore = db
  .prepare("SELECT COUNT(*) AS n FROM pos_sandbox_catalog")
  .get().n;

// Items that have ever appeared on an order must survive, whatever their name.
const ordered = new Set(
  db.prepare("SELECT DISTINCT item_id FROM order_items").all().map((r) => r.item_id),
);

// For every (org, normalised name), keep the single best row: prefer a
// non-POS item, then the lowest rowid, which is the oldest.
const groups = db
  .prepare(
    `SELECT org_id,
            LOWER(TRIM(name)) AS key,
            COUNT(*)          AS n
       FROM items
      GROUP BY org_id, LOWER(TRIM(name))
     HAVING COUNT(*) > 1`,
  )
  .all();

let removed = 0;
let keptOrdered = 0;

db.exec("BEGIN");
try {
  for (const g of groups) {
    const rows = db
      .prepare(
        `SELECT rowid, item_id FROM items
          WHERE org_id = ? AND LOWER(TRIM(name)) = ?
          ORDER BY (item_id LIKE 'pos\\_%' ESCAPE '\\') ASC, rowid ASC`,
      )
      .all(g.org_id, g.key);

    // rows[0] is the keeper: an original item if one exists, else the oldest.
    for (const r of rows.slice(1)) {
      if (!r.item_id.startsWith("pos_")) continue; // never delete a human's item
      if (ordered.has(r.item_id)) {
        keptOrdered += 1;
        continue; // never delete something with order history
      }
      db.prepare("DELETE FROM pos_item_map WHERE item_id = ?").run(r.item_id);
      db.prepare("DELETE FROM items WHERE item_id = ?").run(r.item_id);
      removed += 1;
    }
  }
  // The sandbox catalog is a test fixture that re-seeds from the live menu, so
  // it inherited the explosion. Clearing it stops the loop restarting.
  db.prepare("DELETE FROM pos_sandbox_catalog").run();
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const after = db.prepare("SELECT COUNT(*) AS n FROM items").get().n;
console.log(`  items:   ${before} -> ${after}  (removed ${removed})`);
console.log(`  catalog: ${catalogBefore} -> 0`);
if (keptOrdered > 0) {
  console.log(`  kept ${keptOrdered} duplicate(s) that have order history`);
}
for (const r of db
  .prepare(
    `SELECT o.brand_name AS b, COUNT(i.item_id) AS n
       FROM orgs o LEFT JOIN items i ON i.org_id = o.org_id
      GROUP BY o.org_id ORDER BY n DESC`,
  )
  .all()) {
  console.log(`    ${r.b}: ${r.n}`);
}
