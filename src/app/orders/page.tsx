import Link from "next/link";
import { listOrders } from "@/lib/orders";
import { getSession } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { STATE_LABELS } from "@/lib/state-labels";
import { FoodPhoto } from "@/components/FoodPhoto";
import { ChevronIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getSession();
  if (session?.kind !== "person") return <SignedOut />;

  const orders = listOrders({ personId: session.personId, limit: 40 });
  const live = orders.filter(
    (o) => !["SETTLED", "CANCELLED", "FAILED"].includes(o.state),
  );
  const past = orders.filter((o) => ["SETTLED", "CANCELLED", "FAILED"].includes(o.state));

  return (
    <main className="mx-auto max-w-[720px] px-4 py-4 md:px-6">
      <h1 className="text-[26px] font-extrabold">Orders</h1>

      {orders.length === 0 && (
        <div className="py-20 text-center">
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-card-2 text-[34px]">
            🧾
          </div>
          <p className="text-[18px] font-extrabold">No orders yet</p>
          <p className="mt-1.5 text-[14px] text-ink-2">
            Your orders will show up here, with live tracking while they’re on the way.
          </p>
          <Link href="/" className="btn btn-primary mt-6">
            Find something to eat
          </Link>
        </div>
      )}

      {live.length > 0 && (
        <>
          <h2 className="mb-3 mt-5 text-[17px] font-extrabold">In progress</h2>
          <ul className="m-0 grid list-none gap-3 p-0">
            {live.map((o) => (
              <li key={o.orderId}>
                <Link
                  href={`/track/${o.orderId}`}
                  className="card flex items-center gap-3 p-3 ring-2 ring-brand"
                >
                  <FoodPhoto
                    keyword="food"
                    seed={o.orgId}
                    width={160}
                    height={160}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-[12px]"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="badge badge-brand">{STATE_LABELS[o.state]}</span>
                    <p className="mt-1 truncate text-[16px] font-extrabold">{o.brandName}</p>
                    <p className="num truncate text-[13px] text-ink-2">
                      {o.lines.reduce((n, l) => n + l.qty, 0)} items ·{" "}
                      {formatCents(o.totalCents)}
                    </p>
                  </div>
                  <ChevronIcon className="h-5 w-5 shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-7 text-[17px] font-extrabold">Past orders</h2>
          <ul className="m-0 grid list-none gap-3 p-0">
            {past.map((o) => (
              <li key={o.orderId} className="card p-3">
                <div className="flex items-center gap-3">
                  <FoodPhoto
                    keyword="food"
                    seed={o.orgId}
                    width={160}
                    height={160}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-[12px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-extrabold">{o.brandName}</p>
                    <p className="truncate text-[13px] text-ink-2">
                      {o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                    </p>
                    <p className="num mt-0.5 text-[13px] text-ink-3">
                      {new Date(o.placedAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {formatCents(o.totalCents)}
                      {o.pointsEarned > 0 && o.state === "SETTLED" && (
                        <span className="font-bold text-green"> · +{o.pointsEarned} pts</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link href={`/r/${o.slug}`} className="btn btn-secondary flex-1 py-2.5 text-[14px]">
                    Order again
                  </Link>
                  <Link
                    href={`/track/${o.orderId}`}
                    className="btn btn-outline flex-1 py-2.5 text-[14px]"
                  >
                    View receipt
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function SignedOut() {
  return (
    <main className="mx-auto max-w-[520px] px-4 py-20 text-center">
      <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-card-2 text-[34px]">
        &#129534;
      </div>
      <h1 className="text-[22px] font-extrabold">Sign in to see your orders</h1>
      <p className="mt-2 text-[15px] text-ink-2">
        Your order history and live tracking live here.
      </p>
      <Link href="/signin?next=/orders" className="btn btn-primary mt-6">
        Sign in
      </Link>
    </main>
  );
}
