"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "./CartProvider";
import type { Session } from "@/lib/auth";
import type { NavLink } from "@/lib/site-content";
import { LogoLockup } from "./Logo";
import { BagIcon } from "./icons";

/**
 * The diner-facing site header: logo, centred nav, account controls, cart.
 *
 * White ground with charcoal type and one red underline on the current page —
 * the same restraint the logo shows, where red marks one word and charcoal
 * carries the rest.
 *
 * The links arrive as a prop rather than a const so they can be edited at
 * /ops/content without a deploy. The defaults still live in code — see
 * site-content.ts — so an empty database renders the navigation that ships in
 * the repository rather than none at all.
 */

export function ConsumerHeader({
  session,
  nav,
}: {
  session: Session | null;
  nav: NavLink[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { itemCount, hydrated } = useCart();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg">
      <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-4 py-3 md:px-6">
        <Link href="/" className="shrink-0" aria-label="Mobile Dinners — home">
          <LogoLockup markClass="h-12 w-auto" typeClass="text-[22px]" />
        </Link>

        <nav className="mx-auto hidden items-center gap-8 lg:flex" aria-label="Main">
          {nav.map((n) => {
            const on = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`relative py-1.5 text-[15px] font-semibold transition-colors ${
                  on ? "text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {n.label}
                {on && (
                  <span className="absolute -bottom-0.5 left-0 right-0 h-[3px] rounded-full bg-brand" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2.5 lg:ml-0">
          {session?.kind === "person" ? (
            <Link
              href="/rewards"
              className="hidden rounded-[10px] border border-line-2 px-4 py-2.5 text-[14.5px] font-bold hover:bg-card-2 sm:block"
            >
              {session.displayName || "Account"}
            </Link>
          ) : (
            <>
              <Link
                href="/signin"
                className="hidden rounded-[10px] border border-line-2 px-5 py-2.5 text-[14.5px] font-bold hover:bg-card-2 sm:block"
              >
                Log In
              </Link>
              <Link
                href="/signin"
                className="hidden rounded-[10px] bg-ink px-5 py-2.5 text-[14.5px] font-bold text-bg hover:bg-ink-2 sm:block"
              >
                Sign Up
              </Link>
            </>
          )}

          <Link
            href="/cart"
            aria-label={`Cart, ${hydrated ? itemCount : 0} items`}
            className="relative grid h-10 w-10 place-items-center rounded-[10px] hover:bg-card-2"
          >
            <BagIcon className="h-[22px] w-[22px]" />
            {hydrated && itemCount > 0 && (
              <span className="num absolute -right-1 -top-1 grid h-[19px] min-w-[19px] place-items-center rounded-full bg-brand px-1 text-[11px] font-extrabold text-brand-ink">
                {itemCount}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
            className="grid h-10 w-10 place-items-center rounded-[10px] hover:bg-card-2 lg:hidden"
          >
            <span className="grid gap-[5px]">
              <span className="block h-[2px] w-[19px] rounded bg-ink" />
              <span className="block h-[2px] w-[19px] rounded bg-ink" />
              <span className="block h-[2px] w-[19px] rounded bg-ink" />
            </span>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-line px-4 py-3 lg:hidden" aria-label="Main">
          <ul className="m-0 grid list-none gap-0.5 p-0">
            {nav.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className={`block rounded-[10px] px-3 py-2.5 text-[16px] font-semibold hover:bg-card-2 ${
                    isActive(n.href) ? "text-brand-strong" : ""
                  }`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
            {session?.kind !== "person" && (
              <li className="mt-2 grid grid-cols-2 gap-2 sm:hidden">
                <Link
                  href="/signin"
                  className="rounded-[10px] border border-line-2 px-4 py-2.5 text-center text-[15px] font-bold"
                >
                  Log In
                </Link>
                <Link
                  href="/signin"
                  className="rounded-[10px] bg-ink px-4 py-2.5 text-center text-[15px] font-bold text-bg"
                >
                  Sign Up
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
