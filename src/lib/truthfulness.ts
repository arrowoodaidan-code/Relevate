/**
 * Truthful-content enforcement — deterministic post-processing for generated
 * marketing copy (spec: /home/team/shared/specs/generated-content-truthfulness.md).
 *
 * The prompts now tell the model not to invent property facts, not to add
 * urgency language, and to keep social output plain text — prompted rules alone
 * are the same guarantee class as the hashtag cap and the bracketed-placeholder
 * guard (both of which needed a deterministic half after prompting failed
 * live). This module is that deterministic half:
 *
 *   1. stripUrgencySentences — urgency/scarcity lines are banned outright, so
 *      any sentence carrying one is removed before it reaches the textarea;
 *   2. stripMarkdown — social posts must paste into Instagram/Facebook as
 *      plain text (raw `**INSTAGRAM:**` and `---` used to ship literally);
 *   3. ensureEmailOptOut — every email campaign ends with a plain-language
 *      opt-out line and a labelled postal-address slot (CAN-SPAM, inside the
 *      federal scope the product publicly promises). The address is never
 *      invented: a supplied agent address is used verbatim, otherwise the
 *      labelled slot stays for the agent to fill.
 *
 * All functions are pure text-in/text-out and safe to run on every candidate
 * (model, mock, and refined output alike).
 */

import {
  FAIR_HOUSING_URGENCY_SOURCE,
  scanFairHousing,
  type FairHousingHit,
} from "./fair-housing";

/**
 * Remove every sentence (and therefore every bullet line) that carries a
 * manufactured-urgency/scarcity phrase. Line-aware like
 * stripBracketPlaceholders: original blank lines are preserved, a line left
 * empty by the removal disappears, and text without any urgency phrase is
 * returned byte-identical.
 */
export function stripUrgencySentences(text: string): string {
  if (!text) return text;
  const urgencyRe = new RegExp(FAIR_HOUSING_URGENCY_SOURCE, "i");
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (!urgencyRe.test(line)) {
      kept.push(line);
      continue;
    }
    // Split the line into sentences, drop the ones carrying the phrase,
    // rejoin the survivors. The sentence splitter needs no lookbehind: it
    // matches "text + optional terminal punctuation + trailing space".
    const sentences = line.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [line];
    const survived = sentences.filter((s) => !urgencyRe.test(s));
    const rejoined = survived
      .join(" ")
      .replace(/ {2,}/g, " ")
      .replace(/[ \t]+$/, "");
    if (rejoined.trim() === "") continue; // the whole line was urgency — drop it
    kept.push(rejoined);
  }
  return kept.join("\n");
}

/**
 * Fair-housing hits (urgency and any other risk pattern) present in `text`.
 * Used to build the "your copy was changed" notice so the agent sees what the
 * guardrail removed, not just that something happened.
 */
export function urgencyHits(text: string): FairHousingHit[] {
  return scanFairHousing(text).hits.filter((h) => h.category === "manufactured-urgency");
}

/**
 * Strip markdown decoration from generated text so it pastes cleanly into
 * social platforms: bold/italic/code emphasis markers, heading markers and
 * horizontal rules go; words, hashtags, mentions and URLs stay.
 */
export function stripMarkdown(text: string): string {
  if (!text || !/[*#`~-]/.test(text)) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let changed = false;
  for (const line of lines) {
    let s = line;
    // Horizontal rule (---, ***, ___) — becomes an empty line, dropped below.
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(s)) {
      changed = true;
      continue;
    }
    // Heading markers ("## Heading") — keep the words, drop the hashes.
    const heading = s.replace(/^(\s{0,3})#{1,6}\s+/, "$1");
    if (heading !== s) { changed = true; s = heading; }
    // Bold/italic emphasis ("**word**", "*word*") — keep the word.
    const bold = s.replace(/\*\*([^*\n]+)\*\*/g, "$1");
    if (bold !== s) { changed = true; s = bold; }
    const ital = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?;:])/, "$1$2");
    if (ital !== s) { changed = true; s = ital; }
    // Inline code ("`code`") — keep the word.
    const code = s.replace(/`([^`\n]+)`/g, "$1");
    if (code !== s) { changed = true; s = code; }
    out.push(s);
  }
  if (!changed) return text;
  // Collapse blank runs an hr left behind (max one blank line survives).
  const collapsed: string[] = [];
  for (const line of out) {
    const last = collapsed[collapsed.length - 1];
    if (line.trim() === "" && (last === undefined || last.trim() === "")) continue;
    collapsed.push(line);
  }
  return collapsed.join("\n").replace(/\n{3,}/g, "\n\n");
}

const EMAIL_OPTOUT_SENTINEL = /rather\s+not\s+receive|no\s+longer\s+wish|unsubscribe|take\s+you\s+off\s+my\s+list|don'?t\s+wish\s+to\s+receive/i;
const EMAIL_ADDRESS_SLOT_SENTINEL = /postal\s+address|physical\s+address|mailing\s+address/i;

/**
 * The CAN-SPAM footer. `agentAddress` (when the agent supplied one) is used
 * verbatim; otherwise the line stays a labelled slot the agent fills in —
 * the address is never invented and no fake unsubscribe URL is emitted (a
 * reply reaches the agent's own inbox, so "reply and I'll take you off my
 * list" is literally true of every sending path).
 */
export function emailOptOutFooter(agentAddress?: string): string {
  const addressLine = agentAddress?.trim()
    ? `Postal address: ${agentAddress.trim()}`
    : "Postal address (required by law — add your business address here before sending):";
  return [
    "----------------------------------------------",
    "You're receiving this email because you asked to hear about new listings from me. If you'd rather not receive these emails, just reply to this one and I'll take you off my list.",
    addressLine,
  ].join("\n");
}

/**
 * Guarantee that an email campaign ends with the opt-out line and the
 * postal-address slot. Idempotent: an existing opt-out sentence and/or
 * address line are left untouched, only what is missing is appended.
 */
export function ensureEmailOptOut(text: string, agentAddress?: string): string {
  if (!text) return text;
  const hasOptOut = EMAIL_OPTOUT_SENTINEL.test(text);
  const hasAddress = EMAIL_ADDRESS_SLOT_SENTINEL.test(text);
  if (hasOptOut && hasAddress) return text;
  if (!hasOptOut && !hasAddress) return `${text.trimEnd()}\n\n${emailOptOutFooter(agentAddress)}`;
  // One of the two exists — append only what's missing so the model's own
  // wording (if compliant) survives.
  if (!hasOptOut) {
    return `${text.trimEnd()}\n\nYou're receiving this email because you asked to hear about new listings from me. If you'd rather not receive these emails, just reply to this one and I'll take you off my list.`;
  }
  const addressLine = agentAddress?.trim()
    ? `Postal address: ${agentAddress.trim()}`
    : "Postal address (required by law — add your business address here before sending):";
  return `${text.trimEnd()}\n\n${addressLine}`;
}
