import { listRestaurants } from "@/lib/orders";
import { publishedMenu } from "@/lib/menu";
import { SearchClient, type SearchIndexEntry } from "@/components/SearchClient";
import type { FeedCard } from "@/components/RestaurantCard";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const cards: FeedCard[] = [];
  const dishes: SearchIndexEntry[] = [];

  for (const r of listRestaurants()) {
    const menu = publishedMenu(r.orgId);
    if (menu.length === 0) continue; // not open for business yet
    const fastest = Math.min(...menu.map((m) => m.prepSeconds));
    const ready = Math.round((r.prepBaseSeconds * 0.5 + fastest) / 60);

    cards.push({
      ...r,
      pickupLow: ready,
      pickupHigh: ready + 6,
      etaLow: ready + 8,
      etaHigh: ready + 16,
      soldOut: menu.filter((m) => !m.isAvailable).length,
    });

    for (const item of menu) {
      if (!item.isAvailable) continue;
      dishes.push({
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        imageKw: item.imageKw,
        brandName: r.brandName,
        slug: r.slug,
        cuisine: r.cuisine,
      });
    }
  }

  return <SearchClient initialQuery={q ?? ""} restaurants={cards} dishes={dishes} />;
}
