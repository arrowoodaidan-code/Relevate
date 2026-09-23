/**
 * Relevate — advertising-rules data module (the checklist's SINGLE SOURCE OF TRUTH).
 * ================================================================================
 * Copied VERBATIM from the compliance researcher's findings file:
 *   /home/team/shared/compliance/advertising-rules.json
 *   (relevate-advertising-rules v1.1.0, generated 2026-09-16, lead-verified)
 * Human-readable companion: /home/team/shared/compliance/REAL-ESTATE-ADVERTISING-RULES.md
 *
 * v1.1.0 (2026-09-16): Texas PROMOTED to verified — 22 TAC 535.155 replaces the
 * former `tx-535-153-candidate` (535.153 is "Violating an Exclusive Agency", NOT
 * the advertising rule; the old citation was wrong). Five verified TX rules now
 * cover it: tx-535-155a-name-and-broker, tx-535-155a-half-size,
 * tx-535-155e-social-profile, tx-535-155f-misleading-list and
 * tx-535-155-no-license-number (an explicit negative finding: TX agent ads have NO
 * licence-number requirement). `eho-logo-asset-provenance` was added as UNVERIFIED
 * so the EHO-logo-file question is visible in the data, not only in the docs.
 *
 * WHY THIS FILE EXISTS
 *  - The custom-design-editor compliance checklist panel reads its content from
 *    THIS data, not from hardcoded UI copy. Adding/removing/editing a rule here
 *    makes it appear/disappear/change in the panel with NO UI code change.
 *  - `requirement`, `why`, `satisfied_by`, `severity`, `confidence`, `surface`,
 *    `jurisdiction`, `source_url` and `accessed` are the researcher's words and
 *    are never reworded by the UI. The panel quotes them.
 *
 * HONESTY CONTRACT (do not weaken)
 *  - `confidence: "unverified"` means the researcher could NOT verify the claim.
 *    Those rules are routed OUT of the "Must appear" / "Must not appear" groups
 *    by `groupForRule()` and are rendered as "not yet verified — confirm with
 *    your broker". They must never read as hard requirements.
 *  - The panel never renders a pass/fail, "compliant", or green-check verdict.
 *    Tick state is the agent's own assertion (see ComplianceChecklistPanel).
 *  - This is a research aid, not legal advice, and it is not exhaustive.
 */
import type { DesignPresetId } from "~/lib/design";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** `must_appear` = the ad should carry this; `must_avoid` = the ad must not. */
export type RuleType = "must_appear" | "must_avoid";
/** The researcher's severity for the rule, as written in the data file. */
export type RuleSeverity = "hard" | "best practice";
/** `verified` = primary source pulled in-session; `unverified` = could not be confirmed. */
export type RuleConfidence = "verified" | "unverified";

export interface AdvertisingRule {
  id: string;
  /** e.g. "federal", "state:ca", "nar", "mls", "platform:meta", "product". */
  jurisdiction: string;
  /** Which product surfaces the rule touches, e.g. "flyer_footer", "all_text_surfaces". */
  surface: string[];
  type: RuleType;
  requirement: string;
  why: string;
  satisfied_by: string;
  severity: RuleSeverity;
  source_url: string;
  accessed: string;
  notes?: string;
  confidence: RuleConfidence;
}

export interface AdvertisingRulesMeta {
  name: string;
  version: string;
  generated: string;
  researcher: string;
  disclaimer: string;
  access_note: string;
}

/* ------------------------------------------------------------------ */
/* Data — verbatim copy of advertising-rules.json                      */
/* ------------------------------------------------------------------ */

export const ADVERTISING_RULES_META: AdvertisingRulesMeta = {
  name: "relevate-advertising-rules",
  version: "1.1.0",
  generated: "2026-09-16",
  researcher: "agent-compliance-researcher",
  disclaimer:
    "Research aid for product rule engine. NOT legal advice; not exhaustive or authoritative. Broker and state commission have final say. Rules marked confidence=unverified must NOT be enforced as hard requirements until verified.",
  access_note:
    "All source_url entries accessed 2026-09-16. HTTP status recorded in source notes; unverified entries flagged. v1.1.0: TX promoted to verified (22 TAC 535.155, replacing the former 535.153 candidate); EHO logo asset provenance added as unverified.",
};

export const ADVERTISING_RULES: AdvertisingRule[] = [
  {
    id: "fha-3604c-no-discriminatory-ads",
    jurisdiction: "federal",
    surface: [
      "property_description",
      "flyer_text",
      "social_caption",
      "email_campaign",
      "listing_summary",
      "image_prompt",
    ],
    type: "must_avoid",
    requirement:
      "No notice/statement/advertisement about the sale or rental of a dwelling may indicate any preference, limitation, or discrimination based on race, color, religion, sex, handicap, familial status, or national origin, or an intention to make such a preference/limitation/discrimination.",
    why:
      "42 U.S.C. 3604(c) (Fair Housing Act); violation is a federal unlawful practice enforceable by HUD and DOJ.",
    satisfied_by:
      "Content guardrail scanning generated text and image prompts for protected-class references (words, phrases, photos, illustrations, symbols) and blocking/flagging; prompt system instruction listing the 7 protected classes.",
    severity: "hard",
    source_url: "https://www.law.cornell.edu/uscode/text/42/3604",
    accessed: "2026-09-16",
    notes:
      "Verified verbatim text of (c) in-session. LII mirrors OLRC text; uscode.house.gov returned error at access.",
    confidence: "verified",
  },
  {
    id: "cfr100-75-flyers-explicitly-covered",
    jurisdiction: "federal",
    surface: [
      "flyer_text",
      "flyer_image",
      "social_caption",
      "social_image",
      "email_campaign",
      "image_prompt",
    ],
    type: "must_avoid",
    requirement:
      "Advertising materials may not convey preference/limitation tied to protected class; the regulation explicitly covers flyers, brochures, signs, banners, posters, billboards, and photographs/illustrations/symbols.",
    why:
      "24 CFR 100.75(a)-(c); HUD's implementing rule; 'flyers, brochures ... banners, posters' named in (b); photos/illustrations/symbols named in (c)(1).",
    satisfied_by:
      "Same guardrail as fha-3604c plus image-level review; property photos that depict only one demographic profile in lifestyle-marketing contexts should be flagged as risk in guidance.",
    severity: "hard",
    source_url: "https://www.ecfr.gov/api/versioner/v1/full/2026-09-14/title-24.xml?part=100",
    accessed: "2026-09-16",
    notes: "Current eCFR issue 2026-08-20. HTTP 200; text quoted in research notes.",
    confidence: "verified",
  },
  {
    id: "cfr100-75c3-media-location-targeting",
    jurisdiction: "federal",
    surface: ["social_ad_targeting_guidance", "campaign_guidance"],
    type: "must_avoid",
    requirement:
      "Do not select advertising media/locations that deny segments of the housing market information based on protected class; do not refuse or differentially price ad placement on protected-class grounds.",
    why:
      "24 CFR 100.75(c)(3)-(4); the regulatory hook behind platform special-ad-category treatment of housing ads.",
    satisfied_by:
      "App guidance text when generating social campaigns: warn that paid housing ads face special-category restrictions and that protected-class-based targeting is prohibited.",
    severity: "hard",
    source_url: "https://www.ecfr.gov/api/versioner/v1/full/2026-09-14/title-24.xml?part=100",
    accessed: "2026-09-16",
    notes: "App cannot control targeting; surfaces as warning text + prompt guardrail.",
    confidence: "verified",
  },
  {
    id: "cfr109-status-do-not-cite",
    jurisdiction: "federal",
    surface: ["rule_engine_design"],
    type: "must_avoid",
    requirement:
      "Do not build the content checker on 24 CFR Part 109 / (former) 109.30 prohibited-word list: Part 109 is absent from the current CFR.",
    why:
      "Verified: eCFR part index (2026-08-20 issue) has no Part 109; ?part=109 returns 404 'No matching content found'; LII 404; govinfo part-level XML redirects/errors (2012-2025). 100.75(d) still references the part (stale reference).",
    satisfied_by:
      "Use the statutory-class + 100.75(c)(1) 'words/phrases/photos/symbols conveying preference' test as the operative standard; keep HUD/DOJ exemplar phrases as guidance-level risk flags with label 'risk pattern, not regulatory text'.",
    severity: "hard",
    source_url: "https://www.ecfr.gov/api/versioner/v1/full/2026-09-14/title-24.xml?part=109",
    accessed: "2026-09-16",
    notes: "Design-critical finding. The stale 100.75(d) reference appears in the part=100 fetch.",
    confidence: "verified",
  },
  {
    id: "cfr110-poster-11x14-office",
    jurisdiction: "federal",
    surface: ["checklist_help_text", "open_house_kit"],
    type: "must_appear",
    requirement:
      "Post and maintain the prescribed 11x14 fair housing poster at the place of business where dwellings are offered for sale/rental, at covered dwellings, and at all places of business participating in real-estate-related transactions/brokerage services (model-dwelling option for new construction).",
    why:
      "24 CFR 110.10, 110.25; legend text is 'EQUAL HOUSING OPPORTUNITY ... IT IS ILLEGAL TO DISCRIMINATE AGAINST ANY PERSON BECAUSE OF RACE, COLOR, RELIGION, SEX, HANDICAP, FAMILIAL STATUS (HAVING ONE OR MORE CHILDREN), OR NATIONAL ORIGIN'. Poster requirement is physical display, not flyer content.",
    satisfied_by:
      "Open-house checklist / office checklist in-app; reuse the regulation's EHO legend as the authoritative footer phrase option.",
    severity: "hard",
    source_url: "https://www.ecfr.gov/api/versioner/v1/full/2026-09-14/title-24.xml?part=110",
    accessed: "2026-09-16",
    notes: "Surface is office/dwelling display, not the generated visual.",
    confidence: "verified",
  },
  {
    id: "eho-statement-footer-recommended",
    jurisdiction: "federal",
    surface: ["flyer_footer", "social_footer"],
    type: "must_appear",
    requirement:
      "Recommended: add an 'Equal Housing Opportunity' statement line (and optionally the EHO logo) to flyer/social templates as a default footer.",
    why:
      "Industry/HUD-program convention; expected by agents and MLSs; NOT a federal statute requiring the logo on every ad (the federal mandate is the poster rule). HUD's EHO logo page 404'd at access - brand usage verified via NAR page.",
    satisfied_by:
      "Footer element on native flyer/social templates with toggle + exact-logo asset; product copy should say 'recommended', not 'required by law'.",
    severity: "best practice",
    source_url: "https://www.nar.realtor/logos-and-trademark-rules",
    accessed: "2026-09-16",
    notes:
      "HUD logo page unverified (404 at access); NAR landing page verified; see eho-logo-asset-provenance for the logo-file provenance flag.",
    confidence: "verified",
  },
  {
    id: "eho-logo-asset-provenance",
    jurisdiction: "federal",
    surface: ["flyer_footer", "social_footer", "design_assets"],
    type: "must_avoid",
    requirement:
      "PROVENANCE FLAG (UNVERIFIED): do not ship an EHO logo IMAGE FILE in templates until its authoritative source and usage conditions are verified. The HUD logo page (hud.gov/program_offices/fair_housing_equal_opp/FHEO_logo) and the NAR 'logos-and-trademark-usage' path both returned HTTP 404 at access (2026-09-16). What IS verified: (i) the regulation's legend wording - 'EQUAL HOUSING OPPORTUNITY' + the statutory protected-class sentence (24 CFR 110.25); (ii) NAR's landing page /logos-and-trademark-rules (HTTP 200), which lists an Equal Housing Opportunity logo section whose asset file and precise use conditions were NOT re-verified. Shipping a logo of unverified provenance is an OPEN QUESTION for the owner.",
    why:
      "Compliance-task discipline: never ship an unverified asset in a compliance feature. 'Everyone uses the EHO logo' is a narrative, not a source.",
    satisfied_by:
      "Block the EHO logo FILE from template defaults until owner decision: (a) NAR-sourced mark used per NAR member rules, (b) HUD-sourced mark re-located on a live HUD page, or (c) legend text only. Meanwhile render 'Equal Housing Opportunity' as text (24 CFR 110.25 wording), optional, default-on.",
    severity: "hard",
    source_url: "https://www.hud.gov/program_offices/fair_housing_equal_opp/FHEO_logo",
    accessed: "2026-09-16",
    notes:
      "UNVERIFIED - do not ship the asset as a requirement. Federal law does not require the EHO logo on every ad (poster rule = 24 CFR 110); the logo is program/industry convention. Owner call required before any logo file ships.",
    confidence: "unverified",
  },
  {
    id: "nar-realtor-mark-usage",
    jurisdiction: "nar",
    surface: ["flyer_footer", "social_footer", "agent_name_line", "generated_copy"],
    type: "must_avoid",
    requirement:
      "Use REALTOR(R) mark only for NAR members, with the registered symbol, uppercase, per the Membership Marks Manual; do not use generically and do not modify the logo.",
    why:
      "NAR membership marks rules; page states marks 'must be used correctly and according to the rules outlined in the Membership Marks Manual'.",
    satisfied_by:
      "Never auto-insert 'REALTOR' into copy; if agent declares member status, render 'REALTOR(R)' with symbol; keep logos unmodified; unused-by-default.",
    severity: "hard",
    source_url: "https://www.nar.realtor/logos-and-trademark-rules",
    accessed: "2026-09-16",
    notes:
      "Landing page verified with captured controlling quote; full manual not read in-session (lower confidence on manual-internal specifics).",
    confidence: "verified",
  },
  {
    id: "ca-10140-6-license-disclosure",
    jurisdiction: "state:ca",
    surface: ["flyer_footer", "social_footer", "email_signature", "property_description_footer"],
    type: "must_appear",
    requirement:
      "CA licensee ads/matter pertaining to licensed activity must designate that the licensee is performing acts requiring a real estate license (10140.6(a)); solicitation materials intended as first contact with consumers must disclose agent name, license identification number, and responsible broker's identity (10140.6(b)(1)).",
    why: "CA Bus. & Prof. Code 10140.6 (verified verbatim in-session, leginfo).",
    satisfied_by:
      "Per-state disclosure block: '{Agent Name} - DRE # {license}' + '{Brokerage Name} - DRE # {broker license}' + license designation line; only render when user selects CA and supplies license fields.",
    severity: "hard",
    source_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=10140.6",
    accessed: "2026-09-16",
    notes:
      "HTTP 200; text quoted in research notes. Applicability of (b)(1) to a given flyer is broker-confirmable ('solicitation materials intended to be the first point of contact').",
    confidence: "verified",
  },
  {
    id: "fl-61j2-10-025-brokerage-name",
    jurisdiction: "state:fl",
    surface: ["flyer_footer", "social_footer", "email", "web_render"],
    type: "must_appear",
    requirement:
      "All real estate advertising must include the licensed name of the brokerage firm; advertising must be recognizable as coming from a real estate licensee; when an agent's personal name appears, at least the last name as registered with the Commission must be used.",
    why:
      "Fla. Admin. Code R. 61J2-10.025(1)-(2) (verified full text in-session from official flrules rule document).",
    satisfied_by:
      "Brokerage-name line mandatory on all FL renders; agent personal-name line renders registered last name. Florida state toggle in disclosure block.",
    severity: "hard",
    source_url: "https://www.flrules.org/gateway/ruleno.asp?id=61J2-10.025",
    accessed: "2026-09-16",
    notes:
      "Rule text file: https://www.flrules.org/gateway/readFile.asp?sid=0&tid=3517431&type=1&file=61J2-10.025.doc (HTTP 200; text extracted).",
    confidence: "verified",
  },
  {
    id: "fl-61j2-10-025-internet-adjacency",
    jurisdiction: "state:fl",
    surface: ["web_render", "social_caption"],
    type: "must_appear",
    requirement:
      "When advertising on the Internet (includes social/web renders), the brokerage firm name must be placed adjacent to, or immediately above or below, the point of contact information (mailing address, street address, email, phone, fax).",
    why: "Fla. Admin. Code R. 61J2-10.025(3)(a) (verified in-session).",
    satisfied_by:
      "Template layout rule: brokerage-name line co-located with the contact block (phone/email/address), not on the opposite side of the graphic.",
    severity: "hard",
    source_url: "https://www.flrules.org/gateway/ruleno.asp?id=61J2-10.025",
    accessed: "2026-09-16",
    notes: "Layout-specific; the design-engineer should implement a grouped 'disclosure strip'.",
    confidence: "verified",
  },
  {
    id: "fl-61j2-10-025-no-false-advertising",
    jurisdiction: "state:fl",
    surface: ["all_text_surfaces"],
    type: "must_avoid",
    requirement:
      "No real estate advertisement placed by a licensee shall be fraudulent, false, deceptive, or misleading.",
    why: "Fla. Admin. Code R. 61J2-10.025(1) (verified in-session).",
    satisfied_by: "Same unsubstantiated-claim guardrail as ftc-truth; do not invent amenities.",
    severity: "hard",
    source_url: "https://www.flrules.org/gateway/ruleno.asp?id=61J2-10.025",
    accessed: "2026-09-16",
    confidence: "verified",
  },
  {
    id: "tx-535-155a-name-and-broker",
    jurisdiction: "state:tx",
    surface: ["flyer_footer", "social_footer", "email", "web_render"],
    type: "must_appear",
    requirement:
      "Every Texas advertisement must include, in a readily noticeable location: (a) the name of the license holder or team placing the advertisement, and (b) the broker's name (sized per tx-535-155a-half-size).",
    why:
      "22 TAC 535.155(a) (TREC 'Advertisements'); full rule text verified inline on TREC's official rules page, 2026-09-16.",
    satisfied_by:
      "TX disclosure block on native flyer/social templates: '{Agent/Team Name}' + '{Broker Name}' in one contiguous footer strip, both readily noticeable; size rule enforced per tx-535-155a-half-size.",
    severity: "hard",
    source_url: "https://www.trec.texas.gov/agency-information/rules-and-laws/trec-rules",
    accessed: "2026-09-16",
    notes:
      "Citation correction: an earlier draft cited 22 TAC 535.153 for Texas advertising; 535.153 is 'Violating an Exclusive Agency' and is NOT the advertising rule. Related: 535.154 (alternate/team/assumed business names - team names must end 'team'/'group' and be registered before use); 535.155(b) defines 'advertisement' (covers publications, brochures, radio/TV, email, text, social media, Internet, stationery, cards, displays, signs, billboards; excludes communications to current clients and directional signs with only broker name/logo).",
    confidence: "verified",
  },
  {
    id: "tx-535-155a-half-size",
    jurisdiction: "state:tx",
    surface: ["flyer_footer", "social_footer", "email", "web_render"],
    type: "must_appear",
    requirement:
      "The broker's name must be at least half the size of the largest contact information (phone, email, address, etc.) for any sales agent, associated broker, or team name contained in the advertisement.",
    why: "22 TAC 535.155(a) (verified full text, TREC rules page, 2026-09-16).",
    satisfied_by:
      "Renderer layout rule: compute the largest contact-info font size in the disclosure strip; the broker-name line must be at least half of it.",
    severity: "hard",
    source_url: "https://www.trec.texas.gov/agency-information/rules-and-laws/trec-rules",
    accessed: "2026-09-16",
    notes: "Was mis-cited as 535.153 in an earlier draft; correct rule is 535.155(a).",
    confidence: "verified",
  },
  {
    id: "tx-535-155e-social-profile",
    jurisdiction: "state:tx",
    surface: ["social_footer", "social_caption", "email"],
    type: "must_appear",
    requirement:
      "For an advertisement placed on social media or by text message, the required names (license holder/team + broker) may be located on a separate page or the account user profile page IF that page is (i) readily accessible by a direct link from the social media post or text and (ii) readily noticeable on that page/profile.",
    why: "22 TAC 535.155(e) (verified full text, TREC rules page, 2026-09-16).",
    satisfied_by:
      "Product decision to make explicitly: rendering the disclosure block ON the social image is the safer default; 535.155(e) is the allowance a TX agent may use (disclosures on a linked profile page). Default to on-image; do not auto-omit.",
    severity: "hard",
    source_url: "https://www.trec.texas.gov/agency-information/rules-and-laws/trec-rules",
    accessed: "2026-09-16",
    notes:
      "This is an allowance, not a relaxation of tx-535-155a-name-and-broker; the profile page must actually carry the disclosures and be directly linked from the post/text.",
    confidence: "verified",
  },
  {
    id: "tx-535-155f-misleading-list",
    jurisdiction: "state:tx",
    surface: ["property_description", "flyer_text", "social_caption", "email_campaign", "listing_summary"],
    type: "must_avoid",
    requirement:
      "A Texas advertisement may not: be inaccurate in any material fact or representation; identify a sales agent as a broker; use a title, email or website address implying a sales agent runs the brokerage; use a team name implying independent brokerage services (forbidden team-name terms: 'brokerage', 'company', 'associates'); use a sales-agent name other than as shown on the license (or a registered alternate); cause the public to believe an unlicensed person is engaged in brokerage; create confusion about permitted property use; make a value claim not based on a disclosed, readily available appraisal; imply involvement in a transaction the person played no role in; advertise a property under an exclusive listing without the listing broker's permission AND disclosure of the listing broker's name (unless waived in writing); keep offering a listed property more than 10 days after the listing agreement ends; advertise a property 10+ days after closing without stating its current status; offer rebates without the required consent/disclosure; offer undisclosed compensation for promoting a third-party service; or use rankings not based on objective criteria disclosed in the ad.",
    why:
      "22 TAC 535.155(f) (verified full text, TREC rules page, 2026-09-16); team-name forbidden terms also 535.154(c).",
    satisfied_by:
      "Same unsubstantiated-claim guardrail as ftc-truth-in-advertising, plus: no sales-agent-presented-as-broker titles, no team display name containing forbidden words, value-claim superlatives blocked without a user-supplied appraisal basis.",
    severity: "hard",
    source_url: "https://www.trec.texas.gov/agency-information/rules-and-laws/trec-rules",
    accessed: "2026-09-16",
    notes: "Itemized from the rule text; the opening clause is the material-facts catch-all.",
    confidence: "verified",
  },
  {
    id: "tx-535-155-no-license-number",
    jurisdiction: "state:tx",
    surface: ["rule_engine_design", "flyer_footer", "social_footer"],
    type: "must_avoid",
    requirement:
      "Do NOT add a license-number requirement for Texas AGENT advertising: the full text of 22 TAC 535.155 contains no license-number display requirement for license-holder advertisements. (Contrast: TX real-estate INSPECTOR advertisements under 22 TAC 535.221 DO require license numbers on websites and social media - do not import that rule onto agent/flyer surfaces.)",
    why:
      "Verified by absence: full 535.155 text read inline from TREC's official rules page on 2026-09-16; no license-number provision for agent advertising. 535.221 (inspectors) verified on the same page.",
    satisfied_by:
      "TX disclosure block must NOT render a license-number field as a TX requirement (agent license number may only ever be optional user-supplied info, never a TX-mandated element); guard checklist copy against claiming a TX license number is required.",
    severity: "hard",
    source_url: "https://www.trec.texas.gov/agency-information/rules-and-laws/trec-rules",
    accessed: "2026-09-16",
    notes:
      "Design-critical negative finding - prevents inventing a requirement. Mirrors the cfr109-status-do-not-cite pattern.",
    confidence: "verified",
  },
  {
    id: "ny-dos-candidate",
    jurisdiction: "state:ny",
    surface: ["flyer_footer", "social_footer"],
    type: "must_appear",
    requirement:
      "CANDIDATE (UNVERIFIED): New York licensee advertising rules (19 NYCRR Part 175 / DOS guidance) - exact requirements UNVERIFIED in-session.",
    why:
      "All primary routes blocked on 2026-09-16: dos.ny.gov/real-estate returned HTTP 403 to curl and served a Cloudflare 'Attention Required!' challenge via headless browser (no content); nysenate.gov legislation pages returned HTTP 403; public.leginfo.state.ny.us / legislation.nysenate.gov probes were launched but results were lost to a tool-channel failure (cannot claim any verified); the Internet Archive (wayback availability API) returned no archived snapshots for the DOS real-estate pages.",
    satisfied_by:
      "DO NOT ENFORCE. Revisit NY via browser/archive in follow-up; do not ship a NY-specific requirement until a live NY DOS page, 19 NYCRR text, or NY Senate/Assembly statute text is captured.",
    severity: "hard",
    source_url: "https://www.dos.ny.gov/licensing/real-estate",
    accessed: "2026-09-16",
    notes:
      "UNVERIFIED - do not ship as requirement. Routes tried: dos.ny.gov (403 + Cloudflare challenge), nysenate.gov (403), public.leginfo.state.ny.us (results lost to tool failure), Internet Archive (no snapshots).",
    confidence: "unverified",
  },
  {
    id: "other-states-candidate",
    jurisdiction: "state:all-other",
    surface: ["flyer_footer", "social_footer"],
    type: "must_appear",
    requirement:
      "All states other than CA, FL, and TX are UNVERIFIED for license-disclosure requirements. National product needs a per-state disclosure-snippet library populated state-by-state from primary sources before shipping state-specific defaults.",
    why: "Only CA, FL, and TX verified in-session; state disclosure laws differ.",
    satisfied_by: "State-configurable disclosure block; blank-by-default until verified for a state.",
    severity: "best practice",
    source_url: "n/a",
    accessed: "2026-09-16",
    notes:
      "Explicitly named unverified jurisdictions: NY, all others (TX moved to verified on 2026-09-16 via 22 TAC 535.155).",
    confidence: "unverified",
  },
  {
    id: "mls-attribution",
    jurisdiction: "mls",
    surface: ["listing_summary", "flyer_footer", "social_caption"],
    type: "must_appear",
    requirement:
      "Best practice: attribute listing data source and listing brokerage per the relevant MLS rules; MLS texts are market-local and were NOT verified in-session.",
    why: "Common MLS rule pattern; no national text available to verify.",
    satisfied_by:
      "Optional attribution line the agent can fill (e.g., 'Source: {MLS}'); label as agent-confirmable.",
    severity: "best practice",
    source_url: "n/a",
    accessed: "2026-09-16",
    notes:
      "UNVERIFIED per-MLS. Three candidate rule pages returned HTTP 200 at access (2026-09-16) but their attribution/listings-source text was NOT yet read: Bright MLS https://www.brightmls.com/about/legal/rules; California Regional MLS (CRMLS) https://www.crmls.org/legal/rules; Midwest Real Estate Data (MRED) https://www.mredllc.com/. Read each page's rule text and attribute each rule to its named MLS before shipping.",
    confidence: "unverified",
  },
  {
    id: "meta-special-ad-category",
    jurisdiction: "platform:meta",
    surface: ["social_ad_targeting_guidance", "campaign_guidance"],
    type: "must_avoid",
    requirement:
      "Paid housing ads on Meta are a 'special ad category': no age/gender/postcode/ZIP/racial/religious-affinity targeting; advertisers must use expanded/broad audiences. CITE PENDING - help-center anchor returned 404 at access.",
    why:
      "Meta platform policy for housing ads (special ad categories). Policy directionally certain; live URL unverified.",
    satisfied_by:
      "Guidance copy appended to generated social campaign text warning about special-ad-category restrictions; do not emit targeting recommendations keyed to protected classes.",
    severity: "hard",
    source_url: "https://www.facebook.com/business/help/1517919519278477",
    accessed: "2026-09-16",
    notes:
      "URL returned HTTP 404 at access; pass-2 also got HTTP 400 from business.facebook.com/help/... - re-verify a live Meta help URL before shipping citation. Enforcement risk: ad rejection/account limits. UNVERIFIED citation.",
    confidence: "unverified",
  },
  {
    id: "google-housing-ads",
    jurisdiction: "platform:google",
    surface: ["social_ad_targeting_guidance"],
    type: "must_avoid",
    requirement:
      "Google restricts personalized targeting for housing ads; discriminatorily targeted advertising is disallowed. CITE PENDING - support page anchor returned 404 at access.",
    why: "Google Ads housing policy (candidate; unverified live in-session).",
    satisfied_by: "Same campaign-guidance treatment as Meta.",
    severity: "hard",
    source_url: "https://support.google.com/adspolicy/answer/2465303",
    accessed: "2026-09-16",
    notes:
      "HTTP 404 at access for answer/2465303; pass-2 also got HTTP 404 for answer/1581051 - reverify a live Google Ads policy URL. UNVERIFIED citation.",
    confidence: "unverified",
  },
  {
    id: "ftc-truth-in-advertising",
    jurisdiction: "federal",
    surface: ["all_text_surfaces", "image_prompt"],
    type: "must_avoid",
    requirement:
      "Advertising must be truthful and non-deceptive; claims must be substantiated before they are made; advertisers are liable for claims in their ads including AI-generated copy.",
    why:
      "FTC Act Section 5 enforcement; FTC 'Advertising & Marketing' business guidance (verified live HTTP 200).",
    satisfied_by:
      "Prompt rule: no invented amenities/facts, no unsubstantiated superlatives/claims not supplied by the user; flag modal verbs of claim ('guaranteed', 'best', '#1') unless user-confirmed.",
    severity: "hard",
    source_url: "https://www.ftc.gov/business-guidance/advertising-marketing",
    accessed: "2026-09-16",
    confidence: "verified",
  },
  {
    id: "no-manufactured-urgency",
    jurisdiction: "product",
    surface: ["email_campaign", "social_caption", "flyer_text"],
    type: "must_avoid",
    requirement:
      "Do not generate false urgency/scarcity ('act now', 'only N left', 'last chance') unless the user supplies a real deadline.",
    why: "Team acceptable-use policy; avoids deceptive-advertising risk.",
    satisfied_by: "Prompt guardrail + UI date field for genuine open-house/offer deadlines.",
    severity: "best practice",
    source_url: "n/a",
    accessed: "2026-09-16",
    notes: "Product behavior rule.",
    confidence: "verified",
  },
];

/* ------------------------------------------------------------------ */
/* Design surface → rule surfaces                                      */
/* ------------------------------------------------------------------ */

/** The three output formats the custom design editor can produce. */
export type DesignSurfaceKind = "flyer" | "social" | "social_portrait";

/**
 * Surface tags that a design of each format can actually carry. A rule counts
 * as relevant to a design when its `surface` list intersects this set.
 *  - tags are the researcher's vocabulary (see the data file),
 *  - "all_text_surfaces" / "image_prompt" / "generated_copy" / "agent_name_line"
 *    are format-independent, so they count for both formats.
 */
export const SURFACE_TAGS_BY_FORMAT: Record<DesignSurfaceKind, string[]> = {
  flyer: [
    "flyer_text",
    "flyer_image",
    "flyer_footer",
    "agent_name_line",
    "generated_copy",
    "all_text_surfaces",
    "image_prompt",
  ],
  social: [
    "social_caption",
    "social_image",
    "social_footer",
    "social_ad_targeting_guidance",
    "campaign_guidance",
    "agent_name_line",
    "generated_copy",
    "all_text_surfaces",
    "image_prompt",
  ],
  social_portrait: [
    "social_caption",
    "social_image",
    "social_footer",
    "social_ad_targeting_guidance",
    "campaign_guidance",
    "agent_name_line",
    "generated_copy",
    "all_text_surfaces",
    "image_prompt",
  ],
};

export const FORMAT_LABEL: Record<DesignSurfaceKind, string> = {
  flyer: "flyer (8.5×11, 1275×1650 px)",
  social: "social post (1:1, 1080×1080 px)",
  social_portrait: "social story (4:5, 1080×1350 px)",
};

/** Which format a design doc/preset is being made for. */
export function formatForPreset(preset: DesignPresetId): DesignSurfaceKind {
  if (preset === "flyer") return "flyer";
  if (preset === "socialPortrait") return "social_portrait";
  return "social";
}

/**
 * Which format a design document is being made for — taken from the doc's own
 * canvas size (the editor can't change it; DESIGN_PRESETS owns the sizes).
 */
export function formatForDimensions(width: number, height: number): DesignSurfaceKind {
  if (width === 1275 && height === 1650) return "flyer";
  if (width === 1080 && height === 1350) return "social_portrait";
  // Portrait-ish canvases are treated as stories; everything else as 1:1 social.
  return height > width ? "social_portrait" : "social";
}

/** Does this rule touch a surface this design format can carry? */
export function ruleAppliesToFormat(rule: AdvertisingRule, format: DesignSurfaceKind): boolean {
  const tags = SURFACE_TAGS_BY_FORMAT[format];
  return rule.surface.some((s) => tags.includes(s));
}

/* ------------------------------------------------------------------ */
/* Grouping (data-driven: `type` + `severity` + `confidence`)           */
/* ------------------------------------------------------------------ */

export type ChecklistGroupId = "must_appear" | "must_avoid" | "best_practice" | "unverified";

export interface ChecklistGroupDef {
  id: ChecklistGroupId;
  title: string;
  blurb: string;
}

/**
 * The four rendered groups, in order. The first three come straight from the
 * data (`type` / `severity`); the last exists so that `confidence: "unverified"`
 * rules are never presented as requirements — see `groupForRule`.
 */
export const CHECKLIST_GROUPS: ChecklistGroupDef[] = [
  {
    id: "must_appear",
    title: "Must appear",
    blurb: "Rules the research records as requirements to include.",
  },
  {
    id: "must_avoid",
    title: "Must not appear",
    blurb: "Rules the research records as things the ad must not carry.",
  },
  {
    id: "best_practice",
    title: "Best practice",
    blurb: "Recommended, not legally required. Industry convention or product policy.",
  },
  {
    id: "unverified",
    title: "Not yet verified — confirm with your broker",
    blurb:
      "The researcher could not confirm these from a primary source. Do not treat them as requirements — check with your broker or state commission.",
  },
];

/**
 * Group a rule purely from its own data fields:
 *   confidence "unverified"      → "unverified"  (never a hard requirement)
 *   severity   "best practice"   → "best_practice"
 *   type       "must_appear"     → "must_appear"
 *   type       "must_avoid"      → "must_avoid"
 * No rule id or UI copy is involved, so new rules slot in automatically.
 */
export function groupForRule(rule: AdvertisingRule): ChecklistGroupId {
  if (rule.confidence === "unverified") return "unverified";
  if (rule.severity === "best practice") return "best_practice";
  return rule.type === "must_appear" ? "must_appear" : "must_avoid";
}

export interface ChecklistSection {
  group: ChecklistGroupDef;
  rules: AdvertisingRule[];
}

export interface Checklist {
  format: DesignSurfaceKind;
  /** Groups that have at least one rule for this format, in CHECKLIST_GROUPS order. */
  sections: ChecklistSection[];
  /** Rules that do not touch any surface this format can carry. Never shown as requirements. */
  notForThisFormat: AdvertisingRule[];
  /** Total rules in the data file (data-driven header count). */
  totalRules: number;
}

/** Build the checklist for a design format from the rules data. */
export function buildChecklist(rules: AdvertisingRule[], format: DesignSurfaceKind): Checklist {
  const relevant = rules.filter((r) => ruleAppliesToFormat(r, format));
  const notForThisFormat = rules.filter((r) => !ruleAppliesToFormat(r, format));
  const sections: ChecklistSection[] = [];
  for (const group of CHECKLIST_GROUPS) {
    const inGroup = relevant.filter((r) => groupForRule(r) === group.id);
    if (inGroup.length > 0) sections.push({ group, rules: inGroup });
  }
  return { format, sections, notForThisFormat, totalRules: rules.length };
}

/* ------------------------------------------------------------------ */
/* Display copy derived from the data                                  */
/* ------------------------------------------------------------------ */

/** Human labels for the researcher's jurisdiction vocabulary. */
const JURISDICTION_LABELS: Record<string, string> = {
  federal: "Federal",
  nar: "NAR (membership marks)",
  mls: "MLS (market-local, not verified)",
  product: "Product policy",
  "platform:meta": "Meta platform policy",
  "platform:google": "Google Ads policy",
  "state:ca": "California",
  "state:fl": "Florida",
  "state:tx": "Texas",
  "state:ny": "New York (not verified)",
  "state:all-other": "All states other than CA, FL and TX (not verified)",
};

export function jurisdictionLabel(jurisdiction: string): string {
  return JURISDICTION_LABELS[jurisdiction] ?? jurisdiction;
}

/**
 * Conditional rules must show their condition, not a bare requirement. The two
 * conditions below come from the rule's own requirement/notes text and never
 * strengthen it. Rules without an entry here simply show no condition line.
 */
const RULE_CONDITIONS: Record<string, string> = {
  "nar-realtor-mark-usage":
    "Condition: NAR members only. The rule's own wording is \"Use REALTOR(R) mark only for NAR members, with the registered symbol, uppercase…\" — do not use the mark if you are not a NAR member.",
  "ca-10140-6-license-disclosure":
    "Condition: the (b)(1) first-contact disclosure applies to solicitation materials intended as the first point of contact with consumers; the researcher notes that applicability for a given flyer is broker-confirmable.",
};

export function ruleCondition(rule: AdvertisingRule): string | null {
  return RULE_CONDITIONS[rule.id] ?? null;
}

/**
 * Short bullet line for an item. These are faithful compressions of the rule's
 * own `requirement` — never stronger — and the full verbatim requirement is
 * always shown in the item's expandable detail. A rule with no summary here
 * (e.g. a rule added to the data file later) falls back to its own
 * `requirement` text, so new rules render with no UI change.
 */
const RULE_SUMMARIES: Record<string, string> = {
  "fha-3604c-no-discriminatory-ads":
    "Nothing in the ad may indicate a preference, limitation or discrimination based on a protected class.",
  "cfr100-75-flyers-explicitly-covered":
    "Flyers, brochures and their photographs, illustrations and symbols are explicitly covered by the fair-housing advertising rule.",
  "cfr100-75c3-media-location-targeting":
    "Do not pick ad media or placements that deny housing information to a protected class.",
  "cfr109-status-do-not-cite":
    "Internal: do not build content checking on the retired 24 CFR Part 109 word list.",
  "cfr110-poster-11x14-office":
    "Post the prescribed 11x14 fair housing poster at your office and covered locations — a physical display duty, not flyer content.",
  "eho-statement-footer-recommended":
    "Recommended footer: an \u201cEqual Housing Opportunity\u201d statement line (optionally the EHO logo) on flyers and social posts.",
  "nar-realtor-mark-usage":
    "Use the REALTOR(R) mark only as a NAR member, with the registered symbol and in uppercase; never used generically or auto-inserted.",
  "ca-10140-6-license-disclosure":
    "California: licensee ads must designate licensed activity; first-contact solicitation must give the agent's name, license number and the responsible broker.",
  "fl-61j2-10-025-brokerage-name":
    "Florida: advertising must carry the brokerage's licensed name and be recognisable as coming from a real estate licensee.",
  "fl-61j2-10-025-internet-adjacency":
    "Florida, internet/social: the brokerage name must sit adjacent to (or immediately above/below) the contact information.",
  "fl-61j2-10-025-no-false-advertising":
    "Florida: no fraudulent, false, deceptive or misleading real estate advertising.",
  "eho-logo-asset-provenance":
    "Do not ship an EHO logo image file: its authoritative source could not be verified. 24 CFR 110.25's \u201cEQUAL HOUSING OPPORTUNITY\u201d legend text stays the default.",
  "tx-535-155a-name-and-broker":
    "Texas: ads must name the license holder (or team) and the broker, in a readily noticeable place.",
  "tx-535-155a-half-size":
    "Texas: the broker's name must be at least half the size of the largest contact information in the ad.",
  "tx-535-155e-social-profile":
    "Texas, social/text: the required names may live on a directly linked, readily noticeable profile page — on-image remains the safer default.",
  "tx-535-155f-misleading-list":
    "Texas: no inaccurate material claims, no sales agent presented as a broker, no team name implying its own brokerage, plus the rule's other prohibitions.",
  "tx-535-155-no-license-number":
    "Texas has NO license-number display requirement for agent advertising — never render a TX licence number as required.",
  "ny-dos-candidate":
    "New York candidate rule (unverified): licensee advertising requirements — no primary source could be pulled.",
  "other-states-candidate":
    "Every state except California, Florida and Texas: license-disclosure requirements have not been verified yet.",
  "mls-attribution":
    "Best practice: attribute the listing data source/MLS and the listing brokerage — MLS texts are market-local and unverified.",
  "meta-special-ad-category":
    "Meta paid housing ads are a special ad category — no age, gender, ZIP/postcode, racial or religious-affinity targeting (citation pending).",
  "google-housing-ads":
    "Google restricts personalised targeting for housing ads; discriminatory targeting is disallowed (citation pending).",
  "ftc-truth-in-advertising":
    "Claims must be truthful and substantiated before you make them — you are liable for claims in your ads, including AI-generated copy.",
  "no-manufactured-urgency":
    "No false urgency or scarcity (\u201cact now\u201d, \u201conly N left\u201d) unless you have a real deadline.",
};

export function ruleSummary(rule: AdvertisingRule): string {
  const s = RULE_SUMMARIES[rule.id];
  if (s) return s;
  // Fallback for rules added to the data file: quote the requirement itself.
  return rule.requirement;
}

/** Never rendered as a verdict — always shown with the panel's disclaimers. */
export const COMPLIANCE_PANEL_DISCLAIMERS = {
  /** (a) always visible */
  notLegalAdvice:
    "This is a research-backed aid, not legal advice. It is not exhaustive. Your broker and your state commission have the final say.",
  /** (b) always visible */
  ehoFooter:
    "Equal Housing Opportunity footers are a recommended industry convention, not a legal requirement.",
  /** no auto pass/fail verdicts — tick state is the agent's own assertion */
  noVerdict:
    "Relevate does not check your design and never certifies compliance. Ticks are your own notes, and unticked items are not a failure.",
} as const;


// ---------------------------------------------------------------------------
// Render-path disclosure exports (task 834b0e71, Design Engineer). The native
// flyer/social templates and /api/render import THESE names — the checklist
// data above stays the single source of rule TEXT; the block below adds the
// small render-side vocabulary on top of it (pure addition, checklist content
// untouched).
// ---------------------------------------------------------------------------

/** Exact legend phrase from 24 CFR 110.25 (authoritative phrasing). */
export const EHO_LEGEND = "Equal Housing Opportunity";

/** NAR membership mark: uppercase + registered symbol - only when the agent
 * declares NAR membership (nar-realtor-mark-usage). Never auto-inserted. */
export const REALTOR_MARK = "REALTOR\u00AE";

/** Jurisdictions with VERIFIED advertising rules (v1.1.0 data). Every other
 * state is unverified (other-states-candidate): fields are offered, no
 * requirement is claimed, nothing is enforced.
 *
 * HONESTY NOTE — TX is verified at the RULE level only (22 TAC 535.155, see the
 * five tx-* rules), it is NOT yet implemented in the render path:
 * `disclosureWarnings()` below has FL and CA branches, and there is no TX branch,
 * so no TX-specific warning or layout rule fires yet. The two TX rendering
 * requirements still to build are (1) broker name at least HALF the size of the
 * largest contact info, and (2) NO licence-number field (TX agent ads have no
 * licence-number requirement). Nothing here claims TX rendering is enforced. */
export const VERIFIED_JURISDICTIONS = ["FL", "CA", "TX"] as const;

/** User-supplied disclosure profile - every field optional, never fabricated;
 * an empty field renders NOTHING (no placeholder, no bracket text). */
export interface DisclosureInput {
  jurisdiction?: string;
  brokerageName?: string;
  agentName?: string;
  agentLicense?: string;
  brokerName?: string;
  brokerLicense?: string;
  narMember?: boolean;
  /** EHO footer toggle - DEFAULT ON (eho-statement-footer-recommended). */
  ehoFooter?: boolean;
}

const cleanStr = (v?: string) => (typeof v === "string" ? v.trim() : "");

/**
 * State-aware disclosure warnings for a render request - exactly as researched,
 * never exceeding the verified rules:
 *  - FL + missing brokerage name -> WARNING (61J2-10.025 must surface, not pass).
 *  - CA + any disclosure field present -> INFO confirmation (B&P 10140.6(b)(1)
 *    applicability is broker-confirmable - a confirmation, never a guarantee).
 *  - TX -> warning when the licence-holder/team name or the broker's name is
 *    missing (22 TAC 535.155(a), verified). The half-size broker constraint is
 *    enforced in the footer LAYOUT (branded-templates txFooterPlan). No
 *    licence-number messaging: TX has NO licence-number requirement for agent
 *    advertising (tx-535-155-no-license-number) - silence about numbers is by
 *    design, not an oversight.
 *  - Any other state -> no requirement claimed, no warning.
 */
export function disclosureWarnings(
  input: DisclosureInput,
): { level: "warning" | "info"; message: string }[] {
  const out: { level: "warning" | "info"; message: string }[] = [];
  const state = cleanStr(input.jurisdiction).toUpperCase();
  if (state === "FL" && !cleanStr(input.brokerageName)) {
    out.push({
      level: "warning",
      message:
        "Florida advertising must include the licensed name of the brokerage firm (Fla. Admin. Code R. 61J2-10.025). This render is missing the brokerage name - add it under Agent & Logo so the asset carries the required disclosure. (This is a rule citation, not a compliance certification.)",
    });
  }
  if (state === "CA") {
    const has = [cleanStr(input.agentName), cleanStr(input.agentLicense), cleanStr(input.brokerName), cleanStr(input.brokerLicense)].some(Boolean);
    if (has) {
      const missing: string[] = [];
      if (!cleanStr(input.agentName)) missing.push("agent name");
      if (!cleanStr(input.agentLicense)) missing.push("agent DRE #");
      if (!cleanStr(input.brokerName)) missing.push("responsible broker name");
      if (!cleanStr(input.brokerLicense)) missing.push("responsible broker DRE #");
      out.push({
        level: "info",
        message: missing.length
          ? "CA licence details render as supplied (B&P Code \u00A710140.6(b)(1) covers first-point-of-contact solicitation material - confirm applicability with your responsible broker). Not yet filled: " + missing.join(", ") + "."
          : "CA licence details render as supplied (B&P Code \u00A710140.6(b)(1) covers first-point-of-contact solicitation material - confirm applicability with your responsible broker).",
      });
    }
  }
  if (state === "TX") {
    const missing: string[] = [];
    if (!cleanStr(input.agentName)) missing.push("the name of the licence holder or team placing the advertisement");
    if (!cleanStr(input.brokerName)) missing.push("the responsible broker's name");
    if (missing.length) {
      out.push({
        level: "warning",
        message:
          "Texas advertising must include, in a readily noticeable location: the name of the licence holder or team placing the ad, and the broker's name (22 TAC \u00A7535.155(a)). Missing from this render: " + missing.join("; ") + ". Texas does not require a licence number on agent advertising, so none is rendered.",
      });
    }
  }
  return out;
}
