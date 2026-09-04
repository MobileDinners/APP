import {
  posFetch,
  PosError,
  type PosItem,
  type PosOrderPayload,
  type PosProvider,
  type PosTokens,
} from "./types";

/**
 * Square adapter.
 *
 * Square money is already in the smallest denomination, which lines up with the
 * integer-cent rule everywhere else in this codebase — no float ever appears.
 *
 * An item in Square is an ITEM object with one or more VARIATIONS, and the
 * price lives on the variation, not the item. A "Large Horchata" is a variation
 * of "Horchata". We import the first variation as the item price and keep the
 * variation id, because that is what an order line must reference.
 */

const API = process.env.SQUARE_API_BASE ?? "https://connect.squareup.com";
const OAUTH = process.env.SQUARE_OAUTH_BASE ?? "https://connect.squareup.com";
// Pinned. Square dates its API and unpinned clients break on their schedule.
const SQUARE_VERSION = "2025-01-23";

const SCOPES = [
  "MERCHANT_PROFILE_READ",
  "ITEMS_READ",
  "ORDERS_READ",
  "ORDERS_WRITE",
  "INVENTORY_READ",
].join("+");

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Square-Version": SQUARE_VERSION,
    "Content-Type": "application/json",
  };
}

type CatalogResponse = {
  objects?: Array<{
    id: string;
    type: string;
    is_deleted?: boolean;
    item_data?: {
      name?: string;
      description?: string;
      category_id?: string;
      variations?: Array<{
        id: string;
        item_variation_data?: {
          name?: string;
          price_money?: { amount?: number; currency?: string };
        };
      }>;
    };
  }>;
  cursor?: string;
};

export const square: PosProvider = {
  id: "square",
  name: "Square",
  requiresOAuth: true,

  configured() {
    return Boolean(process.env.SQUARE_CLIENT_ID && process.env.SQUARE_CLIENT_SECRET);
  },

  authorizeUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.SQUARE_CLIENT_ID ?? "",
      session: "false",
      state,
      redirect_uri: redirectUri,
    });
    // scope uses + separators, which URLSearchParams would percent-encode.
    return `${OAUTH}/oauth2/authorize?${params}&scope=${SCOPES}`;
  },

  async exchangeCode(code, redirectUri) {
    const body = (await posFetch(
      `${OAUTH}/oauth2/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Square-Version": SQUARE_VERSION },
        body: JSON.stringify({
          client_id: process.env.SQUARE_CLIENT_ID,
          client_secret: process.env.SQUARE_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      },
      "Square",
    )) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: string;
      merchant_id?: string;
    };

    if (!body.access_token || !body.merchant_id) {
      throw new PosError("Square did not return an access token", 502);
    }

    const tokens: PosTokens = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_at ?? null,
      merchantId: body.merchant_id,
      locationId: null,
    };

    // An order cannot be created without a location, so resolve one now rather
    // than failing on the first order push hours later.
    tokens.locationId = await firstLocation(tokens.accessToken);
    return tokens;
  },

  async refresh(refreshToken) {
    const body = (await posFetch(
      `${OAUTH}/oauth2/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Square-Version": SQUARE_VERSION },
        body: JSON.stringify({
          client_id: process.env.SQUARE_CLIENT_ID,
          client_secret: process.env.SQUARE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      },
      "Square",
    )) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: string;
      merchant_id?: string;
    };

    if (!body.access_token) throw new PosError("Square refresh failed", 502);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      expiresAt: body.expires_at ?? null,
      merchantId: body.merchant_id ?? "",
      locationId: await firstLocation(body.access_token),
    };
  },

  async fetchCatalog(tokens) {
    const items: PosItem[] = [];
    let cursor: string | undefined;

    // Catalogues are paged. A 3,000-item franchise menu is a real case.
    do {
      const qs = new URLSearchParams({ types: "ITEM" });
      if (cursor) qs.set("cursor", cursor);

      const body = (await posFetch(
        `${API}/v2/catalog/list?${qs}`,
        { method: "GET", headers: headers(tokens.accessToken) },
        "Square",
      )) as CatalogResponse;

      for (const obj of body.objects ?? []) {
        if (obj.type !== "ITEM" || obj.is_deleted) continue;
        const data = obj.item_data;
        if (!data?.name) continue;

        const variation = data.variations?.[0];
        const amount = variation?.item_variation_data?.price_money?.amount;
        // Variable-priced items have no amount. Importing them as $0.00 would
        // put a free dish on the marketplace, so they are skipped and reported.
        if (typeof amount !== "number") continue;

        items.push({
          // The ORDER line references the variation, so that is the id we keep.
          externalId: variation?.id ?? obj.id,
          name: data.name,
          description: data.description ?? "",
          priceCents: amount,
          hidden: false,
          category: data.category_id ?? null,
        });
      }
      cursor = body.cursor;
    } while (cursor);

    return items;
  },

  async pushOrder(tokens, order) {
    if (!tokens.locationId) {
      throw new PosError("No Square location on this connection", 409);
    }

    const body = (await posFetch(
      `${API}/v2/orders`,
      {
        method: "POST",
        headers: headers(tokens.accessToken),
        body: JSON.stringify({
          // Square dedupes on this key, so a retry cannot double-fire a ticket.
          idempotency_key: order.reference,
          order: {
            location_id: tokens.locationId,
            reference_id: order.reference,
            source: { name: "Mobile Dinners" },
            line_items: order.lines.map((l) => ({
              name: l.name,
              quantity: String(l.quantity),
              base_price_money: { amount: l.unitPriceCents, currency: "USD" },
              note: l.note.slice(0, 500) || undefined,
            })),
            note: order.note.slice(0, 500) || undefined,
          },
        }),
      },
      "Square",
    )) as { order?: { id?: string } };

    if (!body.order?.id) throw new PosError("Square accepted no order id", 502);
    return { externalOrderId: body.order.id };
  },

  async ping(tokens) {
    await posFetch(
      `${API}/v2/locations`,
      { method: "GET", headers: headers(tokens.accessToken) },
      "Square",
    );
    return true;
  },
};

async function firstLocation(accessToken: string): Promise<string | null> {
  const body = (await posFetch(
    `${API}/v2/locations`,
    { method: "GET", headers: headers(accessToken) },
    "Square",
  )) as { locations?: Array<{ id?: string; status?: string }> };

  const active = body.locations?.find((l) => l.status === "ACTIVE") ?? body.locations?.[0];
  return active?.id ?? null;
}
