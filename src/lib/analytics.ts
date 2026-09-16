/**
 * PostHog analytics wrapper — degrades gracefully when env vars are missing.
 *
 * Track key events:
 * - user_signed_up — fired after successful signup
 * - content_generated — fired after AI content generation
 * - checkout_started — fired when user clicks a plan
 */

const POSTHOG_KEY = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_POSTHOG_KEY : undefined;
const POSTHOG_HOST = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_POSTHOG_HOST : undefined;

let posthog: any = null;

function getPostHog() {
  if (!posthog && typeof window !== "undefined" && (window as any).posthog) {
    posthog = (window as any).posthog;
  }
  return posthog;
}

export function isAnalyticsEnabled(): boolean {
  return !!(POSTHOG_KEY && POSTHOG_HOST);
}

export function trackEvent(event: string, properties?: Record<string, any>): void {
  const ph = getPostHog();
  if (ph) {
    ph.capture(event, properties ?? {});
  }
}

export function identifyUser(userId: string, traits?: Record<string, any>): void {
  const ph = getPostHog();
  if (ph) {
    ph.identify(userId, traits ?? {});
  }
}
