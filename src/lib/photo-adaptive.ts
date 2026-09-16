/**
 * Relevate — photo-adaptive palette engine for the native photo overlays
 * (task bf6f8534: "text stays visible on ANY uploaded photo, professional
 * palette derived from the photo").
 * =========================================================================
 * SCOPE / CONTRACT
 *   This module is used ONLY by the native no-template photo layouts
 *   (branded-templates.ts → Flyer-Hero / Social-Photo). The classic
 *   (no-photo) layouts and the template-replica path never call it, so their
 *   renders are byte-unchanged by design.
 *
 *   It is self-contained: it imports only @resvg/resvg-js (already a server
 *   dependency, used by render.ts) and exports pure sync helpers. It must NOT
 *   import render.ts / render-templates.ts (no circular deps, no edits to
 *   Design Engineer A's files).
 *
 * WHAT IT COMPUTES
 *   1. per-zone average luminance of the uploaded photo (zones are
 *      canvas-fractional rects; with objectFit:cover the photo fills the
 *      canvas, so canvas fractions == visible photo fractions),
 *   2. a dominant hue cluster (saturated pixels only — pure neutrals don't
 *      drive the accent), bucketed to warm / green / cool / neutral,
 *   3. per-zone adaptive palettes:
 *        - dark photo zone  → cream/mint text on the dark brand scrim
 *          (current design — unchanged colors),
 *        - bright photo zone → dark ink text on a light cream wash
 *          (reversed polarity so text never blends into a bright photo),
 *   4. a WCAG contrast floor: the chosen text color vs the EFFECTIVE surface
 *      (photo × scrim/wash) must meet ≥3:1 (large text: price/address/badge)
 *      or ≥4.5:1 (body). The scrim/wash alpha is strengthened first; the text
 *      polarity flips only if the surface cannot reach the floor.
 *
 *   Accent: derived from the photo's dominant hue, constrained to the muted
 *   professional brand family (warm gold / emerald / dusty blue-slate). Used
 *   for price (dark mode), ribbon/pill borders, fact-chip borders, rules and
 *   dividers — replacing the hardcoded gold where a photo is present.
 *
 * DETERMINISM / PERF
 *   All helpers are pure + deterministic. The photo is decoded once at
 *   ≤160px (same cost class as render.ts's SAMPLE_LONG_SIDE sampling).
 */
import { Resvg } from "@resvg/resvg-js";

/** Canvas-fractional zone rect (all 0..1). */
export interface PhotoZone { fx: number; fy: number; fw: number; fh: number; }
export type AccentBucket = "warm" | "green" | "cool" | "neutral";

export interface PhotoAnalysis {
  /** Weighted (Rec.709) average luminance 0..255 per zone key. */
  zoneLum: Record<string, number>;
  /** Whole-photo weighted average luminance 0..255. */
  avgLum: number;
  /** Dominant saturated hue (0..360) or null when the photo is all neutral. */
  hue: number | null;
  /** Mean saturation (0..1) of the dominant cluster. */
  sat: number;
  bucket: AccentBucket;
  /** Derived professional accent hex (muted, brand-adjacent). */
  accentHex: string;
}

const SAMPLE_LONG_SIDE = 160;

/** Muted professional accents, brand-adjacent (DESIGN-TOKENS.md family). */
const ACCENT_HEX: Record<AccentBucket, string> = {
  warm: "#b98a3e",     // brand gold — warm sunlit exteriors, wood tones
  green: "#4f8a6f",    // muted emerald — lawns, treed lots, gardens
  cool: "#6b8fa3",     // dusty blue-slate — sky, water, coastal
  neutral: "#b98a3e",  // brand gold fallback (gray/black-and-white photos)
};

/** Rec.709 weighted luminance (0..255). */
function lumOf(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** sRGB → linear (for WCAG). */
function linearize(c255: number): number {
  const c = c255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG contrast ratio between two 0..255-luminance surfaces (text vs bg). */
export function contrastRatio(textLum: number, bgLum: number): number {
  const lt = linearize(textLum);
  const lb = linearize(bgLum);
  const [hi, lo] = lt >= lb ? [lt, lb] : [lb, lt];
  return (hi + 0.05) / (lo + 0.05);
}

/** RGB → HSL hue (0..360) + saturation (0..1). */
function hueSat(r: number, g: number, b: number): { hue: number; sat: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta < 0.001) return { hue: 0, sat: 0 };
  let h: number;
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
  else h = 60 * ((rn - gn) / delta + 4);
  if (h < 0) h += 360;
  const sat = delta / (1 - Math.abs(max + min - 1)); // HSL sat
  return { hue: h, sat: Number.isFinite(sat) ? Math.min(1, sat) : 0 };
}

function bucketFor(hue: number | null): AccentBucket {
  if (hue === null) return "neutral";
  // warm: reds/oranges/golds (incl. near-360 reds); green: 60..180;
  // cool: 180..330 (blues/teals/purples). Everything else warm by default.
  if (hue >= 60 && hue < 180) return "green";
  if (hue >= 180 && hue < 330) return "cool";
  return "warm";
}

/**
 * Decode a data-URL image at ≤160px and rasterize once. Returns RGBA pixels
 * plus the decode dimensions (or null on any decode failure — callers treat
 * null as "no photo palette" and fall back to the current fixed design).
 */
function decodeSmall(dataUrl: string): { px: Uint8ClampedArray; w: number; h: number } | null {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SAMPLE_LONG_SIDE}" height="${SAMPLE_LONG_SIDE}" viewBox="0 0 ${SAMPLE_LONG_SIDE} ${SAMPLE_LONG_SIDE}"><image href="${dataUrl}" x="0" y="0" width="${SAMPLE_LONG_SIDE}" height="${SAMPLE_LONG_SIDE}" preserveAspectRatio="xMidYMid slice"/></svg>`;
    const rendered = new Resvg(svg).render();
    return { px: new Uint8ClampedArray(rendered.pixels as unknown as ArrayLike<number>), w: SAMPLE_LONG_SIDE, h: SAMPLE_LONG_SIDE };
  } catch {
    return null;
  }
}

/** Weighted avg luminance (0..255) of a fractional zone on the small raster. */
function zoneLuminance(px: Uint8ClampedArray, w: number, h: number, z: PhotoZone): number {
  const x0 = Math.max(0, Math.round(z.fx * w));
  const x1 = Math.min(w - 1, Math.round((z.fx + z.fw) * w) - 1);
  const y0 = Math.max(0, Math.round(z.fy * h));
  const y1 = Math.min(h - 1, Math.round((z.fy + z.fh) * h) - 1);
  let sum = 0, n = 0;
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const i = (y * w + x) * 4;
      sum += lumOf(px[i], px[i + 1], px[i + 2]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Analyze the uploaded photo: per-zone luminance + dominant saturated hue.
 * zones keys are caller-chosen ("price" | "upper" | "body" | …).
 */
export function analyzePhoto(dataUrl: string, zones: Record<string, PhotoZone>): PhotoAnalysis | null {
  const dec = decodeSmall(dataUrl);
  if (!dec) return null;
  const { px, w, h } = dec;
  const zoneLum: Record<string, number> = {};
  for (const [key, z] of Object.entries(zones)) zoneLum[key] = zoneLuminance(px, w, h, z);
  // whole-photo avg
  let avgSum = 0, avgN = 0;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4;
      avgSum += lumOf(px[i], px[i + 1], px[i + 2]);
      avgN++;
    }
  }
  const avgLum = avgN ? avgSum / avgN : 0;
  // Dominant SATURATED cluster (exclude near-neutral: sat < 0.18 or lum < 18
  // → shadows read as neutral; a bright sky or lawn drives the accent).
  const bins = new Map<string, { count: number; hue: number; sat: number }>();
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const { hue, sat } = hueSat(r, g, b);
      if (sat < 0.18 || lumOf(r, g, b) < 18) continue;
      const key = `${Math.round(hue / 15) * 15}`;
      const e = bins.get(key) ?? { count: 0, hue, sat };
      e.count++;
      e.hue = (e.hue * (e.count - 1) + hue) / e.count;
      e.sat = (e.sat * (e.count - 1) + sat) / e.count;
      bins.set(key, e);
    }
  }
  let best: { count: number; hue: number; sat: number } | null = null;
  for (const e of bins.values()) if (!best || e.count > best.count) best = e;
  const hue = best ? best.hue : null;
  const sat = best ? best.sat : 0;
  const bucket = bucketFor(hue);
  return { zoneLum, avgLum, hue, sat, bucket, accentHex: ACCENT_HEX[bucket] };
}

/**
 * Per-zone adaptive palette. mode "dark" → cream/mint text on the dark brand
 * scrim (current design); mode "light" → dark ink on a light cream wash.
 *
 * CONTRAST FLOOR (owner: "guaranteed visible" is non-negotiable):
 *  - large text (price/address/badge) ≥ 3:1 vs the effective surface,
 *  - body ≥ 4.5:1.
 * The surface is the photo luminance at the zone blended with the scrim/wash
 * (scrimSolidLum + washSolidLum are the near-solid scrim/wash colors). If the
 * chosen polarity fails, we first raise the scrim/wash strength so the surface
 * darkens (dark mode) or lightens (light mode); if even the strongest
 * scrim/wash can't clear the floor, the text color shifts (last resort —
 * toward near-black/near-white).
 */
export interface ZonePalette {
  mode: "dark" | "light";
  /** Main text color for this zone (price/address/body segment). */
  textColor: string;
  textLum: number;
  /** Accent for rules/chips/borders in this zone (photo-derived). */
  accent: string;
  /** Effective surface luminance 0..255 AFTER scrim/wash (measured). */
  surfaceLum: number;
  /** Measured WCAG contrast ratio text vs surface. */
  contrast: number;
  /**
   * Scrim/wash coverage (0..1) used to reach the floor. Normalized to a
   * value the call site can turn into alpha (0.55 default; raised when the
   * photo is too bright/dark for the polarity).
   */
  strength: number;
  /** True when the zone needed a polarity flip (bright photo). */
  flipped: boolean;
}

const DARK_SCRIM = { r: 4, g: 16, b: 7 };        // rgba(4,16,7,…)
const LIGHT_WASH = { r: 252, g: 249, b: 240 };    // cream wash rgba(252,249,240,…)

const LARGE_FLOOR = 3.0;
const BODY_FLOOR = 4.5;

export function zonePalette(
  analysis: PhotoAnalysis | null,
  zoneKey: string,
  opts: { type: "large" | "body"; darkText?: string; lightText?: string; darkAccent?: string },
): ZonePalette {
  const floor = opts.type === "body" ? BODY_FLOOR : LARGE_FLOOR;
  const zoneLum = analysis?.zoneLum[zoneKey] ?? 0;
  const accent = analysis ? analysis.accentHex : (opts.darkAccent ?? "#b98a3e");
  const darkText = opts.darkText ?? "#fff5e0"; // cream (current price color)
  const lightText = opts.lightText ?? "#173024"; // brand ink on light wash

  // 1) Polarity choice: bright zone (lum > 150) flips to dark-ink-on-light.
  //    Zones we never measure (photo absent) stay in the current dark mode.
  const flipped = zoneLum > 150;
  if (!flipped) {
    // Dark mode: cream text; strengthen the dark scrim until ≥ floor.
    let strength = 0.58; // matches the mid/bottom scrim coverage in practice
    for (; strength <= 1; strength += 0.07) {
      const surface = (1 - strength) * zoneLum + strength * lumOf(DARK_SCRIM.r, DARK_SCRIM.g, DARK_SCRIM.b);
      if (contrastRatio(lumOf(...hexToRgb(darkText)), surface) >= floor) {
        return { mode: "dark", textColor: darkText, textLum: lumOf(...hexToRgb(darkText)), accent, surfaceLum: surface, contrast: contrastRatio(lumOf(...hexToRgb(darkText)), surface), strength: Math.min(1, strength), flipped: false };
      }
    }
    // Last resort: pure white text.
    const surface = zoneLum * 0 + lumOf(DARK_SCRIM.r, DARK_SCRIM.g, DARK_SCRIM.b);
    return { mode: "dark", textColor: "#ffffff", textLum: 255, accent, surfaceLum: surface, contrast: contrastRatio(255, surface), strength: 1, flipped: false };
  }

  // Bright zone → light mode: dark ink on a light cream wash.
  let strength = 0.55;
  for (; strength <= 0.92; strength += 0.06) {
    const surface = (1 - strength) * zoneLum + strength * lumOf(LIGHT_WASH.r, LIGHT_WASH.g, LIGHT_WASH.b);
    if (contrastRatio(lumOf(...hexToRgb(lightText)), surface) >= floor) {
      return { mode: "light", textColor: lightText, textLum: lumOf(...hexToRgb(lightText)), accent, surfaceLum: surface, contrast: contrastRatio(lumOf(...hexToRgb(lightText)), surface), strength, flipped: true };
    }
  }
  // Last resort: near-black text on a full cream wash (essentially a light card).
  const surface = zoneLum * 0.12 + lumOf(LIGHT_WASH.r, LIGHT_WASH.g, LIGHT_WASH.b) * 0.88;
  return { mode: "light", textColor: "#0d1a12", textLum: lumOf(13, 26, 18), accent, surfaceLum: surface, contrast: contrastRatio(lumOf(13, 26, 18), surface), strength: 0.92, flipped: true };
}

/**
 * Global (whole-photo) palette — drives the full-image scrim direction and the
 * default accent for the ribbon/pill/chips/divider when no per-zone override
 * is needed. Photo absent → the current fixed dark design (no change).
 */
export function globalPalette(analysis: PhotoAnalysis | null, opts: { accent?: string } = {}): {
  mode: "dark" | "light";
  accent: string;
  avgLum: number;
} {
  if (!analysis) return { mode: "dark", accent: opts.accent ?? "#b98a3e", avgLum: 0 };
  return {
    mode: analysis.avgLum > 150 ? "light" : "dark",
    accent: analysis.accentHex,
    avgLum: analysis.avgLum,
  };
}