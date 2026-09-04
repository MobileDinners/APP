import Link from "next/link";
import { getWallet, listOrders, listRestaurants } from "@/lib/orders";
import { getSession } from "@/lib/auth";
import { formatCents, pointsToCents } from "@/lib/money";
import { FoodPhoto } from "@/components/FoodPhoto";
import { CheckIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const TIERS = [
  { name: "bronze", orders: 0, perk: "1× points" },
  { name: "silver", orders: 12, perk: "1.25× points" },
  { name: "gold", orders: 24, perk: "1.5× points + early access to new items" },
  { name: "platinum", orders: 48, perk: "2× points + priority prep" },
] as const;

export default async function RewardsPage() {
  const session = await getSession();
  if (session?.kind !== "person") {
    return (
      <main className="mx-auto max-w-[520px] px-4 py-20 text-center">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-card-2 text-[34px]">
          &#127873;
        </div>
        <h1 className="text-[22px] font-extrabold">Sign in to see your rewards</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          One points balance that works at every restaurant here.
        </p>
        <Link href="/signin?next=/rewards" className="btn btn-primary mt-6">
          Sign in
        </Link>
      </main>
    );
  }

  const wallet = getWallet(session.personId);
  const restaurants = listRestaurants();
  const orders = listOrders({ personId: session.personId, limit: 60 });

  const tierIndex = TIERS.findIndex((t) => t.name === wallet.tier);
  const next = TIERS[tierIndex + 1];
  const toNext = next ? Math.max(0, next.orders - wallet.ordersCount) : 0;
  const progress = next
    ? Math.min(100, ((wallet.ordersCount - TIERS[tierIndex].orders) /
        (next.orders - TIERS[tierIndex].orders)) * 100)
    : 100;

  // Achievements computed from real order history, not hardcoded.
  const settled = orders.filter((o) => o.state === "SETTLED");
  const cuisines = new Set(
    settled.map((o) => restaurants.find((r) => r.orgId === o.orgId)?.cuisine).filter(Boolean),
  );
  const brands = new Set(settled.map((o) => o.orgId));

  const achievements = [
    { label: "First order", hint: "Place your first order", done: settled.length >= 1, at: `${Math.min(settled.length, 1)}/1` },
    { label: "Neighborhood regular", hint: "Order 5 times", done: settled.length >= 5, at: `${Math.min(settled.length, 5)}/5` },
    { label: "Explorer", hint: "Try 3 cuisines", done: cuisines.size >= 3, at: `${Math.min(cuisines.size, 3)}/3` },
    { label: "Local supporter", hint: "Order from 4 restaurants", done: brands.size >= 4, at: `${Math.min(brands.size, 4)}/4` },
    { label: "Points saver", hint: "Bank 2,000 points", done: wallet.pointsBalance >= 2000, at: `${Math.min(wallet.pointsBalance, 2000)}/2000` },
    { label: "Big night", hint: "One order over $40", done: settled.some((o) => o.totalCents > 4000), at: settled.some((o) => o.totalCents > 4000) ? "1/1" : "0/1" },
  ];
  const earned = achievements.filter((a) => a.done).length;

  return (
    <main className="mx-auto max-w-[720px] px-4 py-4 md:px-6">
      <h1 className="text-[26px] font-extrabold">Rewards</h1>

      <section className="mt-4 overflow-hidden rounded-[20px] bg-brand p-5 text-brand-ink">
        <p className="text-[12px] font-bold uppercase tracking-wider opacity-80">
          Balance · works at every restaurant
        </p>
        <p className="num mt-1.5 text-[42px] font-extrabold leading-none">
          {wallet.pointsBalance.toLocaleString()}
        </p>
        <p className="mt-1 text-[15px] font-bold opacity-90">
          = {formatCents(pointsToCents(wallet.pointsBalance))} off any order
        </p>

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-[13px] font-bold">
            <span className="capitalize">{wallet.tier}</span>
            {next && <span className="capitalize opacity-80">{next.name}</span>}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/20">
            <div className="h-full rounded-full bg-white/90" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-[13px] font-semibold opacity-90">
            {next
              ? `${toNext} more order${toNext === 1 ? "" : "s"} to ${next.name} — ${next.perk}`
              : "Top tier. Nice."}
          </p>
        </div>
      </section>

      <h2 className="mb-3 mt-7 text-[17px] font-extrabold">Redeem near you</h2>
      <ul className="m-0 grid list-none gap-2 p-0">
        {restaurants.slice(0, 4).map((r, i) => {
          const cost = [400, 1000, 250, 750][i];
          const reward = ["Free side", "$10 off $25", "$5 off $20", "Free drink"][i];
          const affordable = wallet.pointsBalance >= cost;
          return (
            <li key={r.orgId}>
              <Link href={`/r/${r.slug}`} className="card flex items-center gap-3 p-3">
                <FoodPhoto
                  keyword={r.imageKw}
                  seed={r.orgId}
                  width={160}
                  height={160}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-[12px]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-extrabold">{r.brandName}</p>
                  <p className="text-[13px] text-ink-2">{reward}</p>
                </div>
                <span
                  className={`badge shrink-0 ${affordable ? "badge-green" : "badge-muted"}`}
                >
                  {affordable ? `${cost} pts` : `${cost} pts`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <h2 className="mb-1 mt-7 text-[17px] font-extrabold">Achievements</h2>
      <p className="mb-3 text-[14px] text-ink-2">
        {earned} of {achievements.length} unlocked
      </p>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
        {achievements.map((a) => (
          <li
            key={a.label}
            className={`card p-3 text-center ${a.done ? "" : "opacity-65"}`}
          >
            <span
              className={`mx-auto grid h-11 w-11 place-items-center rounded-full ${
                a.done ? "bg-green-soft text-green" : "bg-card-2 text-ink-3"
              }`}
            >
              {a.done ? <CheckIcon className="h-5 w-5" /> : <span className="text-[17px]">🔒</span>}
            </span>
            <p className="mt-2 text-[13.5px] font-extrabold leading-tight">{a.label}</p>
            <p className="mt-0.5 text-[12px] leading-tight text-ink-2">{a.hint}</p>
            <p className="num mt-1 text-[11px] font-bold text-ink-3">{a.at}</p>
          </li>
        ))}
      </ul>

      <section className="card mt-7 p-4">
        <h2 className="text-[16px] font-extrabold">How points work here</h2>
        <ul className="mt-2 list-none space-y-2 p-0 text-[14px] leading-relaxed text-ink-2">
          <li>
            <span className="font-bold text-ink">10 points per $1</span> on the food subtotal —
            never on tax, tips, or delivery fees.
          </li>
          <li>
            <span className="font-bold text-ink">100 points = $1 off</span>, and they spend at
            any restaurant on Mobile Dinners, not just the one that gave them to you.
          </li>
          <li>
            The restaurant you redeem at still gets paid in full — we settle it, so no one
            loses money because you saved up.
          </li>
        </ul>
      </section>
    </main>
  );
}
