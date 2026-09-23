/**
 * Fair Housing guardrail — generation-side enforcement.
 * ===========================================================================
 * Built on the statute's 7 protected classes (42 USC 3604(c)) plus the
 * 24 CFR 100.75 "conveys preference / limitation / discrimination" test —
 * NOT on 24 CFR Part 109 / (former) 109.30, which is absent from the current
 * CFR (verified from the eCFR part index 2026-09-16; 100.75(d) carries a stale
 * cross-reference to it, which is why a phantom "prohibited words" list
 * circulates). See rules fha-3604c-no-discriminatory-ads,
 * cfr100-75-flyers-explicitly-covered, cfr100-75c3-media-location-targeting
 * and cfr109-status-do-not-cite in src/lib/advertising-rules.ts.
 *
 * HONESTY CONSTRAINTS (product constraint, not marketing copy):
 *  1. Every regex below is a RISK PATTERN informed by HUD/DOJ exemplar
 *     phrases and Fair Housing guidance — it is NOT regulatory text, and the
 *     UI must label it that way (see FAIR_HOUSING_UI_DISCLAIMER).
 *  2. A clean scan does NOT mean the output is compliant. The scanner cannot
 *     read intent, context, or imagery the way HUD can. No compliance claim
 *     may be made anywhere in the product from a clean result.
 *  3. Lawful property descriptions are deliberately NOT flagged: physical
 *     accessibility features ("wheelchair ramp", "step-free entrance") are
 *     allowed under 100.75 — only occupant-targeting by disability is a risk.
 *  4. Age-restricted housing ("55+", seniors communities) is treated as
 *     lawful (Housing for Older Persons Act exemption) and is NOT flagged.
 */

export type FairHousingCategory =
  | "familial-status"
  | "religion"
  | "race-color-national-origin"
  | "sex"
  | "disability"
  | "coded-desirability"
  | "source-of-income"
  | "manufactured-urgency";

export interface FairHousingPattern {
  id: string;
  category: FairHousingCategory;
  /** Short human name for the UI. */
  label: string;
  /** Case-insensitive, global. Compiled once at module load. */
  pattern: RegExp;
  /** Honest one-line explanation for the UI detail view. */
  note: string;
  /** True when the pattern is outside the 7 federal classes. */
  outsideFederalSeven?: boolean;
}

/**
 * Risk-pattern list. Each entry is "risk pattern, not regulatory text".
 * Word boundaries and context anchors keep ordinary copy unflagged.
 */
export const FAIR_HOUSING_PATTERNS: FairHousingPattern[] = [
  // ---- Familial status (7 protected classes) ----
  {
    id: "fh-familial-targeting",
    category: "familial-status",
    label: "Targeting or excluding by family status",
    pattern:
      /\b(?:perfect|ideal|great|appeals?\s+to|suited\s+for|designed\s+for|tailored\s+for|made\s+for)\s+(?:for\s+)?(?:a\s+)?(?:young|growing|modern|starting|busy|large|small)?\s*(?:families|family|couples?|parents|children|kids|singles|newlyweds)/i,
    note: "Suggests the home is meant for (or not for) households with/without children — familial status is a protected class under 42 USC 3604(c).",
  },
  {
    id: "fh-familial-exclusion",
    category: "familial-status",
    label: "Excludes children or non-adults",
    pattern:
      /\b(?:no\s+(?:children|kids|families\s+with\s+children)|child(?:ren)?[- ]free|adults?\s+only|adult\s+(?:living|community|building|complex|residence)|singles?\s+only|married\s+(?:couples?|only)|couples?\s+only|no\s+minors)\b/i,
    note: "Explicit exclusion by family status ('no children', 'adults only') is a classic § 3604(c) violation.",
  },
  {
    id: "fh-family-friendly",
    category: "familial-status",
    label: "'Family-friendly' framing",
    pattern: /\bfamily[- ]friendly\b/i,
    note: "HUD guidance treats 'family-friendly' as a familial-status risk phrase. Describe the property (fenced yard, play space) instead of who should live there.",
  },
  {
    id: "fh-ideal-buyer-demographic",
    category: "familial-status",
    label: "'Ideal buyer/tenant' defined by demographics",
    pattern:
      /\b(?:ideal|perfect)\s+(?:buyer|tenant|fit|match|resident)\b[^.!?]{0,80}\b(?:family|families|couple|couples|young|growing|bachelor)\b/i,
    note: "Defining the 'ideal buyer' by household type steers by familial status. Describe what the property offers instead.",
  },
  {
    id: "fh-bachelor-pad",
    category: "sex",
    label: "'Bachelor pad' framing",
    pattern: /\bbachelor\s+pad\b/i,
    note: "Gender-coded targeting language (sex is a protected class).",
  },
  {
    id: "fh-gender-only",
    category: "sex",
    label: "Restricts by sex",
    pattern:
      /\b(?:men|women|gentlemen|ladies|males|females)\s+only\b/i,
    note: "'Women only' / 'gentlemen' targeting — sex is a protected class under § 3604(c).",
  },
  // ---- Religion (7 protected classes) ----
  {
    id: "fh-religion-proximity",
    category: "religion",
    label: "Proximity to a place of worship as an amenity",
    pattern:
      /\b(?:close|closer|near|nearby|adjacent|walking\s+distance|short\s+(?:walk|drive)|(?:\d+|five|ten|two|three|few)\s+minutes?)\b[^.!?]{0,60}\b(?:church(?:es)?|mosque(?:s)?|synagogue(?:s)?|temple(?:s)?|shul|parish|mass|place(?:s)?\s+of\s+worship|worship)\b/i,
    note: "Proximity-to-worship framing signals religious preference (HUD/DOJ exemplar). Factual distances to transit, parks or downtown are fine.",
  },
  {
    id: "fh-religion-community",
    category: "religion",
    label: "Names a religious identity of the area",
    pattern:
      /\b(?:christian|catholic|jewish|muslim|islamic|hindu|buddhist|mormon|latter[- ]day|protestant|evangelical)\s+(?:community|communities|neighborhood|neighbourhood|area|families|residents?|heritage)\b/i,
    note: "Describing the area by its religion steers by religion — a § 3604(c) risk.",
  },
  // ---- Race / color / national origin (7 protected classes) ----
  {
    id: "fh-demographics-described",
    category: "race-color-national-origin",
    label: "Describes residents by race, ethnicity or nationality",
    pattern:
      /\b(?:white|black|caucasian|african[- ]american|hispanic|latino|latina|latinx|asian|european|american|mexican|chinese|korean|japanese|vietnamese|filipino|indian|pakistani|arab|middle[- ]eastern|somali|ethiopian)\s+(?:family|families|neighbors?|neighbours?|community|communities|neighborhood|neighbourhood|area|buyers?|residents?|population)\b/i,
    note: "Describing who lives in the area by race, ethnicity or nationality signals preference/exclusion — § 3604(c) risk.",
  },
  {
    id: "fh-area-composition",
    category: "race-color-national-origin",
    label: "Area composition framing ('integrated', 'predominantly…')",
    pattern:
      /\b(?:integrated|predominant(?:ly|ely)?|majority[- ]|minority[- ]|diverse)\s+(?:white|black|hispanic|latino|asian|ethnic|minORITY|immigrant|population|residents?|community|neighborhood|neighbourhood)/i,
    note: "Composition framing ('integrated neighborhood', 'predominantly…') is a HUD-listed risk pattern; describe the property, never the demographics.",
  },
  {
    id: "fh-national-origin-targeting",
    category: "race-color-national-origin",
    label: "Targets by language or citizenship",
    pattern:
      /\b(?:english[- ]speaking\s+only|citizens?\s+only|no\s+immigrants?|ideal\s+for\s+immigrants?|immigrant\s+community)\b/i,
    note: "Language/citizenship targeting maps to national origin — protected class.",
  },
  // ---- Disability (7 protected classes) ----
  {
    id: "fh-disability-occupants",
    category: "disability",
    label: "Restricts or targets occupants by disability/health",
    pattern:
      /\b(?:able[- ]bodied\s+only|no\s+wheelchairs?|wheelchairs?\s+not\s+allowed|no\s+disabled|no\s+handicap\w*|healthy\s+(?:residents?|tenants?|occupants?|individuals?)\s+only)\b/i,
    note: "Occupant restriction by disability violates § 3604(c). Describing the property's own accessibility features (ramp, step-free entry) is lawful — this pattern does not flag those.",
  },
  // ---- Coded desirability (proxy for race/color/national origin) ----
  {
    id: "fh-coded-desirability",
    category: "coded-desirability",
    label: "Neighborhood desirability code ('safe', 'exclusive', 'upscale…')",
    pattern:
      /\b(?:safe|safer|safest|quiet|exclusive|prestigious|upscale|affluent|desirable|high[- ]end)\b[^.!?]{0,30}\b(?:neighborhood|neighbourhood|community|area|streets?|block|district|part\s+of\s+town)\b/i,
    note: "HUD/DOJ exemplars treat desirability codes about an area as a proxy steering by race/national origin. Use factual facts (crime stats source, distance) instead.",
  },
  {
    id: "fh-school-quality",
    category: "coded-desirability",
    label: "School-quality framing",
    pattern:
      /\b(?:good|great|excellent|top(?:[- ]rated)?|best|prestigious|award[- ]winning)\s+(?:schools?|school\s+district)\b/i,
    note: "School-quality framing is a recognized proxy for racial/SES steering in HUD guidance. Name the district factually without quality claims.",
  },
  // ---- Source of income (outside the federal 7; many states protect it) ----
  {
    id: "fh-source-of-income",
    category: "source-of-income",
    label: "Excludes subsidy/voucher holders",
    pattern:
      /\bno\s+(?:section\s*8|housing\s+(?:vouchers?|assistance)|subsid\w+|vouchers?)\b/i,
    note: "Not one of the 7 federal classes, but many states/localities protect source of income — flagged as a risk pattern with that caveat.",
    outsideFederalSeven: true,
  },
  // ---- Manufactured urgency (rule: no-manufactured-urgency) ----
  {
    id: "urgency-manufactured",
    category: "manufactured-urgency",
    label: "Manufactured urgency/scarcity",
    pattern:
      /\b(?:act\s+now|don'?t\s+miss\s+(?:out|your\s+chance|this)|last\s+chance|won'?t\s+last(?:\s+long)?|selling\s+fast|going\s+fast|only\s+\d+\s+(?:left|remaining|available|spots?|slots?))\b/i,
    note: "Owner rule: no false urgency/scarcity unless the user supplied a real deadline. State real dates (open house times) instead.",
    outsideFederalSeven: true,
  },
];

/** One matched risk-pattern hit. */
export interface FairHousingHit {
  patternId: string;
  category: FairHousingCategory;
  label: string;
  /** The exact matched phrase from the text (trimmed for display). */
  matched: string;
  note: string;
  outsideFederalSeven: boolean;
}

export interface FairHousingScanResult {
  clean: boolean;
  hits: FairHousingHit[];
}

/**
 * What the generation pipeline reports back to the API/UI:
 * flagged=true means hits survived (or could not be verified away) — the UI
 * MUST show the warning; flagged=false with repaired=true means the strict
 * retry produced clean copy (initial hits are kept for transparency).
 */
export interface FairHousingOutcome {
  flagged: boolean;
  repaired?: boolean;
  hits?: FairHousingHit[];
}

const COMPILED_PATTERNS = FAIR_HOUSING_PATTERNS.map((p) => ({
  meta: p,
  re: new RegExp(p.pattern.source, p.pattern.flags.includes("g") ? p.pattern.flags : p.pattern.flags + "g"),
}));

/**
 * Scan text for Fair Housing risk patterns.
 * Pure regex over the given text — no network calls, sub-millisecond.
 * Returns one hit per pattern (first match) to keep the warning readable.
 */
export function scanFairHousing(text: string): FairHousingScanResult {
  if (!text || typeof text !== "string") return { clean: true, hits: [] };
  const hits: FairHousingHit[] = [];
  for (const { meta, re } of COMPILED_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      hits.push({
        patternId: meta.id,
        category: meta.category,
        label: meta.label,
        matched: m[0].trim().slice(0, 120),
        note: meta.note,
        outsideFederalSeven: meta.outsideFederalSeven ?? false,
      });
    }
  }
  return { clean: hits.length === 0, hits };
}

/**
 * The system-prompt instruction block appended to EVERY generation prompt
 * (all 5 content types x 5 tones). Positioned as the LAST system instruction
 * so it overrides tone/persona guidance elsewhere.
 */
export const FAIR_HOUSING_SYSTEM_BLOCK = `

FAIR HOUSING — REQUIRED COMPLIANCE BEHAVIOR (42 USC 3604(c); 24 CFR 100.75):
Federal law prohibits housing advertisements that indicate any preference, limitation, or discrimination based on race, color, religion, sex, handicap, familial status, or national origin. This applies to every sentence you write.
NEVER write copy that:
- Describes, appeals to, or excludes any of the seven protected classes (e.g. "perfect for young families", "ideal for a young couple", "no children", "adults only", "bachelor pad").
- Uses neighborhood desirability as a proxy for who belongs: "safe neighborhood", "quiet neighborhood", "exclusive community", "upscale area", "good/excellent schools", "prestigious school district".
- Mentions proximity to religious facilities ("close to churches", "walking distance to the mosque/synagogue/temple"). Describe the property — never worship.
- Describes the demographics of the area or its residents (race, ethnicity, nationality, religion, family composition).
- Restricts or targets occupants by disability or health ("able-bodied only"). You MAY describe the property's own accessibility features ("wheelchair ramp", "step-free entrance").
- Pressures with manufactured urgency ("act now", "only 3 left", "won't last") unless the user supplied a real deadline; state real dates instead.
Write about the PROPERTY: layout, condition, finishes, features, price, square footage, showing dates, and factual location (distance to transit, parks, downtown is fine).
If the user's input contains targeting language, DO NOT reproduce, soften, or imply it — omit it and describe the property instead. This rule overrides every tone, persona, or "ideal buyer" instruction elsewhere.`;

/**
 * Strict instruction used for the ONE automatic retry when the first draft
 * trips the risk-pattern scan. Names the exact phrases that were caught.
 */
export function fairHousingStrictRetryBlock(hits: FairHousingHit[]): string {
  const phrases = hits.map((h) => `"${h.matched}"`).join(", ");
  return `

YOUR PREVIOUS DRAFT WAS REJECTED BY THE FAIR HOUSING CHECK. It contained these risk phrases: ${phrases}.
Rewrite the content removing ALL of them and anything like them. Do not describe, appeal to, or exclude any type of person, family, religion, or community demographic. Describe only the property itself — its features, condition, price, size, and showing details. Factual distances to transit, parks, shopping or downtown are fine; proximity to religious facilities is NOT. Keep the same output format and length. Output ONLY the corrected content.`;
}

/**
 * Image-prompt rules appended to EVERY generated image prompt (gpt-image-1
 * inherits the same 100.75 exposure through photographs/illustrations/symbols
 * as text does).
 */
export const FAIR_HOUSING_IMAGE_BLOCK = `

FAIR HOUSING IMAGE RULES (24 CFR 100.75 covers photographs, illustrations and symbols): depict the property and grounds only. Do NOT include people depicted in a way that signals a protected class (race, color, religion, sex, disability, familial status, national origin); no family groupings used to signal who should live here; no religious buildings, symbols or iconography as a neighborhood selling point; no signs, flags or symbols conveying preference or exclusion.`;

/**
 * Strict avoidance instruction appended to an image prompt when the scan
 * trips on user-supplied detail that leaked into it (no paid retry — the
 * avoidance text is added before the one and only image call).
 */
export function fairHousingImageAvoidBlock(hits: FairHousingHit[]): string {
  const phrases = hits.map((h) => `"${h.matched}"`).join(", ");
  return ` STRICTLY AVOID the following concepts anywhere in the image: ${phrases}. Do not depict them, their buildings, their symbols, or any people grouped to represent them.`;
}

/**
 * Honest UI copy. The flagged list is risk patterns — never regulatory text —
 * and a clean result never certifies compliance.
 */
export const FAIR_HOUSING_UI_WARNING_TITLE =
  "Fair Housing risk pattern detected — review before publishing";
export const FAIR_HOUSING_UI_DISCLAIMER =
  "This check matches risk patterns informed by HUD/DOJ exemplars and 42 USC 3604(c) / 24 CFR 100.75 — they are risk patterns, not regulatory text. A clean result does not mean the content is compliant. Your broker and your state commission have final say.";
