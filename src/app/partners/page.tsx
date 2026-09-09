import Link from "next/link";
import type { Metadata } from "next";
import { listRestaurants } from "@/lib/orders";
import { publishedMenu } from "@/lib/menu";
import { CommissionCalculator } from "@/components/CommissionCalculator";
import { CtaBand, Card, Eyebrow, SectionHead, Stat, Wrap } from "@/components/marketing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mobile Dinners for Restaurants",
  description:
    "One system replaces your point of sale, your website, your marketing stack and your delivery apps. Restaurants keep 100% of every order.",
};

/** The three planes, straight out of the architecture. */
const PLANES = [
  {
    tag: "Plane A",
    name: "Operations",
    line: "Must never fail",
    blurb:
      "Point of sale, kitchen display, order routing, printers and the offline gateway. If the internet drops, the restaurant keeps taking money and the queue replays when it comes back.",
    items: ["Unified POS", "Kitchen display", "Offline gateway", "Accounting sync"],
  },
  {
    tag: "Plane B",
    name: "Growth",
    line: "Must be measurable",
    blurb:
      "Website, CRM, SMS and email, loyalty, upsells and the menu optimizer. Every campaign runs against a holdout, so the number you are shown is lift, not credit taken for orders you would have got anyway.",
    items: ["AI site builder", "CRM + segments", "Campaigns with holdouts", "Menu optimizer"],
  },
  {
    tag: "Plane C",
    name: "Demand",
    line: "Must be fair",
    blurb:
      "The marketplace. Diners browse every restaurant in one app, restaurants pay nothing per order, and one points wallet works across all of them.",
    items: ["0% commission", "Cross-brand points", "Live kitchen status", "Own the guest data"],
  },
];

const REPLACES = [
  { name: "Toast / Square", role: "Point of sale", cost: "$69 to $165 / mo + hardware" },
  { name: "Owner / BentoBox", role: "Website + ordering", cost: "$199 to $499 / mo" },
  { name: "Klaviyo / Attentive", role: "Email + SMS", cost: "$100 to $500 / mo" },
  { name: "Punchh / Thanx", role: "Loyalty", cost: "$150 to $400 / mo" },
  { name: "DoorDash / UberEats", role: "Marketplace demand", cost: "15% to 30% of every order" },
  { name: "Spreadsheets", role: "Menu pricing, labor", cost: "Hours a week" },
];

export default function MarketingHome() {
  // The company site quotes the live system, not a copywriter's guess.
  const live = listRestaurants().filter((r) => publishedMenu(r.orgId).length > 0);
  const dishCount = live.reduce((n, r) => n + publishedMenu(r.orgId).length, 0);

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="border-b border-line bg-bg-2">
        <Wrap className="grid items-start gap-10 py-12 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-[12.5px] font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-green" />
              Zero commission. Written into the terms.
            </span>

            <h1 className="mt-5 text-balance text-[42px] font-extrabold leading-[1.02] tracking-[-0.045em] md:text-[68px]">
              Your restaurant.{" "}
              <span className="text-brand-strong">Your customers.</span> Your money.
            </h1>

            <p className="mt-5 max-w-[54ch] text-[17.5px] leading-relaxed text-ink-2 md:text-[20px]">
              Mobile Dinners is the point of sale, the website, the marketing stack
              and the delivery marketplace in one system. Diners order in an app
              that works like the ones they already use. You keep 100% of the
              ticket.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/partners/signup"
                className="rounded-full bg-brand px-6 py-3.5 text-[15.5px] font-extrabold text-brand-ink transition-colors hover:bg-brand-press"
              >
                Start free
              </Link>
              <Link
                href="/"
                className="rounded-full border border-line-2 bg-card px-6 py-3.5 text-[15.5px] font-extrabold transition-colors hover:bg-card-2"
              >
                Order food →
              </Link>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-5 border-t border-line pt-7">
              <div>
                <dt className="sr-only">Commission</dt>
                <dd>
                  <Stat value="0%" label="Commission, always" />
                </dd>
              </div>
              <div>
                <dt className="sr-only">Restaurants live</dt>
                <dd>
                  <Stat
                    value={live.length.toLocaleString()}
                    label="Restaurants live"
                    note="On this build, right now"
                  />
                </dd>
              </div>
              <div>
                <dt className="sr-only">Dishes on sale</dt>
                <dd>
                  <Stat value={dishCount.toLocaleString()} label="Dishes on sale" />
                </dd>
              </div>
            </dl>
          </div>

          <CommissionCalculator />
        </Wrap>
      </section>

      {/* ------------------------------------------------------------- replaces */}
      <Wrap className="py-16 md:py-24">
        <SectionHead
          eyebrow="One system"
          title="Six vendors, six invoices, six systems that don't talk"
          lede="Most restaurants run their business across half a dozen tools that each own a piece of the customer. Mobile Dinners is one login, one database, one bill."
        />

        <div className="mt-9 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line-2">
                <th className="pb-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                  What you pay for today
                </th>
                <th className="pb-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                  Job
                </th>
                <th className="pb-3 text-right text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                  Typical cost
                </th>
                <th className="pb-3 pl-6 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                  Mobile Dinners
                </th>
              </tr>
            </thead>
            <tbody>
              {REPLACES.map((r) => (
                <tr key={r.name} className="border-b border-line">
                  <td className="py-3.5 text-[15px] font-bold">{r.name}</td>
                  <td className="py-3.5 text-[14.5px] text-ink-2">{r.role}</td>
                  <td className="num py-3.5 text-right text-[14.5px] text-ink-2">{r.cost}</td>
                  <td className="py-3.5 pl-6">
                    <span className="badge badge-green">Included</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Wrap>

      {/* ---------------------------------------------------------- three planes */}
      <section className="bg-ink py-16 text-bg md:py-24">
        <Wrap>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-brand-strong">
            Architecture
          </p>
          <h2 className="mt-2 max-w-[24ch] text-balance text-[30px] font-extrabold leading-[1.08] tracking-[-0.03em] md:text-[42px]">
            Built as three planes, because they fail differently
          </h2>
          <p className="mt-4 max-w-[62ch] text-[16.5px] leading-relaxed opacity-70">
            A marketing campaign going down should never stop a kitchen. So the
            system is split by consequence: operations, growth, demand. Each plane
            has its own failure budget, and nothing in Plane B or C can take Plane
            A with it.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PLANES.map((p) => (
              <div
                key={p.tag}
                className="rounded-[18px] border border-bg/15 bg-bg/[0.04] p-6"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-strong">
                    {p.tag}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-50">
                    {p.line}
                  </span>
                </div>
                <h3 className="mt-2 text-[24px] font-extrabold tracking-[-0.02em]">
                  {p.name}
                </h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed opacity-72">{p.blurb}</p>
                <ul className="m-0 mt-4 grid list-none gap-1.5 p-0">
                  {p.items.map((i) => (
                    <li key={i} className="flex items-center gap-2 text-[13.5px] font-semibold">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-brand" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* ------------------------------------------------------------------- ai */}
      <Wrap className="py-16 md:py-24">
        <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-14">
          <div>
            <SectionHead
              eyebrow="AI that shows its work"
              title="Every recommendation comes with the number behind it"
              lede="The optimizer does not tell you to 'consider raising prices'. It tells you which item, to what price, what it expects to happen to volume, and how confident it is, then logs the decision so you can check it in three weeks."
            />
            <Link
              href="/partners/features#ai"
              className="mt-5 inline-block text-[15px] font-extrabold text-brand-strong hover:underline"
            >
              How the AI layer works →
            </Link>
          </div>

          <Card className="bg-bg-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-3">
              Menu optimizer · sample recommendation
            </p>
            <div className="mt-4 rounded-[14px] bg-card p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[16px] font-extrabold">Al Pastor Tacos</h3>
                <span className="badge badge-green">High confidence</span>
              </div>
              <p className="num mt-2 text-[15px] font-bold">
                $6.50 <span className="text-ink-3">→</span> $6.95
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-ink-3">Est. volume change</dt>
                <dd className="num text-right font-bold">−3.1%</dd>
                <dt className="text-ink-3">Est. margin change</dt>
                <dd className="num text-right font-bold text-green">+$412 / mo</dd>
                <dt className="text-ink-3">95% interval</dt>
                <dd className="num text-right font-bold">$180 to $640</dd>
                <dt className="text-ink-3">Elasticity prior</dt>
                <dd className="num text-right font-bold">−0.85 (signature)</dd>
              </dl>
            </div>
            <p className="mt-3.5 text-[13px] leading-relaxed text-ink-3">
              Recommendations are logged with their inputs and the model version.
              Three weeks later the dashboard shows what actually happened next to what
              was predicted, including the times it was wrong.
            </p>
          </Card>
        </div>
      </Wrap>

      {/* ------------------------------------------------------------ two sides */}
      <Wrap className="pb-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border border-line bg-card p-7">
            <Eyebrow>For restaurants</Eyebrow>
            <h2 className="mt-2 text-[26px] font-extrabold tracking-[-0.025em]">
              Take orders in about an hour
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              Sign up, add your menu, publish. Your storefront, marketplace listing and
              kitchen display all come from the same menu, so you publish once and every
              surface updates together.
            </p>
            <Link href="/partners/signup" className="btn btn-primary mt-5 w-full">
              Create a restaurant account
            </Link>
          </div>

          <div className="rounded-[20px] border border-line bg-card p-7">
            <Eyebrow>For diners</Eyebrow>
            <h2 className="mt-2 text-[26px] font-extrabold tracking-[-0.025em]">
              In-store prices, no service fee
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              Restaurants do not have to mark up a menu to survive a 30% cut, so the
              price you see is the price on the wall. Points earned anywhere spend
              everywhere.
            </p>
            <Link href="/" className="btn btn-secondary mt-5 w-full">
              Browse restaurants
            </Link>
          </div>
        </div>
      </Wrap>

      <CtaBand />
    </>
  );
}
