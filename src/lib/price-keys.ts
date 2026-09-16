/**
 * Single source of truth for Stripe price lookup keys and their tier mapping.
 *
 * Every plan has a MONTHLY key (`starter_monthly`/`pro`/`team`) and a YEARLY (pay-upfront)
 * key (`starter_annual`/`pro_annual`/`team_annual`). The `_annual` keys map back
 * to the SAME tier so the webhook provisions the correct subscription_tier.
 *
 * NOTE (2026-08-21): the Starter monthly key is `starter_monthly`, NOT the legacy `starter`
 * key. The legacy `starter` key is still locked by an old archived $29 price and Stripe
 * refuses to release it, so we use a distinct key for the $39 Starter. The `pro`/`team`
 * keys are unchanged and are referenced directly. The three `_annual` keys are all free.
 *
 * Annual amounts are created in scripts/setup-stripe-subscriptions.ts as exactly
 * 12 × the monthly amount (no discount).
 */
export const PRICE_KEYS = [
  "starter_monthly",
  "pro",
  "team",
  "starter_annual",
  "pro_annual",
  "team_annual",
] as const;

export type PriceKey = (typeof PRICE_KEYS)[number];

export function isValidPriceKey(key: string): boolean {
  return (PRICE_KEYS as readonly string[]).includes(key);
}

/** Maps every price lookup key (monthly + annual) to its subscription tier. */
export const PRICE_KEY_TO_TIER: Record<string, string> = {
  starter_monthly: "starter",
  pro: "pro",
  team: "team",
  starter_annual: "starter",
  pro_annual: "pro",
  team_annual: "team",
};

/** The annual equivalent lookup key for a monthly key (e.g. "starter_monthly" -> "starter_annual"). */
export const ANNUAL_KEY_FOR: Record<string, string> = {
  starter_monthly: "starter_annual",
  pro: "pro_annual",
  team: "team_annual",
};

/** The monthly equivalent lookup key for an annual key (e.g. "starter_annual" -> "starter_monthly"). */
export const MONTHLY_KEY_FOR: Record<string, string> = Object.fromEntries(
  Object.entries(ANNUAL_KEY_FOR).map(([m, a]) => [a, m]),
);
