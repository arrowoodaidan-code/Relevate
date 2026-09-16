/**
 * Regression check for the advertising-rules module + the compliance checklist
 * data plumbing (task 420406e2).
 *
 *   bun scripts/check-advertising-rules.ts
 *
 * It asserts, with no UI involved:
 *   1. src/lib/advertising-rules.ts is a VERBATIM copy of the researcher's
 *      findings file (when that file is present on this machine).
 *   2. Grouping is driven by the data alone: confidence=unverified never lands
 *      in "Must appear" / "Must not appear"; severity "best practice" lands in
 *      "Best practice".
 *   3. A FLYER checklist contains no social-only rule (and vice versa), and
 *      off-format rules are routed to `notForThisFormat`.
 *   4. A rule ADDED to the data (no UI change) shows up in the checklist — the
 *      fallback path renders the requirement text itself.
 * Exits non-zero on any failure.
 */
import { readFileSync, existsSync } from "node:fs";
import {
  ADVERTISING_RULES,
  ADVERTISING_RULES_META,
  buildChecklist,
  groupForRule,
  ruleSummary,
  type AdvertisingRule,
} from "../src/lib/advertising-rules";

const SHARED_JSON = "/home/team/shared/compliance/advertising-rules.json";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/* 1 — verbatim copy of the researcher's file ------------------------------- */
if (existsSync(SHARED_JSON)) {
  const shared = JSON.parse(readFileSync(SHARED_JSON, "utf8")) as {
    meta: Record<string, unknown>;
    rules: AdvertisingRule[];
  };
  check(
    "rules count matches the shared research file",
    shared.rules.length === ADVERTISING_RULES.length,
    `shared=${shared.rules.length} module=${ADVERTISING_RULES.length}`,
  );
  const mismatched = ADVERTISING_RULES.filter((r, i) => {
    const s = shared.rules[i];
    return !s || JSON.stringify(s) !== JSON.stringify(r);
  });
  check("every rule is byte-identical (JSON) to the shared research file", mismatched.length === 0, mismatched.map((r) => r.id).join(", "));
  const metaKeys = ["name", "version", "generated", "researcher", "disclaimer", "access_note"] as const;
  const metaMismatch = metaKeys.filter(
    (k) => (ADVERTISING_RULES_META as unknown as Record<string, unknown>)[k] !== shared.meta[k],
  );
  check("meta block is identical to the shared research file", metaMismatch.length === 0, metaMismatch.join(", "));
} else {
  console.log(`SKIP  verbatim comparison — ${SHARED_JSON} not present on this machine`);
}

/* 2 — grouping comes from the data ---------------------------------------- */
const unverifiedIds = ADVERTISING_RULES.filter((r) => r.confidence === "unverified").map((r) => r.id);
console.log(`\nunverified rules (must never be requirements): ${unverifiedIds.join(", ")}`);
check(
  "no unverified rule groups as must_appear / must_avoid",
  ADVERTISING_RULES.every(
    (r) => r.confidence !== "unverified" || groupForRule(r) === "unverified",
  ),
);
check(
  "best-practice severity (and only that) groups as best_practice",
  ADVERTISING_RULES.every((r) =>
    r.confidence === "unverified"
      ? true
      : r.severity === "best practice"
        ? groupForRule(r) === "best_practice"
        : groupForRule(r) !== "best_practice",
  ),
);

/* 3 — per-format filtering ------------------------------------------------ */
const SOCIAL_ONLY = ["meta-special-ad-category", "google-housing-ads", "cfr100-75c3-media-location-targeting"];
const flyer = buildChecklist(ADVERTISING_RULES, "flyer");
const social = buildChecklist(ADVERTISING_RULES, "social");
const flyerIds = flyer.sections.flatMap((s) => s.rules.map((r) => r.id));
const socialIds = social.sections.flatMap((s) => s.rules.map((r) => r.id));
check("flyer checklist contains no social-only rule", SOCIAL_ONLY.every((id) => !flyerIds.includes(id)), SOCIAL_ONLY.filter((id) => flyerIds.includes(id)).join(", "));
check("social-only rules are routed to notForThisFormat for a flyer", SOCIAL_ONLY.every((id) => flyer.notForThisFormat.some((r) => r.id === id)));
check("social checklist keeps the social targeting rules", SOCIAL_ONLY.every((id) => socialIds.includes(id)));
check(
  "flyer checklist carries the footer/licence rules",
  ["eho-statement-footer-recommended", "nar-realtor-mark-usage", "ca-10140-6-license-disclosure", "fl-61j2-10-025-brokerage-name"].every(
    (id) => flyerIds.includes(id),
  ),
);
check("every rule is accounted for (relevant + off-format)", [flyer, social].every((c) => c.sections.reduce((n, s) => n + s.rules.length, 0) + c.notForThisFormat.length === ADVERTISING_RULES.length));

console.log("\nflyer sections:");
for (const s of flyer.sections) console.log(`  ${s.group.id.padEnd(14)} ${String(s.rules.length).padStart(2)}  ${s.rules.map((r) => r.id).join(", ")}`);

/* 4 — adding a rule to the data appears in the checklist with no UI change - */
const throwaway: AdvertisingRule = {
  id: "throwaway-data-driven-check",
  jurisdiction: "product",
  surface: ["flyer_text"],
  type: "must_appear",
  requirement: "THROWAWAY RULE — proves the checklist renders straight from the data file.",
  why: "Data-driven proof.",
  satisfied_by: "Nothing; removed immediately after the check.",
  severity: "hard",
  source_url: "n/a",
  accessed: "2026-09-16",
  confidence: "verified",
};
const withThrowaway = buildChecklist([...ADVERTISING_RULES, throwaway], "flyer");
const added = withThrowaway.sections.flatMap((s) => s.rules).find((r) => r.id === throwaway.id);
check("a new data rule appears in the checklist with no code change", Boolean(added), added ? `group=${groupForRule(added)}` : "missing");
check("a new rule with no summary copy falls back to its own requirement text", ruleSummary(throwaway) === throwaway.requirement);
check("the throwaway rule is a Must appear item for a flyer", withThrowaway.sections.some((s) => s.group.id === "must_appear" && s.rules.some((r) => r.id === throwaway.id)));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
