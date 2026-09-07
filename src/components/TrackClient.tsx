"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import type { Order, OrderState } from "@/lib/types";
import { useLive } from "./useLive";
import { DeliveryMap } from "./DeliveryMap";
import { FoodPhoto } from "./FoodPhoto";
import { BackIcon, CheckIcon, StarIcon } from "./icons";

const RANK: OrderState[] = [
  "DRAFT", "PENDING_PAYMENT", "CONFIRMED", "ACCEPTED", "IN_KITCHEN", "READY",
  "AWAITING_PICKUP", "COURIER_ASSIGNED", "IN_TRANSIT", "COMPLETED", "SETTLED",
];

const DELIVERY_STEPS: { state: OrderState; label: string; blurb: string }[] = [
  { state: "CONFIRMED", label: "Order placed", blurb: "The restaurant has your order" },
  { state: "IN_KITCHEN", label: "Preparing your food", blurb: "It's on the line now" },
  { state: "READY", label: "Food is ready", blurb: "Packed and waiting for your driver" },
  { state: "IN_TRANSIT", label: "On the way", blurb: "Your driver is heading over" },
  { state: "COMPLETED", label: "Delivered", blurb: "Enjoy" },
];

const PICKUP_STEPS: { state: OrderState; label: string; blurb: string }[] = [
  { state: "CONFIRMED", label: "Order placed", blurb: "The restaurant has your order" },
  { state: "IN_KITCHEN", label: "Preparing your food", blurb: "It's on the line now" },
  { state: "READY", label: "Ready for pickup", blurb: "Come grab it at the counter" },
  { state: "COMPLETED", label: "Picked up", blurb: "Enjoy" },
];

export function TrackClient({
  order,
  restaurant,
  mapKey,
}: {
  order: Order;
  /** The restaurant's geocoded location, for the map. Null if unresolved. */
  restaurant: { name: string; lat: number | null; lng: number | null };
  /** MapTiler key. Empty string when no provider is configured. */
  mapKey: string;
}) {
  useLive({ orderId: order.orderId });
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const steps = order.fulfillment === "delivery" ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentRank = RANK.indexOf(order.state);
  const done = order.state === "COMPLETED" || order.state === "SETTLED";

  const promised = new Date(order.promisedAt);
  const low = new Date(promised.getTime() - 3 * 60_000);
  const high = new Date(promised.getTime() + 5 * 60_000);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const minsLeft =
    now === null ? null : Math.max(0, Math.round((promised.getTime() - now) / 60000));
  const late = now !== null && promised.getTime() < now && !done;

  // How far along the route the marker sits — driven by state, not a timer.
  const progressByState: Partial<Record<OrderState, number>> = {
    CONFIRMED: 0.04, ACCEPTED: 0.1, IN_KITCHEN: 0.2, READY: 0.34,
    COURIER_ASSIGNED: 0.46, IN_TRANSIT: 0.72, AWAITING_PICKUP: 0.5,
    COMPLETED: 1, SETTLED: 1,
  };
  const progress = progressByState[order.state] ?? 0.04;

  return (
    <main className="pb-tabs">
      <div className="relative">
        {/* A delivery with real coordinates gets a real map. Anything else —
            a pickup order, or one placed before geocoding existed — keeps the
            stylised route, which is honest about being illustrative. */}
        {order.fulfillment === "delivery" &&
        order.addressLat !== null &&
        order.addressLng !== null ? (
          <DeliveryMap
            restaurant={
              restaurant.lat !== null && restaurant.lng !== null
                ? { lat: restaurant.lat, lng: restaurant.lng }
                : null
            }
            destination={{ lat: order.addressLat, lng: order.addressLng }}
            restaurantName={restaurant.name}
            address={order.address}
            miles={null}
            apiKey={mapKey}
          />
        ) : (
          <RouteMap progress={progress} done={done} />
        )}
        <Link
          href="/"
          aria-label="Back"
          className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-bg/92 shadow-sm backdrop-blur-sm"
        >
          <BackIcon className="h-[18px] w-[18px]" />
        </Link>
      </div>

      <div className="mx-auto max-w-[620px] px-4 md:px-6">
        <section className="relative -mt-7 rounded-[20px] bg-card p-5 shadow-[var(--shadow-md)]">
          {done ? (
            <h1 className="text-[26px] font-extrabold">
              {order.fulfillment === "delivery" ? "Delivered" : "Picked up"}
            </h1>
          ) : (
            <>
              <p className="text-[13px] font-bold uppercase tracking-wider text-ink-3">
                {late ? "Running late" : "Arriving in"}
              </p>
              <h1 className="num mt-1 text-[34px] font-extrabold leading-none">
                {minsLeft === null ? "—" : late ? "Any minute" : `${minsLeft} min`}
              </h1>
              <p className="mt-1.5 text-[14px] text-ink-2">
                Estimated {fmt(low)} – {fmt(high)}
              </p>
            </>
          )}

          <div className="mt-4 flex gap-1.5" aria-hidden="true">
            {steps.map((s) => {
              const reached = currentRank >= RANK.indexOf(s.state);
              return (
                <span
                  key={s.state}
                  className={`h-1.5 flex-1 rounded-full ${
                    reached ? (late ? "bg-amber" : "bg-brand") : "bg-card-2"
                  }`}
                />
              );
            })}
          </div>

          <ol className="m-0 mt-5 list-none p-0">
            {steps.map((step) => {
              const reached = currentRank >= RANK.indexOf(step.state);
              const event = order.events.find(
                (e) =>
                  e.eventType === `order.${step.state.toLowerCase()}` ||
                  (step.state === "CONFIRMED" && e.eventType === "order.created"),
              );
              return (
                <li key={step.state} className="flex gap-3 py-2">
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                      reached ? "bg-brand text-brand-ink" : "bg-card-2 text-ink-3"
                    }`}
                  >
                    {reached ? (
                      <CheckIcon className="h-3.5 w-3.5" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[15px] ${
                        reached ? "font-extrabold" : "font-semibold text-ink-3"
                      }`}
                    >
                      {step.label}
                    </span>
                    <span className="block text-[13px] text-ink-2">{step.blurb}</span>
                  </span>
                  <span className="num shrink-0 text-[13px] font-semibold text-ink-3">
                    {event
                      ? new Date(event.occurredAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {order.fulfillment === "delivery" &&
          currentRank >= RANK.indexOf("COURIER_ASSIGNED") &&
          !done && (
            <section className="card mt-3 flex items-center gap-3 p-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-card-2 text-[18px] font-extrabold">
                M
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold">Marcus C.</p>
                <p className="flex items-center gap-1 text-[13px] text-ink-2">
                  <StarIcon className="h-3 w-3 text-amber" />
                  <span className="num">4.9</span> · Silver Civic · 8KJ 221
                </p>
              </div>
              <button type="button" className="btn btn-secondary px-4 py-2.5 text-[14px]">
                Message
              </button>
            </section>
          )}

        <section className="card mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-extrabold">{order.brandName}</h2>
            <span className="num text-[13px] text-ink-3">
              #{order.orderId.slice(0, 6)}
            </span>
          </div>

          <ul className="m-0 mt-3 list-none border-t border-line p-0">
            {order.lines.map((line) => (
              <li key={line.lineNo} className="flex gap-3 border-b border-line py-3 last:border-0">
                <FoodPhoto
                  keyword="food"
                  seed={line.itemId}
                  width={140}
                  height={140}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold">
                    {line.qty}× {line.name}
                  </p>
                  {line.optionsLabel && (
                    <p className="text-[13px] text-ink-2">{line.optionsLabel}</p>
                  )}
                  {line.notes && (
                    <p className="text-[13px] italic text-ink-3">“{line.notes}”</p>
                  )}
                </div>
                <span className="num shrink-0 text-[14.5px] font-bold">
                  {formatCents(line.unitPriceCents * line.qty)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 space-y-1 border-t border-line pt-3">
            <Line label="Subtotal" value={formatCents(order.subtotalCents)} />
            {order.discountCents > 0 && (
              <Line
                label="Points applied"
                value={`−${formatCents(order.discountCents)}`}
                green
              />
            )}
            {order.deliveryFeeCents > 0 && (
              <Line label="Delivery" value={formatCents(order.deliveryFeeCents)} />
            )}
            <Line label="Service fee" value={formatCents(0)} green />
            <Line label="Tax" value={formatCents(order.taxCents)} />
            {order.tipCents > 0 && (
              <Line label="Driver tip" value={formatCents(order.tipCents)} />
            )}
            <div className="flex justify-between border-t border-line pt-2 text-[16px] font-extrabold">
              <span>Total</span>
              <span className="num">{formatCents(order.totalCents)}</span>
            </div>
          </div>

          <p className="mt-3 rounded-[12px] bg-green-soft px-3 py-2.5 text-[13px] font-semibold text-green">
            {order.state === "SETTLED"
              ? `+${order.pointsEarned} points added to your wallet.`
              : `You'll earn ${order.pointsEarned} points when this order completes.`}
          </p>
        </section>

        <details className="card mt-3 p-4">
          <summary className="cursor-pointer text-[13px] font-bold text-ink-3">
            Event log · {order.events.length} events
          </summary>
          <ul className="m-0 mt-3 list-none p-0">
            {order.events.map((e) => (
              <li
                key={e.seq}
                className="flex gap-3 border-b border-line py-1.5 text-[12px] last:border-0"
              >
                <span className="num w-5 text-ink-3">{e.seq}</span>
                <span className="flex-1 font-semibold text-blue">{e.eventType}</span>
                <span className="text-ink-3">{e.source}</span>
                <span className="num text-ink-3">
                  {new Date(e.occurredAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </details>

        <div className="mt-4 flex gap-2 pb-6">
          <Link href="/" className="btn btn-secondary flex-1">
            Order something else
          </Link>
          <Link href="/kds" className="btn btn-outline flex-1">
            Watch the kitchen
          </Link>
        </div>
      </div>
    </main>
  );
}

/** Stylised route map — no tiles, no API key, and it never fakes movement. */
function RouteMap({ progress, done }: { progress: number; done: boolean }) {
  const path = "M 24 208 C 90 208, 96 128, 152 128 S 232 60, 300 56";
  const markerOffset = Math.min(1, Math.max(0, progress));

  return (
    <div className="relative h-52 w-full overflow-hidden bg-card-2 sm:h-64">
      <svg viewBox="0 0 340 240" className="h-full w-full" aria-label="Delivery route">
        <defs>
          <pattern id="blocks" width="46" height="46" patternUnits="userSpaceOnUse">
            <rect width="46" height="46" fill="var(--card-2)" />
            <rect x="0" y="0" width="38" height="38" rx="4" fill="var(--card)" />
          </pattern>
        </defs>
        <rect width="340" height="240" fill="url(#blocks)" />

        <path d="M0 128 H340 M152 0 V240" stroke="var(--line)" strokeWidth="9" fill="none" />

        <path d={path} stroke="var(--line-2)" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path
          d={path}
          stroke="var(--brand)"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - markerOffset}
        />

        <circle cx="300" cy="56" r="7" fill="var(--brand)" />
        <circle cx="300" cy="56" r="3" fill="var(--card)" />
        <circle cx="24" cy="208" r="7" fill="var(--ink)" />
        <circle cx="24" cy="208" r="3" fill="var(--card)" />

        {!done && (
          <g>
            <path
              d={path}
              stroke="none"
              fill="none"
              id="route"
              pathLength={1}
            />
            <circle r="9" fill="var(--brand)" stroke="var(--card)" strokeWidth="3">
              <animateMotion dur="0.01s" fill="freeze" keyPoints={`${markerOffset};${markerOffset}`} keyTimes="0;1" calcMode="linear">
                <mpath href="#route" />
              </animateMotion>
            </circle>
          </g>
        )}
      </svg>

      <span className="absolute bottom-2 right-2 rounded-full bg-bg/90 px-2.5 py-1 text-[11px] font-bold text-ink-3 backdrop-blur-sm">
        Illustrative route
      </span>
    </div>
  );
}

function Line({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex justify-between text-[14px]">
      <span className="text-ink-2">{label}</span>
      <span className={`num font-semibold ${green ? "text-green" : ""}`}>{value}</span>
    </div>
  );
}
