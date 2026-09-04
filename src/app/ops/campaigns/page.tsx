import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRestaurantById } from "@/lib/orders";
import { listCampaigns, measure, previewAudience, TEMPLATES } from "@/lib/campaigns";
import { profiles } from "@/lib/crm";
import { Campaigns } from "@/components/Campaigns";
import type { Segment } from "@/lib/crm-labels";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/campaigns");

  const active = getRestaurantById(session.orgId);
  if (!active) redirect("/staff/login");

  const all = profiles(active.orgId);
  const segmentSizes = Object.fromEntries(
    (["champion", "loyal", "promising", "at_risk", "lapsed", "one_time"] as Segment[]).map(
      (s) => [s, all.filter((p) => p.segment === s).length],
    ),
  );

  const campaigns = listCampaigns(active.orgId);

  return (
    <Campaigns
      active={active}
      staff={{ name: session.name, role: session.role }}
      templates={TEMPLATES}
      segmentSizes={segmentSizes}
      previews={Object.fromEntries(
        TEMPLATES.map((t) => [
          t.id,
          previewAudience(active.orgId, t.segment, t.channel, 10, t.offerType, t.offerValue),
        ]),
      )}
      campaigns={campaigns}
      results={Object.fromEntries(
        campaigns.map((c) => [c.campaignId, measure(active.orgId, c.campaignId)]),
      )}
    />
  );
}
