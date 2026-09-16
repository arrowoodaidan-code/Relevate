/**
 * Text style → bundled font matching for Relevate's template-replica renderer.
 *
 * The vision analyzer (src/lib/ai.ts) returns per-region typography — family
 * category, weight, italic flag, letter-spacing, case transform and exact glyph
 * color. Satori only renders the font files actually registered, so this module
 * is the single place that maps a detected style onto the bundled Relevate font
 * set and applies the case transform to the composited content.
 *
 * ROUND 2 FONT VARIETY (Aug 13) — the bundle now carries six families, all OFL:
 *   Relevate Sans      (DejaVu Sans 400/700)          ← sans-serif
 *   Relevate Serif     (DejaVu Serif 400/700)         ← serif
 *   Relevate Mono      (DejaVu Sans Mono 400/700)     ← mono
 *   Relevate Display   (Playfair Display 400/700/900) ← display (elegant serif)
 *   Relevate Script    (Great Vibes 400)              ← script (calligraphy)
 *   Relevate Condensed (Bebas Neue 400)               ← condensed (tall/narrow)
 *   Relevate Calligraphy (Sacramento 400)             ← builder calligraphy
 *   Relevate Handwriting (Amatic SC 400/700)          ← builder handwriting
 *   Relevate Retro       (Pacifico 400)               ← builder retro display
 * Registry names are the CONTRACT shared with the renderer and geometry work —
 * see the fonts array in src/lib/render.ts. Do not rename without coordinating.
 *
 * WHAT IS MATCHED
 *  - family category   → the six families above (script/display/condensed now
 *                        resolve to their DEDICATED faces, not DejaVu Serif)
 *  - weight            → bold ⇒ 700 (display bold ⇒ Playfair Bold; sans/serif/
 *                        mono bold ⇒ DejaVu Bold), everything else ⇒ 400.
 *                        Playfair 900 is registered for a future "black"
 *                        detection but is not emitted (vision fontWeight has no
 *                        "black" value). Great Vibes and Bebas Neue ship a
 *                        single 400 weight by design, so script/condensed are
 *                        always 400 (documented below).
 *  - letter-spacing    → whole-pixel tracking string for satori ("3px"/"-1px")
 *  - uppercase         → content is uppercased in JS before compositing
 *  - color             → handled by the sampler/renderer (regionForegrounds),
 *                        not by this module
 *
 * WHAT IS DELIBERATELY LIMITED (and why)
 *  - italic            → no italic/oblique face is bundled (Playfair Display has
 *                        true italics but bundling them would add ~4 files; the
 *                        flag is preserved end-to-end for a future italic
 *                        bundle, the compositor renders upright).
 *  - small-caps         → real small caps need a font with the `smcp` OpenType
 *                        feature; none of the bundled faces provide it, so
 *                        approximated by an uppercase content transform
 *                        (documented approximation, not true small caps).
 *  - light (300)       → only 400/700/900 are registered; "light" emits 400
 *                        (nearest registered weight), exactly as before.
 *  - script weight     → Great Vibes is single-weight (400); bold script
 *                        requests render 400.
 *  - condensed weight  → Bebas Neue is single-weight (400); bold condensed
 *                        requests render 400.
 *  - display weight    → Playfair 400/700/900 registered; vision "bold" → 700.
 *  - scripts (Cyrillic, Greek, CJK, …) → the new faces cover Latin only; the
 *                        DejaVu faces remain the fallback for non-Latin glyphs
 *                        (existing behavior, unchanged).
 *
 * The color priority chain (sampled template lettering → vision textColor →
 * luminance-aware default) lives in render.ts / render-templates.ts; this module
 * only concerns itself with type style and case.
 */
import type { TemplateRegion } from "./prompts";

/** The six bundled family names as registered in src/lib/render.ts. */
export type MatchedFamily =
  | "Relevate Sans"
  | "Relevate Serif"
  | "Relevate Mono"
  | "Relevate Display"
  | "Relevate Script"
  | "Relevate Condensed"
  | "Relevate Calligraphy"
  | "Relevate Handwriting"
  | "Relevate Retro";

/** Only weights with a registered face (900 is registered but not yet emitted). */
export type MatchedFontWeight = 400 | 700 | 900;

/** Case transform applied to the composited CONTENT (not CSS). */
export type MatchedTextTransform = "uppercase" | "none";

export interface MatchedTypography {
  fontFamily: MatchedFamily;
  /** Registered weight only: 700 for bold, else 400 (incl. "light"). */
  fontWeight: MatchedFontWeight;
  /** Always "normal" — no italic face is bundled (documented limitation). */
  fontStyle: "normal";
  /** Whole-pixel tracking for satori ("8px"), omitted when the region carries
   * no letter-spacing signal (the compositor then uses its default tracking). */
  letterSpacing?: string;
  /** Case transform to apply to the content via applyTextTransform(). */
  textTransform: MatchedTextTransform;
}

/**
 * Map a detected region style to the closest bundled Relevate face + weight +
 * tracking + case transform. Pure and synchronous — safe to unit test.
 *
 * Round 2: script/display/condensed now resolve to their DEDICATED OFL faces
 * (Great Vibes / Playfair Display / Bebas Neue) instead of the legacy DejaVu
 * Serif approximation — that mapping change is flyer-only by design; the social
 * path keeps its own legacy resolution (fontFamilyFor in render-templates.ts)
 * so social renders stay byte-identical (owner parked social).
 */
export function matchRegionTypography(region: Pick<TemplateRegion, "fontFamily" | "fontWeight" | "italic" | "letterSpacingPx" | "textTransform">): MatchedTypography {
  let fontFamily: MatchedFamily = "Relevate Sans";
  if (region.fontFamily === "serif") fontFamily = "Relevate Serif";
  else if (region.fontFamily === "script") fontFamily = "Relevate Script";
  else if (region.fontFamily === "display") fontFamily = "Relevate Display";
  else if (region.fontFamily === "condensed") fontFamily = "Relevate Condensed";
  else if (region.fontFamily === "mono") fontFamily = "Relevate Mono";

  // Script and condensed faces are single-weight (Great Vibes / Bebas Neue ship
  // only 400), so bold requests on those families still emit 400 — satori would
  // silently fall back to 400 anyway; we make the contract exact. Display bold
  // resolves to Playfair Bold (700); Playfair Black (900) stays registered for a
  // future "black" detection and is not emitted by the current vision enum.
  const singleWeightFamily = fontFamily === "Relevate Script" || fontFamily === "Relevate Condensed";
  const fontWeight: MatchedFontWeight = singleWeightFamily ? 400 : (region.fontWeight === "bold" ? 700 : 400);

  const letterSpacing = typeof region.letterSpacingPx === "number"
    ? `${Math.round(region.letterSpacingPx)}px`
    : undefined;

  // small-caps degrades to uppercase (no smcp-capable face bundled) — the
  // region's original intent is preserved in region.textTransform for auditing.
  const textTransform: MatchedTextTransform =
    region.textTransform === "uppercase" || region.textTransform === "small-caps" ? "uppercase" : "none";

  return {
    fontFamily,
    fontWeight,
    fontStyle: "normal", // italic flag preserved on the region; not representable with the bundle
    ...(letterSpacing ? { letterSpacing } : {}),
    textTransform,
  };
}

/**
 * Apply the matched case transform to the composited content. Uppercase
 * uppercases the whole string (line breaks preserved); anything else is
 * returned untouched. This is deliberately a JS transform, not a CSS
 * text-transform: the task contract is "uppercase via content transform", it is
 * deterministic across engines, and it matches how the textarea content is
 * saved/downloaded.
 */
export function applyTextTransform(content: string, transform: MatchedTextTransform): string {
  return transform === "uppercase" ? content.toUpperCase() : content;
}

/**
 * One-call convenience: matched style + transformed content for a text region.
 * The compositor's per-region render then consumes the returned fields.
 */
export function resolveRegionTypography(
  region: TemplateRegion,
  content: string,
): MatchedTypography & { content: string } {
  const matched = matchRegionTypography(region);
  return { ...matched, content: applyTextTransform(content, matched.textTransform) };
}

/** Machine-readable summary of the bundle's matching limits (for reports/UI). */
export const FONT_MATCH_LIMITS = {
  italic: "No italic/oblique face is bundled (Playfair Display has true italics but they are not yet bundled); italic regions render upright. The region.italic flag is preserved for a future italic bundle.",
  smallCaps: "No bundled face has true small caps (none provide the smcp OpenType feature); small-caps regions are approximated by an uppercase content transform.",
  light: "Registered weights are 400/700/900; a 'light' request resolves to 400 (nearest registered weight).",
  scriptWeight: "Great Vibes (Relevate Script) is single-weight 400 by design; bold script requests render 400.",
  condensedWeight: "Bebas Neue (Relevate Condensed) is single-weight 400 by design; bold condensed requests render 400.",
  calligraphyWeight: "Sacramento (Relevate Calligraphy) is single-weight 400 by design; bold calligraphy requests render 400.",
  retroWeight: "Pacifico (Relevate Retro) is single-weight 400 by design; bold retro requests render 400.",
  builderFaces: "Relevate Calligraphy / Handwriting / Retro are only reachable through the custom builder (DesignDoc) font catalog; the template-replica vision fontFamily enum does not emit those styles, so matchRegionTypography never returns them for uploaded-template regions.",
  displayBlack: "Playfair Black (900) is registered but not emitted — the vision fontWeight enum has no 'black' value; bold display resolves to Playfair Bold (700).",
} as const;
