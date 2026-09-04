import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRestaurantById, listOrders } from "@/lib/orders";
import { KdsClient } from "@/components/KdsClient";

export const dynamic = "force-dynamic";

export default async function KdsPage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/kds");

  const active = getRestaurantById(session.orgId);
  if (!active) redirect("/staff/login");

  return (
    <KdsClient
      active={active}
      staff={{ name: session.name, role: session.role }}
      orders={listOrders({ orgId: active.orgId, open: true, limit: 24 })}
      serverNow={Date.now()}
    />
  );
}
