/**
 * TX 535.155(a) gate (task 7be13be8) — UPDATED for the product-scope gate
 * (task a0abba71, owner directive 2026-09-23: product scope = federal + SC).
 *
 * DELIBERATE CHANGE, reported to the lead: with Texas OUT of the product
 * scope, the TX branches (half-size broker line, licence-number suppression,
 * TX warnings) are UNREACHABLE in the product path, so this gate now asserts
 * BOTH sides of the gate:
 *
 *   A. GATED (current product behaviour): a TX-jurisdiction render takes the
 *      GENERIC path — no TX-formatted broker segment, no half-size plan, licence
 *      numbers NOT suppressed (rendered if supplied, generic "License #" label),
 *      no state warnings. Same for CA, and for a non-TX non-SC state (GA):
 *      nothing state-specific leaks. SC (in scope) behaves generically too.
 *   B. SCOPED REFERENCE (the #12 implementation, preserved): the half-size
 *      math lives verbatim in txFooterPlanForScopedTx and is asserted here so
 *      re-enabling Texas (add "TX" to PRODUCT_SCOPE_STATES) cannot regress it.
 *
 * The assertions select themselves from isStateInProductScope("TX"), so when
 * Texas re-enters scope this same script flips back to asserting the original
 * #12 behaviour with no edits.
 */
import { renderMarketingPng } from "../src/lib/render";
import { txFooterPlan, txFooterPlanForScopedTx, largestContactPx } from "../src/lib/branded-templates";
import { disclosureWarnings, isStateInProductScope, PRODUCT_SCOPE_STATES } from "../src/lib/advertising-rules";
import { writeFile, mkdir } from "node:fs/promises";

const OUT = "/home/team/shared/render-samples/tx-disclosure/";
await mkdir(OUT, { recursive: true });

const txInScope = isStateInProductScope("TX");
console.log(`product scope states: ${PRODUCT_SCOPE_STATES.join(", ")} — TX in scope: ${txInScope}`);

const base: Record<string, unknown> = {
  contentType: "flyer",
  jurisdiction: "TX",
  details: {
    address: "2201 Barton Springs Road, Austin",
    price: "$829,000",
    beds: 3, baths: 2, sqft: 2210,
    headline: "Modern Hill Country Retreat Minutes From Zilker Park",
    features: ["Whole-home sonos", "Infinity-edge patio", "Solar array"],
    description: "Floor-to-ceiling glass frames the oak canopy. Chef's kitchen with a plaster hood opens to a screened porch.",
  },
  agentName: "Dana Ruiz",
  agentPhone: "(555) 014-2288",
  brokerageName: "Ruiz Residential Realty",
  brokerName: "Ruiz Residential Realty",
  agentLicense: "TREC #998877",
  brokerLicense: "TREC #900112",
};

// [fixtureName, templateId, strip/band width, contentType]
const CASES: [string, string, number, string][] = [
  ["flyer-hero", "flyer-hero", 1275 - 180, "flyer"],
  ["flyer-classic", "flyer-classic", 1275 - 180, "flyer"],
  ["social-photo", "social-photo", 1080 - 112, "social"],
  ["social-classic", "social-classic", 1080 - 180, "social"],
];

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`ok ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${detail}`); }
};

for (const [name, templateId, w, kind] of CASES) {
  const input: any = { ...base, contentType: kind, brandedTemplate: templateId };
  const plan = txFooterPlan(input, w, 15);
  const largest = largestContactPx(input, w);
  check(`${name}: plan.largestPx consistent with largestContactPx`, plan.largestPx === largest, `plan=${plan.largestPx} direct=${largest}`);
  if (!txInScope) {
    check(`${name}: NO TX broker segment when TX is out of scope`, plan.brokerSeg === null, String(plan.brokerSeg));
    check(`${name}: brokerSize stays at the generic fontSize`, plan.brokerSize === 15, String(plan.brokerSize));
    check(`${name}: licence numbers NOT suppressed (generic strip renders supplied fields)`,
      plan.detailText.includes("998877") && plan.detailText.includes("9001"), plan.detailText);
    check(`${name}: no state-specific licence label (no DRE # for out-of-scope CA-style states)`, !plan.detailText.includes("DRE #"), plan.detailText);
  } else {
    check(`${name}: brokerSize >= largest/2`, plan.brokerSize >= plan.largestPx / 2, `broker=${plan.brokerSize} largest=${plan.largestPx}`);
    check(`${name}: 48px name -> broker >= 24px`, plan.largestPx === 48 && plan.brokerSize >= 24, `broker=${plan.brokerSize}`);
    check(`${name}: broker segment text`, plan.brokerSeg === "Broker Ruiz Residential Realty", String(plan.brokerSeg));
    const strip = `${plan.brokerSeg ?? ""} ${plan.detailText}`;
    check(`${name}: no licence-number label in TX strip`, !/License #|DRE #/.test(strip), strip);
    check(`${name}: supplied licence numbers suppressed`, !strip.includes("998877") && !strip.includes("9001"), strip);
  }
  const png: string = (await renderMarketingPng(input)) as unknown as string;
  check(`${name}: render OK`, typeof png === "string" && png.startsWith("data:image/png;base64,"));
  await writeFile(`${OUT}tx-${name}.png`, Buffer.from(png.slice("data:image/png;base64,".length), "base64"));
}

// Long agent name: band fit interacts with the half-size plan (in-scope) or is
// simply gated (out-of-scope).
const longName: any = { ...base, agentName: "Guadalupe Fernández de Castileja y Mendoza-Ortiz", contentType: "flyer", brandedTemplate: "flyer-hero" };
const planLong = txFooterPlan(longName, 1095, 15);
if (!txInScope) {
  check("long-name: gated TX -> no broker segment, generic size", planLong.brokerSeg === null && planLong.brokerSize === 15, `broker=${planLong.brokerSize} seg=${planLong.brokerSeg}`);
} else {
  check("long-name: brokerSize >= largest/2", planLong.brokerSize >= planLong.largestPx / 2, `broker=${planLong.brokerSize} largest=${planLong.largestPx}`);
  check("long-name: broker >= half floor when name fits small", planLong.brokerSize >= Math.ceil(planLong.largestPx / 2), `broker=${planLong.brokerSize} largest=${planLong.largestPx}`);
}

// B. SCOPED REFERENCE — the preserved #12 half-size implementation, asserted
// regardless of scope so the math cannot rot while gated.
const scopedPlan = txFooterPlanForScopedTx({ ...base, contentType: "flyer", brandedTemplate: "flyer-hero" } as any, 1275 - 180, 15);
check("scoped-ref: broker segment present when TX assumed in scope", scopedPlan.brokerSeg === "Broker Ruiz Residential Realty", String(scopedPlan.brokerSeg));
check("scoped-ref: brokerSize >= largest/2", scopedPlan.brokerSize >= scopedPlan.largestPx / 2, `broker=${scopedPlan.brokerSize} largest=${scopedPlan.largestPx}`);
check("scoped-ref: 48px name -> broker >= 24px", scopedPlan.largestPx === 48 && scopedPlan.brokerSize >= 24, `broker=${scopedPlan.brokerSize}`);

// Warnings — gated per scope.
const wFull = disclosureWarnings({ jurisdiction: "TX", agentName: "Dana Ruiz", brokerName: "Ruiz Residential Realty" });
const wMissing = disclosureWarnings({ jurisdiction: "TX", agentName: "Dana Ruiz" });
const wNoNames = disclosureWarnings({ jurisdiction: "TX" });
if (!txInScope) {
  check("warnings: TX out of scope -> no state warnings (full fields)", wFull.length === 0, JSON.stringify(wFull));
  check("warnings: TX out of scope -> no state warnings (missing broker)", wMissing.length === 0, JSON.stringify(wMissing));
  check("warnings: TX out of scope -> no state warnings (no names)", wNoNames.length === 0, JSON.stringify(wNoNames));
} else {
  check("warnings: TX full fields -> no warning", wFull.length === 0, JSON.stringify(wFull));
  check("warnings: missing broker -> 535.155 warning", wMissing.some((m) => m.level === "warning" && m.message.includes("535.155")), JSON.stringify(wMissing));
  check("warnings: message denies licence-number requirement", wMissing.every((m) => !/(licence|license) number is required/i.test(m.message) && !/must include a (licence|license) number/i.test(m.message)));
  check("warnings: no names at all -> warning", wNoNames.some((m) => m.level === "warning" && m.message.includes("535.155")));
}

// The task's required proof: a NON-TX, NON-SC listing gets NO TX footer.
const gaIn: any = { ...base, jurisdiction: "GA", contentType: "flyer", brandedTemplate: "flyer-hero" };
const gaPlan = txFooterPlan(gaIn, 1275 - 180, 15);
check("GA (non-TX, non-SC): NO TX broker segment", gaPlan.brokerSeg === null, String(gaPlan.brokerSeg));
check("GA: brokerSize stays generic", gaPlan.brokerSize === 15, String(gaPlan.brokerSize));
check("GA: licence numbers render unsuppressed", gaPlan.detailText.includes("998877") && gaPlan.detailText.includes("9001"), gaPlan.detailText);
check("GA: no state warnings", disclosureWarnings({ jurisdiction: "GA", agentName: "Dana Ruiz" }).length === 0);
const gaPng: string = (await renderMarketingPng(gaIn)) as unknown as string;
check("GA: render OK (no TX footer baked)", typeof gaPng === "string" && gaPng.startsWith("data:image/png;base64,"));
await writeFile(`${OUT}ga-flyer-hero-no-tx-footer.png`, Buffer.from(gaPng.slice("data:image/png;base64,".length), "base64"));

// SC is IN scope: the disclosure strip stays generic (no TX-style broker
// segment, licences render as supplied), but task 524f8e4b (PR #28) added an
// SC render-time honesty warning: a missing brokerage name must be called out
// citing S.C. Code 40-57-135(E)(2), and the message never demands a licence
// or phone number (SC has no such requirement).
const scPlan = txFooterPlan({ ...base, jurisdiction: "SC" } as any, 1275 - 180, 15);
check("SC (in scope): generic strip, no TX broker segment", scPlan.brokerSeg === null, String(scPlan.brokerSeg));
check("SC (in scope): licence numbers render unsuppressed (SC has no no-licence render branch)", scPlan.detailText.includes("998877"), scPlan.detailText);
const scWarnMissing = disclosureWarnings({ jurisdiction: "SC", agentName: "Dana Ruiz" });
check("SC (in scope): missing brokerage -> render-time warning cites 40-57-135(E)(2) (task 524f8e4b)",
  scWarnMissing.length === 1 && scWarnMissing[0].message.includes("40-57-135"), JSON.stringify(scWarnMissing));
check("SC (in scope): brokerage supplied -> no render-time warnings",
  disclosureWarnings({ jurisdiction: "SC", agentName: "Dana Ruiz", brokerageName: "Ruiz Residential Realty" }).length === 0);

// CA contrast render (kept for visual inspection).
const caIn: any = { ...base, jurisdiction: "CA", contentType: "flyer", brandedTemplate: "flyer-hero" };
const caWarn = disclosureWarnings({ jurisdiction: "CA", agentName: "Dana Ruiz", agentLicense: "TREC #998877", brokerName: "Ruiz Residential Realty", brokerLicense: "TREC #900112" });
if (isStateInProductScope("CA")) {
  check("warnings: CA in scope -> info confirmation present", caWarn.some((m) => m.level === "info"), JSON.stringify(caWarn));
} else {
  check("warnings: CA out of scope -> no state messages", caWarn.length === 0, JSON.stringify(caWarn));
  const caPlan = txFooterPlan(caIn, 1275 - 180, 15);
  check("CA out of scope: generic licence label (no DRE #)", !caPlan.detailText.includes("DRE #") && caPlan.detailText.includes("License #"), caPlan.detailText);
}
const caPng: string = (await renderMarketingPng(caIn)) as unknown as string;
await writeFile(`${OUT}ca-flyer-hero-contrast.png`, Buffer.from(caPng.slice("data:image/png;base64,".length), "base64"));

console.log(fail === 0 ? `TX GATE PASS (${pass}/${pass + fail})` : `TX GATE FAIL (${fail} failures, ${pass} passed)`);
if (fail > 0) process.exit(1);
