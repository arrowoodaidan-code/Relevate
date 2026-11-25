// Unit probes for the deterministic truthfulness guards.
import {
  stripUrgencySentences,
  urgencyHits,
  stripMarkdown,
  ensureEmailOptOut,
} from "./src/lib/truthfulness";
import { scanFairHousing } from "./src/lib/fair-housing";

let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log("PASS", name);
  else { failed++; console.log("FAIL", name, extra ?? ""); }
}

// ---- urgency stripping ----
const u1 = stripUrgencySentences(
  "Just listed and this home won't stay on the market long.\nBook a viewing today.",
);
check("urgency: removes 'won't stay on the market long' sentence",
  !u1.includes("won't stay") && u1.includes("Book a viewing today"), u1);

const u2 = stripUrgencySentences("Won't last long!\nSpacious. Act now, this one is moving fast.");
check("urgency: removes urgency-only lines, keeps innocent sentence",
  u2.trim() === "Spacious.", u2);

const u3 = stripUrgencySentences(
  "- Open house Saturday 1-3 PM\n- Must sell, priced to sell\n- 3 bedrooms",
);
check("urgency: strips bullet line, keeps real date + facts",
  u3.includes("Open house Saturday 1-3 PM") && u3.includes("3 bedrooms") && !u3.includes("Must sell"), u3);

const u4 = stripUrgencySentences("Won't last! Call now. Great kitchen.");
check("urgency: keeps innocent sentence from same line", u4.includes("Great kitchen") && !u4.includes("Won't last"), u4);

const u5 = stripUrgencySentences("No urgency here at all.\nMove-in ready.");
check("urgency: clean text unchanged", u5 === "No urgency here at all.\nMove-in ready.", u5);

const u6 = stripUrgencySentences("Only 3 days left before it's gone! Warm kitchen.");
check("urgency: only-N-left and before-it's-gone", u6.includes("Warm kitchen") && !u6.includes("3 days"), u6);

// scan agrees with the stripper on the extended phrases
const scanHit = scanFairHousing("just listed and won't stay on the market long");
check("scan: extended urgency phrase caught", !scanHit.clean && scanHit.hits[0]?.category === "manufactured-urgency", scanHit.hits);
check("urgencyHits filters to manufactured-urgency", urgencyHits("won't last long\nperfect for young families").every(h => h.category === "manufactured-urgency"));

// ---- markdown stripping (social) ----
const m1 = stripMarkdown("**INSTAGRAM:**\n📍 New listing!\n---\n## FACEBOOK\nMessage **me** for details");
check("md: strips bold, hr, heading markers, keeps words+labels",
  m1.includes("INSTAGRAM:") && m1.includes("FACEBOOK") && !m1.includes("**") && !m1.includes("---") && !m1.includes("## "), m1);
const m2 = stripMarkdown("#JustListed #DreamHome");
check("md: hashtags untouched", m2 === "#JustListed #DreamHome", m2);
const m3 = stripMarkdown("Plain text already");
check("md: plain text unchanged", m3 === "Plain text already", m3);

// ---- email opt-out footer ----
const e1 = ensureEmailOptOut("Hi there,\n\nNice home. Reply for a tour.");
check("email: appends opt-out + address slot",
  e1.includes("rather not receive these emails") && e1.includes("Postal address") && e1.trimEnd().endsWith(":"), e1);
const e2 = ensureEmailOptOut(e1);
check("email: idempotent", e2 === e1);
const e3 = ensureEmailOptOut("Hi there\n\nReply to unsubscribe.", "12 Main St, Columbia, SC");
check("email: existing opt-out kept, address used verbatim",
  e3.includes("Reply to unsubscribe.") && e3.endsWith("Postal address: 12 Main St, Columbia, SC"), e3);
const e4 = ensureEmailOptOut(e3);
check("email: idempotent with address", e4 === e3);
const e5 = ensureEmailOptOut("Hi\n\nRather not receive? Let me know.");
check("email: opt-out present but no address → appends slot only",
  e5.includes("Rather not receive?") && e5.trimEnd().endsWith(":"), e5);

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nAll truthfulness unit probes passed");
