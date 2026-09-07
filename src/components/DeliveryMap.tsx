"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A real map of where the food is going, on MapTiler tiles via Leaflet.
 *
 * Raster tiles rather than vector, deliberately. MapLibre renders MapTiler's
 * vector styles more handsomely, but it needs web workers and blob: URLs, and
 * this application's Content-Security-Policy currently allows neither. Raster
 * tiles need one addition — api.maptiler.com on img-src — and nothing else.
 * Loosening a CSP on a page that has just taken a card payment, to make a map
 * slightly prettier, is a poor trade.
 *
 * Leaflet is loaded from cdnjs rather than bundled, matching how Stripe.js is
 * handled: a library only some pages need, pinned to an exact version.
 *
 * WHAT THIS SHOWS, AND WHAT IT DOES NOT. Two fixed points: the restaurant and
 * the address the delivery fee was measured to. A dashed line between them,
 * which is the straight-line distance the price was based on and explicitly
 * NOT a driving route — drawing a road route we never computed would be a
 * picture of a journey nobody is taking. When DoorDash Drive is approved for
 * production and starts sending dasher_location, a third marker becomes the
 * courier and this becomes live tracking. The plumbing for that already
 * exists; the approval does not.
 */

const LEAFLET_VERSION = "1.9.4";
const JS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.js`;
const CSS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.css`;

type LatLng = { lat: number; lng: number };

/** The handful of Leaflet calls used here. */
type LeafletMap = {
  setView: (c: [number, number], z: number) => LeafletMap;
  fitBounds: (b: [number, number][], o?: unknown) => void;
  remove: () => void;
};
type Leaflet = {
  map: (el: HTMLElement, opts?: unknown) => LeafletMap;
  tileLayer: (url: string, opts?: unknown) => { addTo: (m: LeafletMap) => void };
  marker: (c: [number, number], opts?: unknown) => {
    addTo: (m: LeafletMap) => { bindPopup: (html: string) => void };
  };
  polyline: (pts: [number, number][], opts?: unknown) => { addTo: (m: LeafletMap) => void };
  divIcon: (opts: unknown) => unknown;
};
declare global {
  interface Window {
    L?: Leaflet;
  }
}

function loadOnce(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.L) return Promise.resolve();

  if (!document.querySelector(`link[href="${CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS;
    document.head.appendChild(link);
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${JS}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")));
    });
  }

  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = JS;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Leaflet failed to load"));
    document.head.appendChild(el);
  });
}

/** A coloured dot, so no marker image has to be fetched from anywhere. */
function pin(color: string, label: string): string {
  return `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:50%;
    background:${color};color:#fff;font:700 12px/1 system-ui;border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,.35)">${label}</span>`;
}

export function DeliveryMap({
  restaurant,
  destination,
  restaurantName,
  address,
  miles,
  apiKey,
}: {
  restaurant: LatLng | null;
  destination: LatLng | null;
  restaurantName: string;
  address: string;
  miles: number | null;
  apiKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurant || !destination || !apiKey || !ref.current) return;
    let map: LeafletMap | null = null;
    let cancelled = false;

    void (async () => {
      try {
        await loadOnce();
        if (cancelled || !window.L || !ref.current) return;
        const L = window.L;

        map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });

        L.tileLayer(
          `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${apiKey}`,
          {
            // MapTiler's licence requires this attribution to stay visible.
            attribution:
              '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' +
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
            tileSize: 512,
            zoomOffset: -1,
          },
        ).addTo(map);

        const a: [number, number] = [restaurant.lat, restaurant.lng];
        const b: [number, number] = [destination.lat, destination.lng];

        L.marker(a, { icon: L.divIcon({ html: pin("#e23744", "R"), className: "", iconSize: [26, 26] }) })
          .addTo(map)
          .bindPopup(restaurantName);
        L.marker(b, { icon: L.divIcon({ html: pin("#111827", "🏠"), className: "", iconSize: [26, 26] }) })
          .addTo(map)
          .bindPopup(address);

        // Dashed, because this is the straight-line distance the fee was based
        // on. A solid line would read as a route, and we did not compute one.
        L.polyline([a, b], { color: "#e23744", weight: 3, dashArray: "6 6", opacity: 0.75 }).addTo(map);

        map.fitBounds([a, b], { padding: [48, 48], maxZoom: 15 });
      } catch {
        if (!cancelled) setError("The map could not load.");
      }
    })();

    return () => {
      cancelled = true;
      try {
        map?.remove();
      } catch {
        /* already torn down */
      }
    };
  }, [restaurant, destination, restaurantName, address, apiKey]);

  // Every reason the map cannot draw says which one it is, rather than
  // rendering an empty grey box that looks broken.
  const unavailable = !apiKey
    ? "Map unavailable — no map provider is configured."
    : !restaurant
      ? "The restaurant's location has not been geocoded yet."
      : !destination
        ? "This order has no geocoded delivery address."
        : error;

  if (unavailable) {
    return (
      <div className="grid h-52 place-items-center rounded-[14px] border border-dashed border-line-2 bg-card-2 px-6 text-center sm:h-64">
        <p className="text-[13.5px] leading-relaxed text-ink-3">{unavailable}</p>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={ref}
        className="h-52 w-full overflow-hidden rounded-[14px] border border-line sm:h-64"
        role="img"
        aria-label={`Map from ${restaurantName} to ${address}`}
      />
      <p className="mt-2 text-[12.5px] text-ink-3">
        {miles !== null ? `${miles} miles ` : ""}from {restaurantName}. The dashed line is
        the straight-line distance your delivery fee was worked out from, not the road the
        driver takes.
      </p>
    </div>
  );
}
