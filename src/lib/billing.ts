import { randomUUID } from "node:crypto";
import { getDb } from "./db";

/**
 * Subscription billing — the platform's actual revenue.
 *
 * Mobile Dinners takes 0% of a ticket, so unlike a commission marketplace the
 * subscription is not a side business: it is the whole one. That makes MRR the
 * single number the platform lives or dies by, and it had no model at all
 * before this file — the plans existed as prose on the pricing page.
 *
 * Nothing here talks to Stripe yet. The columns for it exist
 * (stripe_subscription_id, stripe_invoice_id) so that wiring it up later is a
 * write rather than a migration, but every figure below comes from our own
 * records. Where a number cannot be computed honestly, the caller is told so
 * rather than shown a zero that looks like a fact.
 */

export type Plan = "starter" | "growth" | "scale" | "enterprise";
export type SubStatus = "trialing" | "active" | "past_due" | "canceled";
export type InvoiceStatus = "paid" | "failed" | "refunded" | "open";

/**
 * The published price list, in cents per location per month.
 *
 * Annual billing is the published price; monthly billing is 20% higher, which
 * is what the pricing page says and what `monthlyPrice` below implements.
 * Enterprise is negotiated, so it has no list price and must be set per deal.
 */
export const PLANS: Record<Plan, { label: string; annualMonthlyCents: number | null }> = {
  starter: { label: "Starter", annualMonthlyCents: 9900 },
  growth: { label: "Growth", annualMonthlyCents: 29900 },
  scale: { label: "Scale", annualMonthlyCents: 59900 },
  enterprise: { label: "Enterprise", annualMonthlyCents: null },
};

/** Monthly-equivalent list price for a plan on a given billing interval. */
export function monthlyPrice(plan: Plan, interval: "month" | "year"): number | null {
  const base = PLANS[plan].annualMonthlyCents;
  if (base === null) return null;
  return interval === "year" ? base : Math.round(base * 1.2);
}

export type Subscription = {
  orgId: string;
  plan: Plan;
  status: SubStatus;
  /** Always the MONTHLY-equivalent, so MRR is a sum rather than a case. */
  priceCents: number;
  interval: "month" | "year";
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  createdAt: string;
};

type SubRow = {
  org_id: string;
  plan: Plan;
  status: SubStatus;
  price_cents: number;
  interval: "month" | "year";
  trial_ends_at: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
};

function toSub(r: SubRow): Subscription {
  return {
    orgId: r.org_id,
    plan: r.plan,
    status: r.status,
    priceCents: r.price_cents,
    interval: r.interval,
    trialEndsAt: r.trial_ends_at,
    currentPeriodEnd: r.current_period_end,
    canceledAt: r.canceled_at,
    createdAt: r.created_at,
  };
}

export function getSubscription(orgId: string): Subscription | null {
  const r = getDb()
    .prepare("SELECT * FROM subscriptions WHERE org_id = ?")
    .get(orgId) as SubRow | undefined;
  return r ? toSub(r) : null;
}

export function listSubscriptions(): Subscription[] {
  return (getDb().prepare("SELECT * FROM subscriptions").all() as SubRow[]).map(toSub);
}

/* ------------------------------------------------------------------ *
 * Revenue
 * ------------------------------------------------------------------ */

export type Mrr = {
  /** Committed monthly revenue: active plus past_due. */
  mrrCents: number;
  arrCents: number;
  /** Broken out because they are three very different kinds of number. */
  activeCents: number;
  pastDueCents: number;
  /** Not revenue yet — a trial has committed nothing. */
  trialingCents: number;
  counts: Record<SubStatus, number>;
};

/**
 * Monthly recurring revenue.
 *
 * `past_due` is COUNTED: the contract exists and the customer has not left,
 * they have a card that failed, and writing them out of MRR the day a payment
 * bounces hides exactly the problem worth seeing. `trialing` is EXCLUDED,
 * because nobody has agreed to pay anything yet, and counting trials is the
 * oldest way to flatter this number. Both are returned separately so the
 * dashboard can show the split rather than asking anyone to trust the total.
 */
export function computeMrr(): Mrr {
  const subs = listSubscriptions();
  const counts: Record<SubStatus, number> = {
    trialing: 0,
    active: 0,
    past_due: 0,
    canceled: 0,
  };
  let activeCents = 0;
  let pastDueCents = 0;
  let trialingCents = 0;

  for (const s of subs) {
    counts[s.status] += 1;
    if (s.status === "active") activeCents += s.priceCents;
    else if (s.status === "past_due") pastDueCents += s.priceCents;
    else if (s.status === "trialing") trialingCents += s.priceCents;
  }

  const mrrCents = activeCents + pastDueCents;
  return { mrrCents, arrCents: mrrCents * 12, activeCents, pastDueCents, trialingCents, counts };
}

export type Invoice = {
  invoiceId: string;
  orgId: string;
  amountCents: number;
  refundedCents: number;
  status: InvoiceStatus;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
};

type InvRow = {
  invoice_id: string;
  org_id: string;
  amount_cents: number;
  refunded_cents: number;
  status: InvoiceStatus;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
};

function toInv(r: InvRow): Invoice {
  return {
    invoiceId: r.invoice_id,
    orgId: r.org_id,
    amountCents: r.amount_cents,
    refundedCents: r.refunded_cents,
    status: r.status,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    paidAt: r.paid_at,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
  };
}

export function listInvoices(opts: { orgId?: string; status?: InvoiceStatus; limit?: number } = {}): Invoice[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.orgId) {
    where.push("org_id = ?");
    args.push(opts.orgId);
  }
  if (opts.status) {
    where.push("status = ?");
    args.push(opts.status);
  }
  const sql =
    "SELECT * FROM subscription_invoices" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY created_at DESC LIMIT ?";
  args.push(opts.limit ?? 200);
  return (getDb().prepare(sql).all(...args) as InvRow[]).map(toInv);
}

/** Collected, failed and refunded totals over the trailing `months` months. */
export function billingTotals(months = 12): {
  month: string;
  collectedCents: number;
  failedCents: number;
  refundedCents: number;
}[] {
  const rows = getDb()
    .prepare(
      `SELECT substr(created_at, 1, 7) AS month,
              SUM(CASE WHEN status IN ('paid','refunded') THEN amount_cents ELSE 0 END) AS collected,
              SUM(CASE WHEN status = 'failed' THEN amount_cents ELSE 0 END)             AS failed,
              SUM(refunded_cents)                                                       AS refunded
         FROM subscription_invoices
        GROUP BY month
        ORDER BY month DESC
        LIMIT ?`,
    )
    .all(months) as { month: string; collected: number; failed: number; refunded: number }[];

  return rows
    .map((r) => ({
      month: r.month,
      // Refunds are money that came in and went back out, so collected is net.
      collectedCents: r.collected - r.refunded,
      failedCents: r.failed,
      refundedCents: r.refunded,
    }))
    .reverse();
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export function upsertSubscription(input: {
  orgId: string;
  plan: Plan;
  status: SubStatus;
  priceCents: number;
  interval: "month" | "year";
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  canceledAt?: string | null;
}): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO subscriptions
         (org_id, plan, status, price_cents, interval, trial_ends_at,
          current_period_end, canceled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(org_id) DO UPDATE SET
         plan = excluded.plan,
         status = excluded.status,
         price_cents = excluded.price_cents,
         interval = excluded.interval,
         trial_ends_at = excluded.trial_ends_at,
         current_period_end = excluded.current_period_end,
         canceled_at = excluded.canceled_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.orgId,
      input.plan,
      input.status,
      input.priceCents,
      input.interval,
      input.trialEndsAt ?? null,
      input.currentPeriodEnd ?? null,
      input.canceledAt ?? null,
      now,
      now,
    );
}

export function recordInvoice(input: {
  orgId: string;
  amountCents: number;
  status: InvoiceStatus;
  periodStart: string;
  periodEnd: string;
  paidAt?: string | null;
  refundedCents?: number;
  failureReason?: string | null;
  createdAt?: string;
}): string {
  const id = `inv_${randomUUID().slice(0, 12)}`;
  getDb()
    .prepare(
      `INSERT INTO subscription_invoices
         (invoice_id, org_id, amount_cents, refunded_cents, status, period_start,
          period_end, paid_at, failure_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.orgId,
      input.amountCents,
      input.refundedCents ?? 0,
      input.status,
      input.periodStart,
      input.periodEnd,
      input.paidAt ?? null,
      input.failureReason ?? null,
      input.createdAt ?? new Date().toISOString(),
    );
  return id;
}
