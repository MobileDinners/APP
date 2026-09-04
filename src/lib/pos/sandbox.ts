import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import type { PosItem, PosProvider, PosTokens } from "./types";

/**
 * A simulated POS.
 *
 * Square and Clover cannot be exercised without merchant credentials, which
 * means the parts most likely to contain bugs — catalogue mapping, conflict
 * resolution, order injection, retry — would otherwise ship untested.
 *
 * This provider stands in for a real till: it has its own catalogue that can be
 * edited independently of ours, so a genuine divergence can be created and the
 * sync logic checked against it. It is refused in production.
 */

export type SandboxItem = PosItem & { orgId: string };

function ensureTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS pos_sandbox_catalog (
      org_id      TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      hidden      INTEGER NOT NULL DEFAULT 0,
      category    TEXT,
      PRIMARY KEY (org_id, external_id)
    );
    CREATE TABLE IF NOT EXISTS pos_sandbox_orders (
      external_order_id TEXT PRIMARY KEY,
      org_id    TEXT NOT NULL,
      reference TEXT NOT NULL,
      payload   TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

/** Seeds the fake till from the restaurant's current menu. */
export function seedSandbox(orgId: string, items: Array<{
  itemId: string; name: string; description: string; priceCents: number;
}>): void {
  ensureTable();
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM pos_sandbox_catalog WHERE org_id = ?").run(orgId);
    const insert = db.prepare(
      `INSERT INTO pos_sandbox_catalog
         (org_id, external_id, name, description, price_cents, hidden, category)
       VALUES (?, ?, ?, ?, ?, 0, NULL)`,
    );
    for (const i of items) {
      // A real POS has its own ids, unrelated to ours. Using a different shape
      // here keeps the mapping table honest.
      insert.run(orgId, `SBX-${i.itemId}`, i.name, i.description, i.priceCents);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Simulates someone changing a price on the till itself. */
export function editSandboxItem(
  orgId: string,
  externalId: string,
  patch: Partial<Pick<SandboxItem, "name" | "description" | "priceCents" | "hidden">>,
): void {
  ensureTable();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); values.push(patch.name); }
  if (patch.description !== undefined) { sets.push("description = ?"); values.push(patch.description); }
  if (patch.priceCents !== undefined) { sets.push("price_cents = ?"); values.push(patch.priceCents); }
  if (patch.hidden !== undefined) { sets.push("hidden = ?"); values.push(patch.hidden ? 1 : 0); }
  if (sets.length === 0) return;
  values.push(orgId, externalId);
  getDb()
    .prepare(`UPDATE pos_sandbox_catalog SET ${sets.join(", ")} WHERE org_id = ? AND external_id = ?`)
    .run(...(values as never[]));
}

export function addSandboxItem(orgId: string, item: Omit<PosItem, "hidden"> & { hidden?: boolean }): void {
  ensureTable();
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO pos_sandbox_catalog
         (org_id, external_id, name, description, price_cents, hidden, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(orgId, item.externalId, item.name, item.description, item.priceCents,
      item.hidden ? 1 : 0, item.category);
}

export function sandboxOrders(orgId: string) {
  ensureTable();
  return getDb()
    .prepare(
      "SELECT * FROM pos_sandbox_orders WHERE org_id = ? ORDER BY created_at DESC LIMIT 20",
    )
    .all(orgId) as unknown as Array<{
      external_order_id: string; reference: string; payload: string; created_at: string;
    }>;
}

export const sandbox: PosProvider = {
  id: "sandbox",
  name: "Sandbox till",
  requiresOAuth: false,

  configured() {
    return process.env.NODE_ENV !== "production";
  },

  authorizeUrl() {
    // No OAuth; the connect endpoint short-circuits for this provider.
    return "";
  },

  async exchangeCode(): Promise<PosTokens> {
    return {
      accessToken: `sandbox-${randomUUID()}`,
      refreshToken: null,
      expiresAt: null,
      merchantId: "SANDBOX-MERCHANT",
      locationId: "SANDBOX-LOCATION",
    };
  },

  async refresh(): Promise<PosTokens> {
    return this.exchangeCode("", "");
  },

  async fetchCatalog(tokens): Promise<PosItem[]> {
    ensureTable();
    const rows = getDb()
      .prepare("SELECT * FROM pos_sandbox_catalog WHERE org_id = ?")
      .all(tokens.merchantId === "SANDBOX-MERCHANT" ? currentOrg() : tokens.merchantId) as
      unknown as Array<{
        external_id: string; name: string; description: string;
        price_cents: number; hidden: number; category: string | null;
      }>;

    return rows.map((r) => ({
      externalId: r.external_id,
      name: r.name,
      description: r.description,
      priceCents: r.price_cents,
      hidden: r.hidden === 1,
      category: r.category,
    }));
  },

  async pushOrder(tokens, order) {
    ensureTable();
    const id = `SBXORD-${randomUUID().slice(0, 8)}`;
    getDb()
      .prepare(
        `INSERT INTO pos_sandbox_orders (external_order_id, org_id, reference, payload, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, currentOrg(), order.reference, JSON.stringify(order), new Date().toISOString());
    return { externalOrderId: id };
  },

  async ping() {
    return true;
  },
};

/**
 * The sandbox is per-org but the provider interface is stateless, so the org is
 * threaded through a module-scoped value that sync.ts sets before each call.
 * Ugly, and confined to the fake provider rather than leaking into the real ones.
 */
let activeOrg = "";
export function setSandboxOrg(orgId: string): void {
  activeOrg = orgId;
}
function currentOrg(): string {
  return activeOrg;
}
