/**
 * Shared idempotent + self-correcting Stripe price setup for Relevate.
 *
 * Used by:
 *  - scripts/setup-stripe-subscriptions.ts (local CLI)
 *
 * Behavior (identical in both call sites — no drift):
 *  - If an active price with the lookup_key already exists at the DESIRED amount, leave it alone.
 *  - If it exists at a DIFFERENT amount (e.g. the old Starter $29), ARCHIVE it (active:false) to
 *    free the lookup_key, then recreate at the desired amount on the same product.
 *  - If it does not exist, create it.
 *
 * Owner's FINAL pricing (locked): Starter $39/mo (corrected from $29); annual = 7% off
 * (pay 93% of 12 × monthly), exact cents:
 *   starter_annual $435.24 = 43524¢   (468.00 × 0.93)
 *   pro_annual     $881.64 = 88164¢   (948.00 × 0.93)
 *   team_annual   $2,220.84 = 222084¢ (2388.00 × 0.93)
 */
import type Stripe from "stripe";

const MONTHLY_INTERVAL = "month" as const;
const YEARLY_INTERVAL = "year" as const;

export interface PriceTier {
  lookup_key: string;
  name: string;
  description: string;
  amountCents: number;
  interval: "month" | "year";
}

export const tiers: PriceTier[] = [
  {
    lookup_key: "starter_monthly",
    name: "Relevate Starter — Monthly Subscription",
    description: "Up to 5 listings/month, basic templates, property descriptions, open house flyers, social media posts, email support.",
    amountCents: 3900, // $39/mo  ← corrected from legacy $29
    interval: MONTHLY_INTERVAL,
  },
  {
    lookup_key: "pro",
    name: "Relevate Pro — Monthly Subscription",
    description: "Up to 20 listings/month, all asset types, email campaigns, listing summaries, priority support, custom branding options.",
    amountCents: 7900, // $79/mo
    interval: MONTHLY_INTERVAL,
  },
  {
    lookup_key: "team",
    name: "Relevate Team — Monthly Subscription",
    description: "Unlimited listings, multi-agent seats, branded templates, advanced analytics, dedicated account manager, API access.",
    amountCents: 19900, // $199/mo
    interval: MONTHLY_INTERVAL,
  },
];

export const annualTiers: PriceTier[] = [
  {
    lookup_key: "starter_annual",
    name: "Relevate Starter — Annual Subscription",
    description: "Up to 5 listings/month, basic templates, property descriptions, open house flyers, social media posts, email support. Billed once per year.",
    amountCents: 43524, // $435.24/yr (7% off)
    interval: YEARLY_INTERVAL,
  },
  {
    lookup_key: "pro_annual",
    name: "Relevate Pro — Annual Subscription",
    description: "Up to 20 listings/month, all asset types, email campaigns, listing summaries, priority support, custom branding options. Billed once per year.",
    amountCents: 88164, // $881.64/yr (7% off)
    interval: YEARLY_INTERVAL,
  },
  {
    lookup_key: "team_annual",
    name: "Relevate Team — Annual Subscription",
    description: "Unlimited listings, multi-agent seats, branded templates, advanced analytics, dedicated account manager, API access. Billed once per year.",
    amountCents: 222084, // $2,220.84/yr (7% off)
    interval: YEARLY_INTERVAL,
  },
];

/** For an annual key, the base monthly key (e.g. "starter_annual" -> "starter_monthly"). */
function baseKeyOf(annualKey: string): string {
  if (annualKey === "starter_annual") return "starter_monthly";
  return annualKey.replace("_annual", "");
}

/**
 * Create a price with a lookup_key, retrying on Stripe's eventual-consistency
 * "already uses that lookup key" error. Archiving a price frees its lookup_key
 * only after a short propagation delay (observed live during b3726ffb), so we
 * archive any still-active holder and back off/retry.
 */
async function createPriceWithRetry(
  stripe: Stripe,
  params: Stripe.PriceCreateParams,
  lookupKey: string,
): Promise<Stripe.Price> {
  const maxAttempts = 14;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await stripe.prices.create(params);
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (!/already uses that lookup key/i.test(msg)) throw err;
      // Ensure every active holder of this lookup_key is archived to release it.
      try {
        const holders = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 10 });
        for (const h of holders.data) {
          if (h.active) await stripe.prices.update(h.id, { active: false });
        }
      } catch {
        /* best-effort */
      }
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, Math.min(4000, 500 * attempt)));
    }
  }
  throw new Error(`Unable to create price with lookup_key ${lookupKey}`);
}

export interface EnsureResult {
  lookup_key: string;
  amountCents: number;
  created: boolean;
  priceId: string;
  archived: string[];
}

/**
 * Ensure a price exists at the desired amount under `lookup_key`.
 */
export async function ensurePrice(
  stripe: Stripe,
  tier: PriceTier,
): Promise<EnsureResult> {
  const existing = await stripe.prices.list({
    lookup_keys: [tier.lookup_key],
    limit: 10,
  });

  const activeMatching = existing.data.find(
    (p) => p.active && p.unit_amount === tier.amountCents && p.lookup_key === tier.lookup_key,
  );
  if (activeMatching) {
    return {
      lookup_key: tier.lookup_key,
      amountCents: tier.amountCents,
      created: false,
      priceId: activeMatching.id,
      archived: [],
    };
  }

  // Determine the product to attach to: reuse an existing price's product if one exists,
  // otherwise find the base monthly product (for annual keys), else create a product.
  let productId: string | null = null;
  if (existing.data.length > 0) {
    productId = existing.data[0].product as string;
  }

  // Archive any stale active price for this lookup_key (frees the lookup_key).
  const archived: string[] = [];
  for (const p of existing.data) {
    if (p.active) {
      await stripe.prices.update(p.id, { active: false });
      archived.push(p.id);
    }
  }

  if (!productId) {
    if (tier.interval === "year") {
      const baseKey = baseKeyOf(tier.lookup_key);
      const basePrice = await stripe.prices.list({ lookup_keys: [baseKey], limit: 1 });
      if (basePrice.data.length > 0) {
        productId = basePrice.data[0].product as string;
      }
    }
    if (!productId) {
      const product = await stripe.products.create({ name: tier.name, description: tier.description });
      productId = product.id;
    }
  }

  const price = await createPriceWithRetry(
    stripe,
    {
      product: productId,
      unit_amount: tier.amountCents,
      currency: "usd",
      recurring: { interval: tier.interval },
      lookup_key: tier.lookup_key,
    },
    tier.lookup_key,
  );

  return {
    lookup_key: tier.lookup_key,
    amountCents: tier.amountCents,
    created: true,
    priceId: price.id,
    archived,
  };
}

export interface SetupResult {
  monthly: EnsureResult[];
  annual: EnsureResult[];
  archivedAll: string[];
  prices: {
    lookup_key: string | null;
    id: string;
    amount: number | null;
    interval: string | null;
    active: boolean;
  }[];
}

/**
 * Run the full idempotent setup: reconcile monthly + annual prices, archive stale ones.
 */
export async function setupStripePrices(stripe: Stripe): Promise<SetupResult> {
  const monthly: EnsureResult[] = [];
  for (const tier of tiers) {
    monthly.push(await ensurePrice(stripe, tier));
  }

  const annual: EnsureResult[] = [];
  for (const tier of annualTiers) {
    annual.push(await ensurePrice(stripe, tier));
  }

  const allPrices = await stripe.prices.list({
    lookup_keys: ["starter_monthly", "pro", "team", "starter_annual", "pro_annual", "team_annual"],
    limit: 20,
  });

  const archivedAll = [
    ...monthly.flatMap((r) => r.archived),
    ...annual.flatMap((r) => r.archived),
  ];

  return {
    monthly,
    annual,
    archivedAll,
    prices: allPrices.data.map((p) => ({
      lookup_key: p.lookup_key,
      id: p.id,
      amount: p.unit_amount,
      interval: p.recurring?.interval ?? null,
      active: p.active,
    })),
  };
}
