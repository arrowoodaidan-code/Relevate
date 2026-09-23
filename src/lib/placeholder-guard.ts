/**
 * Bracketed-placeholder guard (task fa4a26ae).
 *
 * Generated copy must never carry literal template placeholders —
 * "[Your Phone Number]", "[Your Email Address]", "[Agent Name]", … — onto a
 * deliverable. Proven live 2026-09-20: a rendered flyer PNG baked both
 * contact placeholders into the graphic while the agent's real phone rendered
 * in the disclosure band (qa-neil-trial-2026-09-17/FINDINGS.md §3).
 *
 * Policy (product rule, enforced here — not left to the model):
 *   - a supplied detail is used verbatim;
 *   - an unsupplied detail renders NOTHING — never a placeholder, never an
 *     invented value.
 *
 * This module is the deterministic enforcement used at two layers:
 *   1. post-generation (src/lib/ai.ts) so placeholder text never reaches the
 *      client textarea, no matter what the model (or a future prompt change)
 *      emits;
 *   2. the render guard (validateRenderRequest in src/lib/render.ts) so no
 *      future change upstream can put a placeholder on a rendered PNG.
 *
 * Stripping is line-aware and invents nothing: a line that consisted only of
 * the placeholder disappears, inline text keeps its surrounding words, and
 * original blank lines are preserved so the layout shape is unchanged.
 */

/**
 * One bracketed placeholder token: "[" + 1–80 chars with no brackets or
 * newlines inside + "]". Length-capped so a stray "[" late in a long legal
 * description can never swallow unrelated copy; newline-excluded so a
 * malformed token can never bridge two lines.
 */
const BRACKET_TOKEN = /\[[^[\]\n]{1,80}\]/g;

/** True when the text still contains at least one bracketed placeholder token. */
export function containsBracketPlaceholder(text: string): boolean {
  return new RegExp(BRACKET_TOKEN.source).test(text);
}

/** The first bracketed placeholder token in the text, or null — used by the
 *  render boundary (validateRenderRequest) to REFUSE with a precise error
 *  naming the offending token (task fa4a26ae, lead direction: fail loudly at
 *  the render boundary rather than printing a bracket on a finished flyer). */
export function findBracketPlaceholder(text: string): string | null {
  const m = new RegExp(BRACKET_TOKEN.source).exec(text);
  return m ? m[0] : null;
}

/**
 * Remove every bracketed placeholder token and the lines it leaves empty.
 * Byte-identical fast path when the text contains no "[" at all.
 */
export function stripBracketPlaceholders(text: string): string {
  if (!text || text.indexOf("[") === -1) return text;
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const stripped = line
      .replace(new RegExp(BRACKET_TOKEN.source, "g"), "")
      // Collapse runs of spaces the removed tokens left behind (inline case:
      // "Call [Your Phone Number] today" → "Call today", not "Call  today").
      .replace(/ {2,}/g, " ")
      .replace(/[ \t]+$/, "");
    if (stripped.trim() === "" && line.trim() !== "") {
      // The line was ONLY placeholder(s) — it disappears entirely so the
      // remaining copy flows naturally (e.g. a lone "[Your Phone Number]"
      // line on a flyer). Original blank lines are kept: they carry the
      // paragraph rhythm and must survive untouched.
      continue;
    }
    kept.push(stripped);
  }
  return kept.join("\n");
}
