import { notFound } from "next/navigation";
import { getOrder } from "@/lib/orders";
import { getSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/site-content";
import { TrackClient } from "@/components/TrackClient";

export const dynamic = "force-dynamic";

export default async function TrackPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const session = await getSession();
  const order = getOrder(orderId);

  // Your own order, an order at the restaurant you work for, or any order if
  // you administer the platform — support cannot help with a complaint about
  // an order it is not allowed to look at, and the admin order page links
  // straight here. Anything else is a 404 rather than a 403, so ids cannot be
  // probed.
  const allowed =
    order &&
    (session?.kind === "staff"
      ? order.orgId === session.orgId || isPlatformAdmin(session.email)
      : session?.kind === "person" && order.personId === session.personId);
  if (!order || !allowed) notFound();
  return <TrackClient order={order} />;
}
