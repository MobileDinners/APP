"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RestaurantCard } from "./RestaurantCard";
import { RailArrow } from "./CategoryTiles";
import type { FeedCard, FeedMode } from "@/lib/feed";

/**
 * A titled row of store cards that scrolls sideways, with arrow controls on
 * wide screens and a "See all" escape hatch in the heading.
 */
export function CardCarousel({
  title,
  note,
  cards,
  mode,
  seeAllHref,
}: {
  title: string;
  note?: string;
  cards: FeedCard[];
  mode: FeedMode;
  seeAllHref?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const sync = () => {
      setAtStart(el.scrollLeft < 8);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [cards.length]);

  const nudge = (dir: 1 | -1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  };

  if (cards.length === 0) return null;

  return (
    <section className="pt-9">
      <div className="mb-3 flex items-end justify-between gap-4 px-4 md:px-6">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em] md:text-[26px]">
            {title}
          </h2>
          {note && <p className="mt-0.5 text-[14px] text-ink-2">{note}</p>}
        </div>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="shrink-0 rounded-full border border-line-2 px-4 py-2 text-[14px] font-bold hover:bg-card-2"
          >
            See all
          </Link>
        )}
      </div>

      <div className="relative">
        <div ref={rail} className="rail px-4 md:px-6">
          {cards.map((r) => (
            <div key={r.orgId} className="w-[260px] sm:w-[300px]">
              <RestaurantCard r={r} mode={mode} />
            </div>
          ))}
        </div>
        <RailArrow side="left" hidden={atStart} onClick={() => nudge(-1)} topClass="top-[95px]" />
        <RailArrow side="right" hidden={atEnd} onClick={() => nudge(1)} topClass="top-[95px]" />
      </div>
    </section>
  );
}
