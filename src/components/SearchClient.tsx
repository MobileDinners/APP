"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import { FoodPhoto } from "./FoodPhoto";
import { RestaurantCard, type FeedCard } from "./RestaurantCard";
import { SearchIcon } from "./icons";

export type SearchIndexEntry = {
  itemId: string;
  name: string;
  description: string;
  priceCents: number;
  imageKw: string;
  brandName: string;
  slug: string;
  cuisine: string;
};

const QUICK = ["Tacos", "Pizza", "Burgers", "Noodles", "Bao", "Wings", "Salads", "Coffee"];

export function SearchClient({
  initialQuery,
  restaurants,
  dishes,
}: {
  initialQuery: string;
  restaurants: FeedCard[];
  dishes: SearchIndexEntry[];
}) {
  const [q, setQ] = useState(initialQuery);
  const term = q.trim().toLowerCase();

  const { matchedRestaurants, matchedDishes } = useMemo(() => {
    if (!term) return { matchedRestaurants: [], matchedDishes: [] };
    const r = restaurants.filter(
      (x) =>
        x.brandName.toLowerCase().includes(term) ||
        x.cuisine.toLowerCase().includes(term) ||
        x.blurb.toLowerCase().includes(term),
    );
    const d = dishes.filter(
      (x) =>
        x.name.toLowerCase().includes(term) ||
        x.description.toLowerCase().includes(term) ||
        x.cuisine.toLowerCase().includes(term),
    );
    return { matchedRestaurants: r, matchedDishes: d.slice(0, 24) };
  }, [term, restaurants, dishes]);

  const nothing = term.length > 0 && matchedRestaurants.length === 0 && matchedDishes.length === 0;

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-4 md:px-6">
      <h1 className="sr-only">Search</h1>

      <div className="flex items-center gap-2.5 rounded-full bg-card-2 px-4 py-3">
        <SearchIcon className="h-[18px] w-[18px] shrink-0 text-ink-3" />
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search restaurants or dishes"
          aria-label="Search restaurants or dishes"
          className="w-full bg-transparent text-[16px] outline-none"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="shrink-0 text-[13px] font-bold text-ink-3 hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>

      {!term && (
        <>
          <h2 className="mb-2.5 mt-6 text-[17px] font-extrabold">Popular searches</h2>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQ(s)}
                className="rounded-full bg-card-2 px-4 py-2 text-[14px] font-bold hover:bg-line"
              >
                {s}
              </button>
            ))}
          </div>

          <h2 className="mb-3 mt-8 text-[17px] font-extrabold">All restaurants</h2>
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((r) => (
              <RestaurantCard key={r.orgId} r={r} />
            ))}
          </div>
        </>
      )}

      {nothing && (
        <div className="py-16 text-center">
          <p className="text-[18px] font-extrabold">No results for “{q}”</p>
          <p className="mt-1.5 text-[14px] text-ink-2">
            Try a cuisine, a restaurant name, or a dish.
          </p>
        </div>
      )}

      {matchedDishes.length > 0 && (
        <>
          <h2 className="mb-3 mt-7 text-[17px] font-extrabold">
            Dishes · {matchedDishes.length}
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-0 p-0 sm:grid-cols-2 sm:gap-x-6">
            {matchedDishes.map((d) => (
              <li key={d.itemId} className="border-b border-line">
                <Link href={`/r/${d.slug}`} className="flex items-center gap-3 py-3">
                  <FoodPhoto
                    keyword={d.imageKw}
                    seed={d.itemId}
                    width={160}
                    height={160}
                    alt={d.name}
                    className="h-16 w-16 shrink-0 rounded-[12px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">{d.name}</p>
                    <p className="truncate text-[13px] text-ink-2">{d.brandName}</p>
                    <p className="num text-[14px] font-extrabold">
                      {formatCents(d.priceCents)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {matchedRestaurants.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-[17px] font-extrabold">
            Restaurants · {matchedRestaurants.length}
          </h2>
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {matchedRestaurants.map((r) => (
              <RestaurantCard key={r.orgId} r={r} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
