import { FoodPhoto } from "./FoodPhoto";
import { LogoLockup } from "./Logo";
import { ChevronIcon, PinIcon, SearchIcon, StarIcon } from "./icons";
import type { FeedCard } from "@/lib/feed";

/**
 * The app, shown inside a phone, in the hero.
 *
 * Built from the same tokens and the same restaurant data as the real feed
 * rather than a flat screenshot — so it can never drift out of date, and it
 * re-themes with the rest of the page.
 */
export function PhoneMockup({ cards }: { cards: FeedCard[] }) {
  const two = cards.slice(0, 2);

  return (
    <div className="relative mx-auto w-[300px] overflow-hidden rounded-[38px] bg-ink p-[9px] shadow-[var(--shadow-lg)]">
      <div className="relative overflow-hidden rounded-[30px] bg-bg">
        {/* status bar + notch */}
        <div className="relative flex items-center justify-between px-5 pb-1 pt-2.5">
          <span className="num text-[12px] font-bold">8:01</span>
          <span className="absolute left-1/2 top-1.5 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-ink" />
          <span className="flex items-center gap-1 text-[11px] font-bold text-ink-2">
            <span className="inline-block h-2.5 w-4 rounded-[2px] border border-current" />
          </span>
        </div>

        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <LogoLockup markClass="h-8 w-auto" typeClass="text-[13px]" className="gap-1.5" />
          <span className="grid h-7 w-7 place-items-center rounded-full bg-card-2 text-[13px]">
            🔔
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-4 pb-2">
          <PinIcon className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-bold uppercase tracking-wide text-ink-3">
              Deliver to
            </span>
            <span className="block truncate text-[11.5px] font-semibold">
              742 Elm St, San Francisco
            </span>
          </span>
          <ChevronIcon className="h-3.5 w-3.5 shrink-0 rotate-90 text-ink-3" />
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-[10px] bg-card-2 px-3 py-2">
            <SearchIcon className="h-3.5 w-3.5 text-ink-3" />
            <span className="text-[11.5px] text-ink-3">Search restaurants or dishes</span>
          </div>
        </div>

        {/* the points wallet, which is the actual differentiator */}
        <div className="px-4">
          <div className="flex items-center gap-3 overflow-hidden rounded-[12px] bg-chrome px-3.5 py-3 text-chrome-ink">
            <span className="min-w-0 flex-1">
              <span className="num block text-[19px] font-extrabold leading-none">
                2,847 points
              </span>
              <span className="mt-1 block text-[10.5px] font-semibold opacity-75">
                Works at every restaurant
              </span>
              <span className="mt-2 inline-block rounded-[6px] bg-brand px-2.5 py-1 text-[10.5px] font-extrabold text-brand-ink">
                Redeem
              </span>
            </span>
            <FoodPhoto
              keyword="burger"
              seed="phone-hero"
              width={200}
              height={200}
              alt=""
              className="h-[62px] w-[62px] shrink-0 rounded-[10px]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
          <span className="text-[12.5px] font-extrabold">Popular near you</span>
          <span className="text-[10.5px] font-bold text-brand-strong">View all</span>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          {two.map((r) => (
            <span key={r.orgId} className="block">
              <FoodPhoto
                keyword={r.imageKw}
                seed={r.orgId}
                width={240}
                height={160}
                alt=""
                className="h-[62px] w-full rounded-[8px]"
              />
              <span className="mt-1 block truncate text-[10.5px] font-extrabold">
                {r.brandName}
              </span>
              <span className="num mt-0.5 flex items-center gap-1 text-[9.5px] text-ink-3">
                {r.etaLow}–{r.etaHigh} min
                <StarIcon className="h-2.5 w-2.5 text-ink-2" />
                {r.rating.toFixed(1)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
