/**
 * Stripe Payment Links — the money path that SHIPS.
 *
 * WHY THIS EXISTS (2026-09-23, task cc757042 — cause since fixed; current state at the end)
 * The published `/api/*` layer on relevatelistingassistant.ctonew.app did not run the current
 * repository code, and publishing a new build did not replace it: after publishing main at
 * `da51621` (which contains the redirect fix) the live layer still
 *   - rejected `pro_annual` ("Must be one of: starter_monthly, pro, team"),
 *   - handed a DEMO account a payable checkout session, and
 *   - created sessions whose `success_url` was an internal hostname (`ip-10-110-66-173.…`),
 * while the client bundle refreshed normally. A visitor could therefore pay on the branded host and
 * land on a page that cannot load — which must never be shippable. The cause turned out to be the
 * server-side checkout code in `serve.ts`, fixed in #24/#25.
 *
 * CURRENT STATE (re-verified live 2026-09-28, main `413b118`): the layer does run the current code —
 * every price key is accepted, a demo account is refused, and sessions carry success/cancel URLs on
 * https://relevatelistingassistant.ctonew.app (both load). Payment Links remain the primary path:
 * they ship with the client, need no server round-trip, and cannot be broken by a stale layer.
 *
 * A Stripe Payment Link is created in our own connected account and lives on Stripe's side, so it
 * ships with the client and does not depend on the server layer at all.
 *
 * FILLING THESE IN
 * Create one link per plan in the Stripe dashboard (Products → Payment links), with
 * `after_completion` → "Redirect to a page" = the plan's success page on our public host, e.g.
 *   https://<our public host>/app/subscription/success?plan=<price lookup key>
 * and paste the `https://buy.stripe.com/…` URL below against the matching price lookup key.
 * A plan's link can also be supplied at build time with a `VITE_STRIPE_PAYMENT_LINK_<KEY>`
 * environment value, which wins over the value committed here (Vite `*` vars are baked in at
 * build time, so a change needs a publish).
 *
 * `client_reference_id` (and a prefilled email) can be appended at click time from the signed-in
 * user, so a Payment Link purchase is still attributable to a user when we reconcile by hand —
 * the alternative (no attribution at all) makes provisioning guesswork.
 */

import { isValidPriceKey } from "./price-keys";

/** Link per price lookup key. Empty string = not created yet, and the UI then offers no purchase. */
export const PAYMENT_LINKS: Record<string, string> = {
  /* Created in our own connected account by the owner on 2026-09-23; each redirects to
   * https://relevatelistingassistant.ctonew.app/app/subscription/success and allows promotion
   * codes. Starter $39/mo · Pro $79/mo · Team $199/mo. */
  starter_monthly: "https://buy.stripe.com/dRmfZj89t9ICflMbUl7ok02",
  pro: "https://buy.stripe.com/9B67sN89t3ke8Xo0bD7ok00",
  team: "https://buy.stripe.com/3cI5kFexR082flMgaB7ok01",
  /* Yearly (pay-upfront) links, created in our own connected account on 2026-09-28. Each redirects
   * to https://relevatelistingassistant.ctonew.app/app/subscription/success, allows promotion codes,
   * and carries `metadata plan=<lookup key>`. The price id on each line is the recurring year price
   * the link charges, and its amount is the figure the UI prints (src/lib/stripe-prices.ts):
   * Starter $435.24/yr · Pro $881.64/yr · Team $2,220.84/yr. */
  starter_annual: "https://buy.stripe.com/5kQ8wRdtN4oib5w1fH7ok04", // price_1UIy0DRfpx71SLuLKwApkVcB — 43524¢ / year
  pro_annual: "https://buy.stripe.com/14A5kF4XhdYS1uW7E57ok05", // price_1UIy0DRfpx71SLuLak0pGA7M — 88164¢ / year
  team_annual: "https://buy.stripe.com/cNi00lgFZcUOc9A7E57ok03", // price_1UIy0DRfpx71SLuL7YM9HMcQ — 222084¢ / year
};

/**
 * Whether the legacy `/api/create-checkout-session` path may be offered.
 *
 * FALSE, and it may only be turned on by the task that produces the live proof (17ab450d), not as a
 * side effect of any other change.
 *
 * The original reason for holding it (sessions whose success/cancel URLs pointed at an internal
 * hostname, stranding a buyer who paid) is FIXED and verified live on 2026-09-28: the endpoint
 * accepts every price key, refuses a demo account, and returns
 * https://relevatelistingassistant.ctonew.app/app/subscription/success — which loads. The hold now
 * rests on what is still unproven: no session created on the live host has been read back from
 * Stripe and its public success_url followed through, and payment provisioning is manual (the
 * webhook is not registered). Until that proof exists, the UI offers Payment Links or nothing —
 * never a button that can take money without a return path we have actually verified.
 */
export const API_CHECKOUT_ENABLED = false;

function envLink(key: string): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const name = `VITE_STRIPE_PAYMENT_LINK_${key.toUpperCase()}`;
  return (env[name] ?? "").trim();
}

/** The configured Payment Link for a plan, or null when there is none (or the key is unknown). */
export function paymentLinkFor(priceLookupKey: string): string | null {
  if (!isValidPriceKey(priceLookupKey)) return null;
  const fromEnv = envLink(priceLookupKey);
  const fromConfig = (PAYMENT_LINKS[priceLookupKey] ?? "").trim();
  const url = fromEnv || fromConfig;
  return url.startsWith("https://") ? url : null;
}

/**
 * A plan's Payment Link with buyer attribution appended.
 *
 * `client_reference_id` is the signed-in user's id (Stripe stores it on the session and shows it in
 * the dashboard, which is how we match a payment to an account). `prefilled_email` saves the buyer
 * typing it again. Both are optional: a visitor who is not signed in still gets a working link,
 * just without attribution.
 */
export function paymentLinkUrl(
  priceLookupKey: string,
  opts: { clientReferenceId?: string; email?: string } = {},
): string | null {
  const base = paymentLinkFor(priceLookupKey);
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (opts.clientReferenceId) url.searchParams.set("client_reference_id", opts.clientReferenceId);
  if (opts.email) url.searchParams.set("prefilled_email", opts.email);
  return url.toString();
}
