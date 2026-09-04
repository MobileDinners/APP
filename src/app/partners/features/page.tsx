import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, Card, Eyebrow, PageHero, SectionHead, Wrap } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Features — Mobile Dinners",
  description:
    "POS, kitchen display, menu of record, website builder, CRM, campaigns with holdouts, loyalty, upsell engine, menu optimizer, Square and Clover coexist mode.",
};

type Feature = {
  id: string;
  name: string;
  plane: "Operations" | "Growth" | "Demand";
  line: string;
  body: string;
  bullets: string[];
  status: "Live" | "In build";
};

const FEATURES: Feature[] = [
  {
    id: "pos",
    name: "Unified point of sale",
    plane: "Operations",
    line: "One order object from counter to kitchen to payout",
    body:
      "Counter, phone, marketplace and your own website all produce the same order record, priced against the same menu version and routed by the same rules. There is no separate 'online orders' tablet to reconcile at close.",
    bullets: [
      "Append-only event log — the order's state is a fold over its history, never an overwrite",
      "Offline gateway keeps taking orders when the internet drops, replays on reconnect",
      "Square and Clover coexist mode: keep your terminals, push our orders into your till",
      "Integer cents end to end — no floating point anywhere near money",
    ],
    status: "Live",
  },
  {
    id: "menu",
    name: "Menu of record",
    plane: "Operations",
    line: "Publish once, every surface changes together",
    body:
      "The menu you edit is a draft. Publishing freezes it into an immutable, content-hashed version, and every order records which version it was priced against. Change a price tomorrow and it cannot rewrite what a guest agreed to pay today.",
    bullets: [
      "Draft vs published, with a diff before you commit",
      "Availability is live — 86 an item and it greys out instantly, no republish needed",
      "Claims filter blocks allergen and health claims from ever reaching a guest",
      "Items that have been ordered can be hidden, never deleted, so receipts stay intact",
    ],
    status: "Live",
  },
  {
    id: "kds",
    name: "Kitchen display",
    plane: "Operations",
    line: "Station routing, bump bars, and a clock that is honest",
    body:
      "Tickets route to the station that actually cooks the item. The line sees elapsed time against the promise made to the guest, not a generic timer, so late is visible before it is a refund.",
    bullets: [
      "Per-station queues with item-level bumping",
      "Live promise clock — the same number the guest is watching",
      "Order state changes fan out over a live connection, no polling",
    ],
    status: "Live",
  },
  {
    id: "site",
    name: "AI website builder",
    plane: "Growth",
    line: "A real site, generated from your menu, with an SEO audit",
    body:
      "Generates a full page model — hero, story, menu highlights, hours, location, FAQ — from what is already in your account. It is a draft you edit, not a template you fill in, and it runs a copy audit before it will publish.",
    bullets: [
      "Draft / published split, same discipline as the menu",
      "Claims filter refuses to publish allergen or health claims",
      "SEO audit checks title length, description, headings, schema and image alt text",
      "Your own domain, your own guest data, your own conversion tracking",
    ],
    status: "Live",
  },
  {
    id: "crm",
    name: "CRM and customer profiles",
    plane: "Growth",
    line: "Every guest, every order, in your database — not theirs",
    body:
      "A marketplace order is not an anonymous ticket. It is a customer profile with contact details, order history, favourite items, spend and a lifecycle stage you own outright and can export at any time.",
    bullets: [
      "Automatic lifecycle segmentation: new, active, at-risk, lapsed, VIP",
      "Recency, frequency and monetary scoring on real order history",
      "Segment builder that feeds campaigns directly",
      "CSV export and API access — leaving is not a hostage negotiation",
    ],
    status: "Live",
  },
  {
    id: "campaigns",
    name: "Campaigns with holdouts",
    plane: "Growth",
    line: "Incrementality, not attribution",
    body:
      "Every campaign randomly holds back a control group. The number you are shown is treated minus holdout with a confidence interval — the revenue that would not have happened otherwise, rather than credit for orders you were getting anyway.",
    bullets: [
      "SMS and email, with quiet hours and frequency caps enforced in code",
      "Welch two-sample confidence interval on every result",
      "Templates for win-back, birthday, new-item and lapsed-VIP",
      "A result that is not significant is labelled not significant",
    ],
    status: "Live",
  },
  {
    id: "loyalty",
    name: "Cross-restaurant loyalty",
    plane: "Demand",
    line: "One wallet, every restaurant on the network",
    body:
      "Points earned at a taqueria spend at a bakery. It costs each restaurant less than a single-brand programme and gives the diner a reason to stay inside the network instead of drifting to an aggregator.",
    bullets: [
      "One points balance across every restaurant",
      "Per-restaurant earn multipliers you control",
      "Redemption capped per order so a wallet cannot zero out a ticket",
      "Full ledger — every point earned, spent and expired is an entry you can audit",
    ],
    status: "Live",
  },
  {
    id: "upsell",
    name: "Upsell engine",
    plane: "Growth",
    line: "Co-purchase lift, measured against a control",
    body:
      "Suggests the item that actually goes with what is in the cart, ranked by lift — how much more likely B is given A, versus B on its own — not by raw co-occurrence, which just recommends whatever is popular.",
    bullets: [
      "Lift ranking, so the fries do not get recommended to everyone forever",
      "Every impression randomised into treated or control",
      "Measured attach rate and revenue per cart, per suggestion",
    ],
    status: "Live",
  },
  {
    id: "ai",
    name: "AI menu optimizer",
    plane: "Growth",
    line: "A price, a predicted effect, and an interval",
    body:
      "Reads your item costs, prep times and sales history, and proposes specific price and menu-position changes with the expected margin effect and a confidence interval. Every decision is logged with its inputs so you can check it later.",
    bullets: [
      "Item-level elasticity priors by role: signature, staple, commodity",
      "Margin and volume effects reported separately",
      "Confidence intervals, not point estimates dressed as certainty",
      "Decision log — predictions sit next to what actually happened",
    ],
    status: "Live",
  },
  {
    id: "marketplace",
    name: "0% marketplace",
    plane: "Demand",
    line: "Aggregator demand without the aggregator tax",
    body:
      "Diners get the app experience they expect — browse, filter, track, reorder — and restaurants keep the entire ticket. Ranking is by relevance and real prep times, not by who paid for placement.",
    bullets: [
      "No commission on any order, on any plan",
      "Live kitchen status feeds real ETAs instead of optimistic guesses",
      "Sponsored slots, when they exist, are labelled and capped at one card in ten",
    ],
    status: "Live",
  },
  {
    id: "payments",
    name: "Payments and payouts",
    plane: "Operations",
    line: "Cost-plus processing with an itemised statement",
    body:
      "Card processing at 2.6% + 10¢ card-present and 2.9% + 30¢ card-not-present, with interchange itemised separately from our spread on every payout so the number is checkable rather than trusted.",
    bullets: [
      "Next-day payouts",
      "Tokenised cards — no card number ever touches our database",
      "Refunds and partial refunds from the same order timeline",
    ],
    status: "In build",
  },
  {
    id: "dispatch",
    name: "Delivery and dispatch",
    plane: "Demand",
    line: "Your own drivers, gig couriers, or both",
    body:
      "Assigns a courier by distance, current load and how close the food is to ready, and batches nearby orders where it does not hurt the promise. Diners pay a flat fee by distance; you are never charged a percentage.",
    bullets: [
      "Staff drivers and gig couriers in one queue",
      "Batching only when it does not push either order past its promise",
      "Live courier position on the guest's tracking page",
    ],
    status: "In build",
  },
];

const PLANE_TONE: Record<Feature["plane"], string> = {
  Operations: "badge badge-blue",
  Growth: "badge badge-amber",
  Demand: "badge badge-green",
};

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Twelve systems that used to be twelve vendors"
        lede="Everything below runs against one database, one menu of record and one customer record. That is the whole reason the numbers reconcile at the end of the night."
      >
        <div className="flex flex-wrap gap-2">
          {(["Operations", "Growth", "Demand"] as const).map((p) => (
            <span key={p} className={PLANE_TONE[p]}>
              {p}
            </span>
          ))}
          <span className="badge badge-muted">In build = shipping next</span>
        </div>
      </PageHero>

      <Wrap className="py-12 md:py-16">
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <section
              key={f.id}
              id={f.id}
              className="scroll-mt-24 rounded-[18px] border border-line bg-card p-6"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={PLANE_TONE[f.plane]}>{f.plane}</span>
                {f.status === "In build" && <span className="badge badge-muted">In build</span>}
              </div>
              <h2 className="mt-3 text-[22px] font-extrabold tracking-[-0.025em]">{f.name}</h2>
              <p className="mt-1 text-[14px] font-bold text-brand-strong">{f.line}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{f.body}</p>
              <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                {f.bullets.map((b) => (
                  <li key={b} className="flex gap-2.5 text-[14px] leading-snug text-ink-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    {b}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Wrap>

      {/* --------------------------------------------------------------- see it */}
      <section className="bg-bg-2 py-14 md:py-20">
        <Wrap>
          <SectionHead
            eyebrow="Not a mockup"
            title="Every surface on this page is running right now"
            lede="This build is the real system, not screenshots. Open any of the three surfaces and place an order — it will move through all of them."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                href: "/",
                name: "The marketplace",
                blurb: "Browse restaurants, build a cart, check out with points, track the order live.",
              },
              {
                href: "/ops",
                name: "The operator dashboard",
                blurb: "Menu, customers, campaigns, upsells, site, POS connection and the optimizer.",
              },
              {
                href: "/kds",
                name: "The kitchen display",
                blurb: "Station queues, bump bars and the promise clock the guest is watching.",
              },
            ].map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="group rounded-[18px] border border-line bg-card p-6 transition-colors hover:border-brand"
              >
                <h3 className="text-[18px] font-extrabold group-hover:text-brand-strong">{s.name}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{s.blurb}</p>
                <p className="mt-4 text-[14px] font-extrabold text-brand-strong">Open it →</p>
              </Link>
            ))}
          </div>
          <p className="mt-5 text-[13px] text-ink-3">
            Operator and kitchen surfaces need a staff sign-in. Demo credentials are
            on the <Link href="/partners/login" className="font-bold text-brand-strong">login page</Link>.
          </p>
        </Wrap>
      </section>

      {/* ------------------------------------------------------------ principles */}
      <Wrap className="py-14 md:py-20">
        <SectionHead
          eyebrow="How it is built"
          title="Four rules that decided most of the architecture"
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            {
              n: "01",
              h: "Money is integers",
              p: "Every price, tax, tip and point is stored in whole cents. Floating point never touches a number a guest will see on a receipt.",
            },
            {
              n: "02",
              h: "Order state is a fold, not a field",
              p: "Orders are an append-only event log. The current state is computed from history, so a bad write can never quietly rewrite what happened.",
            },
            {
              n: "03",
              h: "Published menus are immutable",
              p: "Editing a price creates a new version. Existing orders keep pointing at the version they were priced against.",
            },
            {
              n: "04",
              h: "Tenancy comes from the session",
              p: "Which restaurant you are is read from your session, never from a URL parameter. Asking for someone else's order returns the same answer as asking for one that does not exist.",
            },
          ].map((r) => (
            <Card key={r.n} className="bg-bg-2">
              <Eyebrow>{r.n}</Eyebrow>
              <h3 className="mt-2 text-[19px] font-extrabold tracking-[-0.02em]">{r.h}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{r.p}</p>
            </Card>
          ))}
        </div>
      </Wrap>

      <CtaBand
        title="Try it with your own menu"
        lede="Signing up creates a real restaurant with a real menu draft and a real operator dashboard. Publish it and it appears on the marketplace."
      />
    </>
  );
}
