import { PHOTOS } from "./photos";

/**
 * Food photography for the prototype.
 *
 * Real dish photos from TheMealDB, resolved once by scripts/fetch-photos.mjs
 * and baked into photos.ts — so every image is guaranteed to be food (a random
 * stock-photo API will happily hand you a bridge for "bao") and the app has no
 * runtime dependency on an image service.
 *
 * Selection is seeded by id, so a given dish always shows the same photo.
 * Swap this one function for a CDN when the restaurants supply real shots.
 */

/** Stable non-negative integer from an id. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Keywords with no direct match fall back to something visually adjacent. */
const FALLBACK: Record<string, string> = {
  coffee: "milkshake",
  tea: "milkshake",
};

export function foodPhoto(keyword: string, seed: string, width: number): string {
  const key = PHOTOS[keyword] ? keyword : (FALLBACK[keyword] ?? "food");
  const pool = PHOTOS[key] ?? PHOTOS.food ?? [];
  if (pool.length === 0) return "";

  const url = pool[hash(seed) % pool.length];
  // TheMealDB serves a ~7KB preview variant — right for thumbnails and circles.
  return width <= 320 ? `${url}/preview` : url;
}

/** Deterministic hue for the plate that sits behind a loading photo. */
export function plateHue(seed: string): number {
  return hash(seed) % 360;
}
