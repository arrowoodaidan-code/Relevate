/**
 * Display layer for Relevate's list prices.
 *
 * Every dollar figure the marketing pages and blog copy show is derived HERE, from
 * the Stripe price record in `src/lib/stripe-prices.ts` — the same amounts the setup
 * script creates and therefore the same amounts checkout charges. Nothing quotes a
 * hand-written amount any more, so a price can never be displayed as one number while
 * Stripe bills another. (2026-09-16: the pricing page rounded annual amounts to whole
 * dollars — $435 shown vs $435.24 charged — which is the class of bug this prevents.)
 *
 * Formatting rule: whole-dollar amounts print without cents ("$39"), amounts with
 * cents print EXACTLY ("$435.24"). Never round, in either direction.
 */
import { annualTiers, tiers } from "./stripe-prices";
import type { PriceKey } from "./price-keys";

const ALL_TIERS = [...tiers, ...annualTiers];

/** The exact amount, in cents, that Stripe charges for a lookup key. */
export function planAmountCents(lookupKey: PriceKey): number {
  const tier = ALL_TIERS.find((t) => t.lookup_key === lookupKey);
  if (!tier) {
    throw new Error(
      `No Stripe price record for lookup key "${lookupKey}" — src/lib/stripe-prices.ts must define it.`,
    );
  }
  return tier.amountCents;
}

/** Exact USD string from a cent amount: 3900 -> "$39", 222084 -> "$2,220.84". */
export function usdDisplay(cents: number): string {
  const whole = cents % 100 === 0;
  const amount = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `$${amount}`;
}

export interface PlanPriceDisplay {
  /** Exact displayed amount, e.g. "$39" or "$2,220.84". */
  price: string;
  /** "/mo" or "/yr". */
  period: string;
  /** Optional sub-label under the price (annual only). */
  priceSub?: string;
  priceLookupKey: PriceKey;
}

/** Monthly price display for a monthly lookup key. */
export function monthlyPriceDisplay(lookupKey: PriceKey): PlanPriceDisplay {
  return {
    price: usdDisplay(planAmountCents(lookupKey)),
    period: "/mo",
    priceSub: undefined,
    priceLookupKey: lookupKey,
  };
}

/**
 * Annual (pay-upfront) price display for an annual lookup key.
 * The per-month equivalent is the annual amount ÷ 12, and the saving is measured
 * against 12 × the monthly list price — both computed, never asserted.
 */
export function annualPriceDisplay(
  annualKey: PriceKey,
  monthlyKey: PriceKey,
): PlanPriceDisplay {
  const annualCents = planAmountCents(annualKey);
  const monthlyCents = planAmountCents(monthlyKey);
  const savePct = Math.round((1 - annualCents / (12 * monthlyCents)) * 100);
  return {
    price: usdDisplay(annualCents),
    period: "/yr",
    priceSub: `(${usdDisplay(Math.round(annualCents / 12))}/mo, paid upfront) · save ${savePct}%`,
    priceLookupKey: annualKey,
  };
}
