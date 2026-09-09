"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoLockup } from "./Logo";

/**
 * Chrome for partners.mobiledinners.com — the restaurant side of the business.
 *
 * Deliberately its own header and footer: a restaurant owner evaluating the
 * platform and a diner ordering dinner have nothing in common, and mixing the
 * two pitches into one navigation is how both get ignored. The only crossing
 * point is the "Order food" link back to the marketplace.
 */

const NAV = [
  { href: "/partners/features", label: "Features" },
  { href: "/partners/pricing", label: "Pricing" },
  { href: "/partners/support", label: "Support" },
  { href: "/partners/about", label: "About" },
];

const FOOTER: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Platform",
    links: [
      { href: "/partners/features", label: "Features" },
      { href: "/partners/pricing", label: "Pricing" },
      { href: "/partners/features#pos", label: "Square & Clover" },
      { href: "/partners/features#marketplace", label: "0% marketplace" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { href: "/partners/signup", label: "Start free" },
      { href: "/staff/login", label: "Owner sign in" },
      { href: "/ops", label: "Operator dashboard" },
      { href: "/kds", label: "Kitchen display" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/partners/about", label: "About" },
      { href: "/partners/about#why", label: "Why we exist" },
      { href: "/partners/support#status", label: "System status" },
      { href: "/partners/support#contact", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms#commission", label: "Commission pledge" },
      { href: "/privacy#data", label: "Who owns your data" },
    ],
  },
];

export function PartnersChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PartnersHeader />
      <div className="min-h-[60vh]">{children}</div>
      <PartnersFooter />
    </>
  );
}

function PartnersHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A route change should never leave the sheet hanging open behind the page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/92 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-5 py-3 md:px-8">
        <Link href="/partners" className="flex shrink-0 items-center gap-2.5">
          <LogoLockup markClass="h-10 w-auto" typeClass="text-[18px]" />
          <span className="hidden self-end pb-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-3 sm:inline">
            Partners
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-2 text-[14.5px] font-semibold transition-colors ${
                  active ? "bg-card-2 text-ink" : "text-ink-2 hover:bg-card-2 hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/"
            className="hidden rounded-full px-3 py-2 text-[14px] font-bold text-ink-3 hover:bg-card-2 hover:text-ink lg:block"
          >
            Order food →
          </Link>
          <Link
            href="/staff/login"
            className="hidden rounded-full px-3.5 py-2 text-[14.5px] font-bold text-ink-2 hover:bg-card-2 hover:text-ink sm:block"
          >
            Log in
          </Link>
          <Link
            href="/partners/signup"
            className="rounded-full bg-brand px-4 py-2.5 text-[14.5px] font-extrabold text-brand-ink transition-colors hover:bg-brand-press"
          >
            Start free
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-card-2 md:hidden"
          >
            <span className="grid gap-[5px]">
              <span className="block h-[2px] w-[18px] rounded bg-ink" />
              <span className="block h-[2px] w-[18px] rounded bg-ink" />
              <span className="block h-[2px] w-[18px] rounded bg-ink" />
            </span>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-line bg-bg px-5 py-3 md:hidden" aria-label="Main">
          <ul className="m-0 grid list-none gap-0.5 p-0">
            {[
              ...NAV,
              { href: "/staff/login", label: "Log in" },
              { href: "/", label: "Order food →" },
            ].map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className="block rounded-[10px] px-3 py-2.5 text-[16px] font-semibold hover:bg-card-2"
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

function PartnersFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-bg-2">
      <div className="mx-auto max-w-[1180px] px-5 py-12 md:px-8">
        <div className="grid gap-9 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <LogoLockup markClass="h-12 w-auto" typeClass="text-[21px]" />
            <p className="mt-3 max-w-[30ch] text-[14px] leading-relaxed text-ink-2">
              The point of sale, the website, the marketing and the marketplace in one
              system, with zero commission on every order.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-[14px] font-extrabold text-brand-strong hover:underline"
            >
              Looking for dinner? Order food →
            </Link>
          </div>

          {FOOTER.map((col) => (
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

        {/*
          There was a "Demo environment — all restaurants, orders and metrics on
          this build are generated fixtures" line here. It was true while this
          was a prototype and is not any more, and it was the first thing a
          restaurant owner read before reaching the pricing page. Telling a
          prospect the product is not real is an expensive way to be modest.
        */}
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Mobile Dinners, Inc.</p>
          <p>
            <a href="/partners/support" className="hover:text-ink hover:underline">
              Talk to us
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
