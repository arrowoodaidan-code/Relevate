/**
 * Checkout routing for Relevate.
 *
 * HOW A BUYER PAYS (rewritten 2026-09-23, task cc757042)
 *   1. If this plan has a Stripe Payment Link (`src/lib/payment-links.ts`), that is the path: it
 *      lives on Stripe's side, so it works even though the live host's `/api/*` layer is stale, and
 *      it can carry the signed-in user's id for reconciliation.
 *   2. Otherwise, ONLY when `API_CHECKOUT_ENABLED` is true, ask this host's
 *      `/api/create-checkout-session` (see that flag: on the branded host today it produces
 *      success URLs on an internal hostname, so it stays off until verified live).
 *   3. Otherwise nothing is offered. That is deliberate: a Subscribe button that takes money and
 *      strands the buyer is worse than no button, and the UI labels the plan "Not available yet".
 *
 * A buyer is never routed to another host to pay — a payment taken in a Stripe account we cannot
 * see is money we cannot reconcile.
 *
 * The plan keys live in src/lib/price-keys.ts — the single source of truth.
 */
import { isValidPriceKey, MONTHLY_KEY_FOR } from "./price-keys";
import { API_CHECKOUT_ENABLED, paymentLinkFor, paymentLinkUrl } from "./payment-links";

/** Human label for a plan key, e.g. "Starter (yearly)". Kept here so both CTA surfaces agree. */
export function planLabel(priceLookupKey: string): string {
  const annual = priceLookupKey.endsWith("_annual");
  const base = priceLookupKey.replace(/_monthly$/, "").replace(/_annual$/, "");
  const name = base === "starter" ? "Starter" : base === "pro" ? "Pro" : base === "team" ? "Team" : priceLookupKey;
  return annual ? `${name} (yearly)` : `${name} (monthly)`;
}

/**
 * How a plan can be paid for right now — pure and synchronous, so the pricing UI can decide
 * whether to render a working control or the honest "not available yet" state.
 */
export function checkoutAvailability(priceLookupKey: string): "payment-link" | "api" | "none" {
  if (paymentLinkFor(priceLookupKey)) return "payment-link";
  return API_CHECKOUT_ENABLED ? "api" : "none";
}

/**
 * Read the checkout intent carried by a legacy `?plan=<key>&start=1` URL. We no longer create these
 * links; a previously shared one only *selects* a plan and may ask this page to start checkout for
 * it here, under rules 1–3 above.
 */
export function readCheckoutIntent(search: string): { plan: string | null; autoStart: boolean } {
  const params = new URLSearchParams(search);
  const plan = params.get("plan");
  return {
    plan: plan && isValidPriceKey(plan) ? plan : null,
    autoStart: params.get("start") === "1",
  };
}

/** The signed-in user, when there is one. Never throws: attribution is a bonus, not a gate. */
async function signedInUser(): Promise<{ id: string; email?: string; tier?: string } | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const user = data?.user ?? data;
    if (!user?.id) return null;
    return {
      id: String(user.id),
      email: user.email ? String(user.email) : undefined,
      tier: user.subscription_tier ? String(user.subscription_tier) : undefined,
    };
  } catch {
    return null;
  }
}

export type CheckoutStartResult =
  | { outcome: "redirecting" }
  | {
      outcome: "unavailable";
      /** Why this page cannot take the payment — shown to the visitor, never invented. */
      reason: string;
      planKey: string;
      planLabel: string;
      /**
       * A plan that IS available on this page instead (the monthly equivalent, when only the annual
       * cycle is missing). Absent when there is nothing honest to offer.
       */
      fallback?: { planKey: string; planLabel: string; note: string };
    };

export type CheckoutUnavailable = Extract<CheckoutStartResult, { outcome: "unavailable" }>;

/** The monthly fallback descriptor, when the monthly plan is genuinely purchasable here. */
function monthlyFallback(priceLookupKey: string) {
  const monthly = MONTHLY_KEY_FOR[priceLookupKey];
  if (!monthly || checkoutAvailability(monthly) === "none") return undefined;
  return {
    planKey: monthly,
    planLabel: planLabel(monthly),
    note: "Billed monthly on this page, cancel any time.",
  };
}

/**
 * Start checkout for a plan.
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

  const user = await signedInUser();

  /* Demo accounts never bill. The live host's server layer enforces no such thing (measured: it
   * returns a payable session for a demo user id), so the guarantee is enforced here, client-side,
   * before any Stripe URL is handed over. */
  if (user?.tier === "demo") {
    return {
      outcome: "unavailable",
      reason: "Demo accounts have full access and never require billing.",
      planKey: priceLookupKey,
      planLabel: planLabel(priceLookupKey),
    };
  }

  const link = paymentLinkUrl(priceLookupKey, {
    clientReferenceId: user?.id,
    email: user?.email,
  });
  if (link) {
    opts?.onAnalytics?.();
    window.location.href = link;
    return { outcome: "redirecting" };
  }

  if (API_CHECKOUT_ENABLED) {
    const result = await startViaApi(priceLookupKey, opts);
    if (result) return result;
  }

  /* Nothing on this page can take this plan's money without a return path we trust. Say so. */
  const fallback = monthlyFallback(priceLookupKey);
  return {
    outcome: "unavailable",
    reason:
      priceLookupKey.endsWith("_annual")
        ? "Yearly billing isn't available on this page yet. Nothing has been charged."
        : "Subscribing from this page isn't available yet. Nothing has been charged.",
    planKey: priceLookupKey,
    planLabel: planLabel(priceLookupKey),
    ...(fallback ? { fallback } : {}),
  };
}

/**
 * The legacy API path. Returns null when this page could not start a payment (the caller then
 * reports the honest "not available" state), or a `redirecting` result when the browser is on its
 * way to Stripe.
 *
 * Server error text is NEVER shown to a visitor — it goes to the console for us instead, because
 * lines like `Invalid priceLookupKey: pro_annual. Must be one of: …` describe our internals.
 */
async function startViaApi(
  priceLookupKey: string,
  opts?: { onAnalytics?: () => void },
): Promise<CheckoutStartResult | null> {
  try {
    const res = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceLookupKey }),
      credentials: "include",
    });
    const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      opts?.onAnalytics?.();
      window.location.href = data.url;
      return { outcome: "redirecting" };
    }
    if (data.error) console.warn("[checkout] API declined:", data.error);
  } catch (err) {
    console.warn("[checkout] API unreachable:", err);
  }
  return null;
}
