"use client";

import { useLive } from "./useLive";

/** Keeps sold-out badges honest when the kitchen 86s an item. */
export function LiveFeed() {
  const { connected } = useLive();
  return (
    <span className="hidden shrink-0 items-center gap-1.5 pb-1 text-[12px] font-bold text-ink-3 sm:flex">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          connected ? "bg-green" : "bg-line-2"
        }`}
      />
      {connected ? "Live menu" : "Reconnecting"}
    </span>
  );
}
