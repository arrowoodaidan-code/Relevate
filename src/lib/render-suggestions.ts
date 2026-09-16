/**
 * Render-suggestion resolver — the honest core of the "prompt box" under the
 * rendered social/flyer image.
 *
 * The owner wants a text box where the user types a suggested change (e.g.
 * "make the text bigger", "switch to a sunset vibe", "use a lighter background")
 * and the service "makes suggested driven changes to the image itself."
 *
 * GENUINELY-SUPPORTED LEVER: The server-side renderer (render-templates.ts /
 * branded-templates.ts) takes a `brandStyle` string and maps it via
 * `accentFor()` to the template's ACCENT theme (the divider/underline + accent
 * tones across the branded layouts). That is a REAL, visible change the render
 * pipeline already applies — style/theme suggestions are resolved here to a
 * brandStyle the renderer consumes verbatim.
 *
 * HONEST LIMITS (NOT faked): the renderer does NOT currently expose parameters
 * for text/font sizing, layout rearrangement, background swaps, or arbitrary
 * pixel edits. When a suggestion targets one of those, this resolver returns
 * `ok:false` with a clear, truthful reason instead of pretending to apply it.
 * (Photo/tone regeneration is a separate AI-image pipeline, not this resolver.)
 *
 * This is a pure deterministic function (no network/LLM) so it is unit-testable
 * and cheap to gate.
 */

/** Controlled accent themes the renderer genuinely supports via `brandStyle`. */
export interface SupportedStyle {
  /** brandStyle string sent to /api/render. */
  brandStyle: string;
  /** human-readable name shown in the UI. */
  label: string;
  /** accent hex the renderer resolves (via accentFor). */
  accent: string;
}

export const SUPPORTED_STYLES: SupportedStyle[] = [
  { brandStyle: "gold luxury", label: "Warm Gold", accent: "#d4a017" },
  { brandStyle: "navy coastal", label: "Coastal Blue", accent: "#5eb4d8" },
  { brandStyle: "rose blush", label: "Rose Blush", accent: "#dc8b91" },
  { brandStyle: "silver modern", label: "Modern Silver", accent: "#c7d0d5" },
];

export function accentForBrandStyle(style: string): string {
  const s = style.toLowerCase();
  if (/(blue|navy|coastal)/.test(s)) return "#5eb4d8";
  if (/(rose|pink|blush)/.test(s)) return "#dc8b91";
  if (/(silver|gray|grey|modern)/.test(s)) return "#c7d0d5";
  return s.includes("gold") || s.includes("lux") ? "#d4a017" : "#b8860b";
}

export interface RenderSuggestionInput {
  suggestion: string;
  currentStyle?: string;
  type?: "flyer" | "social";
}

export type RenderSuggestionResult =
  | {
      ok: true;
      brandStyle: string;
      label: string;
      accent: string;
      applied: string;
      changed: boolean;
    }
  | { ok: false; reason: string };

/**
 * Classify a free-text suggestion into a renderer-supported style change.
 * Returns ok:false (honest) for anything the renderer cannot currently apply.
 */
export function resolveRenderSuggestion(input: RenderSuggestionInput): RenderSuggestionResult {
  const raw = (input.suggestion || "").trim();
  if (!raw) {
    return { ok: false, reason: "Please type a suggestion (e.g. \"coastal blue theme\")." };
  }
  const s = raw.toLowerCase();

  // --- Honest unsupported categories (the renderer has no knob for these yet) ---
  if (/(font|text).*(bigger|larger|smaller|size)|make the text (bigger|smaller)|bigger text|smaller text/.test(s)) {
    return {
      ok: false,
      reason:
        "Text sizing isn't adjustable via a suggestion yet — the layout auto-fits the copy to fit the design. Try a style/theme change like \"coastal blue theme\".",
    };
  }
  if (/(layout|rearrange|move|rearrang|different layout|reorder)/.test(s)) {
    return {
      ok: false,
      reason:
        "Re-arranging the layout isn't supported by a suggestion yet. Style/theme changes are available — try \"gold luxury\" or \"modern silver\".",
    };
  }
  if (/(background|behind|backdrop).*(lighter|darker|different)|lighter background|darker background|change the background/.test(s)) {
    return {
      ok: false,
      reason:
        "Swapping the background isn't supported by a suggestion yet (the template background is fixed). I can restyle the accent theme instead — try \"coastal blue\".",
    };
  }
  if (/(regenerate|generate a new|new photo|replace photo|change the photo)/.test(s)) {
    return {
      ok: false,
      reason:
        "Regenerating the photo uses the separate AI-image tool. For now this box drives style/theme changes — try \"rose blush\" or \"modern silver\".",
    };
  }

  // --- Supported style/theme intents ---
  const match =
    (/(coastal|navy blue|ocean|sky blue|blue)/.test(s) && SUPPORTED_STYLES[1]) ||
    (/(rose|pink|blush|romantic)/.test(s) && SUPPORTED_STYLES[2]) ||
    (/(silver|gray|grey|modern|minimal|neutral|monochrome)/.test(s) && SUPPORTED_STYLES[3]) ||
    (/(gold|luxe?|elegant|warm(?!er)|classic|premium)/.test(s) && SUPPORTED_STYLES[0]) ||
    null;

  if (!match) {
    return {
      ok: false,
      reason:
        "I couldn't map that to a change the design tool can apply. Supported suggestions: a style/theme like \"coastal blue\", \"gold luxury\", \"modern silver\", or \"rose blush\".",
    };
  }

  const current = (input.currentStyle || "").toLowerCase();
  const changed = !current.includes(match.brandStyle.split(" ")[0]);
  return {
    ok: true,
    brandStyle: match.brandStyle,
    label: match.label,
    accent: match.accent,
    applied: `Applied the ${match.label.toLowerCase()} accent theme (${match.accent}).`,
    changed,
  };
}
