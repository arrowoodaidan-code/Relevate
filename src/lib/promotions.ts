/**
 * THE single declared source of truth for every promotional discount claim Relevate makes.
 *
 * WHY THIS EXISTS (2026-09-28): /pricing, the landing page banner and the Product Hunt blog post
 * all advertised a launch discount code that had never been created in our Stripe account — both
 * `GET /v1/promotion_codes` and `GET /v1/coupons` were EMPTY, and the live Payment Links accept
 * promotion codes, so every buyer who typed it was refused. A discount claim is only true while
 * Stripe holds that exact code on those exact terms.
 *
 * (The retired wording is deliberately NOT repeated here: the preflight scan in
 * `scripts/check-pricing-display.ts` reads this file too, and a retired code written in a comment
 * is still a code a reader could try. It lives in the git history of this change.)
 *
 * So no surface may hold a hand-written code or percent-off promise any more. Advertising copy is
 * rendered FROM this map (see `promotionClaimText`), and with the map empty NO claim is rendered
 * anywhere — which is the honest state today: we have no launch promotion.
 *
 * TO ADD A CLAIM — both steps, in this order, neither skippable:
 *   1. The owner decides the discount economics and creates the coupon + promotion code in the
 *      Stripe dashboard. Read it back (`/v1/promotion_codes` and `/v1/coupons`) and copy the code,
 *      its `prom_...` id, the coupon id, `percent_off` and `duration_in_months`.
 *   2. Add the entry below with terms matching what Stripe enforces. /pricing and the landing
 *      banner then advertise it automatically — no copy edit anywhere else.
 *
 * `scripts/check-pricing-display.ts` (a preflight step) proves every declared entry carries a code,
 * a Stripe promotion-code id, a coupon id, a percent, a duration and terms, and that no code or
 * 2+-digit discount claim appears in src/ or public/ outside this map. That gate never calls
 * Stripe: it proves the DECLARATION is complete, not that the id exists. Only reading the code
 * back from Stripe proves that, and that read is what step 1 is for.
 */

export interface PromotionClaim {
  /** The exact code a buyer types at checkout (Stripe matches promotion codes case-insensitively). */
  code: string;
  /** Stripe promotion code id (`prom_...`) in OUR account — the proof that the code exists. */
  stripePromotionCodeId: string;
  /** Stripe coupon id the code applies, as returned by `/v1/coupons`. */
  stripeCouponId: string;
  /** Stripe's `percent_off` for that coupon, exactly as configured. */
  percentOff: number;
  /** Stripe's `duration_in_months` for that coupon, exactly as configured. */
  durationMonths: number;
  /** Exact buyer-facing terms, including any end date Stripe enforces. */
  terms: string;
}

/**
 * Every promotion we are allowed to advertise.
 *
 * EMPTY IS THE HONEST DEFAULT. As of 2026-09-28 the connected Stripe account holds no promotion
 * codes and no coupons (`/v1/promotion_codes` and `/v1/coupons` both returned empty lists), so
 * this map is empty and nothing anywhere offers a discount code. An entry belongs here only after
 * step 1 above has actually been done — never because copy needs one.
 */
export const PROMOTION_CLAIMS: PromotionClaim[] = [];

/** The declared claim for a code, or null when we have not declared one (so must not advertise it). */
export function promotionClaimForCode(code: string): PromotionClaim | null {
  const wanted = code.trim().toUpperCase();
  return PROMOTION_CLAIMS.find((claim) => claim.code.toUpperCase() === wanted) ?? null;
}

/** The claim a surface should display, or null when there is nothing true to say. */
export function activePromotionClaim(): PromotionClaim | null {
  return PROMOTION_CLAIMS[0] ?? null;
}

/**
 * The ONE place claim copy is worded, derived from the declaration — so a claim can never be
 * advertised with terms other than the ones it was declared with (percent and duration included).
 */
export function promotionClaimText(claim: PromotionClaim): string {
  const months = claim.durationMonths === 1 ? "1 month" : `${claim.durationMonths} months`;
  return `Save ${claim.percentOff}% for your first ${months} with code ${claim.code}.`;
}

/**
 * Copy for whatever claim is active, or null when none is. This is what the pricing page and the
 * landing banner render; `null` means they render no offer at all.
 */
export function activePromotionText(): string | null {
  const claim = activePromotionClaim();
  return claim ? promotionClaimText(claim) : null;
}
