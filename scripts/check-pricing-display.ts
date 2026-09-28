/**
 * Guard against two shipping bugs that both cost money:
 *
 *   A. "the page says one number, Stripe charges another" — every amount the UI derives from
 *      src/lib/pricing-display.ts must match the Stripe price record in src/lib/stripe-prices.ts
 *      EXACTLY, cents included, and any "save N%" or monthly-equivalent must be arithmetically true
 *      against those exact amounts.
 *   B. "the page advertises a cycle nobody can buy" — 2026-09-28: three live annual Payment Links
 *      existed in Stripe but `PAYMENT_LINKS` had those keys as empty strings, so the yearly toggle
 *      advertised $435.24 / $881.64 / $2,220.84 and offered no way to pay them. Every cycle the
 *      pricing page advertises must resolve, through the same code path the UI uses, to a real
 *      purchase link.
 *
 * It also holds the API session path off until it has its own live proof (task 17ab450d): flipping
 * `API_CHECKOUT_ENABLED` is a deliberate act, and a check that fails on it is how it stays one.
 *
 * Run: bun scripts/check-pricing-display.ts
 */
import { readFileSync } from "node:fs";
import { annualPriceDisplay, monthlyPriceDisplay, planAmountCents, usdDisplay } from "../src/lib/pricing-display";
import { tiers, annualTiers } from "../src/lib/stripe-prices";
import { API_CHECKOUT_ENABLED, paymentLinkFor } from "../src/lib/payment-links";
import { PRICE_KEYS, type PriceKey } from "../src/lib/price-keys";

const failures: string[] = [];
let checks = 0;

function expect(label: string, actual: string, expected: string) {
  checks++;
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
  if (!ok) failures.push(`${label}: got ${actual}, expected ${expected}`);
}

/** Boolean assertion, for things that are not a single displayed string. */
function check(label: string, ok: boolean, detail = "") {
  checks++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/** Displayed string -> the cent amount it claims, so it can be compared to Stripe's. */
function centsOf(display: string): number {
  return Math.round(Number(display.replace(/[$,]/g, "")) * 100);
}

const ALL_TIERS = [...tiers, ...annualTiers];

console.log("--- Monthly display (must be unchanged: whole dollars) ---");
expect("starter_monthly price", monthlyPriceDisplay("starter_monthly").price, "$39");
expect("pro price", monthlyPriceDisplay("pro").price, "$79");
expect("team price", monthlyPriceDisplay("team").price, "$199");
expect("period", monthlyPriceDisplay("starter_monthly").period, "/mo");

console.log("\n--- Annual display (exact cents, derived from the Stripe record) ---");
const s = annualPriceDisplay("starter_annual", "starter_monthly");
const p = annualPriceDisplay("pro_annual", "pro");
const t = annualPriceDisplay("team_annual", "team");
expect("starter annual price", s.price, "$435.24");
expect("starter annual sub", s.priceSub!, "($36.27/mo, paid upfront) · save 7%");
expect("pro annual price", p.price, "$881.64");
expect("pro annual sub", p.priceSub!, "($73.47/mo, paid upfront) · save 7%");
expect("team annual price", t.price, "$2,220.84");
expect("team annual sub", t.priceSub!, "($185.07/mo, paid upfront) · save 7%");

console.log("\n--- Displayed amount === Stripe amount charged (cents-exact, no rounding) ---");
const PAIRS: { key: PriceKey; display: string }[] = [
  { key: "starter_monthly", display: monthlyPriceDisplay("starter_monthly").price },
  { key: "pro", display: monthlyPriceDisplay("pro").price },
  { key: "team", display: monthlyPriceDisplay("team").price },
  { key: "starter_annual", display: s.price },
  { key: "pro_annual", display: p.price },
  { key: "team_annual", display: t.price },
];
for (const { key, display } of PAIRS) {
  const record = ALL_TIERS.find((x) => x.lookup_key === key);
  expect(`${key}: display vs Stripe amountCents`, String(centsOf(display)), String(record?.amountCents));
}

console.log("\n--- Any advertised saving or monthly equivalent is arithmetically true ---");
const ANNUAL_PAIRS: { annual: PriceKey; monthly: PriceKey }[] = [
  { annual: "starter_annual", monthly: "starter_monthly" },
  { annual: "pro_annual", monthly: "pro" },
  { annual: "team_annual", monthly: "team" },
];
for (const { annual, monthly } of ANNUAL_PAIRS) {
  const annualCents = planAmountCents(annual);
  const monthlyCents = planAmountCents(monthly);
  const shown = annualPriceDisplay(annual, monthly).priceSub ?? "";

  /* The percentage shown must BE the saving computed from the exact amounts — not a figure
   * someone typed beside them. */
  const shownPct = /save (\d+)%/.exec(shown);
  const truePct = Math.round((1 - annualCents / (12 * monthlyCents)) * 100);
  check(
    `${annual}: shown saving is the true one`,
    shownPct !== null && Number(shownPct[1]) === truePct,
    shownPct ? `${shownPct[1]}% shown, ${truePct}% computed from ${annualCents}¢ vs ${12 * monthlyCents}¢` : "no saving shown",
  );

  /* And the claim may never overstate: paying for the year must save AT LEAST the advertised
   * percentage. Compared in exact integer arithmetic — `monthlyCents * 12 * 0.93` in floating point
   * puts team_annual one cent under its own true amount (238800 × 0.93 = 222083.999…) and would fail
   * a correct price. annual ≤ 12 × monthly × (1 - p) ⟺ annual × 100 ≤ 12 × monthly × (100 - p). */
  if (shownPct) {
    const claimed = Number(shownPct[1]);
    const twelveMonthly = 12 * monthlyCents;
    const withinClaim = annualCents * 100 <= twelveMonthly * (100 - claimed);
    const exactPct = ((1 - annualCents / twelveMonthly) * 100).toFixed(3);
    check(
      `${annual}: ${annualCents}¢ honours the advertised ${claimed}% saving`,
      withinClaim,
      `${usdDisplay(annualCents)} vs ${usdDisplay(twelveMonthly)} monthly — true saving ${exactPct}%`,
    );
  }

  /* The monthly equivalent printed under the annual price must be the annual amount ÷ 12. */
  const expectedMonthly = usdDisplay(Math.round(annualCents / 12));
  check(
    `${annual}: displayed monthly equivalent is annual ÷ 12`,
    shown.includes(`${expectedMonthly}/mo`),
    `${expectedMonthly}/mo expected in "${shown}"`,
  );
}

console.log("\n--- Every advertised cycle has a working purchase path ---");
/* "Advertised" = shown on /pricing. The page builds its plan cards from these same keys, so the
 * catalog and the page are compared against each other rather than trusted separately. */
let pricingSource = "";
try {
  pricingSource = readFileSync(new URL("../src/routes/pricing.tsx", import.meta.url), "utf8");
} catch (err: any) {
  check("pricing page readable", false, String(err?.message ?? err));
}
const advertisedKeys = PRICE_KEYS.filter((key) => pricingSource.includes(`"${key}"`));
check(
  "pricing page and price catalog agree on the advertised cycles",
  advertisedKeys.length === PRICE_KEYS.length,
  `${advertisedKeys.length}/${PRICE_KEYS.length} advertised` +
    (advertisedKeys.length === PRICE_KEYS.length ? "" : ` — missing: ${PRICE_KEYS.filter((k) => !advertisedKeys.includes(k)).join(", ")}`),
);

for (const key of advertisedKeys) {
  const link = paymentLinkFor(key);
  check(
    `${key}: offered for purchase (real Stripe Payment Link)`,
    typeof link === "string" && link.startsWith("https://buy.stripe.com/"),
    link ?? `empty — the /pricing card would read "Not available yet" while still advertising ${usdDisplay(planAmountCents(key))}`,
  );
}

console.log("\n--- The API session path stays off until its own live proof (task 17ab450d) ---");
check(
  "API_CHECKOUT_ENABLED is false",
  API_CHECKOUT_ENABLED === false,
  `API_CHECKOUT_ENABLED=${API_CHECKOUT_ENABLED} — turning it on requires a session created on the live host, read back from Stripe, with a public success_url that loads`,
);

console.log("\n--- Formatting rule ---");
expect("whole dollars print without cents", usdDisplay(3900), "$39");
expect("cents print exactly", usdDisplay(222084), "$2,220.84");
expect("cents print exactly (2-digit cents)", usdDisplay(88164), "$881.64");

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nAll ${checks} pricing-display checks passed.`);
