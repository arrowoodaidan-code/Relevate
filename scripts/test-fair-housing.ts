/**
 * Fair Housing guardrail test suite (task 01bc80ec).
 * Run: bun scripts/test-fair-housing.ts
 *
 * Adversarial inputs MUST be caught (named risk pattern), and ordinary
 * legitimate copy MUST NOT be flagged — otherwise users learn to ignore
 * the warning. Also measures the scanner's per-call latency.
 *
 * NOTE: these are RISK PATTERNS informed by HUD/DOJ exemplars — not
 * regulatory text, and a clean scan does not certify compliance.
 */
import { scanFairHousing, FAIR_HOUSING_PATTERNS } from "../src/lib/fair-housing";

const ADVERSARIAL: Array<[string, string]> = [
  ["appeals to young families", "fh-familial-targeting"],
  ["This home is perfect for families with kids", "fh-familial-targeting"],
  ["perfect for a young couple", "fh-familial-targeting"],
  ["close to churches", "fh-religion-proximity"],
  ["walking distance to the mosque", "fh-religion-proximity"],
  ["walking distance to the synagogue", "fh-religion-proximity"],
  ["walking distance to the temple", "fh-religion-proximity"],
  ["safe, quiet neighbourhood", "fh-coded-desirability"],
  ["safe neighborhood", "fh-coded-desirability"],
  ["exclusive community", "fh-coded-desirability"],
  ["no children", "fh-familial-exclusion"],
  ["adults only", "fh-familial-exclusion"],
  ["family-friendly neighborhood", "fh-family-friendly"],
  ["The ideal buyer is a growing family", "fh-ideal-buyer-demographic"],
  ["in a prestigious school district", "fh-school-quality"],
  ["no section 8", "fh-source-of-income"],
  ["able-bodied only", "fh-disability-occupants"],
  ["bachelor pad", "fh-bachelor-pad"],
  ["P.S. Homes in this neighborhood are selling fast", "urgency-manufactured"],
];

const LEGITIMATE: string[] = [
  "3 bed, 2 bath, 1,800 sq ft — $450,000. Open house Sunday 2-4pm.",
  "Granite countertops, stainless appliances, and a fenced backyard.",
  "Walking distance to downtown, the metro station, and Riverside Park.",
  "New roof in 2024. Two-car garage. Wheelchair-accessible ramp to the side entrance.",
  "Priced at $425,000. Annual taxes approximately $6,800. Shows beautifully.",
  "Cul-de-sac lot with mature trees and a covered patio.",
];

let pass = 0;
let fail = 0;

console.log("=== ADVERSARIAL (must be caught) ===");
for (const [text, expected] of ADVERSARIAL) {
  const r = scanFairHousing(text);
  const hit = r.hits.find((h) => h.patternId === expected);
  if (!r.clean && hit) {
    pass++;
    console.log(`PASS  [${expected}] "${text}" -> matched: "${hit.matched}"`);
  } else {
    fail++;
    console.log(`FAIL  [${expected}] "${text}" -> clean=${r.clean} hits=${r.hits.map((h) => h.patternId).join(",") || "none"}`);
  }
}

console.log("=== LEGITIMATE (must NOT be flagged) ===");
for (const text of LEGITIMATE) {
  const r = scanFairHousing(text);
  if (r.clean) {
    pass++;
    console.log(`PASS  clean: "${text}"`);
  } else {
    fail++;
    console.log(`FAIL  flagged: "${text}" -> ${r.hits.map((h) => `${h.patternId}:"${h.matched}"`).join(", ")}`);
  }
}

// Latency: worst realistic case — long listing copy containing many phrases.
const sample =
  "Beautiful 3 bedroom home near parks and shopping. Open house Sunday 2-4pm. $450,000. " +
  ADVERSARIAL.map((a) => a[0]).join(". ");
const N = 10000;
const t0 = performance.now();
for (let i = 0; i < N; i++) scanFairHousing(sample);
const perScanMs = (performance.now() - t0) / N;

console.log("=== LATENCY ===");
console.log(
  `scanFairHousing over a ${sample.length}-char text: ${perScanMs.toFixed(4)} ms per scan (avg of ${N} runs)`,
);
console.log(`=== RESULT: ${pass} pass, ${fail} fail | ${FAIR_HOUSING_PATTERNS.length} patterns compiled ===`);
process.exit(fail === 0 ? 0 : 1);
