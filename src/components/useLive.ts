"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BusEvent } from "@/lib/types";

type Options = {
  orgId?: string;
  orderId?: string;
  /** Re-render the server component tree when an event lands. */
  refreshOnEvent?: boolean;
  onEvent?: (event: BusEvent) => void;
};

/**
 * Subscribes to the order event stream. The operator dashboard, kitchen
 * display, and guest tracking page all render server-side and simply refresh
 * when an event arrives — the same projection-over-events model as the backend.
 */
export function useLive({ orgId, orderId, refreshOnEvent = true, onEvent }: Options = {}) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const params = new URLSearchParams();
    if (orgId) params.set("orgId", orgId);
    if (orderId) params.set("orderId", orderId);
    const url = `/api/stream${params.size ? `?${params}` : ""}`;

    const source = new EventSource(url);

    source.addEventListener("ready", () => setConnected(true));
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false); // EventSource retries on its own

    source.onmessage = (msg) => {
      let event: BusEvent;
      try {
        event = JSON.parse(msg.data) as BusEvent;
      } catch {
        return;
      }
      setLastEventAt(Date.now());
      handlerRef.current?.(event);
      if (refreshOnEvent) router.refresh();
    };

    return () => source.close();
  }, [orgId, orderId, refreshOnEvent, router]);

  return { connected, lastEventAt };
}
