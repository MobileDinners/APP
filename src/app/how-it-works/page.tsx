import Link from "next/link";
import type { Metadata } from "next";
import { listRestaurants } from "@/lib/orders";
import { publishedMenu } from "@/lib/menu";
import { FoodPhoto } from "@/components/FoodPhoto";
import { CtaBand, Faq, PageHero, SectionHead, Stat, Wrap } from "@/components/marketing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How Mobile Dinners Works",
  description:
    "Order from local restaurants at in-store prices. No service fees, no inflated menus, and one points wallet that works at every restaurant on the network.",
};

const FAQS = [
  {
    q: "Why is the food cheaper here?",
    a: "It usually is not cheaper. It is the actual price. Restaurants on other apps raise their menu prices to survive a commission of 15% to 30%, so the same burrito quietly costs two dollars more there. We take nothing per order, so there is nothing to mark up.",
  },
  {
    q: "What do I pay on top of the food?",
    a: "Tax, an optional tip and, if you choose delivery, a delivery fee of $0.99 to $3.99 worked out from how far your address is from the restaurant. It is shown in full at checkout before you pay. There is no service fee, no small-order fee, no busy-time surcharge and no separate 'regulatory response' line.",
  },
  {
    q: "How do the points work?",
    a: "You earn points on every order and they sit in one wallet that works at every restaurant on Mobile Dinners. Points from your Tuesday taco order pay for Saturday's bakery run. Restaurants set their own earn multipliers; redemption is capped per order so a wallet cannot zero out a ticket.",
  },
  {
    q: "Are the delivery times real?",
    a: "They come from the kitchen. Each restaurant's display system reports live queue depth and per-item prep times, and the estimate updates as your order moves. When it slips, the tracking page says so rather than showing an optimistic number until the doorbell.",
  },
  {
    q: "Who gets my contact details?",
    a: "The restaurant you ordered from. That is the point: they should be able to recognize a regular. We do not sell your data, and one restaurant never sees another restaurant's customers.",
  },
];

export default function MarketplacePage() {
  const live = listRestaurants()
    .map((r) => ({ r, menu: publishedMenu(r.orgId) }))
    .filter((x) => x.menu.length > 0);

  const cuisines = [...new Set(live.map((x) => x.r.cuisine))].sort();
  const avgFee =
    live.length > 0
      ? live.reduce((n, x) => n + x.r.deliveryFeeCents, 0) / live.length / 100
      : 0;

  const featured = live.slice(0, 6);

  return (
    <>
      <PageHero
        eyebrow="Marketplace"
        title="The delivery app that does not tax the kitchen"
        lede="Same browse, same cart, same live tracking you already know. The difference is that the restaurant keeps the whole ticket, which is why the prices match the ones on the wall."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full bg-brand px-6 py-3.5 text-[15.5px] font-extrabold text-brand-ink transition-colors hover:bg-brand-press"
          >
            Browse restaurants
          </Link>
          <Link
            href="/partners/signup"
            className="rounded-full border border-line-2 bg-card px-6 py-3.5 text-[15.5px] font-extrabold transition-colors hover:bg-card-2"
          >
            List my restaurant
          </Link>
        </div>
      </PageHero>

      {/* ------------------------------------------------------------ fee compare */}
      <Wrap className="py-14 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-14">
          <div>
            <SectionHead
              eyebrow="The checkout"
              title="Where the other fourteen dollars went"
              lede="A $38 order of food, priced the way each app actually prices it. The menu markup is the part nobody itemises for you."
            />
            <p className="mt-5 text-[14px] leading-relaxed text-ink-3">
              Menu markup is the amount restaurants add to third-party listings to
              absorb commission, commonly 10% to 20%. It never appears as a line on
              your receipt, because it is baked into the item price. Tax is charged
              on the food, so the markup gets taxed too. Same food, same street,
              <strong className="num font-bold text-ink-2"> $13.75</strong> apart.
            </p>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-line bg-card">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line-2 bg-bg-2">
                  <th className="px-5 py-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                    Same order
                  </th>
                  <th className="px-3 py-3 text-right text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                    Big app
                  </th>
                  <th className="px-5 py-3 text-right text-[12px] font-extrabold uppercase tracking-[0.1em] text-brand-strong">
                    Mobile Dinners
                  </th>
                </tr>
              </thead>
              <tbody className="num">
                {[
                  ["Food, as priced in store", "$38.00", "$38.00"],
                  ["Menu markup to absorb commission (15%)", "+$5.70", "$0.00"],
                  ["Service fee (15% of subtotal)", "+$6.56", "$0.00"],
                  ["Delivery fee", "+$2.99", "+$1.99"],
                  ["Tax (8.75% of food)", "+$3.82", "+$3.33"],
                ].map(([label, a, b]) => (
                  <tr key={label} className="border-b border-line">
                    <td className="px-5 py-3 text-[14px] font-semibold text-ink-2">{label}</td>
                    <td className="px-3 py-3 text-right text-[14px] font-bold">{a}</td>
                    <td className="px-5 py-3 text-right text-[14px] font-bold">{b}</td>
                  </tr>
                ))}
                <tr className="bg-bg-2">
                  <td className="px-5 py-4 text-[14px] font-extrabold">Total before tip</td>
                  <td className="px-3 py-4 text-right text-[19px] font-extrabold text-red">
                    $57.07
                  </td>
                  <td className="px-5 py-4 text-right text-[19px] font-extrabold text-green">
                    $43.32
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Wrap>

      {/* ------------------------------------------------------------ live proof
        A section called "live proof" proves nothing when the network is empty —
        it renders a headline promising restaurants above four zeroes. It hides
        itself until there is something to show, and returns the moment a
        restaurant publishes.
      */}
      {live.length > 0 && (
      <section className="bg-bg-2 py-14 md:py-20">
        <Wrap>
          <SectionHead
            eyebrow="On the network"
            title="Restaurants taking orders right now"
            lede="Live listings with published menus behind them."
          />

          {/* "Commission taken 0%" lived here. It is a fact about what a
              restaurant pays us, on a page a diner reads to work out what THEY
              pay, so it moved off the customer site entirely. */}
          <dl className="mt-8 grid grid-cols-3 gap-6">
            <div>
              <dt className="sr-only">Restaurants</dt>
              <dd>
                <Stat value={live.length.toLocaleString()} label="Restaurants" />
              </dd>
            </div>
            <div>
              <dt className="sr-only">Cuisines</dt>
              <dd>
                <Stat value={cuisines.length.toLocaleString()} label="Cuisines" />
              </dd>
            </div>
            <div>
              <dt className="sr-only">Average delivery fee</dt>
              <dd>
                <Stat value={`$${avgFee.toFixed(2)}`} label="Avg delivery fee" />
              </dd>
            </div>
          </dl>

          <ul className="m-0 mt-10 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map(({ r, menu }) => (
              <li key={r.orgId}>
                <Link
                  href={`/r/${r.slug}`}
                  className="group block overflow-hidden rounded-[18px] border border-line bg-card transition-shadow hover:shadow-[var(--shadow-md)]"
                >
                  <FoodPhoto
                    keyword={r.imageKw}
                    seed={r.orgId}
                    width={600}
                    height={340}
                    alt={r.brandName}
                    className="h-40 w-full"
                  />
                  <div className="p-4">
                    <h3 className="text-[16.5px] font-extrabold group-hover:text-brand-strong">
                      {r.brandName}
                    </h3>
                    <p className="mt-1 text-[13.5px] text-ink-2">
                      {r.cuisine} · {r.priceBand} ·{" "}
                      <span className="num">{menu.length}</span> dishes
                    </p>
                    <p className="mt-2 text-[13px] font-bold text-green">
                      No service fee · in-store prices
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/"
            className="mt-8 inline-block text-[15.5px] font-extrabold text-brand-strong hover:underline"
          >
            See all {live.length} restaurants →
          </Link>
        </Wrap>
      </section>
      )}

      {/* --------------------------------------------------------------- wallet */}
      <Wrap id="points" className="scroll-mt-24 py-14 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1fr_0.85fr] md:gap-14">
          <div>
            <SectionHead
              eyebrow="One wallet"
              title="Points from the taqueria buy the bakery"
              lede="Most loyalty programs trap you in one restaurant, so you end up with four cards and a stale balance at each. Here there is one balance, and it works everywhere on the network."
            />
            <ul className="m-0 mt-6 grid list-none gap-3 p-0">
              {[
                "Earn on every order, pickup or delivery",
                "Spend at any restaurant on Mobile Dinners",
                "Restaurants set their own earn multipliers, so some days are worth more",
                "Every point earned, spent and expired is a ledger entry you can see",
              ].map((b) => (
                <li key={b} className="flex gap-2.5 text-[15px] leading-snug text-ink-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[20px] bg-ink p-6 text-bg">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] opacity-60">
              Points wallet
            </p>
            <p className="num mt-3 text-[46px] font-extrabold leading-none tracking-[-0.035em]">
              2,847
            </p>
            <p className="mt-1.5 text-[14px] font-bold opacity-70">
              worth $28.47 at any restaurant
            </p>
            <div className="mt-5 grid gap-2.5 border-t border-bg/15 pt-4 text-[13.5px]">
              {[
                ["Sunrise Taqueria", "+180"],
                ["Golden Bao House", "+240"],
                ["Redeemed at Nonna's", "−500"],
              ].map(([where, pts]) => (
                <div key={where} className="flex items-center justify-between gap-3">
                  <span className="opacity-75">{where}</span>
                  <span
                    className={`num font-extrabold ${
                      pts.startsWith("−") ? "opacity-55" : "text-brand-strong"
                    }`}
                  >
                    {pts}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Wrap>

      {/* -------------------------------------------------------------------- faq */}
      <Wrap>
        <SectionHead eyebrow="For diners" title="Reasonable questions" />
        <div className="mt-7">
          <Faq items={FAQS} />
        </div>
      </Wrap>

      <CtaBand
        title="Order from a restaurant that keeps the money"
        lede="Same food, same street, same fifteen minutes. A much larger share of it reaches the kitchen."
        primary={{ href: "/", label: "Browse restaurants" }}
        secondary={{ href: "/partners/signup", label: "List my restaurant" }}
      />
    </>
  );
}
