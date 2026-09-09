"use client";

import Link from "next/link";
import { formatCents } from "@/lib/money";
import { etaFor, type FeedCard, type FeedMode } from "@/lib/feed";
import { FoodPhoto } from "./FoodPhoto";

export type { FeedCard };

/**
 * Store card, laid out the way the big marketplaces lay theirs out: photo with
 * the offer over it, then name and rating on one row, then the single line a
 * person actually decides on — fee and time.
 *
 * The rating sits in a compact pill rather than beside a star, because at three
 * cards across the eye scans a column of numbers faster than a column of icons.
 */
export function RestaurantCard({
  r,
  mode = "delivery",
  priority = false,
}: {
  r: FeedCard;
  mode?: FeedMode;
  priority?: boolean;
}) {
  const [low, high] = etaFor(r, mode);

  return (
    <Link href={`/r/${r.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-[12px]">
        <FoodPhoto
          keyword={r.imageKw}
          seed={r.orgId}
          width={640}
          height={400}
          alt={r.brandName}
          priority={priority}
          className="aspect-[3/2] w-full transition-transform duration-300 group-hover:scale-[1.03]"
        />

        {r.promo && (
          <span className="absolute left-2.5 top-2.5 rounded-[6px] bg-brand px-2.5 py-1.5 text-[12.5px] font-extrabold text-brand-ink">
            {r.promo}
          </span>
        )}

        <button
          type="button"
          aria-label={`Save ${r.brandName}`}
          onClick={(e) => {
            e.preventDefault();
          }}
          className="absolute bottom-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-full bg-bg/92 text-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-bg"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[17px] w-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13Z" />
          </svg>
        </button>
      </div>

      <div className="pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[16px] font-extrabold leading-tight">
            {r.brandName}
          </h3>
          <span className="num grid h-[26px] shrink-0 place-items-center rounded-full bg-card-2 px-2 text-[12.5px] font-extrabold">
            {r.rating.toFixed(1)}
          </span>
        </div>

        <p className="num mt-1 text-[14px] text-ink-2">
          {mode === "pickup" ? "Pickup" : `${formatCents(r.deliveryFeeCents)} delivery`}
          {" · "}
          {low} to {high} min
        </p>

        <p className="mt-0.5 truncate text-[13px] text-ink-3">
          {r.cuisine} · {r.priceBand} · <span className="num">{r.distanceMi}</span> mi
          {r.isSponsored && " · Sponsored"}
          {r.soldOut > 0 && ` · ${r.soldOut} sold out`}
        </p>
      </div>
    </Link>
  );
}
