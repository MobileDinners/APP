/**
 * The POS adapter boundary — spec §1.7, coexist mode.
 *
 * The restaurant keeps the till it already owns. Mobile Dinners becomes the
 * growth and demand layer on top: it reads their catalogue, and pushes orders
 * back so tickets print on the hardware their staff already know.
 *
 * Everything provider-specific lives behind this interface. Adding Toast later
 * should mean writing one file, not touching sync logic.
 */

export type ProviderId = "square" | "clover" | "sandbox";

export type PosTokens = {
  accessToken: string;
  refreshToken: string | null;
  /** ISO timestamp, or null for tokens that do not expire. */
  expiresAt: string | null;
  merchantId: string;
  /** Square needs a location; Clover does not. */
  locationId: string | null;
};

/** One item as the POS describes it, normalised. */
export type PosItem = {
  externalId: string;
  name: string;
  description: string;
  priceCents: number;
  /** Some POS systems expose a hidden/inactive flag rather than deleting. */
  hidden: boolean;
  category: string | null;
};

export type PosOrderLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  note: string;
};

export type PosOrderPayload = {
  reference: string;
  lines: PosOrderLine[];
  note: string;
};

export type PosProvider = {
  id: ProviderId;
  name: string;
  /** False for the sandbox, which needs no credentials. */
  requiresOAuth: boolean;
  /** True once the operator has configured client id/secret for this provider. */
  configured(): boolean;

  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<PosTokens>;
  refresh(refreshToken: string): Promise<PosTokens>;

  fetchCatalog(tokens: PosTokens): Promise<PosItem[]>;
  pushOrder(tokens: PosTokens, order: PosOrderPayload): Promise<{ externalOrderId: string }>;
  ping(tokens: PosTokens): Promise<boolean>;
};

export class PosError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** Shared HTTP helper. Distinguishes "try again" from "this will never work". */
export async function posFetch(
  url: string,
  init: RequestInit,
  provider: string,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Network failure or timeout: worth retrying.
    throw new PosError(
      `${provider} did not respond: ${(err as Error).message}`,
      503,
      true,
    );
  }

  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (!res.ok) {
    // 401/403 mean the connection is broken and needs re-authorising; 429 and
    // 5xx are worth another attempt.
    const retryable = res.status === 429 || res.status >= 500;
    throw new PosError(
      `${provider} returned ${res.status}: ${describe(body) || text.slice(0, 200)}`,
      res.status,
      retryable,
    );
  }
  return body;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function describe(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  // Square: { errors: [{ detail }] }   Clover: { message }
  if (Array.isArray(b.errors) && b.errors.length) {
    const first = b.errors[0] as Record<string, unknown>;
    return String(first.detail ?? first.code ?? "");
  }
  return String(b.message ?? "");
}
