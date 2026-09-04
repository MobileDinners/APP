"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FoodPhoto } from "./FoodPhoto";
import { ChevronIcon } from "./icons";

const CATEGORIES = [
  { label: "Tacos", kw: "tacos" },
  { label: "Pizza", kw: "pizza" },
  { label: "Burgers", kw: "burger" },
  { label: "Noodles", kw: "ramen" },
  { label: "Bao", kw: "bao" },
  { label: "Wraps", kw: "shawarma" },
  { label: "Wings", kw: "wings" },
  { label: "Salads", kw: "salad" },
  { label: "Sushi", kw: "sushi" },
  { label: "Curry", kw: "curry" },
  { label: "Dessert", kw: "milkshake" },
  { label: "Coffee", kw: "coffee" },
];

/**
 * Category strip. Swipes on touch, and on a pointer device gets the arrow
 * controls a wide screen expects — hidden at the ends so the affordance only
 * appears when there is somewhere to go.
 */
export function CategoryTiles({ active }: { active?: string }) {
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
  }, []);

  const nudge = (dir: 1 | -1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="group/rail relative">
      <div ref={rail} className="rail px-4 md:px-6" aria-label="Browse by category">
        {CATEGORIES.map((c) => {
          const on = active?.toLowerCase() === c.label.toLowerCase();
          return (
            <Link
              key={c.label}
              href={`/search?q=${encodeURIComponent(c.label)}`}
              className="flex w-[92px] shrink-0 flex-col items-center gap-2"
            >
              <FoodPhoto
                keyword={c.kw}
                seed={`cat-${c.label}`}
                width={200}
                height={200}
                alt=""
                className={`h-[76px] w-[76px] rounded-[14px] transition-transform hover:scale-[1.06] ${
                  on ? "ring-2 ring-ink ring-offset-2 ring-offset-bg" : ""
                }`}
              />
              <span
                className={`text-center text-[13px] font-bold ${on ? "text-ink" : "text-ink-2"}`}
              >
                {c.label}
              </span>
            </Link>
          );
        })}
      </div>

      <RailArrow side="left" hidden={atStart} onClick={() => nudge(-1)} />
      <RailArrow side="right" hidden={atEnd} onClick={() => nudge(1)} />
    </div>
  );
}

export function RailArrow({
  side,
  hidden,
  onClick,
  topClass = "top-[38px]",
}: {
  side: "left" | "right";
  hidden: boolean;
  onClick: () => void;
  /** Vertical centre of the thing being scrolled, as a Tailwind top-* class. */
  topClass?: string;
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      className={`absolute z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-card text-ink shadow-[var(--shadow-md)] ring-1 ring-line hover:bg-card-2 md:grid ${topClass} ${
        side === "left" ? "left-1" : "right-1"
      }`}
    >
      <ChevronIcon className={`h-4 w-4 ${side === "left" ? "rotate-180" : ""}`} />
    </button>
  );
}
