/**
 * Product-scope regression test (task a0abba71 — owner directive 2026-09-23,
 * researcher data v2.0.0).
 *
 *   bun scripts/test-product-scope.ts
 *
 * Asserts, with no UI involved:
 *   1. The rule DATA is untouched by the product filter: ADVERTISING_RULES
 *      carries all 30 researcher rules — the 16 hidden ones included.
 *   2. The product-visible subset (PRODUCT_ADVERTISING_RULES) is exactly the
 *      un-marked set (8 federal + 6 SC): marker-driven, via the researcher's
 *      own product_scope="hidden-2026-09" — no jurisdiction hardcoding.
 *   3. The filter is GENERIC: a synthetic hidden rule disappears, a synthetic
 *      unmarked rule appears, buildChecklist output contains no hidden rule.
 *   4. South Carolina is wired: 6 verified SC rules in scope, shown in the
 *      panel status line; the honest empty-state branch remains for the
 *      future; no "compliant" claim is possible from the data.
 *   5. TX rendering is GATED: txFooterPlan on a TX render takes the generic
 *      path; a non-TX non-SC listing (GA) gets no TX footer; SC is in scope
 *      with generic behaviour; the #12 half-size math still holds in the
 *      scoped reference.
 *   6. disclosureWarnings: no state warnings for out-of-scope states
 *      (TX/FL/CA), none for GA, none for SC (no render branches — SC lives
 *      in the checklist data).
 *   7. The federal Fair Housing guardrail is intact (risk patterns still
 *      flagged, clean copy still passes).
 * Exits non-zero on any failure.
 */
import {
  ADVERTISING_RULES,
  PRODUCT_ADVERTISING_RULES,
  PRODUCT_SCOPE_LABEL,
  PRODUCT_SCOPE_STATES,
  SC_RULES_COUNT,
  buildChecklist,
  isRuleInProductScope,
  isStateInProductScope,
  disclosureWarnings,
} from "../src/lib/advertising-rules";
import { txFooterPlan, txFooterPlanForScopedTx, largestContactPx } from "../src/lib/branded-templates";
import { readFileSync } from "node:fs";
import { scanFairHousing } from "../src/lib/fair-housing";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const outJurisdictions = (rules: { jurisdiction: string }[]) => [...new Set(rules.map((r) => r.jurisdiction))];
const unmarked = ADVERTISING_RULES.filter((r) => !(r.product_scope ?? "").toLowerCase().startsWith("hidden"));

// ---- 1. Data untouched -----------------------------------------------------
check("researcher data untouched: all 30 v2.0.0 rules present (hidden ones included)",
  ADVERTISING_RULES.length === 30, `got ${ADVERTISING_RULES.length}`);
check("out-of-scope state rules still present in the data file",
  ["state:tx", "state:fl", "state:ca", "state:ny"].every((j) => ADVERTISING_RULES.some((r) => r.jurisdiction === j)),
  outJurisdictions(ADVERTISING_RULES).join(","));

// ---- 2. Marker-driven product subset ---------------------------------------
check("product scope label is federal + South Carolina", PRODUCT_SCOPE_LABEL === "federal + South Carolina", PRODUCT_SCOPE_LABEL);
check("product scope states is exactly [SC]", PRODUCT_SCOPE_STATES.join(",") === "SC", PRODUCT_SCOPE_STATES.join(","));
check("the researcher hid exactly 16 rules in v2.0.0",
  ADVERTISING_RULES.length - unmarked.length === 16, String(ADVERTISING_RULES.length - unmarked.length));
check("PRODUCT_ADVERTISING_RULES == the un-marked set (marker-driven, no hardcoding)",
  PRODUCT_ADVERTISING_RULES.length === unmarked.length
    && unmarked.every((r) => isRuleInProductScope(r)),
  `product=${PRODUCT_ADVERTISING_RULES.length} unmarked=${unmarked.length}`);
check("product subset contains ONLY federal + state:sc",
  outJurisdictions(PRODUCT_ADVERTISING_RULES).every((j) => j === "federal" || j === "state:sc"),
  outJurisdictions(PRODUCT_ADVERTISING_RULES).join(","));
check("no out-of-scope state leaks into the product subset",
  !PRODUCT_ADVERTISING_RULES.some((r) => ["state:tx", "state:fl", "state:ca", "state:ny", "state:all-other"].includes(r.jurisdiction)));
check("no non-state tag (nar/mls/platform/product) leaks into the product subset",
  !PRODUCT_ADVERTISING_RULES.some((r) => ["nar", "mls", "platform:meta", "platform:google", "product"].includes(r.jurisdiction)));
check("federal rules survive the filter (Fair Housing guardrails stay visible)",
  PRODUCT_ADVERTISING_RULES.some((r) => r.jurisdiction === "federal"),
  `federal in subset: ${PRODUCT_ADVERTISING_RULES.filter((r) => r.jurisdiction === "federal").length}`);
check("checklist built from the product subset exposes no hidden rule in ANY section (incl. off-format)",
  (() => {
    const cl = buildChecklist(PRODUCT_ADVERTISING_RULES, "flyer" as never);
    const all = [...cl.sections.flatMap((s) => s.rules), ...cl.notForThisFormat];
    return all.every((r) => isRuleInProductScope(r));
  })());

// ---- 3. Generic wiring (marker decides, no UI change ever needed) ----------
check("synthetic rule WITHOUT a hidden marker is product-visible",
  isRuleInProductScope({ product_scope: undefined } as never));
check("synthetic rule WITH a hidden marker is filtered out",
  !isRuleInProductScope({ product_scope: "hidden-2026-12" } as never));
check("SC state code is in scope, GA/TX/FL/CA are not",
  isStateInProductScope("SC") && !isStateInProductScope("TX") && !isStateInProductScope("GA") && !isStateInProductScope("FL") && !isStateInProductScope("CA"));
check("checklist renders a synthetic unmarked SC rule with no UI change",
  (() => {
    const sc: any = { id: "test-sc-synthetic", jurisdiction: "state:sc", confidence: "verified", severity: "hard", type: "must_appear", surface: ["flyer_text"], requirement: "synthetic SC requirement" };
    const cl = buildChecklist([sc], "flyer" as never);
    return cl.sections.some((s) => s.rules.some((r) => r.id === "test-sc-synthetic"));
  })());

// ---- 4. South Carolina wired and honest ------------------------------------
const scInData = ADVERTISING_RULES.filter((r) => r.jurisdiction === "state:sc");
check("SC rules landed (6 verified, per researcher v2.0.0)", scInData.length === 6, String(scInData.length));
check("all SC rules are verified + unmarked (product-visible)",
  scInData.every((r) => r.confidence === "verified" && isRuleInProductScope(r)));
check("SC_RULES_COUNT reflects the in-scope SC rules", SC_RULES_COUNT === scInData.length, `${SC_RULES_COUNT} vs ${scInData.length}`);
check("panel carries BOTH honest SC status branches (empty-state + in-scope count)",
  (() => {
    const src = readFileSync(new URL("../src/components/ComplianceChecklistPanel.tsx", import.meta.url), "utf8");
    return src.includes("no state rules captured yet") && src.includes("not a compliance claim") && src.includes("in scope");
  })());

// ---- 5. TX rendering gated --------------------------------------------------
const txIn: any = {
  contentType: "flyer", jurisdiction: "TX", templateId: "flyer-hero",
  agentName: "Dana Ruiz", agentPhone: "(555) 014-2288",
  brokerageName: "Ruiz Residential Realty", brokerName: "Ruiz Residential Realty",
  agentLicense: "TREC #998877", brokerLicense: "TREC #900112",
  details: { address: "2201 Barton Springs Road, Austin", price: "$829,000", beds: 3, baths: 2, sqft: 2210 },
};
const W = 1275 - 180;
const txPlan = txFooterPlan(txIn, W, 15);
check("TX out of scope: NO TX broker segment in the product path", txPlan.brokerSeg === null, String(txPlan.brokerSeg));
check("TX out of scope: broker size stays generic", txPlan.brokerSize === 15, String(txPlan.brokerSize));
check("TX out of scope: supplied licence numbers are NOT suppressed",
  txPlan.detailText.includes("998877") && txPlan.detailText.includes("9001"), txPlan.detailText);
check("TX out of scope: plan consistent with largestContactPx", txPlan.largestPx === largestContactPx(txIn, W));

// The task's required proof: a NON-TX, NON-SC listing gets no TX footer.
const gaPlan = txFooterPlan({ ...txIn, jurisdiction: "GA" }, W, 15);
check("GA (non-TX, non-SC): no TX footer (no broker segment, generic size)",
  gaPlan.brokerSeg === null && gaPlan.brokerSize === 15, `seg=${gaPlan.brokerSeg} size=${gaPlan.brokerSize}`);
check("GA: licence numbers render unsuppressed (generic strip)", gaPlan.detailText.includes("998877"));

// SC: in scope, generic strip behaviour (SC compliance lives in the checklist
// data; the SC no-licence finding is a must_avoid on content-checking, not a
// suppression render branch — SC renders whatever the agent supplies).
const scPlan = txFooterPlan({ ...txIn, jurisdiction: "SC" }, W, 15);
check("SC (in scope): generic strip — no TX-specific behaviour", scPlan.brokerSeg === null && scPlan.detailText.includes("998877"));

// Preserved #12 half-size math (scoped reference) — cannot rot while gated.
const scoped = txFooterPlanForScopedTx(txIn, W, 15);
check("scoped reference: TX broker segment present when TX assumed in scope",
  scoped.brokerSeg === "Broker Ruiz Residential Realty", String(scoped.brokerSeg));
check("scoped reference: brokerSize >= half of largest contact (22 TAC 535.155(a))",
  scoped.brokerSize >= scoped.largestPx / 2, `broker=${scoped.brokerSize} largest=${scoped.largestPx}`);

// ---- 6. disclosureWarnings gated --------------------------------------------
check("warnings: TX out of scope -> no state warnings", disclosureWarnings({ jurisdiction: "TX", agentName: "Dana Ruiz" }).length === 0);
check("warnings: FL out of scope -> no brokerage warning", disclosureWarnings({ jurisdiction: "FL", agentName: "Dana Ruiz" }).length === 0);
check("warnings: CA out of scope -> no info message", disclosureWarnings({ jurisdiction: "CA", agentName: "Dana Ruiz", agentLicense: "x" }).length === 0);
check("warnings: GA -> no state warnings", disclosureWarnings({ jurisdiction: "GA", agentName: "Dana Ruiz" }).length === 0);
// SC (in scope) has exactly ONE render-time honesty branch since task 524f8e4b
// (PR #28): a missing brokerage name warns, citing S.C. Code 40-57-135(E)(2);
// with the brokerage supplied there are no warnings. SC still never leaks TX/FL
// behaviour (no licence suppression, no half-size plan — verify-tx-half-size.ts).
const scWarn = disclosureWarnings({ jurisdiction: "SC", agentName: "Dana Ruiz" });
check("warnings: SC (in scope) -> exactly the 40-57-135(E)(2) missing-brokerage warning, none when supplied (task 524f8e4b)",
  scWarn.length === 1 && scWarn[0].message.includes("40-57-135")
    && disclosureWarnings({ jurisdiction: "SC", agentName: "Dana Ruiz", brokerageName: "Ruiz Residential Realty" }).length === 0,
  JSON.stringify(scWarn));

// ---- 7. Fair Housing guardrail intact ----------------------------------------
const flagged = scanFairHousing("This family-friendly home is ideal for a young couple — no Section 8, adult living preferred.");
check("fair housing: risk language still flagged", !flagged.clean && flagged.hits.length > 0, JSON.stringify(flagged.hits?.map((h: any) => h.matched)));
const clean = scanFairHousing("Four bedrooms, updated kitchen, two-car garage, fenced yard near the greenway.");
check("fair housing: clean copy still passes", clean.clean);

console.log(fail === 0 ? `ALL PASS (${pass}/${pass + fail})` : `FAILURES: ${fail} (${pass} passed)`);
if (fail > 0) process.exit(1);
