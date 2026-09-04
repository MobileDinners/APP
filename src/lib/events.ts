import { EventEmitter } from "node:events";
import type { BusEvent } from "./types";

/**
 * The in-process stand-in for the Kafka/Redpanda event spine described in
 * spec §1.3. Same contract — every state change publishes an event, and the
 * operator dashboard, KDS, and guest tracking are all projections over it.
 * Swapping this for a real broker is a change to this file only.
 */

const globalForBus = globalThis as unknown as { __mdBus?: EventEmitter };

export const bus: EventEmitter =
  globalForBus.__mdBus ?? (globalForBus.__mdBus = new EventEmitter());

// Many SSE clients can attach at once (ops + kds + every open tracking page).
bus.setMaxListeners(0);

export function publish(event: BusEvent): void {
  bus.emit("event", event);
}

export function subscribe(handler: (event: BusEvent) => void): () => void {
  bus.on("event", handler);
  return () => {
    bus.off("event", handler);
  };
}
