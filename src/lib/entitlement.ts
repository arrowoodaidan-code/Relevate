/**
 * Entitlement resolution — the single place that decides what an account may
 * do, from the account's real state (tier + Stripe subscription status + trial
 * window), not from a bare tier string.
 *
 * Owner decisions (2026-11-20, spec /home/team/shared/specs/entitlement-enforcement.md):
 *   1. The "free" portion is a 14-day trial of the lowest tier — a new signup
 *      (tier 'free') gets Starter's entitlements (5 listings/month) for 14
 *      days from signup, then the trial ends and a subscription is required.
 *      The trial is a real `access_expires_at` window, not a label.
 *   2. At the limit (5 listings in the window, or the 14 days run out):
 *      generation is refused with a structured, honest message naming the real
 *      Stripe checkout. Never a silent failure, never a generic error.
 *   3. Existing accounts are NOT migrated by this code. A row that has never
 *      been provisioned by Stripe (no stripe_customer_id) keeps the
 *      pre-enforcement behaviour (its tier's monthly quota) until the
 *      owner-approved migration converts it. A row the webhook HAS provisioned
 *      must show subscription_status 'active' — anything else is refused, so a
 *      cancelled subscription no longer keeps its access.
 *   4. Demo and team tiers keep full access (isFullAccessTier), so the demo
 *      account used for reels and sales calls is unaffected.
 *   5. No silent fallback: an unknown tier resolves to "no plan" and is
 *      refused, never defaulted to 5.
 *
 * This module must stay dependency-light (it is imported by auth.ts): no
 * imports from auth.ts or properties.ts.
 */

import { PAYMENT_LINKS } from "./payment-links";

export const TRIAL_TIER = "free";
export const TRIAL_DURATION_DAYS = 14;
/** Starter's entitlement, granted during the trial. */
export const TRIAL_LISTING_LIMIT = 5;

/** Monthly listing caps per tier. Demo/team are unlimited (isFullAccessTier). */
export const TIER_MONTHLY_LIMITS: Record<string, number> = {
  [TRIAL_TIER]: TRIAL_LISTING_LIMIT,
  starter: 5,
  pro: 20,
};

export function isFullAccessTier(tier: string): boolean {
  return tier === "demo" || tier === "team";
}

export function isTrialTier(tier: string): boolean {
  return tier === TRIAL_TIER;
}

/** The account state entitlement decisions read. Mirrors the users row. */
export interface EntitlementInput {
  subscription_tier: string;
  subscription_status?: string | null;
  stripe_customer_id?: string | null;
  access_starts_at?: string | null;
  access_expires_at?: string | null;
}

export type Entitlement =
  /** demo/team — no quota, no window. */
  | { kind: "unlimited" }
  /** the 14-day signup trial; `ended` says whether the window has closed. */
  | { kind: "trial"; limit: number; ended: boolean; daysLeft: number }
  /** a known paid tier; `legacy` = never provisioned by Stripe (grandfathered
   * until the owner-approved migration). */
  | { kind: "plan"; tier: string; limit: number; entitled: boolean; legacy: boolean }
  /** tier not recognised — no plan, refused. */
  | { kind: "no_plan" };

export function resolveEntitlement(account: EntitlementInput): Entitlement {
  const tier = String(account.subscription_tier ?? "");

  if (isFullAccessTier(tier)) return { kind: "unlimited" };

  if (isTrialTier(tier)) {
    const end = account.access_expires_at ? new Date(account.access_expires_at).getTime() : null;
    const ended = end === null || Date.now() >= end;
    const msLeft = end === null ? 0 : Math.max(end - Date.now(), 0);
    const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return { kind: "trial", limit: TRIAL_LISTING_LIMIT, ended, daysLeft };
  }

  const limit = TIER_MONTHLY_LIMITS[tier];
  if (limit == null) return { kind: "no_plan" };

  const entitled = account.subscription_status === "active";
  const legacy = !entitled && account.stripe_customer_id == null;
  return { kind: "plan", tier, limit, entitled, legacy };
}

export interface EntitlementRefusal {
  code:
    | "TRIAL_ENDED"
    | "TRIAL_LIMIT_REACHED"
    | "NO_PLAN"
    | "SUBSCRIPTION_INACTIVE"
    | "PLAN_LIMIT_REACHED";
  message: string;
  upgrade: { url: string; label: string };
}

/** The real, live Stripe checkout for the plan a trial user is asked to buy. */
const STARTER_CHECKOUT_URL = PAYMENT_LINKS.starter_monthly;
const UPGRADE_STARTER = { url: STARTER_CHECKOUT_URL, label: "Upgrade to Starter — $39/month" };
const UPGRADE_PRICING = { url: "/pricing", label: "View plans" };

/**
 * Why this account cannot generate at all — null when generation may proceed.
 * Quota-at-limit is separate (quotaRefusalFor) because it depends on usage.
 */
export function refusalFor(ent: Entitlement): EntitlementRefusal | null {
  if (ent.kind === "unlimited") return null;

  if (ent.kind === "trial") {
    if (!ent.ended) return null;
    return {
      code: "TRIAL_ENDED",
      message:
        "Your 14-day free trial has ended. Subscribe to Starter ($39/month) to keep generating marketing content.",
      upgrade: UPGRADE_STARTER,
    };
  }

  if (ent.kind === "plan") {
    if (ent.entitled || ent.legacy) return null;
    return {
      code: "SUBSCRIPTION_INACTIVE",
      message:
        "Your subscription is no longer active, so this account cannot generate. Resubscribe to restore access.",
      upgrade: UPGRADE_PRICING,
    };
  }

  return {
    code: "NO_PLAN",
    message: "This account has no active plan. Subscribe to Starter ($39/month) to start generating.",
    upgrade: UPGRADE_STARTER,
  };
}

/**
 * Why this account cannot generate right now even though it has a plan —
 * the monthly listing quota is spent. `used` is countListingsThisMonth().
 */
export function quotaRefusalFor(ent: Entitlement, used: number): EntitlementRefusal | null {
  if (ent.kind === "trial") {
    if (ent.ended || used < ent.limit) return null;
    return {
      code: "TRIAL_LIMIT_REACHED",
      message:
        "You've used all 5 listings included this month. Your allowance resets on the 1st — or subscribe to Starter ($39/month) to keep your account after the trial.",
      upgrade: UPGRADE_STARTER,
    };
  }
  if (ent.kind === "plan") {
    if (!ent.entitled && !ent.legacy) return null; // refusalFor already covers it
    if (used < ent.limit) return null;
    return {
      code: "PLAN_LIMIT_REACHED",
      message: `You've used all ${ent.limit} listings in your monthly allowance. It resets on the 1st of the month.`,
      upgrade: UPGRADE_PRICING,
    };
  }
  return null;
}
