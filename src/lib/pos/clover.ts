import {
  posFetch,
  PosError,
  type PosItem,
  type PosOrderPayload,
  type PosProvider,
  type PosTokens,
} from "./types";

/**
 * Clover adapter.
 *
 * Clover prices are already integer cents, and its inventory is flat — items
 * carry a price directly rather than through variations, which makes the
 * mapping simpler than Square's.
 *
 * Two Clover quirks worth knowing:
 *   · `priceType` can be VARIABLE or PER_UNIT, where the stored price is not
 *     what the guest pays. Those are skipped rather than imported wrong.
 *   · `hidden` items still exist in inventory. They are imported and marked
 *     unavailable, not dropped, so re-enabling one in Clover brings it back.
 */

const API = process.env.CLOVER_API_BASE ?? "https://api.clover.com";
const OAUTH = process.env.CLOVER_OAUTH_BASE ?? "https://www.clover.com";

type InventoryResponse = {
  elements?: Array<{
    id?: string;
    name?: string;
    price?: number;
    priceType?: string;
    hidden?: boolean;
    available?: boolean;
    categories?: { elements?: Array<{ name?: string }> };
  }>;
};

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export const clover: PosProvider = {
  id: "clover",
  name: "Clover",
  requiresOAuth: true,

  configured() {
    return Boolean(process.env.CLOVER_CLIENT_ID && process.env.CLOVER_CLIENT_SECRET);
  },

  authorizeUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.CLOVER_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });
    return `${OAUTH}/oauth/authorize?${params}`;
  },

  async exchangeCode(code) {
    // Clover's v2 token exchange is a POST with a JSON body.
    const body = (await posFetch(
      `${API}/oauth/v2/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.CLOVER_CLIENT_ID,
          client_secret: process.env.CLOVER_CLIENT_SECRET,
          code,
        }),
      },
      "Clover",
    )) as {
      access_token?: string;
      refresh_token?: string;
      access_token_expiration?: number;
      merchant_id?: string;
    };

    if (!body.access_token) throw new PosError("Clover did not return an access token", 502);

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      // Clover returns seconds since epoch, not an ISO string.
      expiresAt: body.access_token_expiration
        ? new Date(body.access_token_expiration * 1000).toISOString()
        : null,
      merchantId: body.merchant_id ?? "",
      locationId: null,
    };
  },

  async refresh(refreshToken) {
    const body = (await posFetch(
      `${API}/oauth/v2/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.CLOVER_CLIENT_ID,
          refresh_token: refreshToken,
        }),
      },
      "Clover",
    )) as {
      access_token?: string;
      refresh_token?: string;
      access_token_expiration?: number;
      merchant_id?: string;
    };

    if (!body.access_token) throw new PosError("Clover refresh failed", 502);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      expiresAt: body.access_token_expiration
        ? new Date(body.access_token_expiration * 1000).toISOString()
        : null,
      merchantId: body.merchant_id ?? "",
      locationId: null,
    };
  },

  async fetchCatalog(tokens) {
    const items: PosItem[] = [];
    const limit = 100;
    let offset = 0;

    for (;;) {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        expand: "categories",
      });
      const body = (await posFetch(
        `${API}/v3/merchants/${tokens.merchantId}/items?${qs}`,
        { method: "GET", headers: headers(tokens.accessToken) },
        "Clover",
      )) as InventoryResponse;

      const page = body.elements ?? [];
      for (const el of page) {
        if (!el.id || !el.name) continue;
        // VARIABLE and PER_UNIT prices are not what a guest pays.
        if (el.priceType && el.priceType !== "FIXED") continue;
        if (typeof el.price !== "number") continue;

        items.push({
          externalId: el.id,
          name: el.name,
          description: "",
          priceCents: el.price,
          hidden: el.hidden === true || el.available === false,
          category: el.categories?.elements?.[0]?.name ?? null,
        });
      }

      if (page.length < limit) break;
      offset += limit;
    }

    return items;
  },

  async pushOrder(tokens, order) {
    // Clover builds an order, then attaches line items one at a time.
    const created = (await posFetch(
      `${API}/v3/merchants/${tokens.merchantId}/orders`,
      {
        method: "POST",
        headers: headers(tokens.accessToken),
        body: JSON.stringify({
          state: "open",
          title: `Mobile Dinners ${order.reference}`,
          note: order.note.slice(0, 255),
        }),
      },
      "Clover",
    )) as { id?: string };

    if (!created.id) throw new PosError("Clover accepted no order id", 502);

    for (const line of order.lines) {
      // Clover has no quantity on a line item; N of something is N lines.
      for (let i = 0; i < line.quantity; i++) {
        await posFetch(
          `${API}/v3/merchants/${tokens.merchantId}/orders/${created.id}/line_items`,
          {
            method: "POST",
            headers: headers(tokens.accessToken),
            body: JSON.stringify({
              name: line.name,
              price: line.unitPriceCents,
              note: line.note.slice(0, 255) || undefined,
            }),
          },
          "Clover",
        );
      }
    }

    return { externalOrderId: created.id };
  },

  async ping(tokens) {
    await posFetch(
      `${API}/v3/merchants/${tokens.merchantId}`,
      { method: "GET", headers: headers(tokens.accessToken) },
      "Clover",
    );
    return true;
  },
};
