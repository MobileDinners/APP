import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRestaurantById } from "@/lib/orders";
import { buildProposals, itemStats, summarize } from "@/lib/optimizer";
import { currentVersion, pendingChanges } from "@/lib/menu";
import { getDb } from "@/lib/db";
import { Optimizer } from "@/components/Optimizer";

export const dynamic = "force-dynamic";

export default async function OptimizerPage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/optimizer");

  const active = getRestaurantById(session.orgId);
  if (!active) redirect("/staff/login");

  const decisions = getDb()
    .prepare(
      `SELECT decision_id, item_id, verdict, proposal_json, created_at
       FROM ai_decisions WHERE org_id = ? ORDER BY created_at DESC LIMIT 8`,
    )
    .all(active.orgId) as unknown as Array<{
      decision_id: string; item_id: string; verdict: string;
      proposal_json: string; created_at: string;
    }>;

  return (
    <Optimizer
      active={active}
      staff={{ name: session.name, role: session.role }}
      summary={summarize(active.orgId)}
      proposals={buildProposals(active.orgId)}
      stats={itemStats(active.orgId)}
      pendingCount={pendingChanges(active.orgId).length}
      liveVersion={currentVersion(active.orgId)?.versionNo ?? null}
      decisions={decisions.map((d) => ({
        id: d.decision_id,
        itemId: d.item_id,
        verdict: d.verdict as "accepted" | "dismissed",
        name: (JSON.parse(d.proposal_json) as { name: string }).name,
        createdAt: d.created_at,
      }))}
    />
  );
}
