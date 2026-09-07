"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "./CartProvider";
import { PartnersChrome } from "./PartnersChrome";
import { ConsumerFooter } from "./ConsumerFooter";
import { ConsumerHeader } from "./ConsumerHeader";
import { LogoLockup } from "./Logo";
import type { Session } from "@/lib/auth";
import type { SiteContent } from "@/lib/site-content";
import { formatCents } from "@/lib/money";
import {
  BagIcon, ChevronIcon, GiftIcon, HomeIcon, PinIcon, ReceiptIcon, SearchIcon,
} from "./icons";

const CONSUMER_TABS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/orders", label: "Orders", Icon: ReceiptIcon },
  { href: "/rewards", label: "Rewards", Icon: GiftIcon },
];

/**
 * Merchant surfaces. In production these are partners.mobiledinners.com; the
 * middleware rewrites that host onto this prefix, so the split is one DNS
 * record rather than a second deployment.
 */
function isPartners(pathname: string): boolean {
  return pathname === "/partners" || pathname.startsWith("/partners/");
}

/** The operator and kitchen applications proper — signed-in staff tools. */
function isStaffTool(pathname: string): boolean {
  return (
    pathname.startsWith("/ops") ||
    pathname.startsWith("/kds") ||
    pathname.startsWith("/staff")
  );
}

/**
 * The internal admin application brings its own header and navigation, so it
 * takes no chrome from here at all — not the consumer shell, and not the
 * operator bar either, since /admin is not scoped to one restaurant.
 */
function isAdmin(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Legal pages are shared by both audiences, so they take whichever chrome the
 * reader arrived in. Defaulting them to the consumer shell is the right guess:
 * far more diners than owners read a privacy policy.
 */
const SHARED_ROUTES = new Set(["/terms", "/privacy"]);

/**
 * Three audiences, three chromes.
 *
 *   consumer   mobiledinners.com — the marketplace: address bar, search, tabs
 *   partners   partners.mobiledinners.com — the restaurant pitch and onboarding
 *   staff      /ops and /kds — dense internal tools, no consumer chrome at all
 *
 * A diner never sees the merchant pitch and an owner never sees a cart. The
 * only crossings are the "For Restaurants" link in the consumer header and
 * footer, and "Order food" back the other way.
 */
export function AppChrome({
  children,
  session,
  content,
}: {
  children: React.ReactNode;
  session: Session | null;
  /** Editable header and footer copy, resolved server-side in the layout. */
  content: SiteContent;
}) {
  const pathname = usePathname();
  const isStaff = isStaffTool(pathname);

  if (isAdmin(pathname)) return <>{children}</>;

  if (isPartners(pathname)) {
    return <PartnersChrome>{children}</PartnersChrome>;
  }

  if (isStaff) {
    return (
      <>
        <StaffBar pathname={pathname} />
        {children}
        <SurfaceSwitcher pathname={pathname} />
      </>
    );
  }

  const hideTopBar = pathname.startsWith("/r/") || pathname.startsWith("/track/");

  return (
    <>
      {!hideTopBar && <ConsumerHeader session={session} nav={content.headerNav} />}
      {children}
      <ConsumerFooter content={content} />
      <BottomTabs pathname={pathname} />
      <SurfaceSwitcher pathname={pathname} />
    </>
  );
}

function TopBar({ session }: { session: Session | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const { itemCount, subtotalCents, hydrated } = useCart();

  return (
    <header className="sticky top-0 z-40 bg-chrome text-chrome-ink">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-2.5 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand text-[15px] font-extrabold text-brand-ink">
            M
          </span>
          <span className="hidden text-[17px] font-extrabold tracking-[-0.02em] sm:block">
            Mobile Dinners
          </span>
        </Link>

        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-chrome-ink/10 px-3 py-2 text-[14px] font-semibold hover:bg-chrome-ink/[0.16]"
        >
          <PinIcon className="h-4 w-4 text-brand" />
          <span className="max-w-[9rem] truncate">742 Elm St</span>
          <ChevronIcon className="h-3.5 w-3.5 rotate-90 opacity-70" />
        </button>

        <form
          className="hidden min-w-0 flex-1 md:block"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <div className="flex items-center gap-2 rounded-full bg-chrome-ink/10 px-4 py-2.5">
            <SearchIcon className="h-4 w-4 shrink-0 opacity-70" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search restaurants or dishes"
              aria-label="Search restaurants or dishes"
              className="w-full bg-transparent outline-none placeholder:text-chrome-ink/55"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <Link
            href="/search"
            aria-label="Search"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-chrome-ink/10 md:hidden"
          >
            <SearchIcon className="h-[18px] w-[18px]" />
          </Link>
          <Link
            href="/support"
            className="hidden shrink-0 rounded-full px-3 py-2 text-[13.5px] font-bold opacity-75 hover:bg-chrome-ink/10 hover:opacity-100 lg:block"
          >
            Help
          </Link>
          <Link
            href="/partners"
            className="hidden shrink-0 rounded-full px-3 py-2 text-[13.5px] font-bold opacity-75 hover:bg-chrome-ink/10 hover:opacity-100 lg:block"
          >
            For Restaurants
          </Link>
          {session?.kind === "person" ? (
            <Link
              href="/rewards"
              className="hidden shrink-0 items-center gap-1.5 rounded-full bg-chrome-ink/10 px-3.5 py-2 text-[13px] font-bold hover:bg-chrome-ink/[0.16] sm:flex"
            >
              {session.displayName || "Account"}
            </Link>
          ) : (
            <Link
              href="/signin"
              className="shrink-0 rounded-full bg-chrome-ink/10 px-3.5 py-2 text-[14px] font-bold hover:bg-chrome-ink/[0.16]"
            >
              Sign in
            </Link>
          )}
          <Link
            href="/cart"
            className="flex shrink-0 items-center gap-2 rounded-full bg-brand px-3.5 py-2 text-[14px] font-bold text-brand-ink hover:bg-brand-press"
          >
            <BagIcon className="h-[18px] w-[18px]" />
            {hydrated && itemCount > 0 ? (
              <span className="num">{formatCents(subtotalCents)}</span>
            ) : (
              <span className="hidden sm:inline">Cart</span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

function BottomTabs({ pathname }: { pathname: string }) {
  const { itemCount, hydrated } = useCart();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/97 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Main"
    >
      <ul className="m-0 grid list-none grid-cols-4 p-0">
        {CONSUMER_TABS.map(({ href, label, Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" || pathname.startsWith("/r/")
              : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${
                  active ? "text-brand-strong" : "text-ink-3"
                }`}
              >
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" filled={active} />
                  {href === "/orders" && hydrated && itemCount > 0 && (
                    <span className="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-brand-ink">
                      {itemCount}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StaffBar({ pathname }: { pathname: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card">
      <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2.5">
        <Link href="/" className="flex items-center">
          <LogoLockup markClass="h-8 w-auto" typeClass="text-[13px]" className="gap-1.5" />
        </Link>
        <span className="rounded-full bg-card-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-2">
          {pathname.startsWith("/ops") ? "Operator" : "Kitchen"}
        </span>
      </div>
    </header>
  );
}

/**
 * Demo-only affordance. In production these are three separate applications
 * behind different logins; here one floating control jumps between them.
 */
function SurfaceSwitcher({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const surfaces = [
    { href: "/", label: "Company site" },
    { href: "/", label: "Customer app" },
    { href: "/ops", label: "Restaurant dashboard" },
    { href: "/kds", label: "Kitchen display" },
  ];
  const isStaff = pathname.startsWith("/ops") || pathname.startsWith("/kds");
  // Public marketing pages are not a demo surface; no floating control there.
  if (isPartners(pathname) || SHARED_ROUTES.has(pathname)) return null;

  return (
    <div className={`fixed right-3 z-50 ${isStaff ? "bottom-3" : "bottom-[84px] md:bottom-4"}`}>
      {open && (
        <div className="mb-2 w-52 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-lg)] ring-1 ring-line">
          <p className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-3">
            Demo · switch surface
          </p>
          {surfaces.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-[14px] font-semibold hover:bg-card-2"
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Switch demo surface"
        className="grid h-10 w-10 place-items-center rounded-full bg-ink text-bg shadow-[var(--shadow-md)]"
      >
        <span className="text-[15px] font-extrabold">{open ? "×" : "⇄"}</span>
      </button>
    </div>
  );
}
