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
import { validateRenderRequest } from "../src/lib/render";
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

// ---- 2) Render guard (the layer that bakes text into the deliverable PNG) ----
const parsed = validateRenderRequest({
  type: "flyer",
  title: "OPEN HOUSE",
  body: qaBody,
  agentName: "Neil Monaghan",
  agentPhone: "(512) 555-0147",
});
check("validateRenderRequest still accepts the payload (strip, not refuse)", parsed.ok);
if (parsed.ok) {
  check("render guard: body carries no bracket tokens",
    !/\[[^[\]\n]{1,80}\]/.test(parsed.data.body), JSON.stringify(parsed.data.body));
  check("render guard: real agent content untouched",
    parsed.data.body.includes("Neil Monaghan")
      && parsed.data.body.includes("Let's make your dream a reality!"));
  check("render guard: placeholder-only lines dropped cleanly",
    parsed.data.body
      === "For more information or to RSVP, contact:\nNeil Monaghan\nLet's make your dream a reality!");
  check("render guard: short fields also scrubbed",
    !/\[/.test([parsed.data.title, parsed.data.agentName, parsed.data.agentPhone].filter(Boolean).join("|")));
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
