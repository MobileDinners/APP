import { subscribe } from "@/lib/events";
import { currentSessionToken, getSession, touchSession } from "@/lib/auth";
import { getOrder } from "@/lib/orders";
import type { BusEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-sent events fan-out. Every surface — operator dashboard, kitchen
 * display, and each guest's tracking page — subscribes here and re-renders
 * from the event, exactly like the WebSocket tier in spec §1.6.
 *
 * What a subscriber may receive is decided from the session, not from query
 * parameters, so nobody can widen their own scope by editing the URL.
 */
export async function GET(req: Request) {
  const session = await getSession();
  // Captured now: cookies are unreadable once the stream outlives the request.
  const sessionToken = await currentSessionToken();

  const url = new URL(req.url);
  const requestedOrder = url.searchParams.get("orderId");

  // Resolve the allowed scope up front.
  let orgScope: string | null = null;
  let orderScope: string | null = null;

  if (session?.kind === "staff") {
    orgScope = session.orgId;
  } else if (session?.kind === "person" && requestedOrder) {
    const order = getOrder(requestedOrder);
    if (!order || order.personId !== session.personId) {
      return new Response("Not found", { status: 404 });
    }
    orderScope = order.orderId;
  } else if (session?.kind === "person") {
    // Signed-in customer with no specific order: menu availability only.
    orderScope = null;
  } else {
    // Anonymous browsers still need 86 updates so the feed stays honest,
    // but they get nothing about anyone's orders.
    orgScope = null;
  }


  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Client went away between the event firing and the write.
        }
      };

      send(`retry: 2000\n\n`);
      send(`event: ready\ndata: {"ok":true}\n\n`);

      const emit = (event: BusEvent) => send(`data: ${JSON.stringify(event)}\n\n`);

      unsubscribe = subscribe((event: BusEvent) => {
        // Staff: everything happening at their own restaurant, nothing else.
        if (orgScope) {
          if (event.orgId === orgScope) emit(event);
          return;
        }

        // Menu availability is public — it is what keeps the feed honest about
        // what is actually orderable, and it reveals nothing about anyone.
        if (event.type === "menu.availability" || event.type === "menu.published") {
          emit(event);
          return;
        }

        // A guest tracking one order gets that order's events and no others.
        if (orderScope && event.orderId === orderScope) emit(event);
      });

      heartbeat = setInterval(() => {
        send(`: ping\n\n`);
        // A held-open stream is a terminal somebody is watching, so it counts
        // as activity against the staff idle timeout. Without this a kitchen
        // display signs itself out during a quiet hour, because it only asks
        // the server for anything when an order actually moves.
        if (sessionToken) touchSession(sessionToken);
      }, 20_000);

      req.signal.addEventListener("abort", () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
