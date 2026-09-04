"use client";

import Link from "next/link";
import { FoodPhoto } from "./FoodPhoto";

const CATEGORIES = [
  { label: "Tacos", kw: "tacos" },
  { label: "Pizza", kw: "pizza" },
  { label: "Burgers", kw: "burger" },
  { label: "Noodles", kw: "ramen" },
  { label: "Bao", kw: "bao" },
  { label: "Wraps", kw: "shawarma" },
  { label: "Wings", kw: "wings" },
  { label: "Salads", kw: "salad" },
  { label: "Dessert", kw: "milkshake" },
  { label: "Coffee", kw: "coffee" },
];

export function CategoryRail({ active }: { active?: string }) {
  return (
    <nav className="rail px-4 md:px-6" aria-label="Browse by category">
      {CATEGORIES.map((c) => {
        const on = active?.toLowerCase() === c.label.toLowerCase();
        return (
          <Link
            key={c.label}
            href={`/search?q=${encodeURIComponent(c.label)}`}
            className="flex w-[70px] flex-col items-center gap-1.5"
          >
            <FoodPhoto
              keyword={c.kw}
              seed={`cat-${c.label}`}
              width={140}
              height={140}
              alt=""
              className={`h-[58px] w-[58px] rounded-full ${
                on ? "ring-2 ring-brand ring-offset-2 ring-offset-bg" : ""
              }`}
            />
            <span
              className={`text-center text-[12px] font-bold ${
                on ? "text-brand-strong" : "text-ink-2"
              }`}
            >
              {c.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
