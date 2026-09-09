import Link from "next/link";
import type { Metadata } from "next";
import { listRestaurants } from "@/lib/orders";
import { publishedMenu } from "@/lib/menu";
import { Faq, SectionHead, Stat } from "@/components/marketing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About Mobile Dinners",
  description:
    "Why there are no service fees, how one points wallet works across every restaurant, and what happens to your data.",
};

/**
 * Diner-facing about page. The merchant version at /partners/about argues the
 * business case to an owner; this one answers the only question a diner
 * actually has, which is why this app is cheaper and whether that lasts.
 */

const FAQS = [
  {
    q: "So what is the catch?",
    a: "There is a business model. It is just not you. Restaurants pay a flat monthly subscription for the software, covering the point of sale, website, kitchen display and marketing tools, and the marketplace comes with it. We also make a small, disclosed margin on card processing. Nobody takes a percentage of your dinner.",
  },
  {
    q: "Is this going to get more expensive later?",
    a: "The zero-commission promise is written into the restaurant contract, not offered as a launch rate. Adding a per-order fee would require every restaurant to sign a new agreement. That is a deliberately high bar, and it is public: see section 2 of the Terms.",
  },
  {
    q: "Are the restaurants any good?",
    a: "They are the same restaurants. This is not a separate class of cheaper places. It is independent kitchens who would rather keep the ticket than hand over a quarter of it. Ranking in the feed is by relevance, distance and real prep times, not by who paid for placement.",
  },
];

export default function ConsumerAboutPage() {
  const live = listRestaurants().filter((r) => publishedMenu(r.orgId).length > 0);

  return (
    <main className="mx-auto max-w-[820px] px-4 pb-6 pt-6 md:px-6">
      <h1 className="text-[32px] font-extrabold leading-[1.08] tracking-[-0.03em] md:text-[42px]">
        The food costs what the restaurant says it costs
      </h1>
      <p className="mt-3 max-w-[58ch] text-[16.5px] leading-relaxed text-ink-2">
        Mobile Dinners is a food marketplace that takes no commission from
        restaurants. That single decision is why there is no service fee on your
        receipt and why the menu price matches the one on the wall.
      </p>

      {/* ------------------------------------------------------------ the maths */}
      <section className="mt-9 rounded-[20px] bg-ink p-6 text-bg md:p-8">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-brand">
          Why it is cheaper here
        </p>
        <h2 className="mt-2 max-w-[24ch] text-balance text-[24px] font-extrabold leading-[1.12] tracking-[-0.025em] md:text-[32px]">
          A 25% commission does not come out of the restaurant. It comes out of
          the menu.
        </h2>
        <p className="mt-4 max-w-[62ch] text-[15.5px] leading-relaxed opacity-75">
          Restaurants run on thin margins, so when an app takes a quarter of the order
          they raise their prices on that app to survive it, commonly by 10% to 20%. Then a service fee is added on top of the marked-up price, and
          tax is charged on all of it. You never see any of that itemized. Here
          there is no commission, so there is nothing to mark up.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[14px] bg-bg/[0.06] p-4">
            <p className="text-[12px] font-bold uppercase tracking-wider opacity-60">
              A $38 order elsewhere
            </p>
            <p className="num mt-1 text-[26px] font-extrabold">$57.07</p>
            <p className="mt-1 text-[13px] opacity-60">
              markup + service fee + delivery + tax
            </p>
          </div>
          <div className="rounded-[14px] bg-bg/[0.06] p-4">
            <p className="text-[12px] font-bold uppercase tracking-wider opacity-60">
              The same order here
            </p>
            <p className="num mt-1 text-[26px] font-extrabold text-brand">$43.32</p>
            <p className="mt-1 text-[13px] opacity-60">delivery + tax, nothing else</p>
          </div>
        </div>

        <Link
          href="/how-it-works"
          className="mt-5 inline-block text-[14.5px] font-extrabold text-brand hover:underline"
        >
          See the full breakdown →
        </Link>
      </section>

      {/* --------------------------------------------------------------- stats */}
      <dl className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4">
        <div>
          <dt className="sr-only">Service fee</dt>
          <dd><Stat value="$0" label="Service fee" note="On every order" /></dd>
        </div>
        {/*
          A "0% taken from restaurants" tile used to sit here. It is true, and
          it answers a question a diner never asked — what we charge a kitchen
          belongs on the partner site, next to the pricing it explains.
        */}
        {live.length > 0 && (
          <div>
            <dt className="sr-only">Restaurants</dt>
            <dd>
              <Stat
                value={live.length.toLocaleString()}
                label="Restaurants live"
                note="Taking orders right now"
              />
            </dd>
          </div>
        )}
        <div>
          <dt className="sr-only">Points</dt>
          <dd><Stat value="1" label="Points wallet" note="Works at all of them" /></dd>
        </div>
      </dl>

      {/* -------------------------------------------------------------- points */}
      <section className="mt-10">
        <SectionHead
          eyebrow="One wallet"
          title="Points from the taqueria buy the bakery"
          lede="Most loyalty programs trap you in one restaurant, so you end up with four half-full cards. Here there is one balance and it works everywhere on the network."
        />
        <Link
          href="/rewards"
          className="mt-4 inline-block text-[15px] font-extrabold text-brand-strong hover:underline"
        >
          See your points →
        </Link>
      </section>

      {/* ---------------------------------------------------------------- data */}
      <section className="mt-10 card p-6">
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em]">
          What happens to your details
        </h2>
        <ul className="m-0 mt-4 grid list-none gap-2.5 p-0">
          {[
            "The restaurant you ordered from gets your name, phone number and delivery address. That is how they reach you, and how a regular gets recognized.",
            "No other restaurant sees them, and we never market one restaurant's customers on behalf of another.",
            "We do not sell your data to anyone.",
            "We never store your card number. Payments are tokenized by the processor.",
          ].map((b) => (
            <li key={b} className="flex gap-2.5 text-[14.5px] leading-snug text-ink-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {b}
            </li>
          ))}
        </ul>
        <Link
          href="/privacy"
          className="mt-4 inline-block text-[14px] font-extrabold text-brand-strong hover:underline"
        >
          Read the Privacy Policy →
        </Link>
      </section>

      {/* ----------------------------------------------------------------- faq */}
      <section className="mt-10">
        <SectionHead eyebrow="Fair questions" title="The ones worth asking" />
        <div className="mt-5">
          <Faq items={FAQS} />
        </div>
      </section>

      <section className="mt-10 rounded-[16px] border border-line bg-bg-2 p-5">
        <h2 className="text-[16px] font-extrabold">Run a restaurant?</h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">
          The other half of this is a point of sale, a website builder, a CRM and a
          kitchen display, with no commission on anything sold through it.
        </p>
        <Link
          href="/partners"
          className="mt-3 inline-block text-[14px] font-extrabold text-brand-strong hover:underline"
        >
          Mobile Dinners for Restaurants →
        </Link>
      </section>

      {/*
        "This build is a demonstration environment. The restaurants, orders and
        figures shown across the app are generated fixtures" closed this page.
        On an About page — the one a customer opens to decide whether we are a
        real company — that sentence answers the question with "no".
      */}
    </main>
  );
}
