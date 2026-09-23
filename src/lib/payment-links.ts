/**
 * Stripe Payment Links — the money path that SHIPS.
 *
 * WHY THIS EXISTS (2026-09-23, task cc757042)
 * The published `/api/*` layer on relevatelistingassistant.ctonew.app does not run the current
 * repository code, and publishing a new build does not replace it: after publishing main at
 * `da51621` (which contains the redirect fix) the live layer still
 *   - rejected `pro_annual` ("Must be one of: starter_monthly, pro, team"),
 *   - handed a DEMO account a payable checkout session, and
 *   - created sessions whose `success_url` is an internal hostname (`ip-10-110-66-173.…`),
 * while the client bundle refreshed normally. A visitor can therefore pay on the branded host and
 * land on a page that cannot load — which must never be shippable.
 *
 * A Stripe Payment Link is created in our own connected account and lives on Stripe's side, so it
 * ships with the client and does not depend on that stale layer at all.
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
  starter_monthly: "",
  pro: "",
  team: "",
  starter_annual: "",
  pro_annual: "",
  team_annual: "",
};

/**
 * Whether the legacy `/api/create-checkout-session` path may be offered.
 *
 * FALSE on purpose, and this is the non-negotiable invariant rather than a preference: on the
 * branded host that endpoint creates sessions whose success/cancel URLs point at an internal
 * hostname, so a buyer who pays is stranded. Turn this on ONLY once a session created on the live
 * host has been read back from Stripe and its `success_url` is a public host that loads
 * (`stripe_read /v1/checkout/sessions?limit=1`). Until then the API path stays off and the UI
 * offers Payment Links or nothing at all — never a button that can take money and strand someone.
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
