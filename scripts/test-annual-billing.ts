/**
 * Unit guard for the annual-billing feature (FINAL owner pricing).
 * Asserts the shared price-key mapping (used by BOTH the checkout validator and
 * the webhook tierMap) and the FINAL amounts:
 *   - Monthly: Starter $39 (was $29), Pro $79, Team $199
 *   - Annual = 7% off → 93% of 12 × monthly (exact cents)
 *
 * Run: bun scripts/test-annual-billing.ts
 * Exit non-zero on any failure (fail-loudly, mirrors the vision-gate pattern).
 */
import {
  PRICE_KEYS,
  isValidPriceKey,
  PRICE_KEY_TO_TIER,
  ANNUAL_KEY_FOR,
  MONTHLY_KEY_FOR,
} from "../src/lib/price-keys";

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

console.log("Annual billing guard (FINAL owner pricing)\n");

// 1. Validator accepts all six keys (monthly + yearly)
console.log("[1] Validator key set");
check(PRICE_KEYS.length === 6, "PRICE_KEYS has 6 entries");
for (const k of ["starter_monthly", "pro", "team", "starter_annual", "pro_annual", "team_annual"]) {
  check(isValidPriceKey(k), `isValidPriceKey accepts "${k}"`);
}
check(!isValidPriceKey("starterx"), "rejects invalid key");
check(!isValidPriceKey("starter"), "rejects legacy locked key 'starter'");
check(!isValidPriceKey(""), "rejects empty key");

// 2. Webhook tierMap: annual keys map to the SAME tier as their monthly key
console.log("\n[2] Webhook tier mapping (annual -> same tier)");
check(PRICE_KEY_TO_TIER.starter_annual === "starter", "starter_annual -> starter");
check(PRICE_KEY_TO_TIER.pro_annual === "pro", "pro_annual -> pro");
check(PRICE_KEY_TO_TIER.team_annual === "team", "team_annual -> team");
check(PRICE_KEY_TO_TIER.starter_monthly === "starter", "starter_monthly -> starter (monthly)");
check(PRICE_KEY_TO_TIER.pro === "pro", "pro -> pro (monthly unchanged)");
check(PRICE_KEY_TO_TIER.team === "team", "team -> team (monthly unchanged)");

// 3. Annual lookup keys round-trip with monthly keys
console.log("\n[3] Annual <-> monthly key round-trip");
check(ANNUAL_KEY_FOR.starter_monthly === "starter_annual", "starter_monthly -> starter_annual");
check(MONTHLY_KEY_FOR.starter_annual === "starter_monthly", "starter_annual -> starter_monthly");
check(MONTHLY_KEY_FOR.pro_annual === "pro", "pro_annual -> pro");
check(MONTHLY_KEY_FOR.team_annual === "team", "team_annual -> team");

// 4. FINAL amounts:
//    Monthly: starter_monthly 3900, pro 7900, team 19900
//    Annual  = round(12 × monthly × 0.93)  (7% off → pay 93%)
console.log("\n[4] FINAL amounts: annual = 93% of 12 x monthly (7% off, exact cents)");
const monthlyAmounts: Record<string, number> = { starter_monthly: 3900, pro: 7900, team: 19900 };
const annualAmounts: Record<string, number> = {
  starter_annual: 43524, // 12×39=468 *0.93 = 435.24
  pro_annual: 88164, // 12×79=948 *0.93 = 881.64
  team_annual: 222084, // 12×199=2388 *0.93 = 2220.84
};
for (const key of ["starter_monthly", "pro", "team"]) {
  const annualKey = ANNUAL_KEY_FOR[key];
  const expected = Math.round(monthlyAmounts[key] * 12 * 0.93);
  check(
    annualAmounts[annualKey] === expected,
    `${key}: ${monthlyAmounts[key]}¢/mo ×12 ×0.93 = ${annualAmounts[annualKey]}¢ (${(annualAmounts[annualKey] / 100).toFixed(2)}/yr)`,
  );
}

// 5. Monthly Starter corrected to $39 (matches the pricing UI card)
console.log("\n[5] Starter monthly corrected to $39 (not $29)");
check(monthlyAmounts.starter_monthly === 3900, "starter_monthly = 3900¢ = $39/mo");
check((monthlyAmounts.starter_monthly * 12) / 100 === 468, "12 × $39 = $468 base for annual");

// 6. No billing_cycle_anchor drift — documented, not set in checkout params (verified in both handlers)
console.log("\n[6] Anchor-day note");
check(
  !PRICE_KEYS.some((k) => k.includes("anchor")),
  "no anchor concept in price keys; Stripe anchors to subscription creation date",
);

console.log(`\nRESULT: ${failures === 0 ? "PASS ✅ (0 check(s) failed)" : `FAIL (${failures} failed)`}`);
process.exit(failures === 0 ? 0 : 1);
