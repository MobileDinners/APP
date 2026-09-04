import Link from "next/link";
import type { Metadata } from "next";
import { listRestaurants } from "@/lib/orders";
import { publishedMenu } from "@/lib/menu";
import type { FeedCard } from "@/lib/feed";
import { FoodPhoto } from "@/components/FoodPhoto";
import { PhoneMockup } from "@/components/PhoneMockup";
import { RestaurantCard } from "@/components/RestaurantCard";
import {
  BagOutlineIcon,
  HeadsetIcon,
  PinOutlineIcon,
  ScooterIcon,
  ShieldIcon,
  StorefrontIcon,
} from "@/components/LandingIcons";
import { PinIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mobile Dinners — Your favorite meals, delivered to you",
  description:
    "Order from local restaurants at in-store prices. No service fees, and one points wallet that works at every restaurant on the network.",
};

function buildCards(): FeedCard[] {
  return listRestaurants()
    .map((r) => {
      const menu = publishedMenu(r.orgId);
      if (menu.length === 0) return null;
      const fastest = Math.min(...menu.map((m) => m.prepSeconds));
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

const FEATURES = [
  {
    Icon: ScooterIcon,
    title: "Fast Delivery",
    body: "Times come from the kitchen, not a guess, and update while you watch.",
  },
  {
    Icon: BagOutlineIcon,
    title: "Wide Selection",
    body: "Independent restaurants across every cuisine, at in-store prices.",
  },
  {
    Icon: ShieldIcon,
    title: "Secure Payments",
    body: "Cards are tokenised by the processor. We never store a card number.",
  },
  {
    Icon: HeadsetIcon,
    title: "Real Support",
    body: "A person on the phone, 9am to 11pm, when an order goes wrong.",
  },
];

const STEPS = [
  {
    Icon: PinOutlineIcon,
    title: "Enter Your Address",
    body: "Tell us where you are and we'll show what can actually reach you.",
  },
  {
    Icon: StorefrontIcon,
    title: "Choose Your Food",
    body: "Browse menus priced the same as the board inside the restaurant.",
  },
  {
    Icon: BagOutlineIcon,
    title: "Place Your Order",
    body: "Check out in seconds. No service fee, and no account until the end.",
  },
  {
    Icon: ScooterIcon,
    title: "Get It Delivered",
    body: "Track it from the kitchen to your door, with the real time left.",
  },
];

export default function LandingPage() {
  const cards = buildCards();
  const popular = [...cards].sort((a, b) => b.rating - a.rating).slice(0, 4);

  return (
    <>
      {/* ------------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden bg-bg-2">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 py-12 md:px-6 lg:grid-cols-[1fr_minmax(0,540px)] lg:gap-6 lg:py-16">
          <div className="relative z-10">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-brand-strong">
              Fast. Fresh. Delivered.
            </p>
            <h1 className="mt-4 max-w-[13ch] text-balance text-[44px] font-extrabold leading-[1.03] tracking-[-0.04em] md:text-[60px]">
              Your Favorite Meals, Delivered To You.
            </h1>
            <p className="mt-5 max-w-[42ch] text-[17px] leading-relaxed text-ink-2">
              Delicious meals from your favorite restaurants, delivered fast to your
              door — at the prices printed inside, with no service fee.
            </p>

            <form
              action="/restaurants"
              className="mt-7 flex max-w-[480px] overflow-hidden rounded-[12px] border border-line-2 bg-card shadow-[var(--shadow-sm)] focus-within:ring-2 focus-within:ring-brand"
            >
              <span className="grid w-11 shrink-0 place-items-center text-ink-3">
                <PinIcon className="h-[18px] w-[18px]" />
              </span>
              <input
                type="text"
                name="address"
                placeholder="Enter your delivery address"
                aria-label="Delivery address"
                className="min-w-0 flex-1 bg-transparent py-3.5 pr-3 text-[15.5px] outline-none"
              />
              <button
                type="submit"
                className="shrink-0 bg-brand px-6 py-3.5 text-[15.5px] font-extrabold text-brand-ink transition-colors hover:bg-brand-press"
              >
                Find Food
              </button>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-[10px] border border-line-2 bg-card px-4 py-2.5 text-[13.5px] font-bold text-ink-2">
                <span className="h-2 w-2 rounded-full bg-teal" />
                iPhone and Android apps coming soon
              </span>
              <Link
                href="/restaurants"
                className="text-[14.5px] font-extrabold text-brand-strong hover:underline"
              >
                Order in your browser →
              </Link>
            </div>
          </div>

          <div className="relative z-20 lg:pl-4">
            <PhoneMockup cards={cards} />
          </div>
        </div>

        {/* Full-bleed food photograph anchoring the right edge, behind the phone.
            The wrapper carries the positioning because .photo sets position:
            relative itself and would win over an `absolute` utility. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[32%] xl:block">
          <FoodPhoto
            keyword="chicken"
            seed="landing-hero"
            width={1000}
            height={900}
            alt=""
            priority
            className="h-full w-full"
          />
        </div>
      </section>

      {/* --------------------------------------------------------- feature strip */}
      <section className="bg-chrome text-chrome-ink">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 md:grid-cols-2 md:px-6 lg:grid-cols-4 lg:divide-x lg:divide-chrome-ink/15">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="flex gap-4 lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-chrome-ink text-ink">
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <span>
                <span className="block text-[17px] font-extrabold">{title}</span>
                <span className="mt-1 block max-w-[30ch] text-[14px] leading-snug opacity-70">
                  {body}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------ popular restaurants | how it works */}
      <section className="grid lg:grid-cols-2">
        <div className="bg-bg px-4 py-12 md:px-6 lg:py-14 lg:pl-[max(1.5rem,calc((100vw-1280px)/2+1.5rem))]">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-[26px] font-extrabold tracking-[-0.03em] md:text-[30px]">
              Popular Restaurants
            </h2>
            <Link
              href="/restaurants"
              className="shrink-0 text-[14.5px] font-extrabold text-brand-strong hover:underline"
            >
              View all
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-7 xl:grid-cols-4">
            {popular.map((r, i) => (
              <RestaurantCard key={r.orgId} r={r} priority={i < 2} />
            ))}
          </div>
        </div>

        <div className="bg-chrome px-4 py-12 text-chrome-ink md:px-6 lg:py-14 lg:pr-[max(1.5rem,calc((100vw-1280px)/2+1.5rem))]">
          <h2 className="text-[26px] font-extrabold tracking-[-0.03em] md:text-[30px]">
            How It Works
          </h2>

          <ol className="relative m-0 mt-8 grid list-none gap-8 p-0 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
            {/* The connector runs behind the badges on a wide screen only. */}
            <span
              aria-hidden="true"
              className="absolute left-[12%] right-[12%] top-7 hidden border-t-2 border-dashed border-brand/60 xl:block"
            />
            {STEPS.map(({ Icon, title, body }, i) => (
              <li key={title} className="relative">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-chrome-ink text-ink">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="num mt-3 block text-[13px] font-extrabold text-brand">
                  {i + 1}
                </span>
                <span className="mt-1 block text-[16.5px] font-extrabold">{title}</span>
                <span className="mt-1.5 block max-w-[26ch] text-[13.5px] leading-snug opacity-70">
                  {body}
                </span>
              </li>
            ))}
          </ol>

          <Link
            href="/how-it-works"
            className="mt-9 inline-block rounded-[10px] bg-brand px-6 py-3 text-[15px] font-extrabold text-brand-ink transition-colors hover:bg-brand-press"
          >
            See where the money goes
          </Link>
        </div>
      </section>

      {/* -------------------------------------------------------------- the pitch */}
      <section className="mx-auto max-w-[1280px] px-4 py-14 md:px-6">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="max-w-[22ch] text-balance text-[26px] font-extrabold leading-[1.12] tracking-[-0.03em] md:text-[32px]">
              0% commission. The kitchen keeps the whole ticket.
            </h2>
            <p className="mt-3 max-w-[62ch] text-[15.5px] leading-relaxed text-ink-2">
              Other apps take 15–30% of every order, so restaurants raise their
              prices there to survive it. We charge a flat monthly fee instead —
              menu prices here match the ones printed inside, and your points work
              across every restaurant on the network.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-6 md:gap-9">
            {[
              ["0%", "commission"],
              ["$0", "service fee"],
              [`${cards.length}`, "restaurants"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd>
                  <p className="num text-[32px] font-extrabold leading-none tracking-[-0.03em]">
                    {v}
                  </p>
                  <p className="mt-1.5 text-[13.5px] font-bold text-ink-2">{l}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------------- CTA */}
      <section className="bg-bg-2">
        <div className="mx-auto flex max-w-[1280px] flex-col items-start gap-5 px-4 py-12 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <h2 className="text-[24px] font-extrabold tracking-[-0.03em]">
              Hungry now?
            </h2>
            <p className="mt-1.5 text-[15.5px] text-ink-2">
              {cards.length} restaurants are taking orders in your area.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/restaurants"
              className="rounded-[10px] bg-brand px-6 py-3.5 text-[15.5px] font-extrabold text-brand-ink transition-colors hover:bg-brand-press"
            >
              Browse restaurants
            </Link>
            <Link
              href="/partners"
              className="rounded-[10px] border border-line-2 bg-card px-6 py-3.5 text-[15.5px] font-extrabold transition-colors hover:bg-card-2"
            >
              For Restaurants
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
