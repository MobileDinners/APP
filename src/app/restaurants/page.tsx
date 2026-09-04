import Link from "next/link";
import { getWallet, listOrders, listRestaurants } from "@/lib/orders";
import { publishedMenu } from "@/lib/menu";
import { getSession } from "@/lib/auth";
import { formatCents, pointsToCents } from "@/lib/money";
import {
  applyFeed,
  describeFeed,
  parseFeedQuery,
  fastestPrepSeconds,
  type FeedCard,
} from "@/lib/feed";
import { CategoryTiles } from "@/components/CategoryTiles";
import { CardCarousel } from "@/components/CardCarousel";
import { FilterChips, FulfillmentToggle } from "@/components/FeedControls";
import { RestaurantCard } from "@/components/RestaurantCard";
import { LiveFeed } from "@/components/LiveFeed";
import { ChevronIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

function buildCards(): FeedCard[] {
  return listRestaurants()
    .map((r) => {
      const menu = publishedMenu(r.orgId);
      // A restaurant that has signed up but not published a menu is not open
      // for business, and Math.min of nothing is Infinity.
      if (menu.length === 0) return null;

      const fastest = fastestPrepSeconds(menu);
      // Kitchen time is what pickup waits on; delivery adds the road leg.
      const ready = Math.round((r.prepBaseSeconds * 0.5 + fastest) / 60);
      return {
        ...r,
        pickupLow: ready,
        pickupHigh: ready + 6,
        etaLow: ready + 8,
        etaHigh: ready + 16,
        soldOut: menu.filter((m) => !m.isAvailable).length,
      };
    })
    .filter((c): c is FeedCard => c !== null);
}

export default async function RestaurantsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; sort?: string; filter?: string }>;
}) {
  const q = parseFeedQuery(await searchParams);
  const all = buildCards();
  const cards = applyFeed(all, q);

  const session = await getSession();
  const person = session?.kind === "person" ? session : null;
  const wallet = person ? getWallet(person.personId) : null;

  // "Order again" is real history, not a hardcoded rail.
  const history = person ? listOrders({ personId: person.personId, limit: 40 }) : [];
  const seen = new Set<string>();
  const orderAgain = history
    .filter((o) => (seen.has(o.orgId) ? false : seen.add(o.orgId)))
    .map((o) => all.find((c) => c.orgId === o.orgId))
    .filter((c): c is FeedCard => Boolean(c));

  const deals = cards.filter((c) => c.promo).slice(0, 8);
  const quickest = [...cards]
    .sort((a, b) => (q.mode === "pickup" ? a.pickupLow - b.pickupLow : a.etaLow - b.etaLow))
    .slice(0, 8);

  return (
    <main className="mx-auto max-w-[1280px]">
      <div className="pt-4">
        <CategoryTiles />
      </div>

      {/* Fulfilment first: it changes prices and times, so it comes before
          anything a person might compare. */}
      <div className="mt-5 border-b border-line">
        <div className="flex items-center justify-between gap-4 px-4 pb-4 md:px-6">
          <FulfillmentToggle q={q} />
          <LiveFeed />
        </div>
        <div className="px-4 pb-3 md:px-6">
          <FilterChips q={q} />
        </div>
      </div>

      {/* The cross-restaurant wallet — the reason to use this app over another */}
      <section className="px-4 pt-5 md:px-6">
        <Link
          href={wallet ? "/rewards" : "/signin"}
          className="relative flex items-center gap-4 overflow-hidden rounded-[14px] bg-chrome px-5 py-4 text-chrome-ink"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold uppercase tracking-wider text-brand">
              {wallet
                ? "Your points work at every restaurant here"
                : "Earn points at every restaurant here"}
            </p>
            {wallet ? (
              <>
                <p className="num mt-1 text-[26px] font-extrabold leading-none">
                  {wallet.pointsBalance.toLocaleString()}{" "}
                  <span className="text-[16px] font-bold opacity-80">
                    points = {formatCents(pointsToCents(wallet.pointsBalance))} off
                  </span>
                </p>
                <p className="mt-1.5 text-[13px] font-semibold capitalize opacity-70">
                  {wallet.tier} tier · {wallet.ordersCount} orders
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-[22px] font-extrabold leading-tight">
                  Sign in to start earning
                </p>
                <p className="mt-1.5 text-[13px] font-semibold opacity-70">
                  Just your phone number, no password
                </p>
              </>
            )}
          </div>
          <ChevronIcon className="h-5 w-5 shrink-0 opacity-70" />
          <div
            className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full"
            style={{ background: "rgba(255,255,255,.06)" }}
          />
        </Link>
      </section>

      {orderAgain.length > 0 && (
        <CardCarousel
          title="Order again"
          cards={orderAgain}
          mode={q.mode}
          seeAllHref="/orders"
        />
      )}

      <CardCarousel
        title="Offers near you"
        note="Deals from restaurants that keep 100% of the ticket"
        cards={deals}
        mode={q.mode}
        seeAllHref="/restaurants?filter=offers"
      />

      <CardCarousel
        title={q.mode === "pickup" ? "Ready fastest" : "Arriving soonest"}
        cards={quickest}
        mode={q.mode}
        seeAllHref="/restaurants?sort=time"
      />

      <section className="px-4 pb-10 pt-10 md:px-6">
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em] md:text-[26px]">
          All restaurants
        </h2>
        <p className="mt-0.5 text-[14px] text-ink-2">
          {describeFeed(cards.length, q)} · in-store prices · no service fees
        </p>

        {cards.length === 0 ? (
          <div className="mt-8 rounded-[16px] border border-dashed border-line-2 p-12 text-center">
            <p className="text-[17px] font-extrabold">Nothing matches those filters</p>
            <p className="mx-auto mt-2 max-w-[44ch] text-[14.5px] text-ink-2">
              Try removing one — there are {all.length} restaurants open right now.
            </p>
            <Link href="/restaurants" className="btn btn-secondary mt-5">
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((r, i) => (
              <RestaurantCard key={r.orgId} r={r} mode={q.mode} priority={i < 3} />
            ))}
          </div>
        )}
      </section>

      {/* The pitch, stated once, where a guest actually reads it */}
      <section className="border-t border-line px-4 py-9 md:px-6">
        <h2 className="text-[19px] font-extrabold">
          0% commission. The kitchen keeps the whole ticket.
        </h2>
        <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-2">
          Other apps take 15–30% of every order, so restaurants raise their prices
          there to survive it. We charge a flat monthly fee instead — menu prices
          here match the ones printed inside, there is no service fee, and your
          points work across every restaurant on this page.
        </p>
        <Link
          href="/how-it-works"
          className="mt-3 inline-block text-[14.5px] font-extrabold text-brand-strong hover:underline"
        >
          See where the money goes →
        </Link>
      </section>
    </main>
  );
}
