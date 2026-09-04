import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, Card, Eyebrow, PageHero, SectionHead, Stat, Wrap } from "@/components/marketing";

export const metadata: Metadata = {
  title: "About — Mobile Dinners",
  description:
    "Why a zero-commission marketplace has to own the point of sale, and what we will and will not do with a restaurant's customers.",
};

const PRINCIPLES = [
  {
    h: "The restaurant owns the customer",
    p: "Every order produces a profile in the restaurant's database, exportable at any time. We do not hold guest contact details hostage, and one restaurant's customers are never marketed to on behalf of another.",
  },
  {
    h: "Zero commission is a term, not a promotion",
    p: "It is written into the contract. We are paid by subscription, by a disclosed payment spread and by optional add-ons. Changing that would require a new contract you have to sign.",
  },
  {
    h: "Ranking is not for sale — much",
    p: "The feed ranks by relevance, distance and real prep times. Sponsored slots exist, are labelled, and are capped at one card in ten. If that cap ever moves, it moves in public.",
  },
  {
    h: "Show the number, including when it is bad",
    p: "Campaigns report lift against a holdout. The optimizer reports a confidence interval. When a recommendation was wrong, the decision log says so. Software that only reports its wins is a slot machine.",
  },
];

const TIMELINE = [
  {
    when: "The problem",
    what: "A 25% commission on a business with 6% margins",
    detail:
      "For most independent restaurants, marketplace orders are not incremental profit — they are volume sold at a loss, subsidised by the dine-in room. Owners know this. They stay because the demand is real and the alternative is invisibility.",
  },
  {
    when: "The false start",
    what: "Direct-ordering tools that nobody visits",
    detail:
      "A commission-free website only helps if guests go to it. Selling a restaurant its own ordering page and leaving it to generate its own demand moves the cost from commission to marketing, and usually costs more.",
  },
  {
    when: "The insight",
    what: "You cannot be free unless you own the rails",
    detail:
      "Demand has to sit on top of the point of sale, not beside it. Owning the POS, the menu of record and the payments means the marketplace can be run at cost — the subscription and the payment spread already pay for it. That is why this is one system and not five integrations.",
  },
  {
    when: "Now",
    what: "One system, three surfaces, one database",
    detail:
      "Operations, growth and demand, split by how badly each fails, running against one menu of record and one customer record. Everything on this site is the live build — place an order and watch it cross all three surfaces.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Built for the six percent margin"
        lede="Mobile Dinners exists because the tools a restaurant needs to find customers are priced as if restaurants had software margins. They do not. So we built the demand layer on top of the operations layer, and charged for the software instead of the food."
      />

      {/* -------------------------------------------------------------- why band */}
      <section id="why" className="scroll-mt-24 bg-ink py-16 text-bg md:py-24">
        <Wrap>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-brand-strong">
            Why we exist
          </p>
          <h2 className="mt-3 max-w-[22ch] text-balance text-[32px] font-extrabold leading-[1.06] tracking-[-0.035em] md:text-[46px]">
            A 25% cut of a 6% margin business is not a fee. It is the business.
          </h2>
          <p className="mt-5 max-w-[64ch] text-[17px] leading-relaxed opacity-72">
            On a $42 delivery order, a typical marketplace keeps about $10.50. The
            food cost is roughly $13. Labour is roughly $12. Rent, utilities,
            insurance and card processing take most of what is left. The restaurant
            is doing the hardest part of the transaction and ending the day behind.
          </p>

          <dl className="mt-12 grid grid-cols-2 gap-8 border-t border-bg/15 pt-10 md:grid-cols-4">
            {[
              { v: "$10.50", l: "Kept by a marketplace", n: "On a $42 delivery order at 25%" },
              { v: "6%", l: "Typical net margin", n: "Independent full-service restaurant" },
              { v: "5", l: "Vendors replaced", n: "POS, site, email, loyalty, marketplace" },
              { v: "0%", l: "What we take per order", n: "On every plan, in the contract" },
            ].map((s) => (
              <div key={s.l}>
                <dt className="sr-only">{s.l}</dt>
                <dd>
                  <p className="num text-[32px] font-extrabold leading-none tracking-[-0.03em] md:text-[40px]">
                    {s.v}
                  </p>
                  <p className="mt-2 text-[14px] font-bold">{s.l}</p>
                  <p className="mt-1 text-[13px] leading-snug opacity-55">{s.n}</p>
                </dd>
              </div>
            ))}
          </dl>
        </Wrap>
      </section>

      {/* -------------------------------------------------------------- timeline */}
      <Wrap className="py-16 md:py-24">
        <SectionHead
          eyebrow="How we got here"
          title="Four steps to a fairly unusual architecture"
          lede="This is a sequence, not a list — each step only makes sense because the one before it failed."
        />

        <ol className="m-0 mt-10 grid list-none gap-0 p-0">
          {TIMELINE.map((t, i) => (
            <li
              key={t.when}
              className="grid gap-3 border-t border-line py-8 md:grid-cols-[200px_1fr] md:gap-10"
            >
              <div>
                <span className="num text-[12px] font-extrabold uppercase tracking-[0.12em] text-brand-strong">
                  {String(i + 1).padStart(2, "0")} · {t.when}
                </span>
              </div>
              <div>
                <h3 className="text-[21px] font-extrabold tracking-[-0.025em]">{t.what}</h3>
                <p className="mt-2.5 max-w-[70ch] text-[15.5px] leading-relaxed text-ink-2">
                  {t.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Wrap>

      {/* ------------------------------------------------------------ principles */}
      <section className="bg-bg-2 py-14 md:py-20">
        <Wrap>
          <SectionHead
            eyebrow="What we commit to"
            title="Four promises that are checkable"
            lede="Each of these is either in the contract or visible in the product. A principle you cannot verify is a slogan."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <Card key={p.h}>
                <Eyebrow>{String(i + 1).padStart(2, "0")}</Eyebrow>
                <h3 className="mt-2 text-[19px] font-extrabold tracking-[-0.02em]">{p.h}</h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-2">{p.p}</p>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-[14px] text-ink-3">
            The specifics live in the{" "}
            <Link href="/terms#commission" className="font-bold text-brand-strong">
              commission pledge
            </Link>{" "}
            and the{" "}
            <Link href="/privacy#data" className="font-bold text-brand-strong">
              data ownership section
            </Link>
            .
          </p>
        </Wrap>
      </section>

      {/* ----------------------------------------------------------- honest bit */}
      <Wrap className="py-16 md:py-24">
        <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-14">
          <SectionHead
            eyebrow="Where we are"
            title="What is built, and what is not"
            lede="This build runs fourteen modules end to end against a real database, with its own test suites. Two things a real business needs are still in progress, and pretending otherwise would be the first broken promise."
          />
          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <span className="badge badge-green">Shipping</span>
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[14px] text-ink-2">
                  {[
                    "Unified POS + order log",
                    "Menu of record + publishing",
                    "Kitchen display",
                    "Marketplace + storefronts",
                    "CRM + segments",
                    "Campaigns with holdouts",
                    "Loyalty wallet",
                    "Upsell engine",
                    "Menu optimizer",
                    "Site builder + SEO audit",
                    "Square / Clover coexist",
                  ].map((x) => (
                    <li key={x} className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-green" />
                      {x}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <span className="badge badge-muted">In build</span>
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[14px] text-ink-2">
                  {[
                    "Card payments and payouts",
                    "Courier dispatch and batching",
                    "AI labor scheduling",
                    "Multi-location rollups",
                    "Public API + webhooks",
                  ].map((x) => (
                    <li key={x} className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" />
                      {x}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
            <p className="mt-4 text-[13.5px] leading-relaxed text-ink-3">
              Until payments ship, orders on this build settle without moving money.
              That is stated on the checkout screen too, not only here.
            </p>
          </div>
        </div>
      </Wrap>

      {/* ---------------------------------------------------------------- facts */}
      <Wrap className="pb-4">
        <div className="rounded-[20px] border border-line bg-card p-7">
          <h2 className="text-[18px] font-extrabold">The company</h2>
          <dl className="mt-5 grid gap-6 sm:grid-cols-3">
            <div>
              <dt className="sr-only">Headquarters</dt>
              <dd>
                <Stat value="SF" label="Headquarters" note="San Francisco, California" />
              </dd>
            </div>
            <div>
              <dt className="sr-only">Founded</dt>
              <dd>
                <Stat value="2025" label="Founded" note="First restaurant live the same year" />
              </dd>
            </div>
            <div>
              <dt className="sr-only">Model</dt>
              <dd>
                <Stat value="SaaS" label="How we get paid" note="Subscription, not a cut of dinner" />
              </dd>
            </div>
          </dl>
        </div>
      </Wrap>

      <CtaBand
        title="Read the terms before you believe the pitch"
        lede="The commission pledge and the data ownership section are the two that matter. They are short, and they are written to be read."
        primary={{ href: "/terms#commission", label: "Commission pledge" }}
        secondary={{ href: "/partners/signup", label: "Start free" }}
      />
    </>
  );
}
