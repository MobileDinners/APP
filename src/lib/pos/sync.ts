import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { getOrder, listMenu } from "../orders";
import { publishMenu } from "../menu";
import { open, seal } from "./secrets";
import { provider } from "./index";
import { setSandboxOrg } from "./sandbox";
import { PosError, type PosItem, type PosTokens, type ProviderId } from "./types";

/**
 * Coexist mode — spec §1.7.
 *
 * The incumbent POS stays the system of record for what a dish is called and
 * what it costs. Mobile Dinners owns the things a till has no concept of:
 * descriptions written for a web page, photos, item cost, marketplace-only
 * items. The conflict table below is the whole contract, and it is the reason
 * this is safe to run against a live restaurant.
 *
 *   field class            winner        on divergence
 *   ---------------------------------------------------------------
 *   name, price            POS           overwrite ours
 *   description, photo     us            keep ours
 *   availability (86)      most recent   last write wins
 *   item cost              us            POS has none
 *   marketplace-only item  us            POS never sees it
 *
 * And the rule that matters most: if more than three fields on one item
 * disagree, nothing is applied and a human is asked. Silently overwriting a
 * price is the worst bug this system can ship.
 */

const DIVERGENCE_LIMIT = 3;

export type Connection = {
  orgId: string;
  provider: ProviderId;
  merchantId: string;
  locationId: string | null;
  status: "active" | "needs_reauth" | "error";
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string;
  expiresAt: string | null;
};

type ConnRow = {
  org_id: string; provider: string; merchant_id: string; location_id: string | null;
  access_token: string; refresh_token: string | null; expires_at: string | null;
  status: string; last_sync_at: string | null; last_error: string | null;
  connected_at: string;
};

function toConnection(r: ConnRow): Connection {
  return {
    orgId: r.org_id,
    provider: r.provider as ProviderId,
    merchantId: r.merchant_id,
    locationId: r.location_id,
    status: r.status as Connection["status"],
    lastSyncAt: r.last_sync_at,
    lastError: r.last_error,
    connectedAt: r.connected_at,
    expiresAt: r.expires_at,
  };
}

export function getConnection(orgId: string): Connection | null {
  const r = getDb()
    .prepare("SELECT * FROM pos_connections WHERE org_id = ?")
    .get(orgId) as unknown as ConnRow | undefined;
  return r ? toConnection(r) : null;
}

function tokensFor(orgId: string): PosTokens {
  const r = getDb()
    .prepare("SELECT * FROM pos_connections WHERE org_id = ?")
    .get(orgId) as unknown as ConnRow | undefined;
  if (!r) throw new PosError("No POS connected", 404);
  return {
    accessToken: open(r.access_token),
    refreshToken: r.refresh_token ? open(r.refresh_token) : null,
    expiresAt: r.expires_at,
    merchantId: r.merchant_id,
    locationId: r.location_id,
  };
}

export function saveConnection(orgId: string, id: ProviderId, tokens: PosTokens): Connection {
  getDb()
    .prepare(
      `INSERT INTO pos_connections
         (org_id, provider, merchant_id, location_id, access_token, refresh_token,
          expires_at, status, last_sync_at, last_error, connected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?)
       ON CONFLICT(org_id) DO UPDATE SET
         provider = excluded.provider,
         merchant_id = excluded.merchant_id,
         location_id = excluded.location_id,
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         status = 'active',
         last_error = NULL`,
    )
    .run(
      orgId, id, tokens.merchantId, tokens.locationId,
      seal(tokens.accessToken),
      tokens.refreshToken ? seal(tokens.refreshToken) : null,
      tokens.expiresAt, new Date().toISOString(),
    );
  return getConnection(orgId)!;
}

export function disconnect(orgId: string): void {
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM pos_connections WHERE org_id = ?").run(orgId);
    // The item mapping goes too. Leaving it would silently re-attach a future
    // connection to items that may no longer correspond.
    db.prepare("DELETE FROM pos_item_map WHERE org_id = ?").run(orgId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Refreshes a token that is within an hour of expiring. */
async function ensureFresh(orgId: string): Promise<PosTokens> {
  const conn = getConnection(orgId);
  if (!conn) throw new PosError("No POS connected", 404);

  const tokens = tokensFor(orgId);
  if (!tokens.expiresAt || !tokens.refreshToken) return tokens;

  const msLeft = new Date(tokens.expiresAt).getTime() - Date.now();
  if (msLeft > 60 * 60 * 1000) return tokens;

  try {
    const fresh = await provider(conn.provider).refresh(tokens.refreshToken);
    saveConnection(orgId, conn.provider, fresh);
    return fresh;
  } catch (err) {
    markBroken(orgId, `Token refresh failed: ${(err as Error).message}`, "needs_reauth");
    throw err;
  }
}

function markBroken(orgId: string, message: string, status: "error" | "needs_reauth") {
  getDb()
    .prepare("UPDATE pos_connections SET status = ?, last_error = ? WHERE org_id = ?")
    .run(status, message.slice(0, 500), orgId);
}

/* ------------------------------------------------------------------ *
 * Catalogue sync
 * ------------------------------------------------------------------ */

export type SyncChange = {
  externalId: string;
  name: string;
  action: "created" | "updated" | "unchanged" | "flagged" | "skipped";
  fields: Array<{ field: string; from: string; to: string }>;
  reason?: string;
};

export type SyncResult = {
  ok: boolean;
  provider: ProviderId;
  created: number;
  updated: number;
  unchanged: number;
  flagged: number;
  skipped: number;
  changes: SyncChange[];
  error?: string;
  publishedVersion?: number;
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function syncCatalog(orgId: string, publish = true): Promise<SyncResult> {
  const conn = getConnection(orgId);
  if (!conn) throw new PosError("No POS connected", 404);

  const p = provider(conn.provider);
  if (conn.provider === "sandbox") setSandboxOrg(orgId);

  let external: PosItem[];
  try {
    const tokens = await ensureFresh(orgId);
    external = await p.fetchCatalog(tokens);
  } catch (err) {
    const e = err as PosError;
    markBroken(orgId, e.message, e.status === 401 || e.status === 403 ? "needs_reauth" : "error");
    const failed: SyncResult = {
      ok: false, provider: conn.provider, created: 0, updated: 0,
      unchanged: 0, flagged: 0, skipped: 0, changes: [], error: e.message,
    };
    writeLog(orgId, conn.provider, failed);
    return failed;
  }

  const db = getDb();
  const mapRows = db
    .prepare("SELECT external_id, item_id FROM pos_item_map WHERE org_id = ? AND provider = ?")
    .all(orgId, conn.provider) as unknown as Array<{ external_id: string; item_id: string }>;
  const mapped = new Map(mapRows.map((r) => [r.external_id, r.item_id]));

  const menu = listMenu(orgId);
  const ours = new Map(menu.map((i) => [i.itemId, i]));
  const changes: SyncChange[] = [];

  /**
   * First-connection reconciliation.
   *
   * A restaurant that already sells here and then connects their till must not
   * end up with two of every dish. Before creating anything, an unmapped till
   * item is matched against an unmapped local item by name.
   *
   * Deliberately conservative: exact match after normalising case and spacing,
   * and only when exactly one candidate exists. Two items called "Small Fries"
   * are left alone for a human, because guessing wrong here silently reprices
   * the wrong dish.
   */
  const normalise = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
  const alreadyMapped = new Set(mapRows.map((r) => r.item_id));
  const byName = new Map<string, string[]>();
  for (const i of menu) {
    if (alreadyMapped.has(i.itemId)) continue;
    const k = normalise(i.name);
    byName.set(k, [...(byName.get(k) ?? []), i.itemId]);
  }
  const claimed = new Set<string>();

  db.exec("BEGIN");
  try {
    for (const ext of external) {
      let localId = mapped.get(ext.externalId);

      // Not mapped yet: try to recognise it as an item we already sell.
      if (!localId) {
        const candidates = (byName.get(normalise(ext.name)) ?? []).filter(
          (id) => !claimed.has(id),
        );
        if (candidates.length === 1) {
          localId = candidates[0];
          claimed.add(localId);
          db.prepare(
            `INSERT OR REPLACE INTO pos_item_map (org_id, provider, external_id, item_id)
             VALUES (?, ?, ?, ?)`,
          ).run(orgId, conn.provider, ext.externalId, localId);
        }
      }

      const local = localId ? ours.get(localId) : undefined;

      // --- new on the till -------------------------------------------
      if (!local) {
        const newId = `pos_${randomUUID().slice(0, 12)}`;
        db.prepare(
          `INSERT INTO items (item_id, org_id, section, name, description, price_cents,
                              cost_cents, prep_seconds, station, is_available,
                              sort_order, image_kw, is_popular, options_json)
           VALUES (?, ?, ?, ?, ?, ?, 0, 300, 'assembly', ?, 999, 'food', 0, '[]')`,
        ).run(
          newId, orgId, ext.category ?? "From your POS", ext.name,
          ext.description, ext.priceCents, ext.hidden ? 0 : 1,
        );
        db.prepare(
          `INSERT OR REPLACE INTO pos_item_map (org_id, provider, external_id, item_id)
           VALUES (?, ?, ?, ?)`,
        ).run(orgId, conn.provider, ext.externalId, newId);

        changes.push({
          externalId: ext.externalId,
          name: ext.name,
          action: "created",
          fields: [{ field: "Price", from: "—", to: money(ext.priceCents) }],
          reason: "New on your POS. Cost and prep time still need filling in here.",
        });
        continue;
      }

      // --- divergence check ------------------------------------------
      const diffs: SyncChange["fields"] = [];
      if (local.name !== ext.name) {
        diffs.push({ field: "Name", from: local.name, to: ext.name });
      }
      if (local.priceCents !== ext.priceCents) {
        diffs.push({ field: "Price", from: money(local.priceCents), to: money(ext.priceCents) });
      }
      // Description is ours, and only adopted when we have none of our own.
      if (!local.description && ext.description) {
        diffs.push({ field: "Description", from: "—", to: ext.description });
      }
      const shouldBeAvailable = !ext.hidden;
      if (local.isAvailable !== shouldBeAvailable) {
        diffs.push({
          field: "Available",
          from: local.isAvailable ? "yes" : "no",
          to: shouldBeAvailable ? "yes" : "no",
        });
      }

      if (diffs.length === 0) {
        changes.push({ externalId: ext.externalId, name: ext.name, action: "unchanged", fields: [] });
        continue;
      }

      // Too much moved at once to trust. Apply nothing, ask a human.
      if (diffs.length > DIVERGENCE_LIMIT) {
        changes.push({
          externalId: ext.externalId,
          name: ext.name,
          action: "flagged",
          fields: diffs,
          reason:
            `${diffs.length} fields disagree. Nothing was changed — this usually means the ` +
            `item was replaced on the till rather than edited, and overwriting it blindly ` +
            `would put the wrong price in front of a guest.`,
        });
        continue;
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      for (const d of diffs) {
        if (d.field === "Name") { sets.push("name = ?"); values.push(ext.name); }
        if (d.field === "Price") { sets.push("price_cents = ?"); values.push(ext.priceCents); }
        if (d.field === "Description") { sets.push("description = ?"); values.push(ext.description); }
        if (d.field === "Available") { sets.push("is_available = ?"); values.push(shouldBeAvailable ? 1 : 0); }
      }
      values.push(local.itemId);
      db.prepare(`UPDATE items SET ${sets.join(", ")} WHERE item_id = ?`).run(...(values as never[]));

      changes.push({ externalId: ext.externalId, name: ext.name, action: "updated", fields: diffs });
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const result: SyncResult = {
    ok: true,
    provider: conn.provider,
    created: changes.filter((c) => c.action === "created").length,
    updated: changes.filter((c) => c.action === "updated").length,
    unchanged: changes.filter((c) => c.action === "unchanged").length,
    flagged: changes.filter((c) => c.action === "flagged").length,
    skipped: changes.filter((c) => c.action === "skipped").length,
    changes,
  };

  // A sync that changes nothing should not mint a menu version.
  if (publish && (result.created > 0 || result.updated > 0)) {
    try {
      result.publishedVersion = publishMenu(orgId, "pos_sync", null).versionNo;
    } catch {
      // publishMenu refuses an unchanged menu; that is fine here.
    }
  }

  getDb()
    .prepare("UPDATE pos_connections SET last_sync_at = ?, status = 'active', last_error = NULL WHERE org_id = ?")
    .run(new Date().toISOString(), orgId);
  writeLog(orgId, conn.provider, result);
  return result;
}

function writeLog(orgId: string, providerId: ProviderId, r: SyncResult) {
  getDb()
    .prepare(
      `INSERT INTO pos_sync_log (log_id, org_id, provider, created, updated, unchanged,
                                 flagged, skipped, detail, ok, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(), orgId, providerId, r.created, r.updated, r.unchanged,
      r.flagged, r.skipped,
      // Unchanged items are the bulk of a sync and say nothing; drop them.
      JSON.stringify(r.changes.filter((c) => c.action !== "unchanged").slice(0, 100)),
      r.ok ? 1 : 0, r.error ?? null, new Date().toISOString(),
    );
}

export function syncHistory(orgId: string, limit = 10) {
  return (
    getDb()
      .prepare("SELECT * FROM pos_sync_log WHERE org_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(orgId, limit) as unknown as Array<{
        log_id: string; provider: string; created: number; updated: number;
        unchanged: number; flagged: number; skipped: number; detail: string;
        ok: number; error: string | null; created_at: string;
      }>
  ).map((r) => ({
    logId: r.log_id,
    provider: r.provider as ProviderId,
    created: r.created,
    updated: r.updated,
    unchanged: r.unchanged,
    flagged: r.flagged,
    skipped: r.skipped,
    changes: JSON.parse(r.detail) as SyncChange[],
    ok: r.ok === 1,
    error: r.error,
    createdAt: r.created_at,
  }));
}

/* ------------------------------------------------------------------ *
 * Order injection
 * ------------------------------------------------------------------ */

/**
 * Pushes a marketplace order into the restaurant's own till, so the ticket
 * prints where their staff already look. Failure is recorded rather than
 * thrown: the guest has paid and the order exists regardless of whether the
 * till accepted it, and a queued push is a problem for the operator, not a
 * reason to fail a checkout.
 */
export async function pushOrderToPos(orderId: string): Promise<{
  status: "pushed" | "failed" | "skipped";
  externalOrderId?: string;
  error?: string;
}> {
  const order = getOrder(orderId);
  if (!order) return { status: "skipped", error: "Unknown order" };

  const conn = getConnection(order.orgId);
  if (!conn) return { status: "skipped" };

  const db = getDb();
  db.prepare(
    `INSERT INTO pos_order_push (order_id, org_id, provider, status, attempts, updated_at)
     VALUES (?, ?, ?, 'pending', 0, ?)
     ON CONFLICT(order_id) DO NOTHING`,
  ).run(orderId, order.orgId, conn.provider, new Date().toISOString());

  const already = db
    .prepare("SELECT status, external_order_id FROM pos_order_push WHERE order_id = ?")
    .get(orderId) as { status: string; external_order_id: string | null } | undefined;
  if (already?.status === "pushed") {
    return { status: "pushed", externalOrderId: already.external_order_id ?? undefined };
  }

  if (conn.provider === "sandbox") setSandboxOrg(order.orgId);

  try {
    const tokens = await ensureFresh(order.orgId);
    const { externalOrderId } = await provider(conn.provider).pushOrder(tokens, {
      // The order id doubles as the idempotency key, so a retry cannot print
      // the same ticket twice.
      reference: order.orderId,
      note: `Mobile Dinners ${order.fulfillment} · ${order.guestName}`.slice(0, 250),
      lines: order.lines.map((l) => ({
        name: l.optionsLabel ? `${l.name} (${l.optionsLabel})` : l.name,
        quantity: l.qty,
        unitPriceCents: l.unitPriceCents,
        note: l.notes,
      })),
    });

    db.prepare(
      `UPDATE pos_order_push SET status = 'pushed', external_order_id = ?,
              attempts = attempts + 1, last_error = NULL, updated_at = ?
       WHERE order_id = ?`,
    ).run(externalOrderId, new Date().toISOString(), orderId);

    return { status: "pushed", externalOrderId };
  } catch (err) {
    const message = (err as Error).message;
    db.prepare(
      `UPDATE pos_order_push SET status = 'failed', attempts = attempts + 1,
              last_error = ?, updated_at = ? WHERE order_id = ?`,
    ).run(message.slice(0, 500), new Date().toISOString(), orderId);
    return { status: "failed", error: message };
  }
}

export function pendingPushes(orgId: string) {
  return getDb()
    .prepare(
      `SELECT order_id, status, attempts, last_error, external_order_id, updated_at
       FROM pos_order_push WHERE org_id = ? AND status != 'pushed'
       ORDER BY updated_at DESC LIMIT 20`,
    )
    .all(orgId) as unknown as Array<{
      order_id: string; status: string; attempts: number;
      last_error: string | null; external_order_id: string | null; updated_at: string;
    }>;
}
