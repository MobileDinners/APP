import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, Card, Faq, PageHero, SectionHead, Wrap } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Support — Mobile Dinners",
  description:
    "Response targets by plan, an emergency line for kitchens that are down, self-serve guides and system status.",
};

const CHANNELS = [
  {
    name: "Kitchen down",
    detail: "(415) 555-0111",
    blurb:
      "Orders not printing, terminal offline, cannot take payment. Answered by a human, 24/7, no queue and no tier gating. Use this one when service is at risk.",
    tone: "urgent" as const,
  },
  {
    name: "Chat",
    detail: "In-app, bottom right of /ops",
    blurb:
      "Everything else during service. Starts with a human on Growth and above; Starter starts with a bot that hands off inside the target window.",
    tone: "normal" as const,
  },
  {
    name: "Email",
    detail: "help@mobiledinners.com",
    blurb:
      "Billing, account changes, integrations, anything with a screenshot attached. Include your restaurant name so it lands on the right account.",
    tone: "normal" as const,
  },
  {
    name: "Onboarding",
    detail: "Scheduled, 45 minutes",
    blurb:
      "Menu build, hardware setup, POS coexist connection and a live test order. Free on every plan, as many times as you need it.",
    tone: "normal" as const,
  },
];

const SLA = [
  { plan: "Starter", first: "12 hours", channels: "Chat, email", hours: "7am–11pm local" },
  { plan: "Growth", first: "4 hours", channels: "Chat, email, phone", hours: "7am–11pm local" },
  { plan: "Scale", first: "1 hour", channels: "Priority chat, email, phone", hours: "24/7" },
  { plan: "Enterprise", first: "15 minutes", channels: "Named CSM + all channels", hours: "24/7, contractual SLA" },
];

const GUIDES = [
  { h: "Building your first menu", p: "Sections, items, food costs and prep times — and what publishing actually does.", href: "/partners/features#menu" },
  { h: "Connecting Square or Clover", p: "Import your catalog, map items and push orders back into your existing till.", href: "/partners/features#pos" },
  { h: "Going live on the marketplace", p: "What has to be true before your restaurant appears in the feed.", href: "/partners/features#marketplace" },
  { h: "Reading a campaign result", p: "Why the number is treated minus holdout, and what a wide interval is telling you.", href: "/partners/features#campaigns" },
  { h: "Running the kitchen display", p: "Station routing, bumping, and the promise clock the guest is watching.", href: "/partners/features#kds" },
  { h: "Exporting your data", p: "Customers, orders, menu versions and campaign results, in CSV and over the API.", href: "/privacy#data" },
];

const FAQS = [
  {
    q: "Something is broken mid-service. What do I do?",
    a: "Call the kitchen-down line. It is answered by a person around the clock on every plan, including Starter — a restaurant that cannot take money is not a support ticket, it is an outage. If the failure is on our side, the offline gateway should already be holding orders locally and will replay them when the connection returns.",
  },
  {
    q: "Can you help me move my menu over?",
    a: "Yes. Send a photo of the printed menu or an export from your current system and onboarding will build the draft with you on the call. You review prices before anything publishes — we will not guess at a price.",
  },
  {
    q: "Do you charge for onboarding or training?",
    a: "No. Onboarding sessions, retraining after staff turnover and menu-rebuild help are included on every plan. Hardware costs money; help does not.",
  },
  {
    q: "What counts as an emergency versus a normal ticket?",
    a: "Emergency: orders not reaching the kitchen, payments failing, terminal or display down, marketplace listing dark during service. Normal: campaign questions, reporting, menu edits, billing, feature requests. When in doubt during service, call — nobody will be annoyed.",
  },
  {
    q: "Where do I see whether it is you or my internet?",
    a: "The status page, and the dashboard header shows a connection indicator per surface. If the gateway is holding orders locally it says so and shows the queue depth, so you know the tickets are safe rather than lost.",
  },
];

const STATUS = [
  { name: "Ordering and checkout", state: "Operational" },
  { name: "Kitchen display", state: "Operational" },
  { name: "Marketplace feed", state: "Operational" },
  { name: "Campaign delivery", state: "Operational" },
  { name: "Square / Clover sync", state: "Operational" },
  { name: "Payments", state: "In build" },
];

export default function SupportPage() {
  return (
    <>
      <PageHero
        eyebrow="Support"
        title="A restaurant that cannot take money is an outage"
        lede="Support is graded by consequence, not by plan. Anything that stops service gets a human on the phone at any hour, on every plan, including the cheapest one."
      />

      {/* ------------------------------------------------------------- channels */}
      <Wrap className="py-12 md:py-16" >
        <div id="contact" className="scroll-mt-24 grid gap-4 md:grid-cols-2">
          {CHANNELS.map((c) => (
            <div
              key={c.name}
              className={`rounded-[18px] border p-6 ${
                c.tone === "urgent"
                  ? "border-brand bg-brand-soft"
                  : "border-line bg-card"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  className={`text-[19px] font-extrabold tracking-[-0.02em] ${
                    c.tone === "urgent" ? "text-brand-strong" : ""
                  }`}
                >
                  {c.name}
                </h2>
                <span
                  className={`num text-[14px] font-extrabold ${
                    c.tone === "urgent" ? "text-brand-strong" : "text-ink-2"
                  }`}
                >
                  {c.detail}
                </span>
              </div>
              <p
                className={`mt-2.5 text-[14.5px] leading-relaxed ${
                  c.tone === "urgent" ? "text-brand-strong" : "text-ink-2"
                }`}
              >
                {c.blurb}
              </p>
            </div>
          ))}
        </div>
      </Wrap>

      {/* ------------------------------------------------------------------ sla */}
      <section className="bg-bg-2 py-14 md:py-20">
        <Wrap>
          <SectionHead
            eyebrow="Response targets"
            title="First human response, by plan"
            lede="These are targets for the first reply from a person, not an auto-acknowledgement. The kitchen-down line is outside this table — it is answered on every plan, at any hour."
          />
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line-2">
                  <th className="pb-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                    Plan
                  </th>
                  <th className="pb-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                    First response
                  </th>
                  <th className="pb-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                    Channels
                  </th>
                  <th className="pb-3 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                    Hours
                  </th>
                </tr>
              </thead>
              <tbody>
                {SLA.map((s) => (
                  <tr key={s.plan} className="border-b border-line">
                    <td className="py-3.5 text-[15px] font-extrabold">{s.plan}</td>
                    <td className="num py-3.5 text-[14.5px] font-bold text-brand-strong">{s.first}</td>
                    <td className="py-3.5 text-[14px] text-ink-2">{s.channels}</td>
                    <td className="py-3.5 text-[14px] text-ink-2">{s.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Wrap>
      </section>

      {/* --------------------------------------------------------------- guides */}
      <Wrap className="py-14 md:py-20">
        <SectionHead eyebrow="Self-serve" title="Guides for the things people ask first" />
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {GUIDES.map((g) => (
            <Link
              key={g.h}
              href={g.href}
              className="group rounded-[16px] border border-line bg-card p-5 transition-colors hover:border-brand"
            >
              <h3 className="text-[16px] font-extrabold group-hover:text-brand-strong">{g.h}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{g.p}</p>
            </Link>
          ))}
        </div>
      </Wrap>

      {/* --------------------------------------------------------------- status */}
      <section id="status" className="scroll-mt-24 bg-bg-2 py-14 md:py-20">
        <Wrap>
          <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-14">
            <SectionHead
              eyebrow="Status"
              title="What is up right now"
              lede="Component-level status for this build. Anything marked in build is not yet shipping and is listed here so the gap is visible rather than implied."
            />
            <Card>
              <ul className="m-0 grid list-none gap-0 divide-y divide-line p-0">
                {STATUS.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 py-3">
                    <span className="text-[15px] font-semibold">{s.name}</span>
                    <span
                      className={
                        s.state === "Operational" ? "badge badge-green" : "badge badge-muted"
                      }
                    >
                      {s.state}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Wrap>
      </section>

      {/* ------------------------------------------------------------------ faq */}
      <Wrap className="py-14 md:py-20">
        <SectionHead eyebrow="Common" title="Answered before you ask" />
        <div className="mt-7">
          <Faq items={FAQS} />
        </div>
      </Wrap>

      <CtaBand
        title="Still stuck? Call the line."
        lede="(415) 555-0111 is answered by a person, at any hour, on every plan. If it is not urgent, chat and email are in the dashboard."
        primary={{ href: "/partners/signup", label: "Start free" }}
        secondary={{ href: "/partners/features", label: "Read the features" }}
      />
    </>
  );
}
