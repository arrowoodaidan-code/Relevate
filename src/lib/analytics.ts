/**
 * Analytics is intentionally OFF.
 *
 * Relevate has NO third-party analytics connection. No vendor script is injected, no analytics
 * key ships to the browser, and no event leaves the page. This module is kept as a documented
 * NO-OP so the ~20 call sites spread through the routes stay as harmless hooks (they record
 * intent, not behaviour) and so nobody re-introduces a vendor by accident.
 *
 * `trackEvent()` and `identifyUser()` do nothing, and `isAnalyticsEnabled()` always returns
 * false. If product metrics are wanted again, the intended path is counting off our own
 * database inside the app (signups, generations, subscriptions) — not re-adding a browser
 * analytics vendor. See README.md → "Analytics: intentionally off".
 *
 * Do not delete the call sites: they mark where a first-party counter would go.
 */

/** Always false: no analytics destination is configured, by design. */
export function isAnalyticsEnabled(): boolean {
  return false;
}

/** NO-OP. Retained so call sites compile and keep documenting where events would be recorded. */
export function trackEvent(_event: string, _properties?: Record<string, any>): void {
  // Intentionally empty: no analytics destination exists.
}

/** NO-OP. Never sends identity data anywhere. */
export function identifyUser(_userId: string, _traits?: Record<string, any>): void {
  // Intentionally empty: no analytics destination exists.
}
