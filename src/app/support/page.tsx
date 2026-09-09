import Link from "next/link";
import type { Metadata } from "next";
import { Faq, SectionHead } from "@/components/marketing";
import { SUPPORT_PHONE, SUPPORT_PHONE_TEL } from "@/lib/platform";

export const metadata: Metadata = {
  title: "Mobile Dinners Help Center",
  description:
    "Order problems, refunds, missing items, points, account questions, and how to reach a person.",
};

/**
 * Diner-facing help. Deliberately separate from /partners/support, which is
 * about plans, SLAs and kitchen outages: someone whose burrito is missing
 * should never land on a page about accounting sync.
 */

const NOW = [
  {
    q: "Where is my order?",
    a: "Open it from Orders and the tracking page shows live status straight from the kitchen: accepted, cooking, ready, on the way. The estimate updates as the order moves, and if it slips the page says so rather than holding an optimistic number until the doorbell.",
    href: "/orders",
    cta: "Track an order",
  },
  {
    q: "Something is missing or wrong",
    a: "Report it from the order's tracking page while the order is still open. It goes straight to the restaurant with the item list and the timeline, and they decide the refund, usually within a few minutes, because they are looking at the same screen you are.",
    href: "/orders",
    cta: "Find the order",
  },
  {
    q: "I need to cancel",
    a: "Free until the restaurant accepts it. Once they have started cooking, it is up to them. Someone has already bought your ingredients and turned on a burner. Ask through the order page and most will sort it out if it is genuinely early.",
    href: "/orders",
    cta: "Open your orders",
  },
];

const FAQS = [
  {
    q: "Why are there no service fees?",
    a: "Because we do not take a cut of your order. Mobile Dinners charges restaurants a flat monthly subscription for the software, so there is no 15% to 30% commission for anyone to pass on to you as a service fee or a quietly inflated menu price. You pay tax, an optional tip and, if you choose delivery, a delivery fee calculated from the distance between the restaurant and the address you give us. It is shown in full at checkout before you pay, never added afterwards.",
  },
  {
    q: "How do points work?",
    a: "You earn points on every order and they sit in one wallet that works at every restaurant on the network, so points from Tuesday's tacos pay for Saturday's bakery run. Restaurants set their own earn multipliers, so some days are worth more. Redemption is capped per order so a wallet cannot zero out a ticket.",
  },
  {
    q: "Do my points expire?",
    a: "Not while you are ordering. Points expire after 18 months of no activity on your account, and you get a text before that happens. Every point earned, spent and expired is a line in your ledger on the Rewards page.",
  },
  {
    q: "How do I sign in? I do not remember a password.",
    a: "There is no password. You enter your phone number and we text a six-digit code. That number is your account. It is also how the restaurant reaches you about an order, and where your tracking link goes.",
  },
  {
    q: "Can I order without making an account?",
    a: "You can browse, build a cart and see your full total with no account at all. We only ask for a phone number at the very end, right before the order is placed, because the restaurant needs a way to reach you about it.",
  },
  {
    q: "How do I change my phone number, or delete my account?",
    a: "From the Rewards page, under account settings. Deleting removes your profile, saved addresses and points balance. Order records are kept where tax law requires it and are disconnected from your identity as far as that allows. The Privacy Policy sets out exactly what is retained and for how long.",
  },
  {
    q: "Who can see my details?",
    a: "The restaurant you ordered from receives your name, phone number and the delivery address for that order. That is the point of ordering direct: they should be able to recognize a regular. No other restaurant sees any of it, we do not sell your data, and we never store your card number.",
  },
  {
    q: "The delivery estimate was wrong.",
    a: "Estimates come from live kitchen data, not a guess, but a kitchen can still get slammed. If an order lands materially late the tracking page will say so while it is happening. If it ruined the meal, report it from the order page. That goes straight to the restaurant, who can refund it.",
  },
];

const CONTACT: {
  name: string;
  detail: string;
  /** Set when the detail is something a device can act on: dial, or compose. */
  href?: string;
  blurb: string;
  tone: "primary" | "normal";
}[] = [
  {
    name: "Live chat",
    detail: "In the app, from any order",
    blurb: "Fastest for anything happening right now: a late order, a missing item, a driver who cannot find the door.",
    tone: "primary" as const,
  },
  {
    name: "Email",
    detail: "help@mobiledinners.com",
    href: "mailto:help@mobiledinners.com",
    blurb: "Account questions, refunds that need a second look, anything with a photo attached. We reply within a day.",
    tone: "normal" as const,
  },
  {
    name: "Phone",
    detail: SUPPORT_PHONE,
    // A number a thumb cannot dial is a number that does not get called, and
    // most of this traffic is a phone held one-handed outside a restaurant.
    href: `tel:${SUPPORT_PHONE_TEL}`,
    blurb: "9am to 11pm, every day. Use this if an order has gone badly wrong and you would rather talk to someone.",
    tone: "normal" as const,
  },
];

export default function ConsumerSupportPage() {
  return (
    <main className="mx-auto max-w-[820px] px-4 pb-6 pt-6 md:px-6">
      <h1 className="text-[32px] font-extrabold tracking-[-0.03em] md:text-[40px]">
        How can we help?
      </h1>
      <p className="mt-2 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
        Most problems with an order are fastest to fix from the order itself,
        because the restaurant sees the same timeline you do.
      </p>

      {/* --------------------------------------------------- something is wrong */}
      <section className="mt-8">
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
          Something is wrong with an order
        </h2>
        <div className="mt-3 grid gap-3">
          {NOW.map((n) => (
            <div key={n.q} className="card p-5">
              <h3 className="text-[17px] font-extrabold">{n.q}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{n.a}</p>
              <Link
                href={n.href}
                className="mt-3 inline-block text-[14px] font-extrabold text-brand-strong hover:underline"
              >
                {n.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ faq */}
      <section className="mt-10">
        <SectionHead eyebrow="Questions" title="Everything else" />
        <div className="mt-5">
          <Faq items={FAQS} />
        </div>
      </section>

      {/* -------------------------------------------------------------- contact */}
      <section id="contact" className="mt-10 scroll-mt-24">
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
          Reach a person
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {CONTACT.map((c) => (
            <div
              key={c.name}
              className={`rounded-[16px] border p-5 ${
                c.tone === "primary" ? "border-brand bg-brand-soft" : "border-line bg-card"
              }`}
            >
              <h3 className="text-[16px] font-extrabold">{c.name}</h3>
              <p className="num mt-1 text-[13.5px] font-bold text-brand-strong">
                {c.href ? (
                  <a href={c.href} className="hover:underline">
                    {c.detail}
                  </a>
                ) : (
                  c.detail
                )}
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{c.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-[16px] border border-line bg-bg-2 p-5">
        <h2 className="text-[16px] font-extrabold">Run a restaurant?</h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">
          Restaurant support is a different desk, with a 24/7 line for kitchens
          that are down mid-service.
        </p>
        <Link
          href="/partners/support"
          className="mt-3 inline-block text-[14px] font-extrabold text-brand-strong hover:underline"
        >
          Partner support →
        </Link>
      </section>

      {/*
        This used to end "...and the phone numbers and email addresses above are
        placeholders". The number above is now a real line, and a page that tells
        a customer the number is fake is a page that stops them calling it.
      */}
      <p className="mt-8 text-[13px] leading-relaxed text-ink-3">
        Orders placed here are real records in the system, but card payments are
        still running against a test processor, so no money moves yet.
      </p>
    </main>
  );
}
