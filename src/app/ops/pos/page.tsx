import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRestaurantById } from "@/lib/orders";
import { availableProviders } from "@/lib/pos";
import { getConnection, pendingPushes, syncHistory } from "@/lib/pos/sync";
import { getDb } from "@/lib/db";
import { PosConnect } from "@/components/PosConnect";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/pos");

  const active = getRestaurantById(session.orgId);
  if (!active) redirect("/staff/login");

  const { msg } = await searchParams;
  const connection = getConnection(active.orgId);

  const mapped = connection
    ? (getDb()
        .prepare("SELECT COUNT(*) AS n FROM pos_item_map WHERE org_id = ?")
        .get(active.orgId) as { n: number }).n
    : 0;

  return (
    <PosConnect
      active={active}
      staff={{ name: session.name, role: session.role }}
      providers={availableProviders()}
      connection={connection}
      mappedCount={mapped}
      history={syncHistory(active.orgId, 6)}
      pending={pendingPushes(active.orgId)}
      message={msg ?? null}
    />
  );
}
