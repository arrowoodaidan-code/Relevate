/**
 * Checkout routing for Relevate.
 *
 * The SAME codebase is deployed to two kinds of host with OPPOSITE checkout needs:
 *   - Working product host: the Vercel production build (canonical alias
 *     site-gray-five-32.vercel.app). It HAS a live STRIPE_SECRET_KEY and its
 *     /api/create-checkout-session works for all 6 plan lookup keys.
 *   - Public marketing hosts: relevatelistingassistant.ctonew.app (+ -dev), which
 *     are built WITHOUT a Stripe key, so their local /api/create-checkout-session
 *     500s ("STRIPE_SECRET_KEY is not configured").
 *
 * Rule (owner decision, Option A): a checkout CTA must NEVER hit the broken local
 * endpoint on a marketing host. Instead it routes to the canonical product URL so
 * checkout happens where Stripe works. On the product host we keep the normal
 * same-origin POST (unchanged behaviour).
 *
 * Use the STABLE alias here, NOT a temporary deployment hostname, so the URL
 * stays valid across redeploys.
 */
export const CANONICAL_PRODUCT_URL = "https://site-gray-five-32.vercel.app";

/** True when the current page is served by a public marketing host that cannot do local Stripe checkout. */
export function isPublicMarketingHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.endsWith("ctonew.app") || host.endsWith("cto.new");
}

/**
 * Start checkout for a plan.
 * - On a public marketing host: route to the canonical product's pricing page
 *   (no local POST — avoids the broken endpoint).
 * - On the product host: perform the normal same-origin POST to
 *   /api/create-checkout-session and redirect to the returned Stripe URL.
 *
 * @param onAnalytics  optional callback fired just before navigation.
 * @throws  when the local POST fails (product host only).
 */
export async function startCheckout(
  priceLookupKey: string,
  opts?: { onAnalytics?: () => void },
): Promise<void> {
  if (isPublicMarketingHost()) {
    opts?.onAnalytics?.();
    window.location.href = `${CANONICAL_PRODUCT_URL}/pricing`;
    return;
  }
  const res = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceLookupKey }),
  });
  const data = await res.json();
  if (!data.url) {
    throw new Error(data.error || "Failed to start checkout. Please try again.");
  }
  opts?.onAnalytics?.();
  window.location.href = data.url;
}
