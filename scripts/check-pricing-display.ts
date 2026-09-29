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
 *   C. "the page advertises a discount nobody can redeem" — 2026-09-28: /pricing, the landing
 *      banner and a launch blog post all promised "save 50% for 3 months with code LAUNCH50" and
 *      BOTH /v1/promotion_codes and /v1/coupons were empty in our own account, so every buyer who
 *      typed it was refused. No code and no percent-off promise may appear anywhere in src/ or
 *      public/ unless `src/lib/promotions.ts` declares it with a Stripe promotion-code id, coupon
 *      id, percent, duration and terms.
 *
 * It also holds the API session path off until it has its own live proof (task 17ab450d): flipping
 * `API_CHECKOUT_ENABLED` is a deliberate act, and a check that fails on it is how it stays one.
 *
 * Run: bun scripts/check-pricing-display.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { annualPriceDisplay, monthlyPriceDisplay, planAmountCents, usdDisplay } from "../src/lib/pricing-display";
import { tiers, annualTiers } from "../src/lib/stripe-prices";
import { API_CHECKOUT_ENABLED, paymentLinkFor } from "../src/lib/payment-links";
import { PROMOTION_CLAIMS, promotionClaimText } from "../src/lib/promotions";
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

console.log("\n--- Discount claims: only a code Stripe actually holds may be advertised ---");
/* WHAT THIS SECTION PROVES: every promotion-code-shaped token and every 2+-digit discount claim
 * anywhere in src/ or public/ is DECLARED in src/lib/promotions.ts, and every declared entry
 * carries a code, a Stripe promotion-code id (prom_...), a coupon id, a percent, a duration and
 * stated terms. So a claim cannot be advertised before the map declares it, and the map cannot be
 * filled in half-way.
 * WHAT IT CANNOT PROVE: that a declared id exists in Stripe, or that the declared terms match the
 * configured coupon. This gate never calls Stripe. A declaration is only true once
 * GET /v1/promotion_codes (and /v1/coupons) has been read back — that read is what makes an entry
 * legal, and the map is only a declaration until it happens. */
console.log(
  `  declaring: ${PROMOTION_CLAIMS.length} claim(s)` +
    (PROMOTION_CLAIMS.length === 0 ? " — the map is empty, so nothing may advertise a code or a discount" : ""),
);
/* Scope, stated plainly: this scans for CODE-SHAPED tokens and for NUMERIC percent-off claims of
 * 2+ digits. It cannot read prose — "half price forever" or "two months free" would pass unwatched,
 * and a one-digit promo percent (5% off) would not be recognised as a claim. Codes are the thing
 * that actually fails at a buyer's checkout, and any claim of substance carries one. */

/* A promotion-code-shaped token: two or more capitals followed by two or more digits ("LAUNCH50").
 * Deliberately narrow, so ordinary identifiers (JSON, POST, NAR) are not swept up. */
const PROMO_CODE_PATTERN = "\\b[A-Z]{2,}[0-9]{2,}[A-Z0-9]*\\b";
/* A percent-off promise worth 2+ digits, hyphen or space tolerated ("50% off", "50%-off",
 * "save 50%"). The annual cycle saving ("save 7%") is single-digit and arithmetically verified in
 * the section above, so it is out of scope here by construction. */
const PERCENT_CLAIM_PATTERN = "\\b[0-9]{2,}\\s*%\\s*-?\\s*(?:off|discount|for)\\b|\\bsave\\s+[0-9]{2,}\\s*%";

/** Tokens that LOOK like promo codes but are not, each with the reason it is here. A stale entry
 *  fails the check below, so this list cannot quietly grow into a hole. */
const NON_PROMO_TOKENS: { token: string; why: string }[] = [
  { token: "SL312345678", why: "editor placeholder for an agent licence number (src/routes/app.tsx)" },
  { token: "BR98765432", why: "editor placeholder for a broker licence number (src/routes/app.tsx)" },
];

function collectTextFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", ".vercel", ".output"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collectTextFiles(full));
    else if (/\.(ts|tsx|js|jsx|html|md)$/.test(entry.name)) found.push(full);
  }
  return found;
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const scannedFiles = ["src", "public"]
  .map((dir) => join(ROOT, dir))
  .filter((dir) => existsSync(dir))
  .flatMap((dir) => collectTextFiles(dir));
const scannedRel = scannedFiles.map((file) => relative(ROOT, file).split(sep).join("/"));
const scannedText = scannedFiles.map((file) => readFileSync(file, "utf8")).join("\n");

/* If the tree moves and the scan silently covers nothing, every other check here would pass for
 * the wrong reason. So the surfaces that can advertise are asserted to be inside the scan. */
const MUST_BE_SCANNED = ["src/routes/pricing.tsx", "src/routes/index.tsx", "src/lib/blog.ts"];
check(
  "the scan reaches every surface that can advertise",
  MUST_BE_SCANNED.every((surface) => scannedRel.includes(surface)),
  `${scannedFiles.length} files scanned — missing: ${MUST_BE_SCANNED.filter((s) => !scannedRel.includes(s)).join(", ") || "none"}`,
);

const codeHits: string[] = [];
const percentHits: string[] = [];
for (const file of scannedFiles) {
  const rel = relative(ROOT, file);
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      for (const match of line.matchAll(new RegExp(PROMO_CODE_PATTERN, "g"))) {
        const token = match[0];
        if (PROMOTION_CLAIMS.some((claim) => claim.code.toUpperCase() === token.toUpperCase())) continue;
        if (NON_PROMO_TOKENS.some((entry) => entry.token === token)) continue;
        codeHits.push(`${rel}:${index + 1} advertises "${token}"`);
      }
      for (const match of line.matchAll(new RegExp(PERCENT_CLAIM_PATTERN, "gi"))) {
        const pct = Number(/[0-9]+/.exec(match[0])?.[0] ?? NaN);
        if (PROMOTION_CLAIMS.some((claim) => claim.percentOff === pct)) continue;
        percentHits.push(`${rel}:${index + 1} claims "${match[0].trim()}"`);
      }
    });
}

check(
  "no promotion code is advertised unless PROMOTION_CLAIMS declares it",
  codeHits.length === 0,
  codeHits.length
    ? `${codeHits.length} undeclared: ${codeHits.join(" | ")}`
    : `${scannedFiles.length} files scanned, 0 undeclared codes`,
);
check(
  "no 2+-digit discount claim is advertised unless PROMOTION_CLAIMS declares it",
  percentHits.length === 0,
  percentHits.length
    ? `${percentHits.length} undeclared: ${percentHits.join(" | ")}`
    : `${scannedFiles.length} files scanned, 0 undeclared discount claims`,
);

/* Every declared entry must be complete: a code, the Stripe objects it refers to, the configured
 * percent and duration, and stated terms. A half-filled entry is an unverifiable claim. */
const incomplete = PROMOTION_CLAIMS.filter(
  (claim) =>
    !/^[A-Z0-9][A-Z0-9_-]{2,}$/.test(claim.code) ||
    !/^prom_/.test(claim.stripePromotionCodeId) ||
    claim.stripeCouponId.trim().length < 5 ||
    !Number.isInteger(claim.percentOff) ||
    claim.percentOff < 1 ||
    claim.percentOff > 100 ||
    !Number.isInteger(claim.durationMonths) ||
    claim.durationMonths < 1 ||
    claim.terms.trim().length < 20,
);
check(
  "every declared claim carries a code, a prom_ id, a coupon id, percent, duration and terms",
  incomplete.length === 0,
  incomplete.length
    ? `incomplete entries: ${incomplete.map((c) => c.code || "(no code)").join(", ")}`
    : `${PROMOTION_CLAIMS.length} declared claim(s), all complete`,
);

const declaredCodes = PROMOTION_CLAIMS.map((claim) => claim.code.toUpperCase());
check(
  "no two declared claims share a code",
  new Set(declaredCodes).size === declaredCodes.length,
  declaredCodes.join(", ") || "no codes declared",
);

/* Copy is derived from the declaration, so what a buyer reads cannot disagree with what the entry
 * says Stripe enforces. */
const copyMismatch = PROMOTION_CLAIMS.filter((claim) => {
  const text = promotionClaimText(claim);
  return !text.includes(`${claim.percentOff}%`) || !new RegExp(`${claim.durationMonths} months?\\b`).test(text);
});
check(
  "rendered claim copy states the declared percent and duration",
  copyMismatch.length === 0,
  copyMismatch.length
    ? `copy disagrees with the declaration for: ${copyMismatch.map((c) => c.code).join(", ")}`
    : `${PROMOTION_CLAIMS.length} claim(s) — copy is derived from the declaration`,
);

const staleAllowlist = NON_PROMO_TOKENS.filter((entry) => !scannedText.includes(entry.token));
check(
  "the non-promo allowlist has no stale entries",
  staleAllowlist.length === 0,
  staleAllowlist.length
    ? `no longer in the tree, delete these lines: ${staleAllowlist.map((e) => e.token).join(", ")}`
    : NON_PROMO_TOKENS.map((e) => `${e.token} = ${e.why}`).join("; "),
);

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
