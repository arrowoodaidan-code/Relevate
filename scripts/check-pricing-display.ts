/**
 * Guard against the "page says one number, Stripe charges another" bug class.
 *
 * Asserts that every amount the UI derives from src/lib/pricing-display.ts matches the
 * Stripe price record in src/lib/stripe-prices.ts EXACTLY — cents included — and that the
 * monthly display is unchanged in style (no cents when the amount is whole dollars).
 *
 * Run: bun run scripts/check-pricing-display.ts
 */
import { annualPriceDisplay, monthlyPriceDisplay, usdDisplay } from "../src/lib/pricing-display";
import { tiers, annualTiers } from "../src/lib/stripe-prices";
import type { PriceKey } from "../src/lib/price-keys";

const failures: string[] = [];

function expect(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
  if (!ok) failures.push(`${label}: got ${actual}, expected ${expected}`);
}

/** Displayed string -> the cent amount it claims, so it can be compared to Stripe's. */
function centsOf(display: string): number {
  return Math.round(Number(display.replace(/[$,]/g, "")) * 100);
}

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
  const record = [...tiers, ...annualTiers].find((x) => x.lookup_key === key);
  expect(`${key}: display vs Stripe amountCents`, String(centsOf(display)), String(record?.amountCents));
}

console.log("\n--- Formatting rule ---");
expect("whole dollars print without cents", usdDisplay(3900), "$39");
expect("cents print exactly", usdDisplay(222084), "$2,220.84");
expect("cents print exactly (2-digit cents)", usdDisplay(88164), "$881.64");

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAll pricing-display checks passed.");
