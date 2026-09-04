import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { dayStats, getRestaurantById, listMenu, listOrders } from "@/lib/orders";
import { OpsClient } from "@/components/OpsClient";

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops");

  // Scope comes from the session, never from a query parameter — staff can
  // only ever see the restaurant they belong to.
  const active = getRestaurantById(session.orgId);
  if (!active) redirect("/staff/login");

  const orders = listOrders({ orgId: active.orgId, limit: 40 });
  const menu = listMenu(active.orgId);

  return (
    <OpsClient
      active={active}
      staff={{ name: session.name, role: session.role }}
      orders={orders}
      menu={menu}
      stats={dayStats(active.orgId)}
    />
  );
}
