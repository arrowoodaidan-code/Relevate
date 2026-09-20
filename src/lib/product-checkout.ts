/**
 * Checkout routing for Relevate.
 *
 * The SAME codebase is deployed to two kinds of host with DIFFERENT checkout capability:
 *   - Product host: the Vercel production build (canonical alias below). It HAS a live
 *     STRIPE_SECRET_KEY, so /api/create-checkout-session works for all 6 plan lookup keys.
 *   - Marketing hosts: relevatelistingassistant.ctonew.app (+ -dev), which are built
 *     WITHOUT a Stripe key, so their local /api/create-checkout-session fails
 *     ("STRIPE_SECRET_KEY is not configured").
 *
 * RULE (changed 2026-09-20 — see the task/PR): a checkout CTA must never move a buyer to a
 * different hostname silently.
 *   1. Always ask the CURRENT host to start checkout first. If this host can take a payment,
 *      checkout starts in place: the visitor's address bar does not change until they reach
 *      Stripe's own checkout page.
 *   2. If the current host cannot take a payment, DO NOT redirect. Return a `handoff`
 *      descriptor instead, so the UI can show an explicit confirmation that names the
 *      destination host, and the visitor only leaves when they choose to.
 *
 * Why the previous behaviour was wrong: `window.location.href = <other host>` ran before any
 * request, so an ordinary mouse click on Subscribe teleported a prospect from the branded
 * domain to a raw platform hostname with no explanation (reproduced by hand 2026-09-20).
 *
 * The plan keys themselves live in src/lib/price-keys.ts — the single source of truth. This
 * module must never carry its own copy of them.
 */
import { isValidPriceKey } from "./price-keys";

/** Canonical product (Vercel) host — the deployment that can take a payment today. */
export const CANONICAL_PRODUCT_URL = "https://site-gray-five-32.vercel.app";

/** Hostname of the canonical product deployment (used for display and self-handoff guards). */
export const CANONICAL_PRODUCT_HOST = "site-gray-five-32.vercel.app";

/**
 * Where a buyer continues when the current host cannot start a payment.
 *
 * `plan`  picks the same plan (and billing cycle) on the destination.
 * `start` records that the buyer already confirmed the handoff, so the destination may begin
 *         checkout itself instead of asking them to find the same plan and click again.
 */
export function checkoutHandoffUrl(priceLookupKey: string): string {
  const params = new URLSearchParams({ plan: priceLookupKey, start: "1" });
  return `${CANONICAL_PRODUCT_URL}/pricing?${params.toString()}`;
}

/**
 * Read the checkout intent carried by a handoff URL (`?plan=<key>&start=1`).
 * Returns `plan: null` for anything that is not a known price key, so a hand-edited or stale
 * link can never start checkout for a plan that does not exist.
 */
export function readCheckoutIntent(search: string): { plan: string | null; autoStart: boolean } {
  const params = new URLSearchParams(search);
  const plan = params.get("plan");
  return {
    plan: plan && isValidPriceKey(plan) ? plan : null,
    autoStart: params.get("start") === "1",
  };
}

/**
 * Result of a checkout attempt.
 * - `redirecting`: this host started a real Stripe Checkout Session and the browser is
 *   already navigating to Stripe. Nothing else to render.
 * - `handoff`: this host cannot take a payment. NOTHING has been charged and NOTHING has
 *   navigated — show the visitor the destination host and let them confirm.
 */
export type CheckoutStartResult =
  | { outcome: "redirecting" }
  | {
      outcome: "handoff";
      /** Hostname the visitor would continue on, named in the confirmation UI. */
      host: string;
      /** Destination URL, with the chosen plan carried over so the right cycle is selected. */
      url: string;
      /** Why this host cannot do it — shown to the visitor, never invented. */
      reason: string;
    };

export type CheckoutHandoff = Extract<CheckoutStartResult, { outcome: "handoff" }>;

/**
 * Start checkout for a plan.
 *
 * @param priceLookupKey  a key from src/lib/price-keys.ts (monthly or annual).
 * @param opts.onAnalytics  fired only when a checkout genuinely starts.
 * @throws  when the visitor's own host fails for a reason a handoff cannot fix (unknown
 *          plan key, or the product host itself failing).
 */
export async function startCheckout(
  priceLookupKey: string,
  opts?: { onAnalytics?: () => void },
): Promise<CheckoutStartResult> {
  if (!isValidPriceKey(priceLookupKey)) {
    throw new Error(
      `Unknown plan "${priceLookupKey}" — refused before contacting checkout.`,
    );
  }

  let failure = "Checkout is not available from this page right now.";
  try {
    const res = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceLookupKey }),
    });
    const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      opts?.onAnalytics?.();
      window.location.href = data.url;
      return { outcome: "redirecting" };
    }
    failure =
      data.error ||
      `Checkout is unavailable from this page (HTTP ${res.status}). Nothing has been charged.`;
  } catch {
    failure =
      "Could not reach the checkout service from this page. Nothing has been charged.";
  }

  // This host cannot take a payment. Offer the handoff only when the destination really is a
  // different host — offering to continue on the current hostname would be nonsense.
  if (window.location.hostname === CANONICAL_PRODUCT_HOST) {
    throw new Error(failure);
  }

  return {
    outcome: "handoff",
    host: CANONICAL_PRODUCT_HOST,
    url: checkoutHandoffUrl(priceLookupKey),
    reason: failure,
  };
}
