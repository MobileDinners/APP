import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, Faq, PageHero, SectionHead, Wrap } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Mobile Dinners Pricing for Restaurants",
  description:
    "Flat monthly pricing per location. 0% commission on every order, on every plan, forever. Processing billed at cost-plus.",
};

type Tier = {
  name: string;
  price: string;
  cadence: string;
  target: string;
  featured?: boolean;
  cta: { href: string; label: string };
};

const TIERS: Tier[] = [
  {
    name: "Starter",
    price: "$99",
    cadence: "per location / month",
    target: "One location, keeping the POS you already own",
    cta: { href: "/partners/signup", label: "Start free" },
  },
  {
    name: "Growth",
    price: "$299",
    cadence: "per location / month",
    target: "One location, running the whole stack on Mobile Dinners",
    featured: true,
    cta: { href: "/partners/signup", label: "Start free" },
  },
  {
    name: "Scale",
    price: "$599",
    cadence: "per location / month",
    target: "Two to nine locations under one brand",
    cta: { href: "/partners/signup", label: "Start free" },
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "negotiated",
    target: "Ten or more locations, franchise groups",
    cta: { href: "/partners/support#contact", label: "Talk to us" },
  },
];

/** Straight out of the business model, so the site and the spec cannot drift. */
const MATRIX: { row: string; cells: [string, string, string, string] }[] = [
  {
    row: "Commission on orders",
    cells: ["0%", "0%", "0%", "0%"],
  },
  {
    row: "Marketplace listing",
    cells: ["Included", "Included", "Included", "Included"],
  },
  {
    row: "Direct online ordering",
    cells: ["Yes", "Yes", "Yes", "Yes"],
  },
  {
    row: "Website + SEO",
    cells: ["Yes", "Yes", "Multi-location", "+ franchise microsites"],
  },
  {
    row: "POS terminals",
    cells: ["Add-on", "2 included", "5 included", "Negotiated"],
  },
  {
    row: "Square / Clover coexist",
    cells: ["Yes", "Yes", "Yes", "Yes"],
  },
  {
    row: "CRM profiles",
    cells: ["2,500", "Unlimited", "Unlimited", "Unlimited"],
  },
  {
    row: "SMS / email credits",
    cells: ["500 / 5,000", "3,000 / 50,000", "10,000 / unlimited", "Negotiated"],
  },
  {
    row: "Loyalty",
    cells: ["Single-brand", "+ cross-brand wallet", "+ custom tiers", "+ private currency"],
  },
  {
    row: "AI menu optimizer",
    cells: ["No", "Yes", "Yes", "Yes"],
  },
  {
    row: "AI labor scheduling",
    cells: ["No", "No", "Yes", "Yes"],
  },
  {
    row: "Offline gateway",
    cells: ["No", "Yes", "Yes", "Redundant pair"],
  },
  {
    row: "Accounting sync",
    cells: ["CSV", "QuickBooks / Xero", "+ multi-entity", "ERP integration"],
  },
  {
    row: "API access",
    cells: ["No", "Read", "Read + write", "Full + webhooks"],
  },
  {
    row: "Support",
    cells: ["Chat, 12h", "Chat + phone, 4h", "Priority, 1h", "Named CSM, SLA"],
  },
];

const HARDWARE = [
  { item: "Countertop terminal", buy: "$549", lease: "$39 / mo" },
  { item: "Kitchen display", buy: "$399", lease: "$29 / mo" },
  { item: "Offline gateway", buy: "$299", lease: "$22 / mo" },
  { item: "Receipt printer", buy: "$229", lease: "$18 / mo" },
  { item: "Card reader", buy: "$99", lease: "Not offered" },
];

const FAQS = [
  {
    q: "Is 0% commission a promotional rate?",
    a: "No. It is a term of the contract, not a launch offer. We make money on the subscription, the payment spread and optional add-ons, never on a percentage of an order. If we ever wanted to change that, it would require your written agreement to a new contract, and you could export everything and leave.",
  },
  {
    q: "What does card processing actually cost?",
    a: "2.6% + 10¢ card-present and 2.9% + 30¢ card-not-present, on every plan. That is cost-plus: interchange is roughly 2.15% + 7¢ blended, and the spread is our margin. Every payout statement itemises interchange separately from our spread, so you can check it.",
  },
  {
    q: "Do I have to replace my Square or Clover terminals?",
    a: "No. Coexist mode connects to your existing Square or Clover account, imports the catalog and pushes Mobile Dinners orders into your POS so the till still balances. Starter is priced for exactly this. You can migrate later, or never.",
  },
  {
    q: "Who pays the delivery fee?",
    a: "The diner pays $0.99 to $3.99 depending on distance, and you can choose to contribute a capped amount to lower it. You are never charged a percentage of the order for delivery, and you can turn delivery off and stay pickup-only at no cost.",
  },
  {
    q: "What happens to my customer data if I leave?",
    a: "You export it. Customer profiles, order history, menu versions and campaign results are yours, downloadable as CSV and available over the API on Growth and up. We do not sell restaurant data, and we do not use one restaurant's data to advantage another.",
  },
  {
    q: "Is there a contract or a setup fee?",
    a: "No setup fee. Annual billing is the published price; monthly billing is 20% higher. Cancel at any time, and annual plans are refunded pro rata for the unused months.",
  },
  {
    q: "How long does it take to go live?",
    a: "Signing up, adding a menu and publishing takes about an hour. Hardware ships in two business days. Migrating an existing POS with historical data is a scheduled cutover, usually inside a week.",
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Flat monthly. Zero per order."
        lede="You pay for software, once a month, per location. You never pay a percentage of a ticket: not on marketplace orders, not on delivery, not ever. Billed annually; monthly billing is 20% higher."
      />

      {/* ------------------------------------------------------------ the tiers */}
      <Wrap className="py-12 md:py-16">
        <div className="grid gap-4 lg:grid-cols-4">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-[18px] border p-6 ${
                t.featured
                  ? "border-brand bg-card shadow-[var(--shadow-md)] ring-1 ring-brand"
                  : "border-line bg-card"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[18px] font-extrabold">{t.name}</h2>
                {t.featured && <span className="badge badge-brand">Most chosen</span>}
              </div>
              <p className="num mt-3 text-[38px] font-extrabold leading-none tracking-[-0.035em]">
                {t.price}
              </p>
              <p className="mt-1.5 text-[13px] font-semibold text-ink-3">{t.cadence}</p>
              <p className="mt-4 min-h-[3.2em] text-[14px] leading-snug text-ink-2">
                {t.target}
              </p>
              <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-green-soft px-2.5 py-1 text-[12px] font-extrabold text-green">
                0% commission
              </span>
              <div className="min-h-6 flex-1" />
              <Link
                href={t.cta.href}
                className={`w-full ${
                  t.featured ? "btn btn-primary" : "btn btn-secondary"
                }`}
              >
                {t.cta.label}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-5 text-[13.5px] leading-relaxed text-ink-3">
          Card processing on every plan: <strong className="num font-bold text-ink-2">2.6% + 10¢</strong>{" "}
          card-present, <strong className="num font-bold text-ink-2">2.9% + 30¢</strong>{" "}
          card-not-present. Interchange is itemized separately from our spread on
          every payout statement.
        </p>
      </Wrap>

      {/* ----------------------------------------------------------- the matrix */}
      <Wrap className="pb-12 md:pb-16">
        <SectionHead
          eyebrow="Compare"
          title="What is in each plan"
          lede="No feature is gated behind a percentage of your revenue. The differences are volume, locations and depth of automation."
        />

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-16 bg-bg">
              <tr className="border-b border-line-2">
                <th className="w-[26%] py-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                  Feature
                </th>
                {TIERS.map((t) => (
                  <th
                    key={t.name}
                    className={`py-3 text-[13px] font-extrabold ${
                      t.featured ? "text-brand-strong" : ""
                    }`}
                  >
                    {t.name}
                    <span className="num ml-1.5 font-bold text-ink-3">{t.price}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((m) => (
                <tr key={m.row} className="border-b border-line">
                  <th
                    scope="row"
                    className="py-3 pr-4 text-left text-[14px] font-bold align-top"
                  >
                    {m.row}
                  </th>
                  {m.cells.map((c, i) => (
                    <td
                      key={i}
                      className={`py-3 pr-3 text-[13.5px] align-top ${
                        c === "No"
                          ? "text-ink-3"
                          : c === "0%"
                            ? "num font-extrabold text-green"
                            : "text-ink-2"
                      }`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Wrap>

      {/* --------------------------------------------------------- the math bit */}
      <section className="bg-bg-2 py-14 md:py-20">
        <Wrap>
          <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-14">
            <div>
              <SectionHead
                eyebrow="The comparison that matters"
                title="A $900,000 restaurant, side by side"
                lede="Half the sales going through a third-party marketplace at 25%. Everything else held equal. This is the whole pitch, in one table."
              />
            </div>

            <div className="rounded-[18px] border border-line bg-card p-6">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line-2">
                    <th className="pb-2.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                      Annual
                    </th>
                    <th className="pb-2.5 text-right text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                      Aggregator stack
                    </th>
                    <th className="pb-2.5 text-right text-[12px] font-extrabold uppercase tracking-[0.1em] text-brand-strong">
                      Mobile Dinners
                    </th>
                  </tr>
                </thead>
                <tbody className="num">
                  {[
                    ["Sales", "$900,000", "$900,000"],
                    ["Marketplace commission", "−$112,500", "$0"],
                    ["POS software", "−$1,428", "included"],
                    ["Website + ordering", "−$3,588", "included"],
                    ["Email + SMS", "−$2,400", "included"],
                    ["Loyalty", "−$2,400", "included"],
                    ["Mobile Dinners plan", "$0", "−$3,588"],
                    ["Card processing", "−$24,300", "−$24,300"],
                  ].map(([label, a, b]) => (
                    <tr key={label} className="border-b border-line">
                      <td className="py-2.5 text-[14px] font-semibold text-ink-2">{label}</td>
                      <td className="py-2.5 text-right text-[14px] font-bold">{a}</td>
                      <td className="py-2.5 text-right text-[14px] font-bold">{b}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pt-3.5 text-[14px] font-extrabold">Kept</td>
                    <td className="pt-3.5 text-right text-[17px] font-extrabold text-red">
                      $753,384
                    </td>
                    <td className="pt-3.5 text-right text-[17px] font-extrabold text-green">
                      $872,112
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
                $450,000 of the sales go through a marketplace at 25%. Processing is
                2.7% blended on both sides, so it is not a difference. It is shown so
                the totals reconcile. Growth plan at $299 × 12.
              </p>
            </div>
          </div>
        </Wrap>
      </section>

      {/* --------------------------------------------------------------- hardware */}
      <Wrap className="py-14 md:py-20">
        <SectionHead
          eyebrow="Hardware"
          title="Buy it or lease it"
          lede="Nothing here is required to start. You can run the whole system on a tablet you already own and add hardware when the volume justifies it."
        />
        <div className="mt-7 overflow-x-auto">
          <table className="w-full min-w-[420px] max-w-[620px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line-2">
                <th className="pb-2.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                  Item
                </th>
                <th className="pb-2.5 text-right text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                  Buy
                </th>
                <th className="pb-2.5 text-right text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                  Lease
                </th>
              </tr>
            </thead>
            <tbody>
              {HARDWARE.map((h) => (
                <tr key={h.item} className="border-b border-line">
                  <td className="py-3 text-[14.5px] font-bold">{h.item}</td>
                  <td className="num py-3 text-right text-[14.5px]">{h.buy}</td>
                  <td className="num py-3 text-right text-[14.5px] text-ink-2">{h.lease}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Wrap>

      {/* -------------------------------------------------------------------- faq */}
      <Wrap className="pb-4">
        <SectionHead eyebrow="Questions" title="The ones that decide it" />
        <div className="mt-7">
          <Faq items={FAQS} />
        </div>
      </Wrap>

      <CtaBand
        title="Run the numbers on your own volume"
        lede="The calculator on the home page uses your order count and your average ticket. If the answer is not obviously worth it, do not switch."
        primary={{ href: "/partners/signup", label: "Start free" }}
        secondary={{ href: "/", label: "Open the calculator" }}
      />
    </>
  );
}
