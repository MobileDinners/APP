"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import type { MenuItem, Restaurant } from "@/lib/types";
import { useCart } from "./CartProvider";
import { useLive } from "./useLive";
import { FoodPhoto } from "./FoodPhoto";
import { BackIcon, ClockIcon, PlusIcon, StarIcon } from "./icons";

export function Storefront({
  restaurant,
  menu,
  etaLow,
  etaHigh,
}: {
  restaurant: Restaurant;
  menu: MenuItem[];
  etaLow: number;
  etaHigh: number;
}) {
  useLive({ orgId: restaurant.orgId });
  const { cart, itemCount, subtotalCents } = useCart();
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [activeSection, setActiveSection] = useState<string>("");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const sections = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of menu) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return [...map.entries()];
  }, [menu]);

  useEffect(() => {
    if (sections.length > 0 && !activeSection) setActiveSection(sections[0][0]);
  }, [sections, activeSection]);

  // Highlight the menu section currently under the sticky nav.
  useEffect(() => {
    function onScroll() {
      const y = window.scrollY + 190;
      let current = sections[0]?.[0] ?? "";
      for (const [name] of sections) {
        const el = sectionRefs.current[name];
        if (el && el.offsetTop <= y) current = name;
      }
      setActiveSection(current);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  const cartIsThisOrg = cart.orgId === restaurant.orgId;

  return (
    <main className="pb-tabs">
      <div className="relative">
        <FoodPhoto
          keyword={restaurant.imageKw}
          seed={restaurant.orgId}
          width={1200}
          height={500}
          alt={restaurant.brandName}
          priority
          className="h-44 w-full sm:h-60 md:h-72"
        />
        <Link
          href="/"
          aria-label="Back"
          className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-bg/92 shadow-sm backdrop-blur-sm"
        >
          <BackIcon className="h-[18px] w-[18px]" />
        </Link>
      </div>

      <div className="mx-auto max-w-[860px] px-4 md:px-6">
        <div className="relative -mt-6 rounded-[18px] bg-card p-4 shadow-[var(--shadow-md)]">
          <h1 className="text-[24px] font-extrabold md:text-[30px]">
            {restaurant.brandName}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {restaurant.cuisine} · {restaurant.priceBand} · {restaurant.address}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] font-bold">
            <span className="flex items-center gap-1">
              <StarIcon className="h-3.5 w-3.5 text-amber" />
              <span className="num">{restaurant.rating.toFixed(1)}</span>
              <span className="num font-medium text-ink-3">
                ({restaurant.ratingCount.toLocaleString()} ratings)
              </span>
            </span>
            <span className="flex items-center gap-1 text-ink-2">
              <ClockIcon className="h-3.5 w-3.5" />
              <span className="num">
                {etaLow}–{etaHigh} min
              </span>
            </span>
            <span className="num text-ink-2">
              {formatCents(restaurant.deliveryFeeCents)} delivery
            </span>
            <span className="badge badge-green">No service fee</span>
          </div>

          {restaurant.promo && (
            <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-[13px] font-bold text-brand-strong">
              {restaurant.promo}
            </p>
          )}

          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{restaurant.blurb}</p>
        </div>
      </div>

      {/* Sticky menu section nav */}
      <div className="sticky top-0 z-30 mt-4 border-b border-line bg-bg/96 backdrop-blur-md">
        <div className="mx-auto max-w-[860px]">
          <nav className="rail px-4 py-2.5 md:px-6" aria-label="Menu sections">
            {sections.map(([name]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  const el = sectionRefs.current[name];
                  if (el) window.scrollTo({ top: el.offsetTop - 150, behavior: "smooth" });
                }}
                className={`rounded-full px-3.5 py-1.5 text-[14px] font-bold transition-colors ${
                  activeSection === name
                    ? "bg-ink text-bg"
                    : "bg-card-2 text-ink-2 hover:bg-line"
                }`}
              >
                {name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-[860px] px-4 md:px-6">
        {sections.map(([section, items]) => (
          <section
            key={section}
            ref={(el) => {
              sectionRefs.current[section] = el;
            }}
            className="pt-6"
          >
            <h2 className="mb-3 text-[20px] font-extrabold">{section}</h2>
            <ul className="m-0 grid list-none grid-cols-1 gap-0 p-0 md:grid-cols-2 md:gap-x-6">
              {items.map((item) => (
                <li key={item.itemId} className="border-b border-line last:border-0">
                  <button
                    type="button"
                    disabled={!item.isAvailable}
                    onClick={() => setOpenItem(item)}
                    className={`flex w-full items-start gap-3 py-3.5 text-left ${
                      item.isAvailable ? "" : "cursor-not-allowed opacity-55"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[16px] font-bold">{item.name}</h3>
                        {item.isPopular && item.isAvailable && (
                          <span className="badge badge-amber shrink-0">Popular</span>
                        )}
                      </div>
                      <p className="line-clamp-2 mt-0.5 text-[13.5px] leading-snug text-ink-2">
                        {item.description}
                      </p>
                      <p className="num mt-1.5 text-[15px] font-extrabold">
                        {formatCents(item.priceCents)}
                      </p>
                      {!item.isAvailable && (
                        <p className="mt-1 text-[12px] font-bold text-red">
                          Sold out right now
                        </p>
                      )}
                    </div>

                    <div className="relative shrink-0">
                      <FoodPhoto
                        keyword={item.imageKw}
                        seed={item.itemId}
                        width={240}
                        height={240}
                        alt={item.name}
                        className="h-[92px] w-[92px] rounded-[12px] sm:h-[104px] sm:w-[104px]"
                      />
                      {item.isAvailable && (
                        <span className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full bg-bg text-ink shadow-[var(--shadow-md)]">
                          <PlusIcon className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {openItem && (
        <ItemSheet item={openItem} restaurant={restaurant} onClose={() => setOpenItem(null)} />
      )}

      {itemCount > 0 && cartIsThisOrg && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/97 p-3 backdrop-blur-md">
          <div className="mx-auto max-w-[860px]">
            <Link href="/cart" className="btn btn-primary w-full justify-between">
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-black/20 px-1.5 text-[13px]">
                {itemCount}
              </span>
              <span>Go to checkout</span>
              <span className="num">{formatCents(subtotalCents)}</span>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

function ItemSheet({
  item,
  restaurant,
  onClose,
}: {
  item: MenuItem;
  restaurant: Restaurant;
  onClose: () => void;
}) {
  const { addLine } = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of item.optionGroups) {
      init[g.id] = g.required && g.select === "single" ? [g.choices[0].id] : [];
    }
    return init;
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const chosen = item.optionGroups.flatMap((g) =>
    g.choices.filter((c) => selected[g.id]?.includes(c.id)),
  );
  const unitPriceCents = item.priceCents + chosen.reduce((s, c) => s + c.priceCents, 0);
  const missing = item.optionGroups.filter(
    (g) => g.required && (selected[g.id]?.length ?? 0) === 0,
  );

  function toggle(groupId: string, choiceId: string, mode: "single" | "multi") {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (mode === "single") return { ...prev, [groupId]: [choiceId] };
      return {
        ...prev,
        [groupId]: current.includes(choiceId)
          ? current.filter((id) => id !== choiceId)
          : [...current, choiceId],
      };
    });
  }

  function add() {
    if (missing.length > 0) return;
    addLine(
      { orgId: restaurant.orgId, slug: restaurant.slug, brandName: restaurant.brandName },
      {
        itemId: item.itemId,
        name: item.name,
        qty,
        unitPriceCents,
        optionsLabel: chosen.map((c) => c.label).join(", "),
        choiceIds: chosen.map((c) => c.id),
        notes: notes.trim(),
      },
    );
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[22px] bg-bg sm:rounded-[22px]">
        <div className="relative shrink-0">
          <FoodPhoto
            keyword={item.imageKw}
            seed={item.itemId}
            width={640}
            height={420}
            alt={item.name}
            priority
            className="h-48 w-full sm:h-56"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-bg/92 text-[19px] font-bold leading-none shadow-sm backdrop-blur-sm"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
          <h3 className="text-[22px] font-extrabold">{item.name}</h3>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">
            {item.description}
          </p>
          <p className="num mt-2 text-[17px] font-extrabold">
            {formatCents(item.priceCents)}
          </p>

          {item.optionGroups.map((group) => (
            <fieldset key={group.id} className="mt-6 border-0 p-0">
              <legend className="mb-2 flex w-full items-center justify-between p-0">
                <span className="text-[16px] font-extrabold">{group.name}</span>
                <span
                  className={`badge ${group.required ? "badge-muted" : "badge-muted"}`}
                >
                  {group.required ? "Required" : "Optional"}
                </span>
              </legend>
              <div className="overflow-hidden rounded-[14px] bg-card-2">
                {group.choices.map((choice, i) => {
                  const on = selected[group.id]?.includes(choice.id) ?? false;
                  return (
                    <label
                      key={choice.id}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-[15px] ${
                        i > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <input
                        type={group.select === "single" ? "radio" : "checkbox"}
                        name={group.id}
                        checked={on}
                        onChange={() => toggle(group.id, choice.id, group.select)}
                        className="h-[18px] w-[18px] accent-[var(--brand)]"
                      />
                      <span className="flex-1 font-semibold">{choice.label}</span>
                      {choice.priceCents > 0 && (
                        <span className="num text-[14px] font-bold text-ink-2">
                          +{formatCents(choice.priceCents)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="mt-6">
            <label htmlFor="notes" className="mb-2 block text-[16px] font-extrabold">
              Special instructions
            </label>
            <input
              id="notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={140}
              placeholder="Allergies, preferences, anything the kitchen should know"
              className="w-full rounded-[12px] bg-card-2 px-4 py-3 outline-none ring-brand focus:ring-2"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-line p-4">
          <div className="flex items-center gap-1 rounded-full bg-card-2 p-1">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
              className="grid h-9 w-9 place-items-center rounded-full text-[20px] font-bold hover:bg-line disabled:opacity-35"
              disabled={qty === 1}
            >
              −
            </button>
            <span className="num w-6 text-center text-[15px] font-extrabold">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(20, q + 1))}
              aria-label="Increase quantity"
              className="grid h-9 w-9 place-items-center rounded-full text-[20px] font-bold hover:bg-line"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={add}
            disabled={missing.length > 0}
            className="btn btn-primary flex-1 justify-between"
          >
            <span>
              {missing.length > 0 ? `Choose ${missing[0].name.toLowerCase()}` : "Add to cart"}
            </span>
            {missing.length === 0 && (
              <span className="num">{formatCents(unitPriceCents * qty)}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
