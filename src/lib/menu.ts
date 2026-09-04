import { randomUUID } from "node:crypto";
import { scan } from "./claims";
import { getDb } from "./db";
import { publish } from "./events";
import { getItem, listMenu } from "./orders";
import type { MenuChange, MenuItem, MenuVersion } from "./types";
import { contentHashOf, toSnapshotItem, type SnapshotItem } from "./menu-snapshot";

export { contentHashOf };

/**
 * Menu of record — spec principle 2.
 *
 * The `items` table is the editable draft. Publishing freezes it into an
 * immutable snapshot with a content hash; orders record which snapshot they
 * were priced against. Nothing ever edits a published version, so changing a
 * price tomorrow can never rewrite what a guest agreed to pay today.
 */


/* ------------------------------------------------------------------ */

type VersionRow = {
  menu_version_id: string; org_id: string; version_no: number;
  content_hash: string; item_count: number; source: string;
  published_by: string | null; published_at: string; snapshot_json: string;
};

function toVersion(r: VersionRow): MenuVersion {
  return {
    menuVersionId: r.menu_version_id,
    orgId: r.org_id,
    versionNo: r.version_no,
    contentHash: r.content_hash,
    itemCount: r.item_count,
    source: r.source as MenuVersion["source"],
    publishedBy: r.published_by,
    publishedAt: r.published_at,
  };
}

export function currentVersion(orgId: string): MenuVersion | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM menu_versions WHERE org_id = ? ORDER BY version_no DESC LIMIT 1",
    )
    .get(orgId) as unknown as VersionRow | undefined;
  return row ? toVersion(row) : null;
}

export function listVersions(orgId: string, limit = 20): MenuVersion[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM menu_versions WHERE org_id = ? ORDER BY version_no DESC LIMIT ?",
    )
    .all(orgId, limit) as unknown as VersionRow[];
  return rows.map(toVersion);
}

function snapshotItems(versionId: string): SnapshotItem[] {
  const row = getDb()
    .prepare("SELECT snapshot_json FROM menu_versions WHERE menu_version_id = ?")
    .get(versionId) as { snapshot_json: string } | undefined;
  return row ? (JSON.parse(row.snapshot_json) as SnapshotItem[]) : [];
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/** What has changed in the draft since the last publish. */
export function pendingChanges(orgId: string): MenuChange[] {
  const live = currentVersion(orgId);
  const draft = listMenu(orgId).map(toSnapshotItem);
  const published = live ? snapshotItems(live.menuVersionId) : [];

  const byId = new Map(published.map((i) => [i.itemId, i]));
  const changes: MenuChange[] = [];

  for (const item of draft) {
    const before = byId.get(item.itemId);
    if (!before) {
      changes.push({ itemId: item.itemId, name: item.name, kind: "added", fields: [] });
      continue;
    }
    byId.delete(item.itemId);

    const fields: MenuChange["fields"] = [];
    if (before.name !== item.name)
      fields.push({ field: "Name", from: before.name, to: item.name });
    if (before.description !== item.description)
      fields.push({ field: "Description", from: before.description, to: item.description });
    if (before.priceCents !== item.priceCents)
      fields.push({ field: "Price", from: money(before.priceCents), to: money(item.priceCents) });
    if (before.costCents !== item.costCents)
      fields.push({ field: "Food cost", from: money(before.costCents), to: money(item.costCents) });
    if (before.prepSeconds !== item.prepSeconds)
      fields.push({
        field: "Prep time",
        from: `${Math.round(before.prepSeconds / 60)} min`,
        to: `${Math.round(item.prepSeconds / 60)} min`,
      });
    if (before.section !== item.section)
      fields.push({ field: "Section", from: before.section, to: item.section });
    if (before.station !== item.station)
      fields.push({ field: "Station", from: before.station, to: item.station });

    if (fields.length > 0) {
      changes.push({ itemId: item.itemId, name: item.name, kind: "changed", fields });
    }
  }

  for (const removed of byId.values()) {
    changes.push({ itemId: removed.itemId, name: removed.name, kind: "removed", fields: [] });
  }

  return changes;
}

/**
 * The menu a GUEST sees and is charged from.
 *
 * Prices, names, descriptions and options come from the published snapshot —
 * never from the editable draft, or an operator half-way through a price
 * revision would be charging people the number they were still thinking about.
 *
 * Availability is the one field taken live, deliberately: 86ing an item has to
 * reach guests in seconds and cannot wait for a publish. That is exactly the
 * split in the spec's conflict-resolution table.
 */
export function publishedMenu(orgId: string): MenuItem[] {
  const version = currentPublished(orgId);
  if (!version) return [];
  const snapshot = snapshotItems(version.menuVersionId);
  const live = new Map(listMenu(orgId).map((i) => [i.itemId, i]));

  return snapshot
    .map((s): MenuItem | null => {
      const current = live.get(s.itemId);
      // An item deleted from the draft since publishing is no longer orderable.
      if (!current) return null;
      return {
        itemId: s.itemId,
        orgId,
        section: s.section,
        name: s.name,
        description: s.description,
        priceCents: s.priceCents,
        costCents: s.costCents,
        prepSeconds: s.prepSeconds,
        station: s.station as MenuItem["station"],
        isAvailable: current.isAvailable,          // live
        imageKw: current.imageKw,                  // presentational
        isPopular: current.isPopular,              // presentational
        optionGroups: s.optionGroups as MenuItem["optionGroups"],
      };
    })
    .filter((i): i is MenuItem => i !== null);
}

/** One item, priced as published. Returns null if it is not on the live menu. */
export function getPublishedItem(orgId: string, itemId: string): MenuItem | null {
  return publishedMenu(orgId).find((i) => i.itemId === itemId) ?? null;
}

export class MenuError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Freeze the current draft as a new immutable version. Republishing an
 * unchanged menu is refused rather than creating a duplicate — the hash is what
 * tells us nothing moved.
 */
export function publishMenu(
  orgId: string,
  source: MenuVersion["source"],
  publishedBy: string | null,
): MenuVersion {
  const db = getDb();
  const items = listMenu(orgId);
  if (items.length === 0) throw new MenuError("Cannot publish an empty menu");

  const hash = contentHashOf(items);
  const live = currentVersion(orgId);
  if (live && live.contentHash === hash) {
    throw new MenuError("Nothing has changed since the last publish", 409);
  }

  const versionNo = (live?.versionNo ?? 0) + 1;
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO menu_versions (menu_version_id, org_id, version_no, content_hash,
                                snapshot_json, item_count, source, published_by, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, orgId, versionNo, hash,
    JSON.stringify(items.map(toSnapshotItem).sort((a, b) => a.itemId.localeCompare(b.itemId))),
    items.length, source, publishedBy, now,
  );

  publish({ type: "menu.published", orgId, menuVersionId: id, versionNo });
  return currentVersion(orgId)!;
}

/**
 * Every org needs a v1 before it can take an order — but a restaurant that
 * signed up ten seconds ago has no items yet. That is an empty menu, not an
 * error, so this returns null rather than throwing and every caller treats it
 * as "nothing on sale yet".
 */
/**
 * The live version, or null if the restaurant has never published.
 *
 * Reading a menu must never publish one. A restaurant that has signed up but
 * not pressed Publish is not open for business, and auto-publishing its draft
 * would put placeholder items on sale at whatever price they happened to hold.
 */
export function currentPublished(orgId: string): MenuVersion | null {
  return currentVersion(orgId);
}

/* ------------------------------------------------------------------ */

export type NewItem = {
  name: string;
  description: string;
  priceCents: number;
  costCents: number;
  prepSeconds: number;
  section: string;
  station: string;
  imageKw: string;
};

const STATIONS = ["grill", "fry", "assembly", "cold", "bar"];

/**
 * Item copy is guest-facing — it renders on the storefront and the public
 * website — so it goes through the same claims filter as the website builder.
 * A "gluten-free" in a dish description is exactly as dangerous as one in a
 * hero headline, and arguably more likely.
 */
function assertCopyIsPublishable(name: string, description: string): void {
  const report = scan({ "Item name": name, "Item description": description });
  const blocked = report.findings.filter((f) => f.severity === "block");
  if (blocked.length > 0) {
    throw new MenuError(
      `Cannot save: ${blocked.map((b) => `"${b.matched}"`).join(", ")}. ` +
      `${blocked[0].reason}`,
      422,
    );
  }
}

/**
 * Adds an item to the draft. It is not orderable until the menu is published.
 *
 * Duplicate names are refused within a restaurant, and not for tidiness: the
 * POS reconciler matches an unmapped till item to ours by name, and two items
 * called the same thing make that match ambiguous — which silently reprices the
 * wrong dish.
 */
export function createItem(orgId: string, input: NewItem): string {
  const db = getDb();

  const name = input.name.trim();
  if (!name) throw new MenuError("Give the item a name");
  if (name.length > 80) throw new MenuError("Name is too long (80 characters max)");

  const section = input.section.trim();
  if (!section) throw new MenuError("Choose or type a section");

  const price = Math.round(input.priceCents);
  if (!Number.isFinite(price) || price < 0 || price > 100_000) {
    throw new MenuError("Price must be between $0.00 and $1,000.00");
  }
  const cost = Math.round(input.costCents ?? 0);
  if (!Number.isFinite(cost) || cost < 0 || cost > 100_000) {
    throw new MenuError("Food cost must be between $0.00 and $1,000.00");
  }
  if (cost > price && price > 0) {
    throw new MenuError(
      `Food cost (${money(cost)}) is above the price (${money(price)}). ` +
      `That item loses money on every sale.`,
    );
  }
  const prep = Math.round(input.prepSeconds ?? 300);
  if (!Number.isFinite(prep) || prep < 0 || prep > 7200) {
    throw new MenuError("Prep time must be between 0 and 120 minutes");
  }
  if (!STATIONS.includes(input.station)) throw new MenuError("Unknown station");

  const description = input.description.trim().slice(0, 280);
  assertCopyIsPublishable(name, description);

  const clash = db
    .prepare("SELECT item_id FROM items WHERE org_id = ? AND lower(trim(name)) = lower(?)")
    .get(orgId, name) as { item_id: string } | undefined;
  if (clash) {
    throw new MenuError(
      `You already have an item called "${name}". Two items with the same name ` +
      `break the match against your POS, so names have to be unique.`,
      409,
    );
  }

  const nextSort = (db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM items WHERE org_id = ?")
    .get(orgId) as { n: number }).n + 1;

  const itemId = `item_${randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO items (item_id, org_id, section, name, description, price_cents,
                        cost_cents, prep_seconds, station, is_available, sort_order,
                        image_kw, is_popular, options_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, '[]')`,
  ).run(
    itemId, orgId, section.slice(0, 60), name, description, price, cost, prep,
    input.station, nextSort, (input.imageKw || "food").slice(0, 40),
  );

  return itemId;
}

/**
 * Removes an item from the draft — but only one that has never been ordered.
 *
 * An item with order history cannot be deleted: receipts, the CRM's favourite
 * dish, and the upsell affinities all reference it, and deleting the row would
 * turn a guest's past order into a blank line. Those get 86'd instead, which
 * takes them off the menu without rewriting history.
 */
export function deleteItem(orgId: string, itemId: string): void {
  const db = getDb();
  const owned = db
    .prepare("SELECT name FROM items WHERE item_id = ? AND org_id = ?")
    .get(itemId, orgId) as { name: string } | undefined;
  if (!owned) throw new MenuError("Unknown item", 404);

  const ordered = (db
    .prepare("SELECT COUNT(*) AS n FROM order_items WHERE item_id = ?")
    .get(itemId) as { n: number }).n;

  if (ordered > 0) {
    throw new MenuError(
      `"${owned.name}" has been ordered ${ordered} time${ordered === 1 ? "" : "s"}, ` +
      `so deleting it would blank those receipts. Mark it sold out instead — it ` +
      `comes off the menu and the history stays intact.`,
      409,
    );
  }

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM pos_item_map WHERE org_id = ? AND item_id = ?").run(orgId, itemId);
    db.prepare("DELETE FROM items WHERE item_id = ? AND org_id = ?").run(itemId, orgId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export type ItemPatch = Partial<{
  name: string;
  description: string;
  priceCents: number;
  costCents: number;
  prepSeconds: number;
  section: string;
  station: string;
}>;

/** Edits the draft. Nothing here is visible to guests until it is published. */
export function updateItem(orgId: string, itemId: string, patch: ItemPatch): void {
  const db = getDb();
  const owned = db
    .prepare("SELECT org_id, name FROM items WHERE item_id = ?")
    .get(itemId) as { org_id: string; name: string } | undefined;
  if (!owned || owned.org_id !== orgId) throw new MenuError("Unknown item", 404);

  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new MenuError("Name cannot be empty");
    assertCopyIsPublishable(name, patch.description ?? "");
    sets.push("name = ?"); values.push(name.slice(0, 80));
  }
  if (patch.description !== undefined) {
    assertCopyIsPublishable(patch.name ?? owned.name ?? "", patch.description);
    sets.push("description = ?"); values.push(patch.description.trim().slice(0, 280));
  }
  if (patch.priceCents !== undefined) {
    const price = Math.round(patch.priceCents);
    if (!Number.isFinite(price) || price < 0 || price > 100_000) {
      throw new MenuError("Price must be between $0.00 and $1,000.00");
    }
    sets.push("price_cents = ?"); values.push(price);
  }
  if (patch.costCents !== undefined) {
    const cost = Math.round(patch.costCents);
    if (!Number.isFinite(cost) || cost < 0 || cost > 100_000) {
      throw new MenuError("Food cost must be between $0.00 and $1,000.00");
    }
    sets.push("cost_cents = ?"); values.push(cost);
  }
  if (patch.prepSeconds !== undefined) {
    const prep = Math.round(patch.prepSeconds);
    if (!Number.isFinite(prep) || prep < 0 || prep > 7200) {
      throw new MenuError("Prep time must be between 0 and 120 minutes");
    }
    sets.push("prep_seconds = ?"); values.push(prep);
  }
  if (patch.section !== undefined) {
    const section = patch.section.trim();
    if (!section) throw new MenuError("Section cannot be empty");
    sets.push("section = ?"); values.push(section.slice(0, 60));
  }
  if (patch.station !== undefined) {
    const allowed = ["grill", "fry", "assembly", "cold", "bar"];
    if (!allowed.includes(patch.station)) throw new MenuError("Unknown station");
    sets.push("station = ?"); values.push(patch.station);
  }

  if (sets.length === 0) return;
  values.push(itemId);
  db.prepare(`UPDATE items SET ${sets.join(", ")} WHERE item_id = ?`).run(...(values as never[]));
}
