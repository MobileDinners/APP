import { createHash, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { profiles } from "./crm";
import type { Segment } from "./crm-labels";
import {
  EMAIL_COST_CENTS,
  SMS_COST_CENTS,
  TEMPLATES,
  type AudiencePreview,
  type Campaign,
  type CampaignResult,
  type Channel,
  type OfferType,
  type Suppression,
} from "./campaign-templates";

export * from "./campaign-templates";

/**
 * Marketing campaigns — spec §4.4.
 *
 * The thing that makes this different from every restaurant marketing tool is
 * the holdout. Attributed revenue ("everyone who ordered within 72 hours of a
 * text") counts people who were going to order anyway, and it always looks
 * spectacular. This measures INCREMENTAL revenue against a randomly withheld
 * control group, which produces smaller, truer numbers — and sometimes honestly
 * reports that a campaign did nothing.
 *
 * Guardrails are enforced here, not in the UI, so the API cannot be used to
 * bypass them.
 */

const FREQUENCY_CAP_DAYS = 14;
const QUIET_HOURS = { start: 9, end: 21 };
const MIN_HOLDOUT_PCT = 5;
const MAX_HOLDOUT_PCT = 50;

export class CampaignError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/* ------------------------------------------------------------------ *
 * Audience
 * ------------------------------------------------------------------ */

type Candidate = { personId: string; suppressedReason: string | null };

/**
 * Everyone in the segment, each marked eligible or suppressed with a reason.
 * Suppressed people are kept rather than filtered away so the operator can see
 * exactly who was excluded and why — a silently shrinking audience is how
 * consent bugs go unnoticed for months.
 */
function candidates(orgId: string, segment: Segment, channel: Channel): Candidate[] {
  const db = getDb();
  const inSegment = profiles(orgId).filter((p) => p.segment === segment);
  if (inSegment.length === 0) return [];

  const ids = inSegment.map((p) => p.personId);
  const placeholders = ids.map(() => "?").join(",");

  const consentRows = db
    .prepare(
      `SELECT person_id, marketing_sms, marketing_email, opted_out_at
       FROM persons WHERE person_id IN (${placeholders})`,
    )
    .all(...(ids as never[])) as unknown as Array<{
      person_id: string; marketing_sms: number; marketing_email: number;
      opted_out_at: string | null;
    }>;
  const consent = new Map(consentRows.map((r) => [r.person_id, r]));

  // Anyone this restaurant has already contacted inside the frequency window.
  const since = new Date(Date.now() - FREQUENCY_CAP_DAYS * 86_400_000).toISOString();
  const recentRows = db
    .prepare(
      `SELECT DISTINCT s.person_id
       FROM campaign_sends s
       JOIN campaigns c ON c.campaign_id = s.campaign_id
       WHERE c.org_id = ? AND s.sent_at IS NOT NULL AND s.sent_at >= ?`,
    )
    .all(orgId, since) as unknown as Array<{ person_id: string }>;
  const recentlyContacted = new Set(recentRows.map((r) => r.person_id));

  return inSegment.map((p) => {
    const c = consent.get(p.personId);
    let reason: string | null = null;

    if (!c) reason = "no_record";
    else if (c.opted_out_at) reason = "opted_out";
    else if (channel === "sms" && c.marketing_sms !== 1) reason = "no_consent";
    else if (channel === "email" && c.marketing_email !== 1) reason = "no_consent";
    else if (recentlyContacted.has(p.personId)) reason = "frequency_cap";

    return { personId: p.personId, suppressedReason: reason };
  });
}

const SUPPRESSION_COPY: Record<string, string> = {
  no_consent: "Never opted in to this channel. Contacting them anyway is illegal, not just rude.",
  opted_out: "Sent STOP or unsubscribed. Permanent.",
  frequency_cap: `Already contacted by you in the last ${FREQUENCY_CAP_DAYS} days.`,
  no_record: "No contact record on file.",
};

/** Stable arm assignment: the same person always lands in the same arm. */
function armFor(campaignId: string, personId: string, holdoutPct: number): "treated" | "holdout" {
  const h = createHash("sha256").update(`${campaignId}:${personId}`).digest();
  return h.readUInt32BE(0) % 100 < holdoutPct ? "holdout" : "treated";
}

function sendCost(channel: Channel, n: number): number {
  return Math.round(n * (channel === "sms" ? SMS_COST_CENTS : EMAIL_COST_CENTS));
}

export function previewAudience(
  orgId: string,
  segment: Segment,
  channel: Channel,
  holdoutPct: number,
  offerType: OfferType,
  offerValue: number,
): AudiencePreview {
  const all = candidates(orgId, segment, channel);
  const eligible = all.filter((c) => !c.suppressedReason);

  const counts = new Map<string, number>();
  for (const c of all) {
    if (c.suppressedReason) counts.set(c.suppressedReason, (counts.get(c.suppressedReason) ?? 0) + 1);
  }

  const suppressions: Suppression[] = [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      explanation: SUPPRESSION_COPY[reason] ?? reason,
    }))
    .sort((a, b) => b.count - a.count);

  // Arms are assigned from the campaign id, which does not exist yet, so these
  // are EXPECTED counts. The realised split will land near them but not on
  // them — that is randomisation working, not a bug.
  const treated = Math.round((eligible.length * (100 - holdoutPct)) / 100);

  // Worst case: every treated guest redeems. Percent offers are costed against
  // the segment's own average ticket rather than a guessed basket.
  const segmentProfiles = profiles(orgId).filter((p) => p.segment === segment);
  const avgTicket = segmentProfiles.length
    ? Math.round(segmentProfiles.reduce((n, p) => n + p.aovCents, 0) / segmentProfiles.length)
    : 0;
  const perOffer =
    offerType === "amount" ? offerValue
    : offerType === "percent" ? Math.round((avgTicket * offerValue) / 100)
    : 0;

  return {
    segmentSize: all.length,
    eligible: eligible.length,
    treated,
    holdout: eligible.length - treated,
    expected: true,
    suppressions,
    estimatedCostCents: sendCost(channel, treated),
    estimatedOfferCostCents: perOffer * treated,
  };
}

/* ------------------------------------------------------------------ *
 * Create and activate
 * ------------------------------------------------------------------ */

type Row = {
  campaign_id: string; org_id: string; name: string; template: string;
  channel: string; segment: string; offer_type: string; offer_value: number;
  message: string; holdout_pct: number; window_days: number; status: string;
  created_at: string; activated_at: string | null;
};

function toCampaign(r: Row): Campaign {
  return {
    campaignId: r.campaign_id, orgId: r.org_id, name: r.name, template: r.template,
    channel: r.channel as Channel, segment: r.segment as Segment,
    offerType: r.offer_type as OfferType, offerValue: r.offer_value,
    message: r.message, holdoutPct: r.holdout_pct, windowDays: r.window_days,
    status: r.status as Campaign["status"], createdAt: r.created_at,
    activatedAt: r.activated_at,
  };
}

export function listCampaigns(orgId: string): Campaign[] {
  return (
    getDb()
      .prepare("SELECT * FROM campaigns WHERE org_id = ? ORDER BY created_at DESC LIMIT 30")
      .all(orgId) as unknown as Row[]
  ).map(toCampaign);
}

export function getCampaign(orgId: string, campaignId: string): Campaign | null {
  const r = getDb()
    .prepare("SELECT * FROM campaigns WHERE org_id = ? AND campaign_id = ?")
    .get(orgId, campaignId) as unknown as Row | undefined;
  return r ? toCampaign(r) : null;
}

export type CreateInput = {
  orgId: string;
  templateId: string;
  holdoutPct: number;
  createdBy: string;
  /** Only for tests and demos: skip the quiet-hours check. */
  ignoreQuietHours?: boolean;
};

/**
 * Creates AND activates in one step, because a campaign that is never
 * activated has no audience and no meaning. Validation happens before any row
 * is written, so a rejected campaign leaves nothing behind.
 */
export function launch(input: CreateInput): { campaign: Campaign; preview: AudiencePreview } {
  const template = TEMPLATES.find((t) => t.id === input.templateId);
  if (!template) throw new CampaignError("Unknown campaign template", 404);

  const holdoutPct = Math.round(input.holdoutPct);
  if (holdoutPct < MIN_HOLDOUT_PCT || holdoutPct > MAX_HOLDOUT_PCT) {
    throw new CampaignError(
      `Holdout must be between ${MIN_HOLDOUT_PCT}% and ${MAX_HOLDOUT_PCT}%. Without one, lift cannot be measured.`,
    );
  }

  const hour = new Date().getHours();
  if (!input.ignoreQuietHours && (hour < QUIET_HOURS.start || hour >= QUIET_HOURS.end)) {
    throw new CampaignError(
      `Outside sending hours (${QUIET_HOURS.start}:00–${QUIET_HOURS.end}:00). Texting people at ${hour}:00 loses more guests than the campaign wins.`,
      409,
    );
  }

  const preview = previewAudience(
    input.orgId, template.segment, template.channel,
    holdoutPct, template.offerType, template.offerValue,
  );
  if (preview.eligible === 0) {
    throw new CampaignError(
      "Nobody in that segment can be contacted on this channel right now.",
      409,
    );
  }
  if (preview.holdout < 30) {
    // Not fatal — an operator may still want to send — but the result will not
    // be measurable, and pretending otherwise is how fake ROI gets reported.
    console.warn(
      `[campaigns] holdout of ${preview.holdout} is too small to detect anything ` +
      `but a very large effect for org ${input.orgId}`,
    );
  }

  const db = getDb();
  const campaignId = randomUUID();
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO campaigns (campaign_id, org_id, name, template, channel, segment,
                              offer_type, offer_value, message, holdout_pct, window_days,
                              status, created_by, created_at, activated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 21, 'active', ?, ?, ?)`,
    ).run(
      campaignId, input.orgId, template.name, template.id, template.channel,
      template.segment, template.offerType, template.offerValue, template.message,
      holdoutPct, input.createdBy, now, now,
    );

    const insert = db.prepare(
      `INSERT INTO campaign_sends (campaign_id, person_id, arm, suppressed_reason, sent_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    for (const c of candidates(input.orgId, template.segment, template.channel)) {
      if (c.suppressedReason) {
        // Suppressed people are recorded with no arm side-effect: they are
        // parked in the holdout arm but never counted as a send.
        insert.run(campaignId, c.personId, "holdout", c.suppressedReason, null);
        continue;
      }
      const arm = armFor(campaignId, c.personId, holdoutPct);
      insert.run(campaignId, c.personId, arm, null, arm === "treated" ? now : null);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { campaign: getCampaign(input.orgId, campaignId)!, preview };
}

/* ------------------------------------------------------------------ *
 * Measurement
 * ------------------------------------------------------------------ */

/** Per-person revenue at this restaurant inside the measurement window. */
function armRevenue(
  campaignId: string,
  orgId: string,
  arm: "treated" | "holdout",
  activatedAt: string,
): number[] {
  return (
    getDb()
      .prepare(
        `SELECT s.person_id AS person_id,
                COALESCE((
                  SELECT SUM(o.subtotal_cents) FROM orders o
                  WHERE o.person_id = s.person_id AND o.org_id = ?
                    AND o.state = 'SETTLED' AND o.placed_at > ?
                ), 0) AS revenue
         FROM campaign_sends s
         WHERE s.campaign_id = ? AND s.arm = ? AND s.suppressed_reason IS NULL`,
      )
      .all(orgId, activatedAt, campaignId, arm) as unknown as Array<{ revenue: number }>
  ).map((r) => r.revenue);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

/**
 * Incremental revenue with a 95% interval, using a Welch two-sample comparison
 * of revenue per person. The interval is the honest part: with realistic
 * audience sizes it will often cross zero, which means the campaign has not
 * been shown to work — not that it definitely failed.
 */
export function measure(orgId: string, campaignId: string): CampaignResult | null {
  const campaign = getCampaign(orgId, campaignId);
  if (!campaign || !campaign.activatedAt) return null;

  const treated = armRevenue(campaignId, orgId, "treated", campaign.activatedAt);
  const holdout = armRevenue(campaignId, orgId, "holdout", campaign.activatedAt);

  const tMean = mean(treated);
  const hMean = mean(holdout);
  const lift = tMean - hMean;

  const se = Math.sqrt(
    (variance(treated) / Math.max(1, treated.length)) +
    (variance(holdout) / Math.max(1, holdout.length)),
  );
  const margin = 1.96 * se;

  const daysElapsed = Math.floor(
    (Date.now() - new Date(campaign.activatedAt).getTime()) / 86_400_000,
  );

  return {
    campaignId,
    treatedCount: treated.length,
    holdoutCount: holdout.length,
    treatedConverted: treated.filter((r) => r > 0).length,
    holdoutConverted: holdout.filter((r) => r > 0).length,
    treatedRevenueCents: Math.round(treated.reduce((a, b) => a + b, 0)),
    holdoutRevenueCents: Math.round(holdout.reduce((a, b) => a + b, 0)),
    treatedRppCents: Math.round(tMean),
    holdoutRppCents: Math.round(hMean),
    liftRppCents: Math.round(lift),
    incrementalRevenueCents: Math.round(lift * treated.length),
    lowCents: Math.round((lift - margin) * treated.length),
    highCents: Math.round((lift + margin) * treated.length),
    significant: lift - margin > 0,
    sendCostCents: sendCost(campaign.channel, treated.length),
    windowDays: campaign.windowDays,
    daysElapsed,
  };
}
