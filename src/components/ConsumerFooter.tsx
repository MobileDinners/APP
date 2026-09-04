import Link from "next/link";
import { LogoLockup } from "./Logo";

/**
 * Footer for the diner-facing marketplace.
 *
 * Short on purpose. A consumer footer is where people go for legal text and the
 * one link they could not find in the app; it is not a place to pitch. The only
 * merchant-facing thing here is "For Restaurants", which is where the whole
 * partners side hangs off — the second of its two entry points, the other being
 * the top-right of the header.
 */

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Order",
    links: [
      { href: "/", label: "All restaurants" },
      { href: "/search", label: "Search" },
      { href: "/orders", label: "Your orders" },
      { href: "/rewards", label: "Points wallet" },
    ],
  },
  {
    heading: "Help",
    links: [
      { href: "/support", label: "Help centre" },
      { href: "/support#contact", label: "Contact us" },
      { href: "/orders", label: "Report an order problem" },
      { href: "/signin", label: "Sign in" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Mobile Dinners" },
      { href: "/how-it-works", label: "Why no service fees" },
      { href: "/how-it-works#points", label: "How points work" },
      { href: "/partners", label: "For Restaurants" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/privacy#rights", label: "Your data rights" },
    ],
  },
];

export function ConsumerFooter() {
  return (
    <footer className="mt-14 border-t border-line bg-bg-2 pb-tabs">
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <LogoLockup markClass="h-12 w-auto" typeClass="text-[21px]" />
            <p className="mt-3 max-w-[34ch] text-[14px] leading-relaxed text-ink-2">
              In-store prices, no service fees, and one points wallet that works at
              every restaurant on the network.
            </p>

            <Link
              href="/partners"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-line-2 bg-card px-4 py-2.5 text-[14px] font-extrabold transition-colors hover:border-brand hover:bg-brand-soft"
            >
              For Restaurants
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-ink-3">
                {col.heading}
              </h2>
              <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="text-[14px] font-semibold text-ink-2 hover:text-ink"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-9 flex flex-col gap-2 border-t border-line pt-6 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Mobile Dinners, Inc.</p>
          <p>
            Demo environment — restaurants, orders and prices here are generated
            fixtures, and no payment is taken.
          </p>
        </div>
      </div>
    </footer>
  );
}
