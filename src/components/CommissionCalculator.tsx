"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * The commission math, run live.
 *
 * Every number here is arithmetic the visitor can check on paper, and every
 * assumption is printed under the result. A marketing calculator that hides its
 * inputs is a marketing calculator nobody believes.
 */

const RATES = [
  { pct: 15, label: "15%", note: "Pickup / basic tier" },
  { pct: 25, label: "25%", note: "Standard delivery" },
  { pct: 30, label: "30%", note: "Top placement tier" },
];

/** Plan is chosen by volume, matching the published tiers. */
function planFor(orders: number): { name: string; monthly: number } {
  if (orders <= 400) return { name: "Starter", monthly: 99 };
  if (orders <= 1600) return { name: "Growth", monthly: 299 };
  return { name: "Scale", monthly: 599 };
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CommissionCalculator() {
  const [orders, setOrders] = useState(620);
  const [ticket, setTicket] = useState(38);
  const [pct, setPct] = useState(25);

  const gmv = orders * ticket;

  // Aggregator: commission is charged on the whole order and already includes
  // card processing, so it is the single line to compare against.
  const aggregatorCost = gmv * (pct / 100);

  // Mobile Dinners: subscription + card processing at cost-plus. 2.9% + 30c is
  // the card-not-present rate; nothing is taken off the order itself.
  const plan = planFor(orders);
  const processing = gmv * 0.029 + orders * 0.3;
  const mdCost = plan.monthly + processing;

  const saved = aggregatorCost - mdCost;
  const savedYear = saved * 12;
  const keptPct = gmv > 0 ? ((gmv - mdCost) / gmv) * 100 : 0;
  const aggKeptPct = gmv > 0 ? ((gmv - aggregatorCost) / gmv) * 100 : 0;

  const max = Math.max(aggregatorCost, mdCost, 1);

  return (
    <div className="rounded-[20px] border border-line bg-card p-5 shadow-[var(--shadow-md)] md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-extrabold">What commission costs you</h2>
        <span className="rounded-full bg-card-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
          Live math
        </span>
      </div>

      <div className="mt-5 grid gap-5">
        <Slider
          label="Marketplace orders a month"
          value={orders}
          min={100}
          max={3000}
          step={20}
          display={orders.toLocaleString()}
          onChange={setOrders}
        />
        <Slider
          label="Average ticket"
          value={ticket}
          min={12}
          max={90}
          step={1}
          display={`$${ticket}`}
          onChange={setTicket}
        />

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-bold text-ink-2">
            Their commission rate
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {RATES.map((r) => (
              <button
                key={r.pct}
                type="button"
                onClick={() => setPct(r.pct)}
                aria-pressed={pct === r.pct}
                className={`rounded-[12px] border px-2 py-2.5 text-center transition-colors ${
                  pct === r.pct
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-line bg-card-2 text-ink-2 hover:border-line-2"
                }`}
              >
                <span className="num block text-[17px] font-extrabold leading-none">
                  {r.label}
                </span>
                <span className="mt-1 block text-[11px] font-semibold leading-tight opacity-80">
                  {r.note}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-6 grid gap-3 border-t border-line pt-5">
        <Bar
          label={`Third-party app · ${pct}% commission`}
          amount={aggregatorCost}
          fraction={aggregatorCost / max}
          tone="bad"
          sub={`You keep ${aggKeptPct.toFixed(1)}% of ${usd(gmv)}`}
        />
        <Bar
          label={`Mobile Dinners · ${plan.name} plan`}
          amount={mdCost}
          fraction={mdCost / max}
          tone="good"
          sub={`${usd(plan.monthly)} plan + ${usd(processing)} card processing · you keep ${keptPct.toFixed(1)}%`}
        />
      </div>

      <div className="mt-5 rounded-[16px] bg-green-soft p-4">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.09em] text-green">
          You keep instead
        </p>
        <p className="num mt-1 text-[34px] font-extrabold leading-none text-green">
          {saved > 0 ? usd(saved) : usd(0)}
          <span className="text-[15px] font-bold"> / month</span>
        </p>
        <p className="num mt-1.5 text-[14px] font-bold text-green">
          {savedYear > 0 ? usd(savedYear) : usd(0)} a year, on the same orders.
        </p>
      </div>

      <Link href="/partners/signup" className="btn btn-primary mt-4 w-full">
        Start free and keep it all
      </Link>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
        Assumes {orders.toLocaleString()} orders a month at a {usd(ticket)} ticket
        ({usd(gmv)} in monthly sales). Card processing on Mobile Dinners is 2.9% +
        30¢ card-not-present, billed at cost-plus and shown on every payout. Plan
        is billed per location, annually. Third-party commission rates are the
        published US rates for the tiers named above and already include their
        processing.
      </p>
    </div>
  );
}

function Slider({
  label, value, min, max, step, display, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[13px] font-bold text-ink-2">{label}</span>
        <span className="num text-[17px] font-extrabold">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-card-2 accent-[var(--brand)]"
      />
    </label>
  );
}

function Bar({
  label, amount, fraction, tone, sub,
}: {
  label: string;
  amount: number;
  fraction: number;
  tone: "bad" | "good";
  sub: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-bold">{label}</span>
        <span
          className={`num text-[18px] font-extrabold ${tone === "bad" ? "text-red" : "text-green"}`}
        >
          {usd(amount)}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-card-2">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            tone === "bad" ? "bg-red" : "bg-green"
          }`}
          style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%` }}
        />
      </div>
      <p className="num mt-1 text-[12px] text-ink-3">{sub}</p>
    </div>
  );
}
