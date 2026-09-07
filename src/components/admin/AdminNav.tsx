"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The eight sections of the admin application, in the order they are used. */
const SECTIONS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/merchants", label: "Merchants" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/billing", label: "Payments & billing" },
  { href: "/admin/delivery", label: "Delivery ops" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/marketplace", label: "Marketplace" },
  { href: "/admin/settings", label: "System" },
];

export function AdminNav() {
  const pathname = usePathname();

  // Exact match for the dashboard, prefix for the rest — otherwise "/admin"
  // would light up on every page underneath it.
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <nav aria-label="Admin sections" className="border-t border-line">
      <div className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-3">
        {SECTIONS.map((s) => {
          const on = isActive(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={on ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-bold transition-colors ${
                on
                  ? "border-brand text-ink"
                  : "border-transparent text-ink-3 hover:text-ink"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
