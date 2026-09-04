import { notFound } from "next/navigation";
import { getOrder } from "@/lib/orders";
import { getSession } from "@/lib/auth";
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

  // Your own order, or an order at the restaurant you work for. Anything else
  // is a 404 rather than a 403, so ids cannot be probed.
  const allowed =
    order &&
    (session?.kind === "staff"
      ? order.orgId === session.orgId
      : session?.kind === "person" && order.personId === session.personId);
  if (!order || !allowed) notFound();
  return <TrackClient order={order} />;
}
