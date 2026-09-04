import { createHash } from "node:crypto";
import type { MenuItem } from "./types";

/**
 * The snapshot shape and its content hash, with no database dependency.
 *
 * Split out of menu.ts so the seed can publish an initial menu version
 * directly: menu.ts imports db.ts, db.ts imports seed.ts, and seed.ts
 * importing menu.ts would close that loop.
 */

/** Fields that actually affect what a guest sees or pays. */
export type SnapshotItem = {
  itemId: string;
  section: string;
  name: string;
  description: string;
  priceCents: number;
  costCents: number;
  prepSeconds: number;
  station: string;
  isAvailable: boolean;
  optionGroups: unknown;
};

export function toSnapshotItem(item: MenuItem): SnapshotItem {
  return {
    itemId: item.itemId,
    section: item.section,
    name: item.name,
    description: item.description,
    priceCents: item.priceCents,
    costCents: item.costCents,
    prepSeconds: item.prepSeconds,
    station: item.station,
    isAvailable: item.isAvailable,
    optionGroups: item.optionGroups,
  };
}

/**
 * Canonical form: items sorted by id, keys in a fixed order. Two menus with the
 * same content must produce byte-identical JSON, or the hash is meaningless.
 */
function canonicalize(items: MenuItem[]): string {
  const ordered = items
    .map(toSnapshotItem)
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
  return JSON.stringify(ordered);
}

export function contentHashOf(items: MenuItem[]): string {
  return createHash("sha256").update(canonicalize(items)).digest("hex");
}
