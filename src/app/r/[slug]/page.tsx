import { notFound } from "next/navigation";
import { getRestaurant } from "@/lib/orders";
import { publishedMenu } from "@/lib/menu";
import { fastestPrepSeconds } from "@/lib/feed";
import { Storefront } from "@/components/Storefront";

export const dynamic = "force-dynamic";

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = getRestaurant(slug);
  if (!restaurant) notFound();

  // No published menu means the restaurant has signed up but never gone on
  // sale. There is nothing to show and nothing to order, so this is a 404
  // rather than an empty storefront that looks broken.
  const menu = publishedMenu(restaurant.orgId);
  if (menu.length === 0) notFound();

  const fastest = fastestPrepSeconds(menu);
  const etaLow = Math.round((restaurant.prepBaseSeconds * 0.5 + fastest) / 60) + 8;

  return (
    <Storefront
      restaurant={restaurant}
      menu={menu}
      etaLow={etaLow}
      etaHigh={etaLow + 8}
    />
  );
}
