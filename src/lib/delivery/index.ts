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
export function deliveryMode(): "live" | "sandbox" | "none" {
  if (!deliveryConfigured()) return "none";
  return (process.env.DOORDASH_API_BASE ?? "").includes("sandbox") ||
    process.env.DOORDASH_ENV === "sandbox"
    ? "sandbox"
    : "live";
}
