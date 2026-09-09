import Link from "next/link";
import {
  FILTERS,
  SORTS,
  feedHref,
  toggleFilter,
  type FeedQuery,
} from "@/lib/feed";

/**
 * The control strip above the feed: fulfillment toggle, filter chips, sort.
 *
 * Every control is a link, not a button with an onClick. That is not laziness —
 * it means the whole thing works before hydration, each view has its own URL to
 * share or bookmark, and the filtering runs once on the server instead of
 * shipping the restaurant list to the browser to be filtered again.
 */

export function FulfillmentToggle({ q }: { q: FeedQuery }) {
  return (
    <div
      className="inline-flex rounded-full bg-card-2 p-1"
      role="group"
      aria-label="Delivery or pickup"
    >
      {(["delivery", "pickup"] as const).map((m) => {
        const on = q.mode === m;
        return (
          <Link
            key={m}
            href={feedHref(q, { mode: m })}
            aria-current={on ? "true" : undefined}
            className={`rounded-full px-5 py-2 text-[14.5px] font-bold capitalize transition-colors ${
              on ? "bg-card text-ink shadow-[var(--shadow-sm)]" : "text-ink-2 hover:text-ink"
            }`}
          >
            {m}
          </Link>
        );
      })}
    </div>
  );
}

export function FilterChips({ q }: { q: FeedQuery }) {
  const anyActive = q.filters.length > 0 || q.sort !== "picked";

  return (
    <div className="rail" aria-label="Filter and sort">
      {SORTS.filter((s) => s.id !== "picked").map((s) => {
        const on = q.sort === s.id;
        return (
          <Link
            key={s.id}
            href={feedHref(q, { sort: on ? "picked" : s.id })}
            aria-pressed={on}
            className={chip(on)}
          >
            {s.label}
          </Link>
        );
      })}

      <span className="my-1 w-px shrink-0 self-stretch bg-line" aria-hidden="true" />

      {FILTERS.map((f) => {
        const on = q.filters.includes(f.id);
        return (
          <Link
            key={f.id}
            href={feedHref(q, toggleFilter(q, f.id))}
            aria-pressed={on}
            className={chip(on)}
          >
            {f.label}
          </Link>
        );
      })}

      {anyActive && (
        <Link
          href="/restaurants"
          className="shrink-0 rounded-full px-3.5 py-2 text-[14px] font-bold text-ink-3 underline hover:text-ink"
        >
          Clear
        </Link>
      )}
    </div>
  );
}

function chip(on: boolean): string {
  return [
    "shrink-0 rounded-full border px-4 py-2 text-[14px] font-bold transition-colors",
    on
      ? "border-ink bg-ink text-bg"
      : "border-line-2 bg-card text-ink-2 hover:border-ink-3 hover:text-ink",
  ].join(" ");
}
