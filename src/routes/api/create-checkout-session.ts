/**
 * Stripe Checkout Session creation endpoint.
 * Creates a Stripe Checkout Session in subscription mode and returns the URL.
 *
 * POST /api/create-checkout-session
 * Body: { priceLookupKey: "starter_monthly" | "pro" | "team" | *_annual, userId?: string }
 * Response: { url: string } — redirect the browser to this URL
 *
 * POST-PAYMENT REDIRECT (fixed 2026-09-23, P0):
 * success_url/cancel_url must be hosts the BUYER can reach. This endpoint used to prefer
 * `process.env.VERCEL_URL`, which on this platform is an internal hostname
 * (`ip-10-110-103-223.us-west-2.prod.aws.beamlit.net`), so a live session came back pointing a
 * paying customer at a page that cannot load. Resolution now lives in src/lib/public-url.ts:
 * configured public base URL -> the request's own forwarded host -> platform hostnames (only if
 * public) -> nothing. When nothing public can be established we throw BEFORE creating a session,
 * so no money is taken and no customer is stranded on a dead page.
 */
import { createServerFn } from "@tanstack/react-start";
import Stripe from "stripe";
import { sql as neonSql } from "../../db";
import { isValidPriceKey, PRICE_KEYS } from "../../lib/price-keys";
import { resolvePublicBaseUrl } from "../../lib/public-url";

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

/**
 * Headers of the in-flight request, when a request context is available.
 * `getRequest()` only exists inside a server-function call, so failures are tolerated: without
 * headers we simply fall back to configured/platform base URLs.
 */
async function requestHeaders(): Promise<Headers | null> {
  try {
    const mod = await import("@tanstack/react-start/server");
    const request = (mod as { getRequest?: () => Request }).getRequest?.();
    return request?.headers ?? null;
  } catch {
    return null;
  }
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

    // Resolve the buyer-reachable base URL BEFORE calling Stripe: a session whose success_url
    // points somewhere unreachable would take the money and strand the customer.
    const baseUrl = resolvePublicBaseUrl({ headers: await requestHeaders() });
    if (!baseUrl) {
      throw new Error(
        "Cannot determine a public URL for the post-payment redirect, so checkout was not " +
          "started and nothing has been charged. Set PUBLIC_APP_URL to this site's public " +
          "address and retry.",
      );
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
      success_url: `${baseUrl}/app/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/app/subscription/cancel`,
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
