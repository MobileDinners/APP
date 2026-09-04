import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRestaurantById, listMenu } from "@/lib/orders";
import { currentVersion, listVersions, pendingChanges } from "@/lib/menu";
import { MenuEditor } from "@/components/MenuEditor";
import { PHOTOS } from "@/lib/photos";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/menu");

  const active = getRestaurantById(session.orgId);
  if (!active) redirect("/staff/login");

  return (
    <MenuEditor
      active={active}
      staff={{ name: session.name, role: session.role }}
      items={listMenu(active.orgId)}
      live={currentVersion(active.orgId)}
      versions={listVersions(active.orgId, 8)}
      changes={pendingChanges(active.orgId)}
      photoKeywords={Object.keys(PHOTOS).sort()}
    />
  );
}
