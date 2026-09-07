import { getDb } from "./db";

/**
 * Turning addresses into coordinates, and coordinates into a delivery fee.
 *
 * This replaces the single most dishonest number in the product. Every
 * restaurant's `distance_mi` was a random value assigned at seed time, and
 * nothing geocoded a diner's address at all — so the "2.4 mi" on a restaurant
 * card and the fee derived from it were decoration. The site promises, in
 * writing on two pages, a fee "worked out from how far your address is from
 * the restaurant". Until now that was not true.
 *
 * OpenCage over raw REST, matching the other providers here. Two things drive
 * the design:
 *
 *   CACHING IS NOT OPTIONAL. The free tier allows 2,500 requests a day and a
 *   busy dinner service would burn that on one street of repeat customers.
 *   Every lookup is cached by normalised address, permanently — addresses do
 *   not move.
 *
 *   A MISSING KEY MUST NOT BREAK CHECKOUT. With no key configured, or on any
 *   provider failure, `deliveryQuote` falls back to the restaurant's flat fee
 *   and says so in its result. A diner who cannot be geocoded should still be
 *   able to order; they should not be charged a fee computed from a distance
 *   nobody knows.
 */

const ENDPOINT = "https://api.opencagedata.com/geocode/v1/json";

/**
 * Any of three names, because the variable got named before the provider was
 * chosen and renaming a live environment variable is a deploy nobody needs.
 * GEOCODE_API_KEY is what the production deployment actually uses.
 */
function apiKey(): string | null {
  return (
    process.env.GEOCODE_API_KEY?.trim() ||
    process.env.OPENCAGE_API_KEY?.trim() ||
    process.env.MAPS_API_KEY?.trim() ||
    null
  );
}

export function geocodeConfigured(): boolean {
  return apiKey() !== null;
}

export type LatLng = { lat: number; lng: number };

export type GeocodeResult = LatLng & {
  /** OpenCage's own 0-10 confidence. See MIN_CONFIDENCE below. */
  confidence: number;
  formatted: string;
};

/**
 * How precise a result has to be before we price a delivery from it.
 *
 * OpenCage's scale is a radius: 10 is within 250m, 8 within 1km, 5 within
 * 10km, 1 is over 25km. Our whole delivery radius is 8 miles — about 13km —
 * so a result accurate to "somewhere in this 10km circle" is not a number to
 * charge money against. 7 (within 5km) is the floor.
 *
 * Anything below falls back to the flat rate, which is a worse price but an
 * honest one. Note this measures PRECISION, not correctness: a confident match
 * on the wrong street is still confident, which is why restaurant addresses
 * need a city and state — see the seed.
 */
const MIN_CONFIDENCE = 7;

/* ------------------------------------------------------------------ *
 * Cache
 * ------------------------------------------------------------------ */

/** Lowercase, collapse whitespace, drop punctuation that never changes a place. */
function cacheKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readCache(key: string): GeocodeResult | null {
  try {
    const row = getDb()
      .prepare("SELECT lat, lng, confidence, formatted FROM geocode_cache WHERE key = ?")
      .get(key) as
      | { lat: number; lng: number; confidence: number; formatted: string }
      | undefined;
    return row ?? null;
  } catch {
    // A cache that cannot be read is a slow path, not a failure.
    return null;
  }
}

function writeCache(key: string, r: GeocodeResult): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO geocode_cache (key, lat, lng, confidence, formatted, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           lat = excluded.lat, lng = excluded.lng,
           confidence = excluded.confidence, formatted = excluded.formatted`,
      )
      .run(key, r.lat, r.lng, r.confidence, r.formatted, new Date().toISOString());
  } catch (err) {
    console.error("[geocode] cache write failed", err);
  }
}

/* ------------------------------------------------------------------ *
 * Lookup
 * ------------------------------------------------------------------ */

/**
 * Address to coordinates. Returns null rather than throwing — every caller
 * has a sensible thing to do without a location, and none of them should
 * fail a checkout because a geocoder was slow.
 */
export async function geocode(address: string): Promise<GeocodeResult | null> {
  const trimmed = address.trim();
  if (trimmed.length < 4) return null;

  const key = cacheKey(trimmed);
  const cached = readCache(key);
  if (cached) return cached;

  const apiKeyValue = apiKey();
  if (!apiKeyValue) return null;

  const url =
    `${ENDPOINT}?q=${encodeURIComponent(trimmed)}&key=${encodeURIComponent(apiKeyValue)}` +
    // US-only for now, which stops "Springfield" resolving to Australia, and
    // no_annotations halves the response for data we never read.
    `&countrycode=us&limit=1&no_annotations=1`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });

    if (res.status === 402) {
      console.error("[geocode] OpenCage quota exceeded — falling back to flat fees");
      return null;
    }
    if (res.status === 401) {
      console.error("[geocode] OpenCage rejected the API key");
      return null;
    }
    if (!res.ok) {
      console.error(`[geocode] OpenCage returned ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      results?: {
        geometry?: { lat: number; lng: number };
        formatted?: string;
        confidence?: number;
      }[];
      rate?: { remaining?: number };
    };

    // Worth seeing in the logs before the quota runs out rather than after.
    if (typeof data.rate?.remaining === "number" && data.rate.remaining < 100) {
      console.warn(`[geocode] only ${data.rate.remaining} OpenCage requests left today`);
    }

    const hit = data.results?.[0];
    if (!hit?.geometry) return null;

    const result: GeocodeResult = {
      lat: hit.geometry.lat,
      lng: hit.geometry.lng,
      confidence: hit.confidence ?? 0,
      formatted: hit.formatted ?? trimmed,
    };
    writeCache(key, result);
    return result;
  } catch (err) {
    console.error("[geocode] lookup failed", err);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Distance
 * ------------------------------------------------------------------ */

const EARTH_RADIUS_MI = 3958.8;

/**
 * Great-circle distance in miles.
 *
 * Straight-line, not driving distance — a road network would need a routing
 * provider and costs per request. For a delivery radius measured in single
 * miles the difference is small and predictable, and it always UNDER-states
 * the real trip, which means the fee is never higher than the road justifies.
 * That is the right direction to be wrong in.
 */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* ------------------------------------------------------------------ *
 * The fee
 * ------------------------------------------------------------------ */

/**
 * The published promise, in one place: "$0.99–$3.99 worked out from how far
 * your address is from the restaurant" — /how-it-works and the partner
 * pricing page both say it, so these numbers are a contract, not a setting.
 *
 * The maximum radius exists because the cap is a promise we would otherwise
 * be making about a thirty-mile trip. Past it, delivery is refused rather
 * than sold at a loss.
 */
export const DELIVERY = {
  baseCents: 99,
  maxCents: 399,
  /** The base covers everything inside this radius. */
  includedMiles: 1,
  perMileCents: 60,
  /** Beyond this we do not deliver at all. */
  maxMiles: 8,
} as const;

export function deliveryFeeForMiles(miles: number): number {
  const extra = Math.max(0, miles - DELIVERY.includedMiles);
  const raw = DELIVERY.baseCents + Math.round(extra * DELIVERY.perMileCents);
  return Math.min(DELIVERY.maxCents, Math.max(DELIVERY.baseCents, raw));
}

export type DeliveryQuote = {
  feeCents: number;
  /** Null when we could not work out a distance. */
  miles: number | null;
  /** True when the fee came from the restaurant's flat rate instead. */
  estimated: boolean;
  /** Set when the address is outside the delivery radius. */
  outOfRange: boolean;
  reason: string;
};

/**
 * What to charge this diner, for this restaurant, at this address.
 *
 * Degrades in a specific order, and says which case it hit so the caller can
 * be honest with the diner rather than presenting a guess as a measurement.
 */
export async function deliveryQuote(input: {
  restaurant: { lat: number | null; lng: number | null; address: string; deliveryFeeCents: number };
  address: string;
}): Promise<DeliveryQuote> {
  const flat = {
    feeCents: input.restaurant.deliveryFeeCents,
    miles: null,
    estimated: true,
    outOfRange: false,
  };

  if (!geocodeConfigured()) {
    return { ...flat, reason: "No geocoding provider is configured" };
  }

  const stored =
    input.restaurant.lat !== null && input.restaurant.lng !== null
      ? { lat: input.restaurant.lat, lng: input.restaurant.lng, confidence: 10, formatted: "" }
      : null;
  const from = stored ?? (await geocode(input.restaurant.address));
  if (!from) {
    return { ...flat, reason: "Could not locate the restaurant" };
  }
  if (from.confidence < MIN_CONFIDENCE) {
    // A vague restaurant address produces a confident-looking distance to the
    // wrong place. Better a flat fee than telling a diner half a mile away
    // that we cannot reach them.
    return {
      ...flat,
      reason: "The restaurant's address is too vague to measure from",
    };
  }

  const to = await geocode(input.address);
  if (!to) {
    return { ...flat, reason: "Could not locate that delivery address" };
  }
  if (to.confidence < MIN_CONFIDENCE) {
    return { ...flat, reason: "That address is too vague to price exactly" };
  }

  const miles = haversineMiles(from, to);

  if (miles > DELIVERY.maxMiles) {
    return {
      feeCents: 0,
      miles: Number(miles.toFixed(1)),
      estimated: false,
      outOfRange: true,
      reason: `That address is ${miles.toFixed(1)} miles away; we deliver within ${DELIVERY.maxMiles}`,
    };
  }

  return {
    feeCents: deliveryFeeForMiles(miles),
    miles: Number(miles.toFixed(1)),
    estimated: false,
    outOfRange: false,
    reason: "Calculated from the distance to your address",
  };
}
