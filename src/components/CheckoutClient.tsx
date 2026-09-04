"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { computeTotals, formatCents, pointsToCents } from "@/lib/money";
import type { Fulfillment, Order, Restaurant, Wallet } from "@/lib/types";
import { useCart } from "./CartProvider";
import { UpsellRail } from "./UpsellRail";
import type { Suggestion } from "@/lib/upsell-types";
import { FoodPhoto } from "./FoodPhoto";
import { VerifySheet } from "./VerifySheet";
import { BackIcon, ClockIcon, PinIcon } from "./icons";

const TIP_PERCENTS = [0, 15, 20, 25];

export function CheckoutClient({
  wallet,
  restaurants,
}: {
  /** null for a signed-out diner — they have no points to spend yet. */
  wallet: Wallet | null;
  restaurants: Restaurant[];
}) {
  const router = useRouter();
  const { cart, subtotalCents, setQty, removeLine, clear, addLine, hydrated } = useCart();

  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [tipPercent, setTipPercent] = useState(20);
  const [usePoints, setUsePoints] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const restaurant = restaurants.find((r) => r.orgId === cart.orgId) ?? null;
  const maxRedeemable = wallet
    ? Math.min(wallet.pointsBalance, Math.floor(subtotalCents))
    : 0;
  const pointsToRedeem = usePoints ? maxRedeemable : 0;

  const totals = useMemo(() => {
    const tipCents =
      fulfillment === "delivery" ? Math.round((subtotalCents * tipPercent) / 100) : 0;
    return computeTotals({
      subtotalCents,
      fulfillment,
      deliveryFeeCents: restaurant?.deliveryFeeCents ?? 0,
      tipCents,
      pointsToRedeem,
      tierMultiplier: restaurant?.pointsMultiplier ?? 1,
    });
  }, [subtotalCents, fulfillment, tipPercent, pointsToRedeem, restaurant]);

  /**
   * The checkout button. For a signed-out diner this opens verification rather
   * than navigating away, so the cart, the tip and the fulfilment choice all
   * survive — leaving the page to sign in is what loses the order.
   */
  function checkout() {
    if (!restaurant || cart.lines.length === 0) return;
    if (!wallet) {
      setVerifying(true);
      return;
    }
    void placeOrder();
  }

  async function placeOrder() {
    if (!restaurant || cart.lines.length === 0) return;
    setPlacing(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `${cart.lines.map((l) => l.lineId).join("|")}::${Date.now()}`,
        },
        body: JSON.stringify({
          orgId: restaurant.orgId,
          fulfillment,
          tipCents: totals.tipCents,
          pointsToRedeem,
          lines: cart.lines.map((l) => ({
            itemId: l.itemId,
            qty: l.qty,
            choiceIds: l.choiceIds,
            notes: l.notes,
          })),
        }),
      });
      const data = (await res.json()) as { order?: Order; error?: string; code?: string };
      if (res.status === 401) {
        // Session expired between opening the cart and paying. Verify in place
        // rather than navigating away — the cart survives either way, but the
        // person's attention does not.
        setPlacing(false);
        setVerifying(true);
        return;
      }
      if (!res.ok || !data.order) {
        setError(data.error ?? "Could not place the order");
        setPlacing(false);
        return;
      }
      clear();
      router.push(`/track/${data.order.orderId}`);
    } catch {
      setError("Network problem — your cart is safe, try again");
      setPlacing(false);
    }
  }

  if (!hydrated) {
    return <main className="px-4 py-20 text-center text-ink-3">Loading your cart…</main>;
  }

  if (!restaurant || cart.lines.length === 0) {
    return (
      <main className="mx-auto max-w-[520px] px-4 py-20 text-center">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-card-2 text-[34px]">
          🛍️
        </div>
        <h1 className="text-[24px] font-extrabold">Your cart is empty</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          Add something from a restaurant near you.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Browse restaurants
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[620px] px-4 pb-40 md:px-6">
      <div className="flex items-center gap-3 py-3">
        <Link
          href={`/r/${restaurant.slug}`}
          aria-label="Back to menu"
          className="grid h-9 w-9 place-items-center rounded-full bg-card-2"
        >
          <BackIcon className="h-[18px] w-[18px]" />
        </Link>
        <h1 className="text-[22px] font-extrabold">Checkout</h1>
      </div>

      <section className="card p-4">
        <p className="text-[16px] font-extrabold">{restaurant.brandName}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
          <ClockIcon className="h-3.5 w-3.5" />
          Ready in about {Math.round(restaurant.prepBaseSeconds / 60)} min
        </p>

        <ul className="m-0 mt-3 list-none border-t border-line p-0">
          {cart.lines.map((line) => (
            <li key={line.lineId} className="flex gap-3 border-b border-line py-3 last:border-0">
              <FoodPhoto
                keyword="food"
                seed={line.itemId}
                width={160}
                height={160}
                alt=""
                className="h-14 w-14 shrink-0 rounded-[10px]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold">{line.name}</p>
                {line.optionsLabel && (
                  <p className="mt-0.5 text-[13px] text-ink-2">{line.optionsLabel}</p>
                )}
                {line.notes && (
                  <p className="mt-0.5 text-[13px] italic text-ink-3">“{line.notes}”</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-full bg-card-2 p-0.5">
                    <button
                      type="button"
                      onClick={() => setQty(line.lineId, line.qty - 1)}
                      aria-label={`Decrease ${line.name}`}
                      className="grid h-7 w-7 place-items-center rounded-full text-[17px] font-bold hover:bg-line"
                    >
                      −
                    </button>
                    <span className="num w-5 text-center text-[14px] font-extrabold">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(line.lineId, line.qty + 1)}
                      aria-label={`Increase ${line.name}`}
                      className="grid h-7 w-7 place-items-center rounded-full text-[17px] font-bold hover:bg-line"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.lineId)}
                    className="text-[13px] font-bold text-ink-3 hover:text-red"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <span className="num shrink-0 text-[15px] font-extrabold">
                {formatCents(line.unitPriceCents * line.qty)}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href={`/r/${restaurant.slug}`}
          className="mt-3 inline-block text-[14px] font-bold text-brand-strong"
        >
          + Add more items
        </Link>
      </section>

      <UpsellRail
        orgId={restaurant.orgId}
        cartItemIds={cart.lines.map((l) => l.itemId)}
        onAdd={(sug: Suggestion) =>
          addLine(
            {
              orgId: restaurant.orgId,
              slug: restaurant.slug,
              brandName: restaurant.brandName,
            },
            {
              itemId: sug.itemId,
              name: sug.name,
              qty: 1,
              unitPriceCents: sug.priceCents,
              optionsLabel: "",
              choiceIds: [],
              notes: "",
            },
          )
        }
      />

      <section className="card mt-3 p-4">
        <h2 className="text-[16px] font-extrabold">How do you want it?</h2>
        <p className="mb-2.5 mt-0.5 text-[13px] text-ink-2">
          Delivery is priced by distance from the restaurant to your address.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["delivery", "pickup"] as Fulfillment[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFulfillment(f)}
              className={`rounded-[12px] px-3 py-3 text-left transition-colors ${
                fulfillment === f
                  ? "bg-brand-soft ring-2 ring-brand"
                  : "bg-card-2 hover:bg-line"
              }`}
            >
              <span className="block text-[15px] font-extrabold capitalize">{f}</span>
              <span className="num mt-0.5 block text-[13px] text-ink-2">
                {f === "delivery"
                  ? `${formatCents(restaurant.deliveryFeeCents)} · ${restaurant.distanceMi} mi`
                  : "No delivery fee"}
              </span>
            </button>
          ))}
        </div>
        {fulfillment === "delivery" && (
          <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-card-2 px-3 py-2.5 text-[14px]">
            <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-strong" />
            <span>
              <span className="font-bold">742 Elm St, Apt 4B</span>
              <br />
              <span className="text-ink-2">“Buzzer broken, call me”</span>
            </span>
          </p>
        )}
      </section>

      {maxRedeemable > 0 && (
        <section className="card mt-3 p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={usePoints}
              onChange={(e) => setUsePoints(e.target.checked)}
              className="h-[18px] w-[18px] accent-[var(--brand)]"
            />
            <span className="flex-1">
              <span className="block text-[15px] font-extrabold">
                Use {maxRedeemable.toLocaleString()} points
              </span>
              <span className="num block text-[13px] text-ink-2">
                Leaves you {((wallet?.pointsBalance ?? 0) - maxRedeemable).toLocaleString()} points
              </span>
            </span>
            <span className="num text-[15px] font-extrabold text-green">
              −{formatCents(pointsToCents(maxRedeemable))}
            </span>
          </label>
        </section>
      )}

      {fulfillment === "delivery" && (
        <section className="card mt-3 p-4">
          <h2 className="text-[16px] font-extrabold">Tip your driver</h2>
          <p className="mb-2.5 mt-0.5 text-[13px] text-ink-2">100% goes to the driver.</p>
          <div className="grid grid-cols-4 gap-2">
            {TIP_PERCENTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setTipPercent(p)}
                className={`num rounded-[12px] py-2.5 text-[14px] font-extrabold transition-colors ${
                  tipPercent === p
                    ? "bg-brand text-brand-ink"
                    : "bg-card-2 text-ink-2 hover:bg-line"
                }`}
              >
                {p === 0 ? "None" : `${p}%`}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card mt-3 p-4">
        <Row label="Subtotal" value={formatCents(totals.subtotalCents)} />
        {totals.discountCents > 0 && (
          <Row label="Points applied" value={`−${formatCents(totals.discountCents)}`} green />
        )}
        {fulfillment === "delivery" && (
          <Row
            label="Delivery fee"
            value={formatCents(totals.deliveryFeeCents)}
            note={`Based on your delivery address — ${restaurant.distanceMi} mi from ${restaurant.brandName}`}
          />
        )}
        <Row label="Service fee" value={formatCents(0)} green />
        <Row label="Tax" value={formatCents(totals.taxCents)} />
        {totals.tipCents > 0 && (
          <Row label="Driver tip" value={formatCents(totals.tipCents)} />
        )}
        <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[17px] font-extrabold">Total</span>
          <span className="num text-[19px] font-extrabold">
            {formatCents(totals.totalCents)}
          </span>
        </div>
        <p className="mt-3 rounded-[12px] bg-green-soft px-3 py-2.5 text-[13px] font-semibold text-green">
          100% of the {formatCents(totals.subtotalCents)} food total goes to{" "}
          {restaurant.brandName}. You’ll earn{" "}
          <span className="num font-extrabold">{totals.pointsEarned}</span> points
          {wallet ? "." : ", redeemable at any restaurant on Mobile Dinners."}
        </p>
      </section>

      {error && (
        <p className="mt-3 rounded-[12px] bg-red-soft px-4 py-3 text-[14px] font-semibold text-red">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/97 p-3 backdrop-blur-md">
        <div className="mx-auto max-w-[620px]">
          <button
            type="button"
            onClick={checkout}
            disabled={placing}
            className="btn btn-primary w-full justify-between"
          >
            <span>
              {placing
                ? "Placing your order…"
                : wallet
                  ? "Place order"
                  : "Continue to place order"}
            </span>
            <span className="num">{formatCents(totals.totalCents)}</span>
          </button>
        </div>
      </div>

      {verifying && (
        <VerifySheet
          totalLabel={formatCents(totals.totalCents)}
          pointsEarned={totals.pointsEarned}
          onVerified={() => {
            setVerifying(false);
            void placeOrder();
          }}
          onCancel={() => setVerifying(false)}
        />
      )}
    </main>
  );
}

function Row({
  label,
  value,
  green,
  note,
}: {
  label: string;
  value: string;
  green?: boolean;
  /** Shown under the label — for a charge that needs explaining as it is read. */
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-[14.5px] text-ink-2">{label}</span>
        {note && (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">
            {note}
          </span>
        )}
      </span>
      <span
        className={`num shrink-0 text-[14.5px] font-semibold ${green ? "text-green" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
