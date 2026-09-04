import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedBySlug } from "@/lib/site";
import { getRestaurantById } from "@/lib/orders";
import { publishedMenu } from "@/lib/menu";
import { formatCents } from "@/lib/money";
import { THEMES } from "@/lib/site-types";
import { FoodPhoto } from "@/components/FoodPhoto";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = getPublishedBySlug(slug);
  if (!found?.site.published) return { title: "Not found" };

  const m = found.site.published;
  return {
    title: m.metaTitle,
    description: m.metaDescription,
    openGraph: { title: m.metaTitle, description: m.metaDescription, type: "website" },
    alternates: { canonical: `/site/${slug}` },
  };
}

export default async function PublicSite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = getPublishedBySlug(slug);
  if (!found?.site.published) notFound();

  const model = found.site.published;
  const org = getRestaurantById(found.orgId);
  if (!org) notFound();

  // The menu is read live from the menu of record. There is no copy of it in
  // the page model, which is why a price published in the POS is correct here
  // seconds later without anyone touching the website.
  const menu = publishedMenu(org.orgId).filter((i) => i.isAvailable);
  const theme = THEMES.find((t) => t.id === model.theme) ?? THEMES[0];

  const sections = model.sections.filter((s) => s.enabled);

  // Structured data straight from the same source the page renders from, so it
  // can never describe a different menu than the one on screen.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: org.brandName,
    description: model.metaDescription,
    servesCuisine: org.cuisine,
    priceRange: org.priceBand,
    address: { "@type": "PostalAddress", streetAddress: org.address },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: org.rating,
      reviewCount: org.ratingCount,
    },
    hasMenu: {
      "@type": "Menu",
      hasMenuSection: [...new Set(menu.map((i) => i.section))].map((section) => ({
        "@type": "MenuSection",
        name: section,
        hasMenuItem: menu
          .filter((i) => i.section === section)
          .map((i) => ({
            "@type": "MenuItem",
            name: i.name,
            description: i.description,
            offers: {
              "@type": "Offer",
              price: (i.priceCents / 100).toFixed(2),
              priceCurrency: "USD",
            },
          })),
      })),
    },
  };

  return (
    <div style={{ ["--site-hue" as string]: String(theme.hue) }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-5 py-3">
          <span className="text-[17px] font-extrabold tracking-tight">{org.brandName}</span>
          <Link
            href={`/r/${org.slug}`}
            className="rounded-full px-4 py-2 text-[14px] font-bold text-white"
            style={{ background: `hsl(var(--site-hue) 72% 45%)` }}
          >
            Order
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-5 pb-16">
        {sections.map((s) => {
          if (s.kind === "hero") {
            return (
              <section key={s.id} className="py-10">
                <FoodPhoto
                  keyword={org.imageKw}
                  seed={org.orgId}
                  width={1200}
                  height={500}
                  alt={org.brandName}
                  priority
                  className="mb-6 h-52 w-full rounded-[18px] sm:h-64"
                />
                <h1 className="text-[36px] font-extrabold leading-[1.05] tracking-tight sm:text-[46px]">
                  {s.headline}
                </h1>
                <p className="mt-3 max-w-[52ch] text-[17px] leading-relaxed text-ink-2">
                  {s.subhead}
                </p>
              </section>
            );
          }

          if (s.kind === "order") {
            return (
              <section key={s.id} className="rounded-[18px] border border-line p-6">
                <h2 className="text-[22px] font-extrabold">{s.heading}</h2>
                <p className="mt-1 text-[15px] text-ink-2">{s.note}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/r/${org.slug}`}
                    className="rounded-full px-5 py-3 text-[15px] font-bold text-white"
                    style={{ background: `hsl(var(--site-hue) 72% 45%)` }}
                  >
                    Order pickup
                  </Link>
                  <Link
                    href={`/r/${org.slug}`}
                    className="rounded-full bg-card-2 px-5 py-3 text-[15px] font-bold"
                  >
                    Delivery
                  </Link>
                </div>
                <p className="mt-3 text-[13.5px] text-ink-3">
                  Ordering happens here, not on another company&rsquo;s site. Prices match the
                  menu inside.
                </p>
              </section>
            );
          }

          if (s.kind === "menu") {
            const shown = menu.slice(0, s.maxItems);
            const bySection = [...new Set(shown.map((i) => i.section))];
            return (
              <section key={s.id} className="py-10">
                <h2 className="text-[26px] font-extrabold">{s.heading}</h2>
                {bySection.map((sec) => (
                  <div key={sec} className="mt-6">
                    <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-3">
                      {sec}
                    </h3>
                    <ul className="m-0 mt-2 list-none p-0">
                      {shown
                        .filter((i) => i.section === sec)
                        .map((i) => (
                          <li
                            key={i.itemId}
                            className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0"
                          >
                            <span className="min-w-0">
                              <span className="text-[15.5px] font-bold">{i.name}</span>
                              {i.description && (
                                <span className="mt-0.5 block text-[13.5px] text-ink-2">
                                  {i.description}
                                </span>
                              )}
                            </span>
                            <span className="num shrink-0 text-[15px] font-bold">
                              {formatCents(i.priceCents)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
                <p className="mt-5 text-[13px] text-ink-3">
                  This menu is read live from the kitchen&rsquo;s own system. Sold-out items
                  disappear from here automatically.
                </p>
              </section>
            );
          }

          if (s.kind === "about") {
            return (
              <section key={s.id} className="border-t border-line py-10">
                <h2 className="text-[22px] font-extrabold">{s.heading}</h2>
                <p className="mt-2 max-w-[62ch] text-[15.5px] leading-relaxed text-ink-2">
                  {s.body}
                </p>
              </section>
            );
          }

          if (s.kind === "hours") {
            return (
              <section key={s.id} className="border-t border-line py-10">
                <h2 className="text-[22px] font-extrabold">{s.heading}</h2>
                <p className="mt-2 text-[15.5px] font-semibold">{org.address}</p>
                <p className="mt-1 text-[15px] text-ink-2">
                  Open daily &middot; {Math.round(org.prepBaseSeconds / 60)} min average prep
                </p>
              </section>
            );
          }

          if (s.kind === "reviews") {
            return (
              <section key={s.id} className="border-t border-line py-10">
                <h2 className="text-[22px] font-extrabold">{s.heading}</h2>
                <p className="num mt-2 text-[15.5px]">
                  <span className="font-extrabold">{org.rating.toFixed(1)}</span> out of 5 from{" "}
                  {org.ratingCount.toLocaleString()} orders
                </p>
              </section>
            );
          }

          if (s.kind === "catering") {
            return (
              <section key={s.id} className="border-t border-line py-10">
                <h2 className="text-[22px] font-extrabold">{s.heading}</h2>
                <p className="mt-2 max-w-[62ch] text-[15.5px] leading-relaxed text-ink-2">
                  {s.body}
                </p>
                {s.email && (
                  <p className="mt-2 text-[15px] font-bold">
                    <a href={`mailto:${s.email}`}>{s.email}</a>
                  </p>
                )}
              </section>
            );
          }

          return null;
        })}
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto max-w-[900px] px-5 text-[13px] text-ink-3">
          {org.brandName} &middot; {org.address} &middot; Powered by Mobile Dinners
        </div>
      </footer>
    </div>
  );
}
