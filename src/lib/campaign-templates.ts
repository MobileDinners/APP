import type { Segment } from "./crm-labels";

/**
 * Client-safe half of the campaigns module: templates, types and copy.
 * campaigns.ts reaches the database; importing a runtime value from it inside
 * a "use client" component would pull node:crypto into the browser bundle.
 */

export type Channel = "sms" | "email";
export type OfferType = "none" | "percent" | "amount";
export type CampaignStatus = "draft" | "active" | "completed";

export type Template = {
  id: string;
  name: string;
  purpose: string;
  segment: Segment;
  channel: Channel;
  offerType: OfferType;
  offerValue: number;
  message: string;
  /** Why this offer, stated so an operator can argue with it. */
  rationale: string;
};

/**
 * The default journey library. Each one targets a segment the CRM already
 * computes, so the audience is behaviour, not a guess.
 *
 * Note what is deliberately absent: a discount on the welcome message. Giving
 * money to someone who just chose to order from you is paying for a decision
 * they already made.
 */
export const TEMPLATES: Template[] = [
  {
    id: "winback",
    name: "Lapsed win-back",
    purpose: "Bring back guests who have stopped ordering entirely.",
    segment: "lapsed",
    channel: "sms",
    offerType: "amount",
    offerValue: 700,
    message:
      "It's been a while. Here's $7 off your next order at {restaurant} — no minimum.",
    rationale:
      "These guests are already gone, so the offer has to be worth re-opening the app for. This is the one place a real discount is justified.",
  },
  {
    id: "at_risk",
    name: "At-risk nudge",
    purpose: "Reach regulars who are overdue against their own rhythm.",
    segment: "at_risk",
    channel: "sms",
    offerType: "percent",
    offerValue: 15,
    message: "We saved your usual. 15% off at {restaurant} this week.",
    rationale:
      "Still in the habit, just slipping. A smaller nudge is enough, and a big discount here would pay people to do what they were likely to do anyway.",
  },
  {
    id: "second_order",
    name: "Second-order push",
    purpose: "Convert a first-time guest into a repeat one.",
    segment: "promising",
    channel: "sms",
    offerType: "amount",
    offerValue: 300,
    message: "Thanks for trying {restaurant}. $3 off if you come back this week.",
    rationale:
      "The first-to-second order gap is where most guests are lost. A small, time-boxed incentive moves it.",
  },
  {
    id: "one_time_recovery",
    name: "One-and-done recovery",
    purpose: "Last attempt at guests who ordered once and vanished.",
    segment: "one_time",
    channel: "sms",
    offerType: "percent",
    offerValue: 20,
    message: "Was it not for you? 20% off at {restaurant} if you give us another go.",
    rationale:
      "Low expected conversion, so it runs rarely and the holdout matters more here than anywhere else.",
  },
  {
    id: "champion_thanks",
    name: "Champion thank-you",
    purpose: "Recognise your best guests without discounting.",
    segment: "champion",
    channel: "sms",
    offerType: "none",
    offerValue: 0,
    message:
      "You're one of our regulars. Your next order at {restaurant} comes with a free side, on us.",
    rationale:
      "Champions do not need a price cut. Discounting them is pure margin loss on revenue you already had.",
  },
  {
    id: "loyal_newitem",
    name: "New item announcement",
    purpose: "Tell reliable guests about something new.",
    segment: "loyal",
    channel: "email",
    offerType: "none",
    offerValue: 0,
    message: "Something new on the menu at {restaurant}. Come see what you think.",
    rationale:
      "Content, not an offer. If a new dish needs a discount to get tried by loyal guests, the dish is the problem.",
  },
];

export type Campaign = {
  campaignId: string;
  orgId: string;
  name: string;
  template: string;
  channel: Channel;
  segment: Segment;
  offerType: OfferType;
  offerValue: number;
  message: string;
  holdoutPct: number;
  windowDays: number;
  status: CampaignStatus;
  createdAt: string;
  activatedAt: string | null;
};

/** Why someone in the segment was not contacted. Shown, never hidden. */
export type Suppression = {
  reason: string;
  count: number;
  explanation: string;
};

export type AudiencePreview = {
  segmentSize: number;
  eligible: number;
  treated: number;
  holdout: number;
  suppressions: Suppression[];
  /** treated/holdout above are expected counts; the realised split varies. */
  expected: boolean;
  estimatedCostCents: number;
  estimatedOfferCostCents: number;
};

export type CampaignResult = {
  campaignId: string;
  treatedCount: number;
  holdoutCount: number;
  treatedConverted: number;
  holdoutConverted: number;
  treatedRevenueCents: number;
  holdoutRevenueCents: number;
  /** Revenue per person, the only fair comparison across unequal arms. */
  treatedRppCents: number;
  holdoutRppCents: number;
  liftRppCents: number;
  incrementalRevenueCents: number;
  /** 95% interval on incremental revenue. Crosses zero when it should. */
  lowCents: number;
  highCents: number;
  significant: boolean;
  sendCostCents: number;
  windowDays: number;
  daysElapsed: number;
};

export function offerLabel(type: OfferType, value: number): string {
  if (type === "percent") return `${value}% off`;
  if (type === "amount") return `$${(value / 100).toFixed(2)} off`;
  return "No discount";
}

/** SMS is billed per segment of 160 characters. */
export const SMS_COST_CENTS = 2;
export const EMAIL_COST_CENTS = 0.1;
