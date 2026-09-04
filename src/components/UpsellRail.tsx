"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import type { Suggestion } from "@/lib/upsell-types";
import { FoodPhoto } from "./FoodPhoto";
import { PlusIcon } from "./icons";

/**
 * "Add to your order" at checkout.
 *
 * Renders nothing at all when there is nothing worth suggesting — an empty
 * shelf is better than a filler suggestion, which teaches guests to ignore the
 * whole row.
 */
export function UpsellRail({
  orgId,
  cartItemIds,
  onAdd,
}: {
  orgId: string;
  cartItemIds: string[];
  onAdd: (s: Suggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Keyed on the cart contents so the slate updates as items go in and out.
  const key = cartItemIds.join(",");

  useEffect(() => {
    let cancelled = false;
    if (!orgId || cartItemIds.length === 0) {
      setSuggestions([]);
      return;
    }
    fetch(`/api/upsell?orgId=${encodeURIComponent(orgId)}&items=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d: { suggestions?: Suggestion[] }) => {
        if (!cancelled) setSuggestions(d.suggestions ?? []);
      })
      .catch(() => {
        // A failed suggestion call must never block checkout.
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, key, cartItemIds.length]);

  const visible = suggestions.filter((s) => !added.has(s.itemId));
  if (visible.length === 0) return null;

  async function add(s: Suggestion) {
    setAdded((prev) => new Set(prev).add(s.itemId));
    onAdd(s);
    try {
      await fetch("/api/upsell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, itemId: s.itemId }),
      });
    } catch {
      // Telemetry is not worth failing an add-to-cart over.
    }
  }

  return (
    <section className="card mt-3 p-4">
      <h2 className="text-[16px] font-extrabold">Add to your order</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-ink-2">
        Ready in the same window as the rest of your food.
      </p>

      <ul className="m-0 grid list-none gap-2 p-0">
        {visible.map((s) => (
          <li key={s.itemId} className="flex items-center gap-3">
            <FoodPhoto
              keyword={s.imageKw}
              seed={s.itemId}
              width={160}
              height={160}
              alt={s.name}
              className="h-14 w-14 shrink-0 rounded-[10px]"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-bold">{s.name}</p>
              <p className="truncate text-[12.5px] text-ink-2">{s.reason}</p>
              <p className="num text-[14px] font-extrabold">{formatCents(s.priceCents)}</p>
            </div>
            <button
              type="button"
              onClick={() => add(s)}
              aria-label={`Add ${s.name}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card-2 hover:bg-line"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
