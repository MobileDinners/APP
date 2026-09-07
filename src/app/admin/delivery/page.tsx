import Link from "next/link";
import { formatCents } from "@/lib/money";
import {
  deliveryEconomics, deliverySuccess, deliveryWebhookLog, integrationStatus, listAllOrders, listDeliveries,
} from "@/lib/admin";
import { Chip, MetricStat, Panel, Stat, TableWrap, Td, Th, shortDate, timeAgo } from "@/components/admin/AdminUI";

export const dynamic = "force-dynamic";
export const metadata = { title: "Delivery operations — Admin" };

/** Terminal courier states, so a failure can be told from a trip in progress. */
const FAILED = new Set(["cancelled", "canceled", "failed", "returned"]);

export default function DeliveryPage() {
  const rows = listDeliveries(100);
  const hooks = deliveryWebhookLog(50);
  const success = deliverySuccess();
  const econ = deliveryEconomics();
  const integrations = integrationStatus().filter((i) => i.key.startsWith("DOORDASH"));
  const configured = integrations.filter((i) => i.configured).length;

  // How much delivery demand exists, whether or not a courier was ever booked.
  const recent = listAllOrders({ limit: 200 }).rows;
  const deliveryOrders = recent.filter((o) => o.fulfillment === "delivery");
  const unbooked = deliveryOrders.filter((o) => !o.deliveryStatus);

  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.03em]">Delivery operations</h1>
      <p className="mt-1 text-[14px] text-ink-3">
        DoorDash Drive control centre — couriers we book, not the DoorDash marketplace.
      </p>

      {configured < integrations.length && (
        <div className="mt-5 rounded-[12px] border border-amber bg-amber-soft p-4 text-[13.5px] leading-relaxed text-amber">
          <strong className="font-extrabold">Drive is not connected.</strong>{" "}
          {configured} of {integrations.length} DoorDash credentials are set, so no courier can
          be booked and every figure on this page has no data behind it. The
          adapter, the JWT signing and the webhook handler are all built and
          tested against a sandbox — what is missing is the credentials. Add them
          in{" "}
          <Link href="/admin/settings" className="font-extrabold underline">
            System
          </Link>
          .
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricStat
          label="Delivery success rate"
          metric={success}
          render={(v) => ({
            value: `${(v.rate * 100).toFixed(1)}%`,
            sub: `${v.delivered} of ${v.attempted} trips`,
            tone: v.rate >= 0.95 ? "good" : v.rate >= 0.85 ? "warn" : "bad",
          })}
        />
        <MetricStat
          label="Courier cost"
          metric={econ}
          render={(v) => ({ value: formatCents(v.courierCents), sub: `${v.trips} trips` })}
        />
        <MetricStat
          label="Collected from diners"
          metric={econ}
          render={(v) => ({ value: formatCents(v.guestCents) })}
        />
        <MetricStat
          label="Delivery margin"
          metric={econ}
          render={(v) => ({
            value: formatCents(v.marginCents),
            sub: `${v.subsidised} trip(s) subsidised`,
            tone: v.marginCents >= 0 ? "good" : "bad",
          })}
        />
      </div>

      <Panel
        title="Delivery demand"
        hint="Delivery orders in the last 200 placed, whether or not a courier was booked."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Delivery orders" value={deliveryOrders.length.toLocaleString()} />
          <Stat
            label="No courier booked"
            value={unbooked.length.toLocaleString()}
            sub={unbooked.length ? "dispatch never ran for these" : undefined}
            tone={unbooked.length ? "warn" : "good"}
          />
          <Stat
            label="Pickup orders"
            value={(recent.length - deliveryOrders.length).toLocaleString()}
          />
        </div>
      </Panel>

      <Panel
        title="Delivery log"
        hint="Every courier trip: quote, assignment, fee split and outcome."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Booked</Th>
              <Th>Order</Th>
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>Courier</Th>
              <Th right>Diner paid</Th>
              <Th right>Courier cost</Th>
              <Th right>Margin</Th>
              <Th>Dropoff ETA</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                  No courier has ever been booked. Once Drive credentials are set, a trip is
                  requested when an order reaches READY — not at checkout, so a kitchen
                  running late does not leave a courier waiting.
                </td>
              </tr>
            ) : (
              rows.map((d) => (
                <tr key={d.deliveryId}>
                  <Td mono>{timeAgo(d.createdAt)}</Td>
                  <Td mono>{d.orderId.slice(-8)}</Td>
                  <Td>{d.provider}</Td>
                  <Td>
                    <Chip
                      tone={
                        d.status === "delivered"
                          ? "good"
                          : FAILED.has(d.status)
                            ? "bad"
                            : "info"
                      }
                    >
                      {d.status}
                    </Chip>
                    {d.cancelReason && (
                      <span className="block text-[11.5px] text-ink-3">{d.cancelReason}</span>
                    )}
                  </Td>
                  <Td>{d.courierName ?? "—"}</Td>
                  <Td right mono>{formatCents(d.guestFeeCents)}</Td>
                  <Td right mono>{formatCents(d.courierFeeCents)}</Td>
                  <Td right mono>
                    <span
                      className={
                        d.guestFeeCents - d.courierFeeCents < 0 ? "font-bold text-red" : ""
                      }
                    >
                      {formatCents(d.guestFeeCents - d.courierFeeCents)}
                    </span>
                  </Td>
                  <Td mono>{d.dropoffEta ? shortDate(d.dropoffEta) : "—"}</Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Panel>

      <Panel
        title="Webhook log"
        hint="Status updates DoorDash pushed to us, after signature verification."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Received</Th>
              <Th>Provider</Th>
              <Th>External id</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {hooks.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-[13.5px] text-ink-3">
                  No webhook has arrived. Point DoorDash at{" "}
                  <span className="num">/api/delivery/webhook</span> and set
                  DOORDASH_WEBHOOK_SECRET.
                </td>
              </tr>
            ) : (
              hooks.map((h) => (
                <tr key={h.event_id}>
                  <Td mono>{timeAgo(h.received_at)}</Td>
                  <Td>{h.provider}</Td>
                  <Td mono>{h.external_id}</Td>
                  <Td>
                    <Chip tone={h.status === "delivered" ? "good" : "plain"}>{h.status}</Chip>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Panel>

      <Panel title="Distance and ETA" hint="How delivery is priced and timed today.">
        <div className="rounded-[12px] border border-amber bg-amber-soft p-4 text-[13.5px] leading-relaxed text-amber">
          <strong className="font-extrabold">Distances are not real.</strong> Every
          restaurant&apos;s <span className="num">distance_mi</span> is a seeded value, and
          nothing geocodes a diner&apos;s address — so the delivery fee quoted at checkout
          varies by a number that was made up at seed time, and ETAs are computed from
          kitchen prep plus a fixed travel allowance rather than a route. Fixing this needs
          a geocoding provider (MAPS_API_KEY) and a real distance call. Until then, treat
          the fee breakdown above as structurally correct and numerically fictional.
        </div>
      </Panel>
    </>
  );
}
