import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRestaurantById } from "@/lib/orders";
import { personOrders, profiles, summarize } from "@/lib/crm";
import type { Segment } from "@/lib/crm-labels";
import { Customers } from "@/components/Customers";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; person?: string; q?: string }>;
}) {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/customers");

  const active = getRestaurantById(session.orgId);
  if (!active) redirect("/staff/login");

  const { segment, person, q } = await searchParams;
  const all = profiles(active.orgId);

  const selected =
    person && all.find((p) => p.personId === person)
      ? {
          profile: all.find((p) => p.personId === person)!,
          orders: personOrders(active.orgId, person),
        }
      : null;

  return (
    <Customers
      active={active}
      staff={{ name: session.name, role: session.role }}
      summary={summarize(all)}
      profiles={all}
      segment={(segment as Segment) ?? null}
      query={q ?? ""}
      selected={selected}
    />
  );
}
