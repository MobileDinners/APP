import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRestaurantById } from "@/lib/orders";
import { auditSeo, checkClaims, getSite } from "@/lib/site";
import { SiteEditor } from "@/components/SiteEditor";

export const dynamic = "force-dynamic";

export default async function SitePage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/site");

  const active = getRestaurantById(session.orgId);
  if (!active) redirect("/staff/login");

  const site = getSite(active.orgId);

  return (
    <SiteEditor
      active={active}
      staff={{ name: session.name, role: session.role }}
      site={site}
      claims={checkClaims(site.draft)}
      seo={auditSeo(active.orgId)}
    />
  );
}
