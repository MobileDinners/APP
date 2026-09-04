import { clover } from "./clover";
import { sandbox } from "./sandbox";
import { square } from "./square";
import type { PosProvider, ProviderId } from "./types";

export * from "./types";

const REGISTRY: Record<ProviderId, PosProvider> = {
  square,
  clover,
  sandbox,
};

export function provider(id: ProviderId): PosProvider {
  const p = REGISTRY[id];
  if (!p) throw new Error(`Unknown POS provider: ${id}`);
  return p;
}

/** What an operator can actually pick right now, and why not if they cannot. */
export function availableProviders(): Array<{
  id: ProviderId;
  name: string;
  configured: boolean;
  note: string;
}> {
  return (Object.keys(REGISTRY) as ProviderId[])
    .filter((id) => id !== "sandbox" || process.env.NODE_ENV !== "production")
    .map((id) => {
      const p = REGISTRY[id];
      const configured = p.configured();
      return {
        id,
        name: p.name,
        configured,
        note: configured
          ? id === "sandbox"
            ? "A simulated till for trying the sync without a merchant account."
            : "Ready to connect."
          : `Set ${id.toUpperCase()}_CLIENT_ID and ${id.toUpperCase()}_CLIENT_SECRET to enable.`,
      };
    });
}
