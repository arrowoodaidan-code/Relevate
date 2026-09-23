/**
 * Gate: checkout redirects and cross-host routing.
 *
 * Run: bun scripts/check-checkout-safety.ts   (exit 0 = pass, 1 = fail)
 *
 * Two P0 defects this guards (2026-09-23):
 *  A. A live Checkout Session came back with `success_url`/`cancel_url` on
 *     `ip-10-110-103-223.us-west-2.prod.aws.beamlit.net` — an internal hostname with no public DNS
 *     record — because the endpoint preferred `process.env.VERCEL_URL`. A paying customer would
 *     have been redirected to a page that cannot load.
 *  B. When a host could not start a payment, the UI offered to continue on
 *     `site-gray-five-32.vercel.app`, which bills into a separate Stripe account this team cannot
 *     see or reconcile. Nobody may be routed to another host to pay.
 *
 * Checks 1–8 EXECUTE the real resolver (src/lib/public-url.ts) rather than pattern-matching it.
 */
import { readFileSync, existsSync } from "node:fs";
import {
  isInternalHostname,
  isPublicHostname,
  resolvePublicBaseUrl,
} from "../src/lib/public-url";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const read = (p: string) => readFileSync(`${ROOT}/${p}`, "utf8");

/**
 * Comments are allowed to name the old behaviour (that is how the next reader learns why the code
 * looks like this), so destination/hostname rules are applied to code only.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/[^\n`"']*$/gm, "");
}

const failures: string[] = [];
const notes: string[] = [];
function check(ok: boolean, label: string) {
  (ok ? notes : failures).push(`${ok ? "OK  " : "FAIL"} ${label}`);
}

const INTERNAL = "ip-10-110-103-223.us-west-2.prod.aws.beamlit.net";
const PUBLIC = "relevatelistingassistant.ctonew.app";

/* ---- 1–3. Hostname classification. ---- */
for (const host of [INTERNAL, "10.110.103.223", "[::1]", "localhost", "mybox", "db.internal", "a.local"]) {
  check(isInternalHostname(host), `isInternalHostname("${host}") is true`);
}
check(isPublicHostname(PUBLIC), `isPublicHostname("${PUBLIC}") is true`);
check(!isPublicHostname(INTERNAL), `isPublicHostname("${INTERNAL}") is false`);
check(!isPublicHostname("127.0.0.1"), "isPublicHostname(\"127.0.0.1\") is false");

/* ---- 4. THE REGRESSION: an internal VERCEL_URL must never win over the request host. ---- */
const regression = resolvePublicBaseUrl({
  headers: { host: PUBLIC },
  env: { VERCEL_URL: INTERNAL, NODE_ENV: "production" },
});
check(
  regression === `https://${PUBLIC}`,
  `the buyer's own host wins over an internal VERCEL_URL (got ${regression ?? "null"})`,
);

/* ---- 5. Forwarded headers (the platform sits behind a proxy). ---- */
const forwarded = resolvePublicBaseUrl({
  headers: { "x-forwarded-host": `${PUBLIC}, internal.example`, "x-forwarded-proto": "https" },
  env: {},
});
check(forwarded === `https://${PUBLIC}`, `x-forwarded-host resolves to the public host (got ${forwarded ?? "null"})`);

/* ---- 6. An explicitly configured public base URL wins outright. ---- */
const configured = resolvePublicBaseUrl({
  headers: { host: "some-other.example.com" },
  env: { PUBLIC_APP_URL: `https://${PUBLIC}/`, VERCEL_URL: INTERNAL },
});
check(
  configured === `https://${PUBLIC}`,
  `PUBLIC_APP_URL wins over the request host and the platform variable (got ${configured ?? "null"})`,
);

/* ---- 7. Never returns an internal hostname, for any input combination. ---- */
const matrix: { headers: Record<string, string>; env: Record<string, string | undefined> }[] = [];
for (const hostHeader of ["", INTERNAL, PUBLIC, "127.0.0.1"]) {
  for (const platform of ["", INTERNAL, "relevate.vercel.app"]) {
    matrix.push({
      headers: hostHeader ? { host: hostHeader } : {},
      env: { VERCEL_URL: platform, NODE_ENV: "production" },
    });
  }
}
const emitted = matrix.map((m) => resolvePublicBaseUrl(m)).filter((v): v is string => v !== null);
check(
  emitted.every((url) => isPublicHostname(new URL(url).hostname)),
  `every emitted base URL is a public hostname (${emitted.length} of ${matrix.length} inputs resolved; the rest fail honestly)`,
);
check(
  emitted.length < matrix.length,
  "inputs with no public host produce NO url (the endpoint then fails instead of emitting a dead link)",
);

/* ---- 8. The endpoint uses the resolver and guards the null case. ---- */
const endpoint = read("src/routes/api/create-checkout-session.ts");
const endpointCode = stripComments(endpoint);
check(
  /resolvePublicBaseUrl\(/.test(endpoint),
  "create-checkout-session.ts resolves the redirect base URL through src/lib/public-url.ts",
);
check(
  !/process\.env\.VERCEL_URL/.test(endpointCode) && !/VERCEL_PROJECT_PRODUCTION_URL/.test(endpointCode),
  "create-checkout-session.ts never reads the platform hostname variables itself",
);
check(
  /if \(!baseUrl\)/.test(endpoint) && /throw new Error/.test(endpoint),
  "create-checkout-session.ts throws BEFORE creating a session when no public URL exists",
);
check(
  /success_url: `\$\{baseUrl\}/.test(endpoint) && /cancel_url: `\$\{baseUrl\}/.test(endpoint),
  "success_url and cancel_url are both built from the resolved base URL",
);

/* ---- 9. Nobody is routed to another host to pay. ---- */
const checkout = read("src/lib/product-checkout.ts");
const checkoutCode = stripComments(checkout);
check(
  !/site-gray-five-32/.test(checkoutCode) && !/CANONICAL_PRODUCT/.test(checkoutCode) && !/checkoutHandoffUrl/.test(checkoutCode),
  "product-checkout.ts carries no other-deployment hostname and no handoff URL builder",
);
check(!/outcome: "handoff"/.test(checkoutCode), "the cross-host `handoff` outcome is gone");
check(
  /outcome: "unavailable"/.test(checkout),
  "the unavailable outcome exists (nothing navigates, nothing is charged)",
);
check(
  /MONTHLY_KEY_FOR/.test(checkout),
  "an annual key that this host rejects falls back to its monthly equivalent",
);
check(
  /Nothing has been charged/.test(checkout),
  "the failure text states plainly that nothing was charged",
);
const assignments = [...checkoutCode.matchAll(/window\.location\.(?:href\s*=|assign\()([^;]*)/g)].map((m) => m[1].trim());
check(assignments.length > 0, "product-checkout.ts still performs the real in-place navigation to Stripe");
check(
  assignments.every((rhs) => !/https?:\/\/|CANONICAL|PRODUCT_HOST/.test(rhs)),
  `no literal or cross-host URL is assigned to window.location (found: ${assignments.join(" | ")})`,
);
check(
  /from "\.\/price-keys"/.test(checkout) && !/starter_monthly|pro_annual|team_annual/.test(checkout),
  "plan keys still come from src/lib/price-keys.ts (no local copy)",
);

/* ---- 10. The UI offers only what works on this host. ---- */
const dialog = read("src/components/CheckoutUnavailableDialog.tsx");
check(existsSync(`${ROOT}/src/components/CheckoutUnavailableDialog.tsx`), "the in-place notice component exists");
check(
  !existsSync(`${ROOT}/src/components/CheckoutHandoffDialog.tsx`),
  "the old cross-host handoff dialog is deleted (its name described behaviour we no longer want)",
);
check(!/<a\s[^>]*href=/.test(dialog), "the notice contains no link that leaves the current host");
check(/Nothing has been charged/.test(dialog), "the notice tells the visitor nothing was charged");
check(/onRetry/.test(dialog) && /fallback/.test(dialog), "the notice can retry on this host with a working plan");
for (const route of ["src/routes/pricing.tsx", "src/routes/index.tsx"]) {
  const src = read(route);
  check(
    /CheckoutUnavailableDialog/.test(src) && !/CheckoutHandoffDialog/.test(src),
    `${route} renders the in-place notice, not a handoff dialog`,
  );
  check(
    /result\.outcome === "unavailable"/.test(src),
    `${route} handles the unavailable outcome`,
  );
}

/* Report. */
for (const line of notes) console.log(line);
if (failures.length) {
  console.log();
  for (const line of failures) console.log(line);
  console.log(`\n${failures.length} of ${failures.length + notes.length} checks FAILED — checkout safety regressed.`);
  process.exit(1);
}
console.log(`\nAll ${notes.length} checks passed — checkout redirects stay public and nobody is routed to another host.`);
