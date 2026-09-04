import type { Totals } from "../money";

/**
 * Who gets what out of a single charge.
 *
 * This is the file that makes "0% commission" true or false, so it is written
 * to be read by a restaurant owner rather than only by a compiler.
 *
 * The rules, stated plainly:
 *
 *   · The restaurant receives the food and the tax on it, in full. Nothing is
 *     deducted for the marketplace. There is no commission line here because
 *     there is no commission — that is the whole product.
 *
 *   · Mobile Dinners receives the delivery fee and the processing spread. The
 *     spread is the difference between what the restaurant is quoted (2.9% +
 *     30c card-not-present) and what the processor actually charges us. It is
 *     disclosed on every statement rather than buried.
 *
 *   · The driver receives the tip, in full. It is held separately and never
 *     nets against anything else.
 *
 *   · Points redemption is funded by the PLATFORM, not by the restaurant. A
 *     diner who earned points at a taqueria and spends them at a bakery is
 *     spending a network currency we issued; asking the bakery to eat that
 *     discount would make cross-brand loyalty a tax on whoever is popular.
 *     So the discount comes out of our share.
 */

/** What the restaurant is quoted, and what the processor actually charges. */
export const PRICING = {
  /** Card-not-present, quoted to the restaurant. Matches the published pricing. */
  restaurantRateBps: 290,
  restaurantFixedCents: 30,
  /** Roughly what Stripe charges the platform on the same transaction. */
  processorRateBps: 290,
  processorFixedCents: 30,
} as const;

export type Split = {
  /** Charged to the diner's card. */
  chargeCents: number;
  /** Transferred to the restaurant's connected account. */
  restaurantCents: number;
  /** Held for the courier. Zero until dispatch exists. */
  driverTipCents: number;
  /** Our take: delivery fee + spread, less the points we funded. */
  platformCents: number;
  /** The processing fee the restaurant is quoted, for their statement. */
  restaurantProcessingCents: number;
  /** What the points discount cost us. */
  pointsFundedCents: number;
  /**
   * True when the redemption exceeded our share on this order. Legal and
   * expected on a small ticket with a big wallet — worth surfacing, not hiding.
   */
  platformUnderwater: boolean;
};

/**
 * Card processing on the restaurant's gross, never more than the gross itself.
 *
 * The clamp is not defensive padding. The 30c fixed component applied to a
 * zero-value line would hand the restaurant a negative payout — they would be
 * charged to sell food — and there is no reading of "0% commission" that
 * survives that.
 */
function processingOn(amountCents: number): number {
  if (amountCents <= 0) return 0;
  const fee =
    Math.round((amountCents * PRICING.restaurantRateBps) / 10000) +
    PRICING.restaurantFixedCents;
  return Math.min(fee, amountCents);
}

/**
 * Splits a completed set of totals between the three parties.
 * Every value is integer cents, and the parts always sum back to the charge.
 */
export function splitPayment(totals: Totals): Split {
  const chargeCents = totals.totalCents;

  // The restaurant is paid on the FULL menu price, not the discounted one.
  // That is what "the platform funds redemption" means in arithmetic: a diner
  // spending points earned elsewhere costs this restaurant nothing, and the
  // gap comes out of our share below.
  //
  // Tax is the amount actually charged, not tax on the full price — that is
  // what the restaurant has to remit, so it is what they receive.
  const restaurantGross = totals.subtotalCents + totals.taxCents;

  const restaurantProcessingCents = processingOn(restaurantGross);
  const restaurantCents = restaurantGross - restaurantProcessingCents;

  const driverTipCents = totals.tipCents;
  const pointsFundedCents = totals.discountCents;

  // Our share is whatever is left after the restaurant and the courier are
  // paid. On an order with a large redemption this goes negative, which is
  // correct and expected: we issued that currency and we are funding it.
  const platformCents = chargeCents - restaurantCents - driverTipCents;

  return {
    chargeCents,
    restaurantCents,
    driverTipCents,
    platformCents,
    restaurantProcessingCents,
    pointsFundedCents,
    platformUnderwater: platformCents < 0,
  };
}

/**
 * The `application_fee_amount` for a Stripe PaymentIntent.
 *
 * Stripe rejects a negative fee and one larger than the charge, so this clamps
 * to a valid range. When a redemption pushes our share below zero we take
 * nothing from the charge.
 *
 * KNOWN GAP: clamping to zero is not the same as settling. On a heavily
 * redeemed order the charge is too small to carry the restaurant's full payout,
 * so the shortfall has to move as a separate Transfer from the platform
 * balance. `platformUnderwater` marks exactly those orders. Until that transfer
 * exists, a fully points-funded order under-pays the restaurant, which is why
 * redemption stays capped and why this is flagged rather than buried.
 */
export function applicationFeeCents(split: Split): number {
  const fee = split.chargeCents - split.restaurantCents - split.driverTipCents;
  return Math.max(0, Math.min(fee, split.chargeCents));
}

/** What the platform still owes the restaurant beyond this charge, if anything. */
export function settlementShortfallCents(split: Split): number {
  return Math.max(0, -split.platformCents);
}
