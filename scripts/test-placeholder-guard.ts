/**
 * Regression test — task fa4a26ae: bracketed placeholders must never reach a
 * deliverable. Proven live 2026-09-20: "[Your Phone Number]" /
 * "[Your Email Address]" were baked into a downloaded flyer PNG even though
 * the agent's real phone was supplied (qa-neil-trial-2026-09-17/FINDINGS.md
 * §3), and the mock generator deterministically emitted
 * "[Add driving directions from nearest major intersection]".
 *
 * Run:  DATABASE_URL= bun scripts/test-placeholder-guard.ts
 * (The script itself clears DATABASE_URL so generateContent's fire-and-forget
 * history save is a guaranteed no-op, and clears OPENAI_API_KEY so the
 * deterministic mock path is what gets asserted.)
 *
 * This test FAILS against the pre-fix code: validateRenderRequest passed
 * bracketed bodies through unchanged, and the mock flyer/email templates
 * emitted brackets by construction.
 */
import { stripBracketPlaceholders, containsBracketPlaceholder } from "../src/lib/placeholder-guard";
import { validateRenderRequest, renderMarketingPng } from "../src/lib/render";
import { generateContent } from "../src/lib/ai";

delete process.env.DATABASE_URL;
process.env.OPENAI_API_KEY = "";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log("PASS", name);
  else { failures++; console.error("FAIL", name, detail ?? ""); }
}

// ---- 1) Guard unit behaviour -------------------------------------------------
check("fast path: text without brackets is byte-identical",
  stripBracketPlaceholders("Call (512) 555-0147 today.\n\nSee you there!")
    === "Call (512) 555-0147 today.\n\nSee you there!");

const qaBody = "For more information or to RSVP, contact:\nNeil Monaghan\n[Your Phone Number]\n[Your Email Address]\nLet's make your dream a reality!";
check("placeholder-only lines vanish (the live QA defect body)",
  !stripBracketPlaceholders(qaBody).includes("["));

check("placeholder-only line removed, surrounding lines kept verbatim",
  stripBracketPlaceholders("A\n[Your Phone Number]\nB") === "A\nB");

check("inline placeholder stripped, surrounding words kept, no double space",
  stripBracketPlaceholders("Call [Your Phone Number] today!") === "Call today!");

check("original blank lines preserved (layout rhythm)",
  stripBracketPlaceholders("A\n\nB") === "A\n\nB");

check("unclosed bracket is not over-eaten",
  stripBracketPlaceholders("Price reduced [ see agent for detail")
    === "Price reduced [ see agent for detail");

check("overlong bracket token (>80 inner chars) left alone",
  stripBracketPlaceholders("x [" + "y".repeat(90) + "] z").includes("y".repeat(90)));

// ---- 2) Render boundary (the layer that bakes text into the deliverable PNG) ----
// Lead direction: REFUSE at the render boundary — fail loudly (no render at
// all) rather than print a bracket on a finished flyer. The asserted contract
// is "real details or nothing": a clean request renders the agent's real
// details verbatim; a placeholder-bearing request renders NOTHING (the
// validator rejects it with an error naming the field and token).
const refused = validateRenderRequest({
  type: "flyer",
  title: "OPEN HOUSE",
  body: qaBody,
  agentName: "Neil Monaghan",
  agentPhone: "(512) 555-0147",
});
check("render boundary REFUSES the QA defect payload (no data, no render)", !refused.ok);
check("refusal error names the field and the first offending token",
  !refused.ok && refused.error.includes("body") && refused.error.includes("[Your Phone Number]"),
  refused.ok ? "unexpectedly accepted" : refused.error);

const refusedShortField = validateRenderRequest({
  type: "flyer",
  title: "OPEN HOUSE",
  body: "Clean body copy with no brackets at all.",
  agentName: "Neil Monaghan",
  agentPhone: "[Your Phone Number]",
});
check("render boundary REFUSES a placeholder in a short field (agentPhone)",
  !refusedShortField.ok && refusedShortField.error.includes("agentPhone") && refusedShortField.error.includes("[Your Phone Number]"),
  refusedShortField.ok ? "unexpectedly accepted" : refusedShortField.error);

const clean = validateRenderRequest({
  type: "flyer",
  title: "OPEN HOUSE",
  body: "For more information or to RSVP, contact:\nNeil Monaghan\nLet's make your dream a reality!",
  agentName: "Neil Monaghan",
  agentPhone: "(512) 555-0147",
});
check("clean request is accepted", clean.ok);
if (clean.ok) {
  check("clean request carries the agent's REAL details through verbatim (output = real details, not brackets)",
    clean.data.body === "For more information or to RSVP, contact:\nNeil Monaghan\nLet's make your dream a reality!"
      && clean.data.agentPhone === "(512) 555-0147"
      && !/\[[^[\]\n]{1,80}\]/.test(clean.data.body));
  // End-to-end: the accepted request actually renders a deliverable PNG.
  const dataUrl = await renderMarketingPng(clean.data);
  check("clean request renders a real PNG (deliverable carries real details)",
    typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,") && dataUrl.length > 10000);
}

// ---- 3) Generation layer — the mock path previously emitted brackets --------
const gen = await generateContent("open-house-flyer", {
  address: "1204 Cedar Ave, Austin, TX 78702",
  price: 525000,
  bedrooms: 3,
  bathrooms: 2,
  squareFeet: 1840,
  keyFeatures: ["Open Floor Plan"],
  description: "Sunny and move-in ready.",
  agentName: "Neil Monaghan",
});
check("generated flyer copy has no bracket tokens",
  !containsBracketPlaceholder(gen.content),
  JSON.stringify(gen.content.match(/\[[^\]\n]{1,80}\]/g) ?? []));

const genEmail = await generateContent("email-campaign", {
  address: "1204 Cedar Ave, Austin, TX 78702",
  price: 525000,
  bedrooms: 3,
  bathrooms: 2,
  squareFeet: 1840,
  keyFeatures: [],
  description: "",
  agentName: "Neil Monaghan",
  agentPhone: "(512) 555-0147",
  agentEmail: "neil@monaghan-co.com",
});
check("generated email copy has no bracket tokens (mock previously: Hi [First Name], [Schedule a Tour], [Agent Name], [Phone Number], [Email])",
  !containsBracketPlaceholder(genEmail.content),
  JSON.stringify(genEmail.content.match(/\[[^\]\n]{1,80}\]/g) ?? []));
check("email mock signature uses the SUPPLIED agent details verbatim",
  genEmail.content.includes("Neil Monaghan")
    && genEmail.content.includes("(512) 555-0147")
    && genEmail.content.includes("neil@monaghan-co.com"));

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nALL PASS");
