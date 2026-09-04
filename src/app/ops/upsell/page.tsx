import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRestaurantById } from "@/lib/orders";
import { stats, topPairs } from "@/lib/upsell";
import { UpsellPerformance } from "@/components/UpsellPerformance";

export const dynamic = "force-dynamic";

export default async function UpsellPage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/upsell");

  const active = getRestaurantById(session.orgId);
  if (!active) redirect("/staff/login");

  return (
    <UpsellPerformance
      active={active}
      staff={{ name: session.name, role: session.role }}
      stats={stats(active.orgId)}
      pairs={topPairs(active.orgId, 12)}
    />
  );
}
