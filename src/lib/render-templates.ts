import { createElement as h } from "react";
import type { TemplateRegion } from "./prompts";
import { resolveRegionTypography } from "./font-match";
import opentype, { type OpentypeFont } from "@shuding/opentype.js";
import type { FontMetricsMap, GlyphMetrics, GlyphMetricsMap } from "./render";
import { brandedMarketingTemplate } from "./branded-templates";

export type RenderType = "flyer" | "social";
export interface TemplateReplicaInput {
  templateImage: string;
  templateRegions: TemplateRegion[];
  /** Current values supplied by the editor, keyed by detected text-region id. */
  regionText: Record<string, string>;
  /** Optional prompt/upload replacements keyed by detected image-region id. */
  regionImages?: Record<string, string>;
  /** Natural dimensions of the uploaded template; used to preserve its aspect ratio. */
  templateWidth?: number;
  templateHeight?: number;
  /**
   * Server-resolved opaque surface per text region, sampled from the uploaded
   * template raster so the composited text box blends with the design instead
   * of showing a flat near-black rectangle. Flyer template mode only — social
   * template mode keeps the legacy opaque surface untouched.
   */
  regionBackgrounds?: Record<string, string>;
  /**
   * Server-resolved original lettering color per text region, sampled from the
   * uploaded raster — the dominant color inside the region that differs from
   * the sampled background (i.e. the template's own text color). Used as the
   * composited text color so edited copy matches the template's lettering.
   * Flyer template mode only; social keeps the vision/default color path.
   */
  regionForegrounds?: Record<string, string>;
  /**
   * Server-resolved INPAINTED copy of the template raster (flyer only): the
   * original lettering has been removed pixel-by-pixel from replaced text
   * regions, so each region shows the template's true background and the new
   * text is composited directly on top — no opaque surface box. When present
   * it replaces templateImage as the base layer; otherwise the legacy surface
   * path applies (social unchanged).
   */
  templateImageInpainted?: string;
  /**
   * e51c4b81 Fix 3: per text-region POST-ERASE surface luminance (0-255),
   * measured from the inpainted base. Makes the white-on-white contrast guard
   * surface-aware: flip near-white ink to dark only when the region was truly
   * whitewashed; keep light ink when a dark surface was preserved.
   */
  regionSurfaceLum?: Record<string, number>;
  /**
   * Server-resolved INK bounding box per replaced text region (flyer only):
   * fractional region-local coordinates {fx, fy, fw, fh} ∈ [0,1] of the ORIGINAL
   * lettering's ink extent within the region rect, measured from the same mask
   * that drove the background inpainting. The geometry pass uses it to tighten
   * the compositing box, match the composited font size to the original glyph
   * height, and align the new text to the original baseline/vertical center.
   */
  inkBoxes?: Record<string, InkBox>;
  /**
   * Server-resolved TRUE ink bounds of the old image per IMAGE region (R4 —
   * "old logo doesn't disappear"): TEMPLATE-fractional rect {fx, fy, fw, fh}
   * measured from the raster (the vision region rect is often smaller than the
   * logo's actual ink). The opaque backing behind a replacement is drawn at
   * this rect so the ENTIRE old logo is covered, not just the region rect.
   */
  imageInkBoxes?: Record<string, InkBox>;
}

/** Fractional region-local ink bounding box (see TemplateReplicaInput.inkBoxes).
 *  `lines`/`firstLineFh` (optional, R4 follow-up): when the region's original
 *  lettering spans MULTIPLE text rows, `lines` is the row count and
 *  `firstLineFh` the FIRST row's height (same fh units) — the height fit then
 *  sizes a replacement with FEWER lines to one original row, centered on the
 *  block, instead of inflating it to the whole block. */
export interface InkBox { fx: number; fy: number; fw: number; fh: number; lines?: number; firstLineFh?: number; }

/** The four native (separate-layer, no-erasure) Relevate layouts, matched 1:1
 * with the client's BrandedTemplateId in designed-output.tsx. */
export type BrandedTemplateId =
  | "flyer-hero"
  | "flyer-classic"
  | "social-photo"
  | "social-classic";

export interface RenderTemplateInput {
  type: RenderType;
  /** ACTUAL output canvas size (server-computed outputCanvasSize). The template
   * replica used to hardcode flyer 1275×1650 / social 1080×1080 and laid every
   * absolute layer out in that space — but the real canvas can differ when an
   * uploaded template's natural dimensions drive outputCanvasSize (owner defect
   * 3c6145cf: replacement photos landed off-canvas because the region geometry
   * was computed in the wrong space). These override the hardcoded defaults so
   * replica layout matches the actual satori canvas. */
  outputWidth?: number;
  outputHeight?: number;
  title?: string;
  body: string;
  agentName?: string;
  /** Optional explicit native-layout override. Absent → auto-dispatch by
   * format + photo presence (default) in brandedMarketingTemplate. */
  brandedTemplate?: BrandedTemplateId;
  /**
   * R5 structured listing data (additive, optional — never fabricated): when a
   * value is absent the branded templates fall back to best-effort regex
   * extraction from the body, and when nothing is found the slot is omitted
   * (price hidden, fact chips hidden). Shared field names with R6 listing-photo
   * auto-fill — must not be renamed.
   */
  price?: string;
  beds?: string;
  baths?: string;
  sqft?: string;
  agentPhone?: string;
  imageDataUrl?: string;
  brandStyle?: string;
  /** Server-resolved, non-client design layers. */
  baseBackgroundDataUrl?: string;
  headerBandDataUrl?: string;
  /** When present, uses an untouched raster template as the base layer. */
  templateReplica?: TemplateReplicaInput;
  /** Measured font metrics (ascent/descent/ink in em) per registered family —
   * drives exact ink-box text placement (R4). */
  fontMetrics?: FontMetricsMap;
  /** Measured GLYPH ink metrics (cap/ascender/descender/baseline in em) per
   * registered family — the correct basis for exact text placement (R4:
   * hhea design metrics don't match real glyph ink). */
  glyphMetrics?: GlyphMetricsMap;
  /** Family → weight → font buffer. Enables EXACT text-width measurement with
   * the same @shuding/opentype.js Satori uses for layout, so the ink-exact
   * fit predicts wrapping/overflow exactly (R4: the old 0.65-em advance model
   * under-estimated DejaVu bold caps → unexpected 2-line wrap broke placement). */
  fontData?: Record<string, Record<number, ArrayBuffer>>;
}

export function accentFor(style = "") {
  const value = style.toLowerCase();
  if (/(blue|navy|coastal)/.test(value)) return "#5eb4d8";
  if (/(rose|pink|blush)/.test(value)) return "#dc8b91";
  if (/(silver|gray|grey|modern)/.test(value)) return "#c7d0d5";
  return value.includes("gold") || value.includes("lux") ? "#d4a017" : "#b8860b";
}

/**
 * Standard fallback for designs without an uploaded template — R5 branded mode
 * (real-estate-style layouts, ALL wordage fitted). Implemented in ./branded-templates.ts
 * (Flyer-Hero/Flyer-Classic/Social-Photo/Social-Classic + fitBlockToBox); the old flat
 * forest layout was replaced by the owner-approved R5 redesign. Template-replica mode
 * is untouched.
 */

/**
 * Map the vision-detected font category to the closest bundled DejaVu variant.
 * The bundle carries exactly 6 fonts — DejaVu Sans/Serif/Mono, each in Regular
 * (400) and Bold (700), registered as "Relevate Sans"/"Relevate Serif"/"Relevate
 * Mono". Fidelity limits with this set:
 *  - script/cursive has no true DejaVu equivalent → closest is the Serif face.
 *  - display faces are approximated by the Serif face (headline serifs like
 *    Playfair are the closest match in the bundle).
 *  - italic and Light (300) weights are not bundled; a "light" request resolves
 *    to the nearest registered weight (400) inside Satori/fontkit.
 * Detected color, weight and alignment are honored at the call site.
 */
function fontFamilyFor(region: TemplateRegion) {
  switch (region.fontFamily) {
    case "serif":
    case "script":
    case "display":
      return "Relevate Serif";
    case "mono":
      return "Relevate Mono";
    default:
      return "Relevate Sans";
  }
}

/** Relative luminance (0–255) of a #rrggbb color — used to pick a readable
 * text default against the sampled surface and to guard surface/text contrast. */
function hexLuminance(hex: string) {
  const value = parseInt(hex.replace("#", ""), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function replicaFrame(width: number, height: number, replica: TemplateReplicaInput) {
  const aspect = replica.templateWidth && replica.templateHeight
    ? replica.templateWidth / replica.templateHeight
    : width / height;
  const outputAspect = width / height;
  if (aspect >= outputAspect) {
    const frameWidth = width;
    const frameHeight = width / aspect;
    return { x: 0, y: (height - frameHeight) / 2, width: frameWidth, height: frameHeight, scale: replica.templateWidth ? frameWidth / replica.templateWidth : 1 };
  }
  const frameHeight = height;
  const frameWidth = height * aspect;
  return { x: (width - frameWidth) / 2, y: 0, width: frameWidth, height: frameHeight, scale: replica.templateHeight ? frameHeight / replica.templateHeight : 1 };
}

function regionPadding(boxWidth: number, boxHeight: number) {
  return Math.max(3, Math.round(Math.min(boxWidth, boxHeight) * 0.035));
}

/**
 * INK-EXACT path (R4 — exact placement): when the box is the measured INK box
 * of the original lettering and the bundled GLYPH metrics are known (measured
 * from rendered probe text — cap/ascender/descender ink em), the size is
 * boxHeight / (inkTop + (lines−1)·lineHeight + inkBottom) so the new glyph ink
 * EXACTLY fills the old lettering's ink box (position AND height), and the
 * caller anchors the baseline via glyph.baselineEm. Width overflow (wrapping)
 * reduces the size. This replaces the old 0.82 heuristic AND the failed hhea
 * design-metric model (hhea ink 1.16em ≠ real glyph ink 0.92em).
 */
function glyphInkTop(text: string, g: GlyphMetrics): number {
  // Ascender glyphs raise the ink above cap height; otherwise cap height.
  return /[bdfhklt]/.test(text) ? g.ascEm : g.capEm;
}
function glyphInkBottom(text: string, g: GlyphMetrics): number {
  // Descender glyphs extend below the baseline; caps/digits sit on it.
  return /[gjpqyQ]/.test(text) ? g.descEm : 0;
}

/**
 * EXACT text width via the same @shuding/opentype.js Satori uses for layout —
 * advance sum at `size` + letter-spacing per glyph (conservative +len). Font
 * parse cached per buffer (WeakMap); glyph advance from the cmap/hmtx tables.
 */
const openTypeFontCache = new WeakMap<ArrayBuffer, OpentypeFont>();
function openTypeFont(buf: ArrayBuffer): OpentypeFont {
  let f = openTypeFontCache.get(buf);
  if (!f) {
    f = opentype.parse(buf);
    openTypeFontCache.set(buf, f);
  }
  return f;
}
export function measureTextWidth(text: string, fontBuf: ArrayBuffer | undefined, size: number, ls: number): number {
  if (!fontBuf) return text.length * (size * 0.72 + ls);
  const f = openTypeFont(fontBuf);
  let adv = 0;
  for (const ch of text) adv += f.charToGlyph(ch).advanceWidth;
  // EXACT width (same opentype Satori uses) + 4% safety. The safety covers
  // sub-pixel rounding and bold-vs-regular advance drift; it must stay SMALL —
  // a char-count model here over-shrinks mixed-case/tracked/condensed text
  // (SE gate C3/C6/C11 + hi-res dh regressions all came from that).
  return ((adv * size) / f.unitsPerEm + ls * Math.max(1, text.length)) * 1.04;
}
/** Greedy word-wrap line count at `size` (matches Satori pre-wrap closely). */
function countVisualLines(lines: string[], fontBuf: ArrayBuffer | undefined, size: number, ls: number, width: number): number {
  let total = 0;
  for (const line of lines) {
    const words = line.split(/(\s+)/).filter((w) => w.length > 0);
    let count = 1, w = 0;
    for (const word of words) {
      const ww = measureTextWidth(word, fontBuf, size, ls);
      if (w === 0) w = ww;
      else if (w + ww <= width) w += ww;
      else { count++; w = ww; }
    }
    total += Math.max(1, count);
  }
  return total;
}

function fittedFontSize(text: string, region: TemplateRegion, pixelWidth: number, pixelHeight: number, scale: number, inkFit = false, glyph?: GlyphMetrics, fontBuf?: ArrayBuffer, widthBox?: number): { size: number; lines: number } {
  const ls = (typeof region.letterSpacingPx === "number" ? Math.round(region.letterSpacingPx) : 0) * scale;
  const padding = inkFit ? 0 : regionPadding(pixelWidth, pixelHeight);
  // Fit against the inner (post-padding) box so auto-sized copy never clips.
  const innerWidth = Math.max(40, pixelWidth - padding * 2);
  const innerHeight = Math.max(20, pixelHeight - padding * 2);
  const configured = region.fontSizePx ? region.fontSizePx * scale : innerHeight * 0.31;
  // Count explicit line breaks as separate lines (bullets, contact blocks) and
  // add wrapped lines per segment — collapsing newlines underestimated the
  // rendered height and let copy overflow its region box.
  const lines = text.split("\n").map((line) => line.trim() || " ");
  if (inkFit && glyph) {
    const L = 1.0; // tight line stacking: baselines spaced exactly 1 em
    // Fixed point: the wrapped line count depends on size, size on count.
    // Wrap prediction also uses the REGION box (capWidth) — the ink width is
    // only a height target, not a width limit.
    const capWidth = Math.max(innerWidth, widthBox ?? 0);
    let n = lines.length;
    for (let iter = 0; iter < 12; iter++) {
      const inkSpan = glyphInkTop(text, glyph) + (n - 1) * L + glyphInkBottom(text, glyph);
      const size = Math.min(Math.max(11, pixelHeight / inkSpan), Math.max(11, configured * 2.5));
      const n2 = countVisualLines(lines, fontBuf, size, ls, capWidth);
      if (n2 === n) break;
      n = Math.max(1, n2);
    }
    const inkSpan = glyphInkTop(text, glyph) + (n - 1) * L + glyphInkBottom(text, glyph);
    let size = Math.min(Math.max(11, pixelHeight / inkSpan), Math.max(11, configured * 2.5));
    // Width cap against the REGION box (not the old lettering's ink width):
    // the ink box drives the HEIGHT match; the region box is the real design
    // slot, so tracked/wider copy can legitimately exceed the old ink width
    // without being shrunk into tiny text (SE gate C3 + repro dh regressions).
    const maxW = Math.max(...lines.map((line) => measureTextWidth(line, fontBuf, size, ls)));
    if (maxW > capWidth) size = Math.max(11, Math.floor((size * capWidth * 2) / maxW) / 2);
    return { size: Math.max(11, Math.round(size * 2) / 2), lines: n };
  }
  const max = inkFit ? Math.max(11, configured) : Math.max(11, Math.min(configured, innerHeight * 0.62));
  for (let size = Math.floor(max); size >= 11; size -= 1) {
    const advance = Math.max(4, size * 0.56 + ls);
    const charsPerLine = Math.max(6, Math.floor(innerWidth / advance));
    const visualLines = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    // Height model. Legacy loose-box fit keeps the 1.22 line-box factor (it
    // matches satori's rendered line boxes). INK fit (pre-R4) used the 0.82
    // glyph-ink factor; retained for the no-metrics fallback.
    if (inkFit) {
      if (size * (visualLines * 0.82 + Math.max(0, visualLines - 1) * 0.34) <= innerHeight) return { size, lines: visualLines };
    } else if (visualLines * size * 1.22 <= innerHeight) {
      return { size, lines: visualLines };
    }
  }
  return { size: 11, lines: 1 };
}


/**
 * Pixel-preserving template mode. The source raster is the sole base layer.
 * Only regions explicitly passed by the editor get a text scrim/new copy or a
 * cover-fitted replacement image; all other source-template pixels stay intact.
 */
function templateReplicaTemplate(input: RenderTemplateInput, replica: TemplateReplicaInput) {
  const width = input.outputWidth ?? (input.type === "social" ? 1080 : 1275);
  const height = input.outputHeight ?? (input.type === "social" ? 1080 : 1650);
  const frame = replicaFrame(width, height, replica);
  const textRegions = replica.templateRegions.filter((region) => region.kind === "text" && typeof replica.regionText[region.id] === "string");
  const imageRegions = replica.templateRegions.filter((region) => region.kind === "image" && replica.regionImages?.[region.id]);
  // Flyer background-inpaint fix (owner-approved): the renderer now receives a
  // pixel-level INPAINTED copy of the template (original lettering removed from
  // replaced regions) and composites the new text directly on top — no opaque
  // surface box, the region shows the template's true background pixel-exact.
  // Social template mode is intentionally NOT touched.
  const flyerBlend = input.type === "flyer";
  const inpainted = flyerBlend && typeof replica.templateImageInpainted === "string" && replica.templateImageInpainted.length > 0;
  const baseImage = (inpainted ? replica.templateImageInpainted : replica.templateImage) as string;

  return h("div", { style: { position: "relative", width, height, display: "flex", overflow: "hidden", backgroundColor: "#0b100b" } },
    h("img", { src: baseImage, style: { position: "absolute", top: frame.y, left: frame.x, width: frame.width, height: frame.height, objectFit: "fill" } }),
    ...imageRegions.map((region) => {
      const src = replica.regionImages?.[region.id] as string;
      // FIX 4 backstop (e51c4b81): even if a bad box reaches composite, a
      // non-full-bleed image whose box swallows a text region (>50% of its own
      // area overlapping text) is a detector error — refuse to draw it so it
      // never obscures the replacement text. Full-bleed background photos and
      // additive (editor-added) draws are exempt.
      {
        const big = region.w > 0.25 && region.h > 0.25;
        const fullBleed = region.label === "photo" && region.w > 0.85 && region.h > 0.85;
        if (big && !fullBleed && !region.additive) {
          const iarea = region.w * region.h;
          for (const t of textRegions) {
            const ix = Math.max(0, Math.min(region.x + region.w, t.x + t.w) - Math.max(region.x, t.x));
            const iy = Math.max(0, Math.min(region.y + region.h, t.y + t.h) - Math.max(region.y, t.y));
            if (iarea > 0 && (ix * iy) / iarea > 0.5) return null; // detector error → drop image
          }
        }
      }
      const rt = frame.y + region.y * frame.height;
      const rl = frame.x + region.x * frame.width;
      const rw = region.w * frame.width;
      const rh = region.h * frame.height;
      // R4 logo fix (owner: "old logo doesn't disappear, new upload not shown
      // in full"): (a) an OPAQUE backing of the sampled card color sits under
      // the replacement so a transparent-backed logo PNG can never ghost the
      // old logo; the backing covers the TRUE old-logo ink bounds measured
      // from the raster (imageInkBoxes — the vision rect is often smaller
      // than the logo, which is why a rect-sized backing left a sliver);
      // (b) logo labels use objectFit contain so the FULL new logo is visible
      // (cover cropped it); photo labels keep cover.
      const backing = replica.regionBackgrounds?.[region.id] ?? "#ffffff";
      const fit = region.label === "logo" ? "contain" : "cover";
      const inkB = replica.imageInkBoxes?.[region.id];
      const bTop = frame.y + (inkB ? inkB.fy : region.y) * frame.height;
      const bLeft = frame.x + (inkB ? inkB.fx : region.x) * frame.width;
      const bW = (inkB ? inkB.fw : region.w) * frame.width;
      const bH = (inkB ? inkB.fh : region.h) * frame.height;
      // Additive draw-on-top (Aug 20, e121b3fd): a region the editor ADDED (FE
      // ADDED_PREFIX id) has NO pre-existing template content beneath its box,
      // so the opaque ring/backing rect that normally covers an old logo would
      // instead ERASE the real underlying design. Additive image regions skip
      // the backing entirely and composite pure draw-on-top (image fills the
      // box as-is); only DETECTED image regions keep the backing.
      return region.additive
        ? [
            h("img", { key: `image-${region.id}`, src, style: { position: "absolute", top: rt, left: rl, width: rw, height: rh, objectFit: fit } }),
          ]
        : [
            h("div", { key: `back-${region.id}`, style: { position: "absolute", top: bTop, left: bLeft, width: bW, height: bH, backgroundColor: backing } }),
            h("img", { key: `image-${region.id}`, src, style: { position: "absolute", top: rt, left: rl, width: rw, height: rh, objectFit: fit } }),
          ];
    }),
    ...textRegions.map((region) => {
      const text = replica.regionText[region.id];
      const boxWidth = region.w * frame.width;
      const boxHeight = region.h * frame.height;
      const align = region.align ?? "left";
      // Ink-box geometry (Aug 13, round 2 + R4): when the template was inpainted
      // we know the ORIGINAL lettering's ink extent per region — tighten the
      // compositing box to it (no loose padding). R4 refined the model: the font
      // size reproduces the ink height exactly (measured font metrics) and the
      // baseline is anchored to the old lettering (see the R4 block below).
      // Falls back to the full region rect when the ink wasn't measured
      // (social / non-inpainted flyer fallback).
      const ink = inpainted && replica.inkBoxes?.[region.id] ? replica.inkBoxes[region.id] : undefined;
      const gx = ink ? ink.fx : 0;
      const gy = ink ? ink.fy : 0;
      const gw = ink ? Math.max(0.02, ink.fw) : 1;
      const gh = ink ? Math.max(0.02, ink.fh) : 1;
      const tightWidth = gw * boxWidth;
      const tightHeight = gh * boxHeight;
      // Text style & color fidelity (Aug 13, style/color workstream): flyer text
      // regions resolve their detected typography through font-match.ts — bold →
      // 700, everything else → the registered 400 ("light" no longer requests an
      // unregistered 300; pixel output identical), letterSpacingPx → a px
      // tracking string, uppercase/small-caps → content uppercased in JS.
      // Social template mode intentionally keeps the legacy inline computation
      // so its renders stay byte-identical (owner parked social).
      const typography = flyerBlend ? resolveRegionTypography(region, text) : undefined;
      const displayText = typography?.content ?? text;
      const fontWeight = typography?.fontWeight ?? (region.fontWeight === "bold" ? 700 : region.fontWeight === "light" ? 300 : 400);
      const fontFamily = typography?.fontFamily ?? fontFamilyFor(region);
      // Background: when the template was INPAINTED (flyer) the old lettering is
      // physically gone, so the text div is transparent and the inpainted base
      // shows the template's true background pixel-exact. Fallback modes keep the
      // opaque surface (sampled local background for flyer, legacy #071307 for
      // social) so old glyphs never ghost through beneath edited copy.
      // ADDITIVE regions (Aug 20, e121b3fd) are editor-ADDED boxes over existing
      // content with NO template lettering underneath — an opaque surface would
      // ERASE the real design under the box, so additive text is always
      // transparent (pure draw-on-top over existing pixels).
      const surface = region.additive ? undefined : (inpainted ? undefined : (flyerBlend && replica.regionBackgrounds?.[region.id] ? replica.regionBackgrounds[region.id] : "#071307"));
      // Text color: sampled template lettering (flyer) → vision-detected
      // textColor → luminance-aware default for the actual surface (light
      // surface → dark text, dark surface → light text). Social template mode
      // keeps the vision/default path so its renders stay identical.
      const sampledText = flyerBlend && replica.regionForegrounds?.[region.id] ? replica.regionForegrounds[region.id] : undefined;
      let color = sampledText || region.textColor || (hexLuminance(surface ?? "#071307") > 150 ? "#1a1d21" : "#ffffff");
      // FIX 3 (e51c4b81): white-on-white contrast guard. On the uploaded-template
      // aggressive path the lettering box is white-FILLED before the new text is
      // composited (a clean, deterministic surface). Vision often reports
      // near-white ink (#ffffff) because the ORIGINAL lettering sat on a dark
      // flame surface — composite on the now-white base that ink would be
      // invisible. When the box was white-filled (inpainted + no opaque backing
      // under the text) and the resolved ink is near-white, flip to a deep dark
      // so the replacement is readable.
      if (inpainted && surface === undefined && hexLuminance(color) > 200) {
        // SURFACE-AWARE (e51c4b81 reconciliation): the guard only flips when
        // the erased box was actually whitewashed. Under Fix 2's ink-masked
        // erase a DARK surface can be preserved (e.g. dark flyer cream
        // lettering) — there light ink stays correct and flipping to dark
        // would create dark-on-dark. Fallback with no measurement: don't flip
        // (conservative — preserve the legit light-on-dark sample).
        const surf = replica.regionSurfaceLum?.[region.id];
        if (surf !== undefined && surf > 160) {
          color = "#173024";
        }
      }
      // R4 EXACT PLACEMENT (lead bar: composited box vs original lettering ink
      // Δ ≤ 2px). When the ink box is known AND the measured GLYPH metrics are
      // available (cap/ascender/descender ink em, probed from rendered text),
      // the font size makes the new glyph ink EXACTLY fill the old lettering's
      // ink box (content-aware: ascenders raise the ink top, descenders extend
      // the bottom) and the baseline is anchored via the measured baselineEm.
      // The R2 model centered a 1.22 line box (sub copy sat 6px low); the first
      // hhea-based model mis-sized copy (real glyph ink ≠ hhea design ink).
      // Fallback (no ink / no metrics — social byte-identity, flyer fallback
      // surface) keeps the legacy model.
      const glyph = input.glyphMetrics?.[fontFamily];
      const inkExact = !!(ink && glyph && inpainted);
      // Width measurement uses the RENDERED text (transforms applied) and the
      // actual font buffer (family + weight) so wrap prediction is exact.
      const fontBuf = input.fontData?.[fontFamily]?.[fontWeight] ?? input.fontData?.[fontFamily]?.[400];
      // R4 follow-up (light-template placement): when the ORIGINAL lettering
      // block spans multiple text rows and the replacement has fewer lines, the
      // height target is ONE original row (the first line's height) and the
      // copy centers on the whole block — a single line replacing a 3-line
      // card must match the card's line size, not the block height.
      const oldLines = ink?.lines ?? 1;
      const lsPx = (typeof region.letterSpacingPx === "number" ? Math.round(region.letterSpacingPx) : 0) * frame.scale;
      if (ink && glyph && oldLines > 1 && !displayText.includes("\n")) {
        // Single-line replacement into a multi-line original block: size to the
        // FIRST original row's height and center the copy on the block.
        const lineH = (ink.firstLineFh ?? ink.fh / oldLines) * boxHeight;
        const centerShift = (tightHeight - lineH) / 2;
        const fit = fittedFontSize(displayText, region, tightWidth, lineH, frame.scale, true, glyph, fontBuf, boxWidth);
        const fontSize = fit.size;
        const inkTop = frame.y + (region.y + gy * region.h) * frame.height;
        const inkLeft = frame.x + (region.x + gx * region.w) * frame.width;
        const divTop = inkTop + centerShift - fontSize * (glyph.baselineEm - glyphInkTop(displayText, glyph));
        const textW = measureTextWidth(displayText, fontBuf, fontSize, lsPx);
        const divW = Math.max(tightWidth, Math.min(textW, boxWidth));
        const divHeight = Math.max(lineH, fontSize * fit.lines);
        return h("div", { key: `text-${region.id}`, style: { position: "absolute", top: divTop, left: inkLeft, width: divW, height: divHeight, padding: 0, display: "flex", flexDirection: "column", justifyContent: "flex-start", overflow: "hidden", ...(surface !== undefined ? { backgroundColor: surface } : {}), color, fontFamily, fontSize, fontWeight, ...(typography?.letterSpacing ? { letterSpacing: typography.letterSpacing } : {}), lineHeight: 1.0, textAlign: align, whiteSpace: "pre-wrap" } }, displayText);
      }
      const fit = inkExact
        ? fittedFontSize(displayText, region, tightWidth, tightHeight, frame.scale, true, glyph, fontBuf, boxWidth)
        : fittedFontSize(displayText, region, tightWidth, tightHeight, frame.scale, !!ink);
      const fontSize = fit.size;
      const inkTop = frame.y + (region.y + gy * region.h) * frame.height;
      const inkLeft = frame.x + (region.x + gx * region.w) * frame.width;
      const lineHeight = inkExact ? 1.0 : 1.22;
      const divTop = inkExact
        ? inkTop - fontSize * (glyph.baselineEm - glyphInkTop(displayText, glyph))
        : inkTop;
      // R4 clip fix: with a tight lineHeight the LINE box (1 em per line) can
      // exceed the ink box (ink ≈ 0.72–1.1 em) — a div capped at the ink-box
      // height clipped the bottom of single-line caps. Height = ink box ∪ line
      // boxes (invisible overflow — the div is transparent over the inpainted
      // base). The FIRST baseline is anchored regardless of the div height.
      const divHeight = inkExact ? Math.max(tightHeight, fontSize * fit.lines) : tightHeight;
      // R4 follow-up (C3/C6/C11 + tracking): the div must be wide enough for
      // the TRACKED text — a div capped at the old lettering's ink width
      // clipped tracked copy (overflow:hidden). Width = ink box ∪ text width
      // (≤ region box); tracking then grows the ink as the style test expects.
      const textW = inkExact ? measureTextWidth(displayText, fontBuf, fontSize, lsPx) : 0;
      const divW = inkExact ? Math.max(tightWidth, Math.min(textW, boxWidth)) : tightWidth;
      return h("div", { key: `text-${region.id}`, style: { position: "absolute", top: divTop, left: inkLeft, width: divW, height: divHeight, padding: ink ? 0 : regionPadding(boxWidth, boxHeight), display: "flex", flexDirection: "column", justifyContent: inkExact ? "flex-start" : "center", overflow: "hidden", ...(surface !== undefined ? { backgroundColor: surface } : {}), color, fontFamily, fontSize, fontWeight, ...(typography?.letterSpacing ? { letterSpacing: typography.letterSpacing } : {}), lineHeight, textAlign: align, whiteSpace: "pre-wrap" } }, displayText);
    }),
  );
}

export function marketingTemplate(input: RenderTemplateInput) {
  return input.templateReplica
    ? templateReplicaTemplate(input, input.templateReplica)
    : brandedMarketingTemplate(input);
}
