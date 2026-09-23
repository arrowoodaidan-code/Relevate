/**
 * Checkout routing for Relevate.
 *
 * RULES (rewritten 2026-09-23 — P0 fix; supersedes the 2026-09-20 cross-host handoff):
 *   1. A checkout CTA asks the CURRENT host to start checkout. On success the browser goes to
 *      Stripe's own page and nothing else has moved.
 *   2. If the current host cannot start a payment, NOTHING navigates and nothing is charged.
 *      The visitor is told, in place, why it failed. **A buyer is never routed to another host
 *      to pay.** The old behaviour sent them to `site-gray-five-32.vercel.app`, which bills into
 *      a separate Stripe account this team cannot see or reconcile — taking money we cannot
 *      account for is worse than not taking it.
 *   3. Where it genuinely fits, we offer what does work on this host instead: a plan whose
 *      *annual* key this host rejects (its server layer is older than this repository) can be
 *      retried monthly in one click, labelled honestly.
 *
 * The plan keys themselves live in src/lib/price-keys.ts — the single source of truth. This
 * module must never carry its own copy of them, and no hostname of another deployment may
 * appear here as a navigation destination.
 */
import { isValidPriceKey, MONTHLY_KEY_FOR } from "./price-keys";

/** Human label for a plan key, e.g. "Starter (yearly)". Kept here so both CTA surfaces agree. */
export function planLabel(priceLookupKey: string): string {
  const annual = priceLookupKey.endsWith("_annual");
  const base = priceLookupKey.replace(/_monthly$/, "").replace(/_annual$/, "");
  const name = base === "starter" ? "Starter" : base === "pro" ? "Pro" : base === "team" ? "Team" : priceLookupKey;
  return annual ? `${name} (yearly)` : `${name} (monthly)`;
}

/**
 * Read the checkout intent carried by a legacy `?plan=<key>&start=1` URL.
 *
 * We no longer create these links (see rule 2 at the top of this file — nothing is routed to
 * another host any more), but a previously shared link may still arrive. It only *selects* a plan
 * and, at most, asks this page to start checkout for it on this host: the same rule applies, so an
 * unreachable plan still fails in place instead of moving anyone.
 *
 * Returns `plan: null` for anything that is not a known price key, so a hand-edited or stale link
 * can never start checkout for a plan that does not exist.
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
 * - `redirecting`: this host started a real Stripe Checkout Session and the browser is already
 *   navigating to Stripe. Nothing else to render.
 * - `unavailable`: this host could not start a payment. NOTHING has navigated and NOTHING has
 *   been charged. The UI states the reason in place and, when `fallback` is present, offers a
 *   one-click retry on THIS host with a plan key that does work here.
 */
export type CheckoutStartResult =
  | { outcome: "redirecting" }
  | {
      outcome: "unavailable";
      /** Why this host cannot do it — shown to the visitor, never invented. */
      reason: string;
      /** The plan the visitor asked for, already labelled for display. */
      planKey: string;
      planLabel: string;
      /**
       * A plan that is known to work on this host instead (monthly, when an annual key was
       * rejected). Absent when there is nothing honest to offer.
       */
      fallback?: { planKey: string; planLabel: string; note: string };
    };

export type CheckoutUnavailable = Extract<CheckoutStartResult, { outcome: "unavailable" }>;

/**
 * Start checkout for a plan on the current host.
 *
 * @param priceLookupKey  a key from src/lib/price-keys.ts (monthly or annual).
 * @param opts.onAnalytics  fired only when a checkout genuinely starts.
 * @throws  only when the caller passed a key that does not exist — refused before any request.
 */
export async function startCheckout(
  priceLookupKey: string,
  opts?: { onAnalytics?: () => void },
): Promise<CheckoutStartResult> {
  if (!isValidPriceKey(priceLookupKey)) {
    throw new Error(`Unknown plan "${priceLookupKey}" — refused before contacting checkout.`);
  }

  let failure = "Checkout is not available from this page right now. Nothing has been charged.";
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
    failure = "Could not reach the checkout service from this page. Nothing has been charged.";
  }

  // Nothing navigates and nothing is charged. Offer a plan that works here when we know one:
  // this host's server layer rejects the annual lookup keys, and the monthly equivalent is a
  // real, payable plan on the same host and the same Stripe account.
  const monthly = MONTHLY_KEY_FOR[priceLookupKey];
  const fallback = monthly
    ? {
        planKey: monthly,
        planLabel: planLabel(monthly),
        note: "Billed monthly on this site, cancel any time.",
      }
    : undefined;

  return {
    outcome: "unavailable",
    reason: failure,
    planKey: priceLookupKey,
    planLabel: planLabel(priceLookupKey),
    ...(fallback ? { fallback } : {}),
  };
}
