/**
 * Stripe Checkout Session creation endpoint.
 * Creates a Stripe Checkout Session in subscription mode and returns the URL.
 *
 * POST /api/create-checkout-session
 * Body: { priceLookupKey: "starter_monthly" | "pro" | "team", userId?: string }
 * Response: { url: string } — redirect the browser to this URL
 */
import { createServerFn } from "@tanstack/react-start";
import Stripe from "stripe";
import { sql as neonSql } from "../../db";
import { isValidPriceKey, PRICE_KEYS } from "../../lib/price-keys";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}

/**
 * Resolve the user tier for a userId (used to block demo accounts).
 * Returns null if the user doesn't exist.
 */
async function getUserTier(userId?: string): Promise<string | null> {
  if (!userId) return null;
  const db = neonSql();
  const rows = await db`SELECT subscription_tier FROM users WHERE id = ${userId} LIMIT 1`;
  return rows.length > 0 ? String(rows[0].subscription_tier) : null;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .validator((data: { priceLookupKey: string; userId?: string }) => {
    if (!data.priceLookupKey || !isValidPriceKey(data.priceLookupKey)) {
      throw new Error(
        `Invalid priceLookupKey: ${data.priceLookupKey}. Must be one of: ${PRICE_KEYS.join(", ")}`,
      );
    }
    return data;
  })
  .handler(async ({ data }) => {
    // Never-billing guarantee: demo accounts can never create a checkout session
    const tier = await getUserTier(data.userId);
    if (tier === "demo") {
      return {
        success: false,
        error: "Demo accounts have full access and never require billing.",
      };
    }

    const stripe = getStripe();

    // Look up the price by its lookup_key metadata
    const prices = await stripe.prices.list({
      lookup_keys: [data.priceLookupKey],
      limit: 1,
      active: true,
    });

    if (prices.data.length === 0) {
      throw new Error(
        `No active Stripe price found with lookup_key: "${data.priceLookupKey}". ` +
        `Ensure prices are created in the Stripe dashboard with lookup_keys matching: starter_monthly, pro, team, starter_annual, pro_annual, team_annual.`,
      );
    }

    const priceId = prices.data[0].id;

    // Build the checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${getBaseUrl()}/app/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getBaseUrl()}/app/subscription/cancel`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      metadata: {
        price_lookup_key: data.priceLookupKey,
      },
    };

    // Attach customer if we have a userId
    if (data.userId) {
      sessionParams.metadata = {
        ...sessionParams.metadata,
        user_id: data.userId,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return { url: session.url! };
  });

function getBaseUrl(): string {
  // In production, use the canonical URL; in dev, use localhost
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
