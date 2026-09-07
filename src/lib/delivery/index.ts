import { doordashProvider } from "./doordash";
import { sandboxDeliveryProvider } from "./sandbox";
import { DeliveryError, type DeliveryProvider } from "./types";

export * from "./types";

/** True once real DoorDash Drive credentials are present. */
export function deliveryConfigured(): boolean {
  return Boolean(
    process.env.DOORDASH_DEVELOPER_ID &&
      process.env.DOORDASH_KEY_ID &&
      process.env.DOORDASH_SIGNING_SECRET,
  );
}

/**
 * Picks the courier network.
 *
 * With credentials: DoorDash Drive. Without: the sandbox, and only outside
 * production. Shipping a fake courier would mean telling a diner their food is
 * on the way when nobody was ever dispatched, so the app refuses rather than
 * degrading quietly into a lie.
 */
export function getDeliveryProvider(): DeliveryProvider {
  if (deliveryConfigured()) return doordashProvider;

  if (process.env.NODE_ENV === "production") {
    throw new DeliveryError(
      "DoorDash credentials are not set. Refusing to run the sandbox courier in " +
        "production — orders would be promised a driver who was never dispatched.",
      500,
      "not_configured",
    );
  }
  return sandboxDeliveryProvider;
}

/** Which environment the credentials point at, for the ops dashboard. */
/**
 * Which courier world we are in — and how much that answer can be trusted.
 *
 * DOORDASH_ENV is a LABEL. It does not change where requests go: that is
 * DOORDASH_API_BASE, which defaults to DoorDash's production endpoint. So a
 * deployment with production credentials and DOORDASH_ENV=sandbox would show
 * a reassuring blue "simulated" banner while dispatching real Dashers to real
 * addresses. A label that can lie about whether a driver is really coming is
 * worse than no label.
 *
 * Hence "unlabelled": configured, pointed at production, and nobody has said
 * which credentials these are. The operator sees that as a warning rather than
 * a confident "live", because the honest answer is that we do not know.
 */
export type DeliveryMode = "live" | "sandbox" | "unlabelled" | "none";

export function deliveryMode(): DeliveryMode {
  if (!deliveryConfigured()) return "none";

  const base = process.env.DOORDASH_API_BASE ?? "";
  // A sandbox endpoint is the only self-evident answer; everything else is a
  // claim somebody made in an environment variable.
  if (base.includes("sandbox")) return "sandbox";

  const label = process.env.DOORDASH_ENV;
  if (label === "sandbox") {
    // Believed, but not silently: the requests are still going to production.
    console.warn(
      "[delivery] DOORDASH_ENV=sandbox but DOORDASH_API_BASE points at " +
        "production. The label is cosmetic — verify these are sandbox " +
        "credentials before marking a delivery order ready.",
    );
    return "sandbox";
  }
  if (label === "live") return "live";

  return "unlabelled";
}
