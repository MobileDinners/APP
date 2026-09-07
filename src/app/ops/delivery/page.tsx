import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getRestaurantById } from "@/lib/orders";
import { formatCents } from "@/lib/money";
import { deliveryMode } from "@/lib/delivery";
import { deliveryEconomics, listDeliveries } from "@/lib/delivery/store";
import { SignOut } from "@/components/SignOut";

export const dynamic = "force-dynamic";

/**
 * What delivery costs, per order and in total.
 *
 * The headline is the net, not the volume. A courier network charges more per
 * drop than a flat guest fee collects, and a dashboard that only counted
 * deliveries would let that gap compound quietly until someone read a bank
 * statement.
 */
export default async function DeliveryOpsPage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/delivery");

  const org = getRestaurantById(session.orgId);
  if (!org) redirect("/staff/login");

  const rows = listDeliveries(session.orgId, 50);
  const econ = deliveryEconomics(session.orgId);
  const mode = deliveryMode();
  const perDelivery = econ.count > 0 ? Math.round(econ.netCents / econ.count) : 0;

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">Delivery</h1>
          <p className="mt-0.5 text-[14px] text-ink-2">
            {org.brandName} · DoorDash Drive
          </p>
        </div>
        <SignOut name={session.name} />
      </div>

      {mode === "none" && (
        <p className="mt-5 rounded-[12px] bg-amber-soft px-4 py-3 text-[14px] font-semibold text-amber">
          No courier network is connected on this deployment, so a local sandbox
          is standing in. Nobody is dispatched, and the fees below are estimates.
          Add the <code className="mono">DOORDASH_*</code> keys to{" "}
          <code className="mono">.env.local</code> to book real Dashers.
        </p>
      )}
      {mode === "unlabelled" && (
        <p className="mt-5 rounded-[12px] bg-amber-soft px-4 py-3 text-[14px] font-semibold text-amber">
          DoorDash credentials are set and requests go to their <strong>production</strong>
          {" "}endpoint, but nothing says whether these are sandbox or live credentials.
          Marking a delivery order ready may dispatch a real Dasher to a real address.
          Set <code className="mono">DOORDASH_ENV</code> to <code className="mono">sandbox</code>
          {" "}or <code className="mono">live</code> once you know which you hold.
        </p>
      )}
      {mode === "sandbox" && (
        <p className="mt-5 rounded-[12px] bg-blue-soft px-4 py-3 text-[14px] font-semibold text-blue">
          DoorDash is in <strong>sandbox</strong>. Deliveries are simulated on
          their side and no Dasher is really sent.
        </p>
      )}

      <section className="mt-5 grid gap-3 sm:grid-cols-4">
        <Tile label="Deliveries" value={String(econ.count)} />
        <Tile label="Guests paid" value={formatCents(econ.guestCents)} />
        <Tile label="Couriers charged" value={formatCents(econ.courierCents)} />
        <Tile
          label="Net per delivery"
          value={formatCents(perDelivery)}
          tone={perDelivery < 0 ? "bad" : "good"}
          note={
            econ.count === 0
              ? "No deliveries yet"
              : perDelivery < 0
                ? "Each delivery costs more than the fee collected"
                : "Fees cover the courier"
          }
        />
      </section>

      <section className="card mt-5 p-5">
        <h2 className="text-[18px] font-extrabold">Recent deliveries</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-[14.5px] text-ink-2">
            None yet. A courier is booked when a delivery order is marked ready.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line-2">
                  {["Order", "Status", "Courier", "Guest paid", "Courier fee", "Net"].map(
                    (h) => (
                      <th
                        key={h}
                        className="pb-2.5 pr-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-ink-3"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const net = d.guestFeeCents - d.courierFeeCents;
                  return (
                    <tr key={d.deliveryId} className="border-b border-line">
                      <td className="py-3 pr-3">
                        <Link
                          href={`/track/${d.orderId}`}
                          className="mono text-[12.5px] text-brand-strong hover:underline"
                        >
                          {d.orderId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={
                            d.status === "delivered"
                              ? "badge badge-green"
                              : d.status === "cancelled"
                                ? "badge badge-red"
                                : "badge badge-amber"
                          }
                        >
                          {d.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-[14px]">{d.courierName ?? "—"}</td>
                      <td className="num py-3 pr-3 text-[14px] text-ink-2">
                        {formatCents(d.guestFeeCents)}
                      </td>
                      <td className="num py-3 pr-3 text-[14px] text-ink-2">
                        {formatCents(d.courierFeeCents)}
                      </td>
                      <td
                        className={`num py-3 pr-3 text-[14px] font-bold ${
                          net < 0 ? "text-red" : "text-green"
                        }`}
                      >
                        {formatCents(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
          The courier fee is what DoorDash Drive charges Mobile Dinners for the
          drop. It is never deducted from the restaurant — the whole ticket still
          reaches the kitchen. The gap between those two columns is a platform
          cost, shown per delivery so the guest fee can be priced against
          something real.
        </p>
      </section>
    </main>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="card p-4">
      <p className="text-[12px] font-bold uppercase tracking-wider text-ink-3">{label}</p>
      <p
        className={`num mt-1.5 text-[24px] font-extrabold leading-none ${
          tone === "bad" ? "text-red" : tone === "good" ? "text-green" : ""
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{note}</p>}
    </div>
  );
}
