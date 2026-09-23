import satori, { init as satoriInit } from "satori";
import { Resvg } from "@resvg/resvg-js";
import { decode as decodeJpeg } from "jpeg-js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { createElement as h } from "react";
import type { TemplateRegion } from "./prompts";
import { marketingTemplate, type RenderTemplateInput, type RenderType, type TemplateReplicaInput, type InkBox } from "./render-templates";
import { findBracketPlaceholder } from "./placeholder-guard";

export interface RenderRequest extends Omit<RenderTemplateInput, "templateReplica"> {
  type: RenderType;
  templateImage?: string;
  templateRegions?: TemplateRegion[];
  regionText?: Record<string, string>;
  regionImages?: Record<string, string>;
  templateWidth?: number;
  templateHeight?: number;
}

const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url));
const ASSET_PATHS = {
  flyerBackground: [join(BUNDLE_DIR, "assets", "flyer-background.png"), "/home/team/shared/design-assets/flyer-background.png"],
  socialBackground: [join(BUNDLE_DIR, "assets", "social-background.png"), "/home/team/shared/design-assets/social-background.png"],
  flyerHeader: [join(BUNDLE_DIR, "assets", "flyer-header-band.png"), "/home/team/shared/design-assets/flyer-header-band.png"],
  socialHeader: [join(BUNDLE_DIR, "assets", "social-header-band.png"), "/home/team/shared/design-assets/social-header-band.png"],
  regularFont: [join(BUNDLE_DIR, "assets", "DejaVuSans.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
  boldFont: [join(BUNDLE_DIR, "assets", "DejaVuSans-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
  serifFont: [join(BUNDLE_DIR, "assets", "DejaVuSerif.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
  serifBoldFont: [join(BUNDLE_DIR, "assets", "DejaVuSerif-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"],
  monoFont: [join(BUNDLE_DIR, "assets", "DejaVuSansMono.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
  monoBoldFont: [join(BUNDLE_DIR, "assets", "DejaVuSansMono-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"],
  // Round 2 font-variety bundle (Aug 13, OFL from Google Fonts — see
  // /home/team/shared/design-assets/fonts/ for the OFL.txt files):
  displayFont: [join(BUNDLE_DIR, "assets", "PlayfairDisplay-Regular.ttf"), "/home/team/shared/design-assets/fonts/PlayfairDisplay-Regular.ttf"],
  displayBoldFont: [join(BUNDLE_DIR, "assets", "PlayfairDisplay-Bold.ttf"), "/home/team/shared/design-assets/fonts/PlayfairDisplay-Bold.ttf"],
  displayBlackFont: [join(BUNDLE_DIR, "assets", "PlayfairDisplay-Black.ttf"), "/home/team/shared/design-assets/fonts/PlayfairDisplay-Black.ttf"],
  scriptFont: [join(BUNDLE_DIR, "assets", "GreatVibes-Regular.ttf"), "/home/team/shared/design-assets/fonts/GreatVibes-Regular.ttf"],
  condensedFont: [join(BUNDLE_DIR, "assets", "BebasNeue-Regular.ttf"), "/home/team/shared/design-assets/fonts/BebasNeue-Regular.ttf"],
} as const;

async function resolveAsset(candidates: readonly string[]): Promise<Buffer> {
  let lastErr: unknown;
  for (const candidate of candidates) {
    try { return await readFile(candidate); } catch (err) { lastErr = err; }
  }
  throw new Error(`None of the asset paths resolved (${candidates.join(", ")}): ${String(lastErr)}`);
}
/**
 * Bound a Buffer's byte range into its own standalone ArrayBuffer. `buf.buffer`
 * can span a larger shared Node pool when the Buffer is a view (byteOffset>0);
 * passing that whole pool to satori as a font (or to Resvg) can corrupt or
 * fail to parse the face. This yields a correctly-sized copy. Font/asset
 * buffers loaded via readFile are generally standalone, but making this
 * explicit removes a latent prod-only failure class (pool-backed buffers) that
 * would otherwise only manifest on the deployed build.
 */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
/**
 * Ensure Satori's yoga wasm is initialized BEFORE any satori() call. Under a
 * plain `bun run <script>` the auto-init resolves a dist-relative path that
 * does not exist, and in a bundled Vercel function the resolution can differ
 * from local — the exact class of "renders locally but throws on prod" failure
 * seen on `/api/render` (warm 500 "Failed to render PNG"). Mirror render-design.ts:
 * resolve the wasm explicitly when reachable, otherwise let the runtime
 * auto-initialize (bundled Vercel build) as a no-op. Idempotent.
 */
let satoriReady: Promise<void> | undefined;
function ensureSatoriReady(): Promise<void> {
  satoriReady ??= (async () => {
    const candidates = [
      fileURLToPath(new URL("../../node_modules/satori/yoga.wasm", import.meta.url)),
      "/home/team/shared/site/node_modules/satori/yoga.wasm",
    ];
    let wasm: Buffer | undefined;
    for (const c of candidates) {
      try { wasm = await readFile(c); break; } catch { /* try next */ }
    }
    if (!wasm) return; // Vercel bundle / auto-init path.
    try {
      await satoriInit(() => wasm);
    } catch {
      // Already initialized or runtime auto-init owns it — safe no-op.
    }
  })();
  return satoriReady;
}

/** Horizontal typography metrics of a bundled font, in em units (1 em = font size).
 * Parsed once per font from its TrueType head/hhea tables (R4 — exact text
 * placement: the composited copy's ink must fill the measured ink box, and the
 * baseline must land where the template's original lettering sat). */
export interface FontMetrics {
  ascentEm: number;
  descentEm: number;
  inkEm: number;
}
const fontMetricsCache = new Map<Buffer, FontMetrics>();
function fontMetrics(data: Buffer): FontMetrics {
  const hit = fontMetricsCache.get(data);
  if (hit) return hit;
  const u16 = (o: number) => (data[o] << 8) | data[o + 1];
  const u32 = (o: number) => data[o] * 0x1000000 + data[o + 1] * 0x10000 + data[o + 2] * 0x100 + data[o + 3];
  const i16 = (o: number) => { const v = u16(o); return v >= 0x8000 ? v - 0x10000 : v; };
  let headOff = 0, hheaOff = 0;
  const numTables = u16(4);
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(data[o], data[o + 1], data[o + 2], data[o + 3]);
    if (tag === "head") headOff = u32(o + 8);
    else if (tag === "hhea") hheaOff = u32(o + 8);
  }
  const upm = headOff ? u16(headOff + 18) : 1000;
  const ascent = hheaOff ? i16(hheaOff + 4) : 800;
  const descent = hheaOff ? i16(hheaOff + 6) : -200;
  const m: FontMetrics = {
    ascentEm: ascent / upm,
    descentEm: Math.abs(descent) / upm,
    inkEm: (ascent - descent) / upm,
  };
  fontMetricsCache.set(data, m);
  return m;
}
/** Font metrics keyed by the registered family name (the font-match contract). */
export type FontMetricsMap = Record<string, FontMetrics>;

/**
 * Measured GLYPH ink metrics (em units) per bundled family — cap height,
 * ascender ink above baseline, descender ink below baseline, and Satori's
 * baseline offset at lineHeight 1.0. Measured ONCE per font by rendering probe
 * strings at fontSize 100 (lineHeight 1.0, flex-start) and reading back the
 * ink bbox. R4 lesson: hhea DESIGN metrics do not match real glyph ink (DejaVu
 * hhea ink = 1.16em, real glyph ink ≈ 0.92em), which is why the first
 * exact-baseline model mis-sized copy. These measured values drive exact text
 * placement onto the template's original lettering (Δ ≤ 2px target).
 */
export interface GlyphMetrics {
  capEm: number;
  ascEm: number;
  descEm: number;
  baselineEm: number;
}
export type GlyphMetricsMap = Record<string, GlyphMetrics>;
const glyphMetricsCache = new Map<Buffer, Promise<GlyphMetrics>>();
export function measureGlyphMetrics(data: Buffer): Promise<GlyphMetrics> {
  const hit = glyphMetricsCache.get(data);
  if (hit) return hit;
  const p = (async () => {
    await ensureSatoriReady();
    const fonts = [{ name: "Probe", data, weight: 400 as const, style: "normal" as const }];
    async function inkOf(text: string): Promise<{ top: number; bottom: number }> {
      // 40px headroom: ascenders (≈0.92em at FS 100) rise above the line top;
      // without it the probe canvas clipped them and ascEm measured low.
      const svg = await satori(
        h("div", { style: { width: 400, height: 400, backgroundColor: "#000", display: "flex", fontFamily: "Probe", color: "#fff" } },
          h("div", { style: { position: "absolute", top: 40, left: 0, fontSize: 100, lineHeight: 1.0, fontWeight: 400 } }, text)),
        { width: 400, height: 400, fonts },
      );
      const px = new Resvg(svg, { fitTo: { mode: "width", value: 400 } }).render().pixels;
      let top = -1, bottom = -1;
      for (let y = 0; y < 400; y++) {
        for (let x = 0; x < 400; x++) {
          const i = (y * 400 + x) * 4;
          if (px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200) {
            if (top < 0) top = y;
            bottom = y;
          }
        }
      }
      return { top, bottom };
    }
    // "H": caps sit on the baseline → baseline ≈ H.bottom; cap = H span.
    // "b"/"l": their TOP reaches the ascender (l = clean stem, b = stem+bowl)
    // → asc = max over probes of (H.bottom − top).
    // "p": its BOTTOM reaches the descender → desc = (p.bottom − H.bottom).
    const hh = await inkOf("H");
    const pp = await inkOf("p");
    const bb = await inkOf("b");
    const ll = await inkOf("l");
    const capEm = (hh.bottom - hh.top) / 100;
    const ascEm = Math.max(capEm, (hh.bottom - bb.top) / 100, (hh.bottom - ll.top) / 100);
    const descEm = Math.max(0.01, (pp.bottom - hh.bottom) / 100);
    // Probe div sits at top:40 — baseline is measured relative to the LINE TOP.
    const g: GlyphMetrics = { capEm, ascEm, descEm, baselineEm: (hh.bottom - 40) / 100 };
    return g;
  })();
  glyphMetricsCache.set(data, p);
  return p;
}

type RenderAssets = {
  flyerBackground: string; socialBackground: string; flyerHeader: string; socialHeader: string;
  regularFont: Buffer; boldFont: Buffer; serifFont: Buffer; serifBoldFont: Buffer; monoFont: Buffer; monoBoldFont: Buffer;
  displayFont: Buffer; displayBoldFont: Buffer; displayBlackFont: Buffer; scriptFont: Buffer; condensedFont: Buffer;
  fontMetrics: FontMetricsMap;
  glyphMetrics: GlyphMetricsMap;
  /** Family → weight → font buffer, for EXACT text-width measurement (R4:
   * same @shuding/opentype.js Satori uses for layout, so wrap prediction
   * matches the render 1:1). */
  fontData: Record<string, Record<number, ArrayBuffer>>;
};
/**
 * Precomputed glyph metrics (capEm/ascEm/descEm/baselineEm) for the six bundled
 * fonts (task 7a71a97b — cold-start reduction). These are DETERMINISTIC per font
 * file and identical to what `measureGlyphMetrics()` derives at runtime — the
 * values below were measured directly from the actual bundle fonts (the same
 * fonts `getRenderAssets` loads), verified via the render-regression gate after
 * wiring. Using them skips the ~24 Satori/Resvg passes (≈650ms) a cold instance
 * would otherwise run on its first render just to fit text. If a bundled font
 * file ever changes, recompute (scripts/precompute-glyph-metrics.ts) and update
 * this table — do not leave a stale entry silently driving layout.
 */
const PRECOMPUTED_GLYPH_METRICS: Record<string, GlyphMetrics> = {
  "Relevate Sans": { capEm: 0.72, ascEm: 0.75, descEm: 0.2, baselineEm: 0.84 },
  "Relevate Serif": { capEm: 0.72, ascEm: 0.75, descEm: 0.2, baselineEm: 0.84 },
  "Relevate Mono": { capEm: 0.72, ascEm: 0.75, descEm: 0.2, baselineEm: 0.84 },
  "Relevate Display": { capEm: 0.69, ascEm: 0.77, descEm: 0.18, baselineEm: 0.91 },
  "Relevate Script": { capEm: 0.96, ascEm: 0.96, descEm: 0.01, baselineEm: 0.89 },
  "Relevate Condensed": { capEm: 0.69, ascEm: 0.69, descEm: 0.01, baselineEm: 0.79 },
};
let renderAssets: Promise<RenderAssets> | undefined;
async function getRenderAssets() {
  renderAssets ??= Promise.all([
    resolveAsset(ASSET_PATHS.flyerBackground), resolveAsset(ASSET_PATHS.socialBackground),
    resolveAsset(ASSET_PATHS.flyerHeader), resolveAsset(ASSET_PATHS.socialHeader),
    resolveAsset(ASSET_PATHS.regularFont), resolveAsset(ASSET_PATHS.boldFont),
    resolveAsset(ASSET_PATHS.serifFont), resolveAsset(ASSET_PATHS.serifBoldFont),
    resolveAsset(ASSET_PATHS.monoFont), resolveAsset(ASSET_PATHS.monoBoldFont),
    resolveAsset(ASSET_PATHS.displayFont), resolveAsset(ASSET_PATHS.displayBoldFont),
    resolveAsset(ASSET_PATHS.displayBlackFont), resolveAsset(ASSET_PATHS.scriptFont), resolveAsset(ASSET_PATHS.condensedFont),
  ]).then(([flyerBackground, socialBackground, flyerHeader, socialHeader, regularFont, boldFont, serifFont, serifBoldFont, monoFont, monoBoldFont, displayFont, displayBoldFont, displayBlackFont, scriptFont, condensedFont]) => ({
    flyerBackground: `data:image/png;base64,${flyerBackground.toString("base64")}`,
    socialBackground: `data:image/png;base64,${socialBackground.toString("base64")}`,
    flyerHeader: `data:image/png;base64,${flyerHeader.toString("base64")}`,
    socialHeader: `data:image/png;base64,${socialHeader.toString("base64")}`,
    regularFont, boldFont, serifFont, serifBoldFont, monoFont, monoBoldFont,
    displayFont, displayBoldFont, displayBlackFont, scriptFont, condensedFont,
    fontMetrics: {
      "Relevate Sans": fontMetrics(regularFont),
      "Relevate Serif": fontMetrics(serifFont),
      "Relevate Mono": fontMetrics(monoFont),
      "Relevate Display": fontMetrics(displayFont),
      "Relevate Script": fontMetrics(scriptFont),
      "Relevate Condensed": fontMetrics(condensedFont),
    },
  })).then(async (assets) => {
    const needs = (["Relevate Sans", "Relevate Serif", "Relevate Mono", "Relevate Display", "Relevate Script", "Relevate Condensed"] as const)
      .filter((k) => !PRECOMPUTED_GLYPH_METRICS[k]);
    // Cold-start fast path: the six bundled fonts are pinned and their glyph
    // metrics are deterministic, so we skip the ~24 Satori passes entirely.
    // Only a family MISSING from the precompute table (i.e. a font changed
    // without updating it) falls back to the runtime measurement.
    const fallback: Record<string, GlyphMetrics> = {};
    if (needs.length > 0) {
      const bufs: Record<string, Buffer> = {
        "Relevate Sans": assets.regularFont, "Relevate Serif": assets.serifFont, "Relevate Mono": assets.monoFont,
        "Relevate Display": assets.displayFont, "Relevate Script": assets.scriptFont, "Relevate Condensed": assets.condensedFont,
      };
      const measured = await Promise.all(needs.map(async (k) => [k, await measureGlyphMetrics(bufs[k])] as const));
      for (const [k, g] of measured) fallback[k] = g;
    }
    const glyphMetrics: GlyphMetricsMap = {
      "Relevate Sans": PRECOMPUTED_GLYPH_METRICS["Relevate Sans"] ?? fallback["Relevate Sans"],
      "Relevate Serif": PRECOMPUTED_GLYPH_METRICS["Relevate Serif"] ?? fallback["Relevate Serif"],
      "Relevate Mono": PRECOMPUTED_GLYPH_METRICS["Relevate Mono"] ?? fallback["Relevate Mono"],
      "Relevate Display": PRECOMPUTED_GLYPH_METRICS["Relevate Display"] ?? fallback["Relevate Display"],
      "Relevate Script": PRECOMPUTED_GLYPH_METRICS["Relevate Script"] ?? fallback["Relevate Script"],
      "Relevate Condensed": PRECOMPUTED_GLYPH_METRICS["Relevate Condensed"] ?? fallback["Relevate Condensed"],
    };
    const fontData: Record<string, Record<number, ArrayBuffer>> = {
      "Relevate Sans": { 400: toArrayBuffer(assets.regularFont), 700: toArrayBuffer(assets.boldFont) },
      "Relevate Serif": { 400: toArrayBuffer(assets.serifFont), 700: toArrayBuffer(assets.serifBoldFont) },
      "Relevate Mono": { 400: toArrayBuffer(assets.monoFont), 700: toArrayBuffer(assets.monoBoldFont) },
      "Relevate Display": { 400: toArrayBuffer(assets.displayFont), 700: toArrayBuffer(assets.displayBoldFont) },
      "Relevate Script": { 400: toArrayBuffer(assets.scriptFont) },
      "Relevate Condensed": { 400: toArrayBuffer(assets.condensedFont) },
    };
    return { ...assets, glyphMetrics, fontData };
  });
  return renderAssets;
}

const validLabels = new Set(["headline", "subheadline", "body", "bullets", "contact", "cta", "footer", "photo", "logo", "headshot", "mascot", "art", "other"]);
const validFamilies = new Set(["serif", "sans-serif", "script", "display", "condensed", "mono"]);
const validWeights = new Set(["normal", "bold", "light"]);
const validAlignments = new Set(["left", "center", "right"]);
function validImage(value: unknown) {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/i.test(value) && value.length <= 5_600_000;
}
function sanitizeRegions(value: unknown): TemplateRegion[] | null {
  if (!Array.isArray(value) || value.length > 24) return null;
  const ids = new Set<string>();
  const result: TemplateRegion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(item.id) || ids.has(item.id)) return null;
    if ((item.kind !== "text" && item.kind !== "image") || typeof item.label !== "string" || !validLabels.has(item.label)) return null;
    const x = Number(item.x), y = Number(item.y), w = Number(item.w), h = Number(item.h);
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w < 0.015 || h < 0.015 || x + w > 1 || y + h > 1) return null;
    if (item.textColor != null && (typeof item.textColor !== "string" || !/^#[0-9a-f]{6}$/i.test(item.textColor))) return null;
    if (item.fontFamily != null && (typeof item.fontFamily !== "string" || !validFamilies.has(item.fontFamily))) return null;
    if (item.fontWeight != null && (typeof item.fontWeight !== "string" || !validWeights.has(item.fontWeight))) return null;
    if (item.align != null && (typeof item.align !== "string" || !validAlignments.has(item.align))) return null;
    if (item.fontSizePx != null && (!Number.isFinite(Number(item.fontSizePx)) || Number(item.fontSizePx) < 8 || Number(item.fontSizePx) > 300)) return null;
    // Text style & color fidelity fields (added Aug 13, style/color workstream):
    // strict validation mirrors the sibling fields — italic must be boolean,
    // letterSpacingPx a finite px within −20…200, textTransform a strict enum.
    if (item.italic != null && typeof item.italic !== "boolean") return null;
    if (item.letterSpacingPx != null && (!Number.isFinite(Number(item.letterSpacingPx)) || Number(item.letterSpacingPx) < -20 || Number(item.letterSpacingPx) > 200)) return null;
    if (item.textTransform != null && (typeof item.textTransform !== "string" || !["uppercase", "small-caps", "none"].includes(item.textTransform))) return null;
    // additive flag (Aug 20, e121b3fd): editor-ADDED regions (FE ADDED_PREFIX
    // ids) composite pure draw-on-top. Accept only an explicit boolean.
    if (item.additive != null && typeof item.additive !== "boolean") return null;
    ids.add(item.id);
    result.push({ id: item.id, kind: item.kind, label: item.label as TemplateRegion["label"], x, y, w, h, ...(typeof item.textColor === "string" ? { textColor: item.textColor } : {}), ...(typeof item.fontFamily === "string" ? { fontFamily: item.fontFamily as TemplateRegion["fontFamily"] } : {}), ...(typeof item.fontWeight === "string" ? { fontWeight: item.fontWeight as TemplateRegion["fontWeight"] } : {}), ...(typeof item.fontSizePx === "number" ? { fontSizePx: item.fontSizePx } : {}), ...(typeof item.align === "string" ? { align: item.align as TemplateRegion["align"] } : {}), ...(typeof item.italic === "boolean" ? { italic: item.italic } : {}), ...(Number.isFinite(Number(item.letterSpacingPx)) ? { letterSpacingPx: Math.max(-20, Math.min(200, Math.round(Number(item.letterSpacingPx)))) } : {}), ...(typeof item.textTransform === "string" && ["uppercase", "small-caps", "none"].includes(item.textTransform) ? { textTransform: item.textTransform as TemplateRegion["textTransform"] } : {}), ...(item.additive === true ? { additive: true } : {}) });
  }
  return result;
}

export function validateRenderRequest(value: unknown): { ok: true; data: RenderRequest } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "JSON body is required" };
  const raw = value as Record<string, unknown>;
  if (raw.type !== "flyer" && raw.type !== "social") return { ok: false, error: "type must be flyer or social" };
  // In template-replica mode the composited copy comes from regionText and body
  // is a fallback only — require it there, but be lenient with its length so a
  // long pasted textarea can't block a template render it doesn't drive.
  if (raw.body == null) {
    if (!raw.templateImage) return { ok: false, error: "body must be 1–5000 characters" };
  } else if (typeof raw.body !== "string" || raw.body.length < 1 || raw.body.length > (raw.templateImage ? 20000 : 5000)) {
    return { ok: false, error: "body must be 1–5000 characters" };
  }
  for (const key of ["title", "agentName", "brandStyle"] as const) if (raw[key] != null && (typeof raw[key] !== "string" || raw[key].length > 500)) return { ok: false, error: `${key} must be a short string` };
  // R5 structured listing data (additive, optional): short display strings only.
  for (const key of ["price", "beds", "baths", "sqft", "agentPhone"] as const) if (raw[key] != null && (typeof raw[key] !== "string" || raw[key].length > 80)) return { ok: false, error: `${key} must be a short string` };
  // Disclosure-footer fields (task 834b0e71, additive + optional): short
  // user-supplied strings, a 2-letter jurisdiction, and strict booleans. All
  // absent → identical behaviour to before (EHO footer defaults ON in the
  // template layer; empty disclosure fields render nothing).
  for (const key of ["brokerageName", "agentLicense", "brokerName", "brokerLicense"] as const) if (raw[key] != null && (typeof raw[key] !== "string" || raw[key].length > 80)) return { ok: false, error: `${key} must be a short string` };
  if (raw.jurisdiction != null && (typeof raw.jurisdiction !== "string" || !/^[A-Za-z]{2}$/.test(raw.jurisdiction))) return { ok: false, error: "jurisdiction must be a 2-letter state code" };
  for (const key of ["narMember", "ehoFooter", "ehoMark"] as const) if (raw[key] != null && typeof raw[key] !== "boolean") return { ok: false, error: `${key} must be a boolean` };
  if (raw.imageDataUrl != null && !validImage(raw.imageDataUrl)) return { ok: false, error: "imageDataUrl must be an image base64 data URL under 4 MB" };
  if (raw.templateImage != null && !validImage(raw.templateImage)) return { ok: false, error: "templateImage must be an image base64 data URL under 4 MB" };
  if (raw.templateImage != null) {
    const regions = sanitizeRegions(raw.templateRegions);
    if (!regions?.length) return { ok: false, error: "templateRegions must contain up to 24 valid template regions" };
    if (!raw.regionText || typeof raw.regionText !== "object" || Array.isArray(raw.regionText)) return { ok: false, error: "regionText is required for template rendering" };
    for (const [id, text] of Object.entries(raw.regionText as Record<string, unknown>)) if (!regions.some((region) => region.id === id && region.kind === "text") || typeof text !== "string" || text.length > 1200) return { ok: false, error: "regionText contains an invalid text-region value" };
    if (raw.regionImages != null) {
      if (typeof raw.regionImages !== "object" || Array.isArray(raw.regionImages)) return { ok: false, error: "regionImages must be an image-region map" };
      for (const [id, image] of Object.entries(raw.regionImages as Record<string, unknown>)) if (!regions.some((region) => region.id === id && region.kind === "image") || !validImage(image)) return { ok: false, error: "regionImages contains an invalid image-region value" };
    }
    for (const key of ["templateWidth", "templateHeight"] as const) if (raw[key] != null && (!Number.isFinite(Number(raw[key])) || Number(raw[key]) < 64 || Number(raw[key]) > 10000)) return { ok: false, error: `${key} must be a valid source-image dimension` };
  }
  // Bracketed-placeholder guard (task fa4a26ae): REFUSE bracketed placeholder
  // tokens at the render boundary — the last line of defense before a
  // deliverable. The generation stage strips silently (copy is still editable
  // there, see ai.ts); by the time text reaches this validator it is meant to
  // be final, so a bracket token means something upstream failed and must
  // surface loudly (HTTP 400 naming the field and token) instead of printing
  // "[Your Phone Number]" on a finished flyer. jurisdiction is regex-validated
  // (2 letters) and the remaining fields are booleans/images, so they are not
  // checked.
  for (const key of ["body", "title", "agentName", "brandStyle", "price", "beds", "baths", "sqft", "agentPhone", "brokerageName", "agentLicense", "brokerName", "brokerLicense"] as const) {
    if (typeof raw[key] === "string") {
      const token = findBracketPlaceholder(raw[key] as string);
      if (token) return { ok: false, error: `${key} contains a bracketed placeholder ${token} — remove it or supply the real value, then render again.` };
    }
  }
  if (raw.regionText != null && typeof raw.regionText === "object" && !Array.isArray(raw.regionText)) {
    for (const [id, text] of Object.entries(raw.regionText as Record<string, string>)) {
      if (typeof text === "string") {
        const token = findBracketPlaceholder(text);
        if (token) return { ok: false, error: `regionText[${id}] contains a bracketed placeholder ${token} — remove it or supply the real value, then render again.` };
      }
    }
  }
  return { ok: true, data: raw as unknown as RenderRequest };
}

/**
 * Output canvas resolution for a template render (R4 — kill fuzz):
 * when the uploaded template's aspect ratio approximately matches the requested
 * format (flyer portrait / social square), render at the template's NATIVE
 * resolution so the returned PNG is not downscaled (the owner's "fuzzy" — a
 * 2550×3300 template came back 1275×1650). Templates whose aspect differs
 * (letterbox case) keep the fixed canvas so the frame contract is unchanged.
 * Long side is capped for serverless memory (8.5×11 @ 300dpi = 2550×3300
 * passes through; bigger templates scale down proportionally).
 * Small templates get a FLOOR (Aug 14, owner render-500 fix): template-replica
 * renders with TEXT regions panic resvg (native SIGABRT → 500) when the output
 * canvas is tiny — Satori emits degenerate line-box geometry below ~600px long
 * side (geom.rs:27 unwrap). Scale those outputs UP to MIN_OUTPUT_LONG_SIDE,
 * aspect preserved (300×388 → 619×800; regions are fractions of the frame, so
 * the layout scales cleanly). Letterboxed and non-replica paths are untouched.
 */
const MIN_OUTPUT_LONG_SIDE = 800;
const MAX_OUTPUT_LONG_SIDE = 4096;
function outputCanvasSize(input: RenderRequest, templateReplica: TemplateReplicaInput | undefined): { width: number; height: number } {
  const baseWidth = input.type === "social" ? 1080 : 1275;
  const baseHeight = input.type === "social" ? 1080 : 1650;
  if (!templateReplica?.templateWidth || !templateReplica?.templateHeight) return { width: baseWidth, height: baseHeight };
  const tw = templateReplica.templateWidth;
  const th = templateReplica.templateHeight;
  const aspectDelta = Math.abs(tw / th - baseWidth / baseHeight) / (baseWidth / baseHeight);
  if (aspectDelta > 0.12) return { width: baseWidth, height: baseHeight }; // letterbox case
  const longSide = Math.max(tw, th);
  if (longSide < MIN_OUTPUT_LONG_SIDE) {
    const s = MIN_OUTPUT_LONG_SIDE / longSide;
    return { width: Math.max(64, Math.round(tw * s)), height: Math.max(64, Math.round(th * s)) };
  }
  if (longSide > MAX_OUTPUT_LONG_SIDE) {
    const s = MAX_OUTPUT_LONG_SIDE / longSide;
    return { width: Math.max(64, Math.round(tw * s)), height: Math.max(64, Math.round(th * s)) };
  }
  return { width: Math.round(tw), height: Math.round(th) };
}
// ---------------------------------------------------------------------------
// JPEG→PNG + WebP→PNG normalization guards (R5 prerequisite; WebP Aug 14).
// Satori AND resvg both fail on JPEG data URLs — Satori throws "RangeError:
// Out of bounds access", resvg silently renders black. gpt-image-1 returns
// JPEG and phone-camera uploads are JPEG, so any image that can reach the
// compositor is re-encoded to PNG here, before Satori/resvg ever see it.
// Satori ALSO throws "Invalid WebP" on WebP data URLs (resvg decodes WebP
// fine), so WebP inputs are re-encoded through an SVG-wrap Resvg render.
// Decoder: jpeg-js (pure JS, zero native deps → safe inside the Vercel
// `bun build` bundle; encodePng below is the same RGBA→PNG encoder the
// renderer already uses for inpainting). PNG inputs and everything else
// return UNCHANGED — the fast path is byte-identical.
// ---------------------------------------------------------------------------
const JPEG_DATA_URL = /^data:image\/(?:jpeg|pjpeg);base64,/i;
const WEBP_DATA_URL = /^data:image\/webp;base64,/i;
/** Native pixel size of a WebP container, parsed from its chunk headers
 *  (VP8X extended, VP8L lossless, VP8 lossy). Returns null when the buffer
 *  is not a recognizable WebP. RFC-style offsets, verified against fixtures
 *  for all three chunk types. */
function webpNativeSize(buf: Buffer): { width: number; height: number } | null {
  // VP8L needs only 25 bytes total (20-byte RIFF/WEBP+chunk header, 1-byte
  // signature, 4-byte packed dims); VP8X/VP8 each re-check >= 30 below.
  if (buf.length < 25 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const tag = buf.toString("ascii", 12, 16);
  if (tag === "VP8X" && buf.length >= 30) return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (tag === "VP8L" && buf.length >= 25 && buf[20] === 0x2f) {
    const n = buf.readUInt32LE(21);
    return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 };
  }
  if (tag === "VP8 " && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) return { width: buf.readUInt16LE(26), height: buf.readUInt16LE(28) };
  return null;
}
/** Re-encode a WebP data URL to PNG: SVG-wrap the WebP at its native size
 *  (long side capped for serverless memory, mirroring outputCanvasSize) and
 *  rasterize with Resvg, then the same encodePng the JPEG guard uses. On any
 *  failure the input is left UNCHANGED (same contract as the JPEG guard). */
function webpToPngDataUrl(dataUrl: string, b64: string): string {
  try {
    const buf = Buffer.from(b64, "base64");
    const dims = webpNativeSize(buf);
    if (!dims) {
      console.error("WebP header parse failed (input left unchanged):", buf.slice(0, 16).toString("hex"));
      return dataUrl;
    }
    let { width, height } = dims;
    const longSide = Math.max(width, height);
    if (longSide > MAX_OUTPUT_LONG_SIDE) {
      const s = MAX_OUTPUT_LONG_SIDE / longSide;
      width = Math.max(1, Math.round(width * s));
      height = Math.max(1, Math.round(height * s));
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${dataUrl}" x="0" y="0" width="${width}" height="${height}"/></svg>`;
    const pixels = new Resvg(svg).render().pixels;
    const png = encodePng(width, height, Buffer.from(pixels));
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (err) {
    console.error("WebP→PNG normalization failed (input left unchanged):", err);
    return dataUrl;
  }
}
export function normalizeImageDataUrl(dataUrl: string): string {
  if (!JPEG_DATA_URL.test(dataUrl) && !WEBP_DATA_URL.test(dataUrl)) return dataUrl; // no-op fast path (PNG + everything else)
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  // Mislabeled uploads exist (MIME says jpeg/webp, bytes are PNG — e.g.
  // renamed files); Satori crashes decoding PNG bytes as JPEG. Sniff the
  // payload and just fix the prefix in that case.
  const head = Buffer.from(b64.slice(0, 64), "base64");
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    return `data:image/png;base64,${b64}`;
  }
  // Real WebP bytes (RIFF....WEBP) — Satori can't decode them, so re-encode
  // to PNG before the compositor sees them (template base, region
  // replacements, and the branded property photo all funnel through here via
  // normalizeRenderImages).
  if (head.length >= 12 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") {
    return webpToPngDataUrl(dataUrl, b64);
  }
  if (JPEG_DATA_URL.test(dataUrl)) {
    try {
      const jpegBuf = Buffer.from(b64, "base64");
      const { width, height, data } = decodeJpeg(jpegBuf, {
        useTArray: true,
        formatAsRGBA: true,
        maxResolutionInMP: 25, // ≈5000×5000 — serverless memory bound
        maxMemoryUsageInMB: 256,
      });
      if (!width || !height || width * height * 4 !== data.length) {
        console.error(`JPEG decode produced unexpected dimensions ${width}×${height} (bytes ${data.length})`);
        return dataUrl;
      }
      const png = encodePng(width, height, Buffer.from(data));
      return `data:image/png;base64,${png.toString("base64")}`;
    } catch (err) {
      // Leave the input unchanged: the downstream render will surface a normal
      // error rather than a black/corrupt image, and the log makes it visible.
      console.error("JPEG→PNG normalization failed (input left unchanged):", err);
      return dataUrl;
    }
  }
  return dataUrl;
}
/** Apply the JPEG/WebP→PNG guard to every image field a render request can carry. */
function normalizeRenderImages(input: RenderRequest): RenderRequest {
  if (!input.imageDataUrl && !input.templateImage && !input.regionImages) return input;
  const out: RenderRequest = { ...input };
  if (out.imageDataUrl) out.imageDataUrl = normalizeImageDataUrl(out.imageDataUrl);
  if (out.templateImage) out.templateImage = normalizeImageDataUrl(out.templateImage);
  if (out.regionImages) {
    const regionImages: Record<string, string> = {};
    for (const [id, url] of Object.entries(out.regionImages)) regionImages[id] = normalizeImageDataUrl(url);
    out.regionImages = regionImages;
  }
  return out;
}

export async function renderMarketingPng(input: RenderRequest) {
  await ensureSatoriReady();
  const assets = await getRenderAssets();
  // JPEG→PNG normalization guard (R5 prerequisite): Satori AND resvg crash on
  // JPEG data URLs ("RangeError: Out of bounds access" from Satori; black
  // render from resvg), and gpt-image-1 + phone cameras both produce JPEGs.
  // Normalize every image field that can reach Satori/resvg — property photo
  // (imageDataUrl), template base (templateImage), template image-region
  // replacements (regionImages) — BEFORE any decoding happens. PNG inputs
  // pass through byte-identical (the fast path is untouched).
  const norm = normalizeRenderImages(input);
  const templateReplica = buildTemplateReplica(norm);
  const { width, height } = outputCanvasSize(norm, templateReplica);
  const templated: RenderTemplateInput = {
    ...norm,
    // Pass the ACTUAL output canvas to the template replica so its absolutely-
    // positioned layers (base image, image-region replacements, text) are laid
    // out in the same space satori renders at. Previously it hardcoded
    // 1275×1650/1080×1080, so a template whose natural size drove outputCanvasSize
    // (e.g. a 791×1024 upload) misplaced every layer and replacement photos were
    // drawn off-canvas — owner defect 3c6145cf.
    outputWidth: width,
    outputHeight: height,
    baseBackgroundDataUrl: norm.type === "flyer" ? assets.flyerBackground : assets.socialBackground,
    headerBandDataUrl: norm.type === "flyer" ? assets.flyerHeader : assets.socialHeader,
    ...(templateReplica ? { templateReplica } : {}),
    fontMetrics: assets.fontMetrics,
    glyphMetrics: assets.glyphMetrics,
    fontData: assets.fontData,
  };
  const svg = await satori(marketingTemplate(templated), {
    width, height,
    fonts: [
      { name: "Relevate Sans", data: assets.regularFont, weight: 400, style: "normal" }, { name: "Relevate Sans", data: assets.boldFont, weight: 700, style: "normal" },
      { name: "Relevate Serif", data: assets.serifFont, weight: 400, style: "normal" }, { name: "Relevate Serif", data: assets.serifBoldFont, weight: 700, style: "normal" },
      { name: "Relevate Mono", data: assets.monoFont, weight: 400, style: "normal" }, { name: "Relevate Mono", data: assets.monoBoldFont, weight: 700, style: "normal" },
      // Round 2 font variety (Aug 13): elegant display serif, calligraphic
      // script, condensed display — all OFL. Names are the CONTRACT for
      // font-match.ts and Design Engineer A's geometry (must not be renamed).
      { name: "Relevate Display", data: assets.displayFont, weight: 400, style: "normal" }, { name: "Relevate Display", data: assets.displayBoldFont, weight: 700, style: "normal" }, { name: "Relevate Display", data: assets.displayBlackFont, weight: 900, style: "normal" },
      { name: "Relevate Script", data: assets.scriptFont, weight: 400, style: "normal" },
      { name: "Relevate Condensed", data: assets.condensedFont, weight: 400, style: "normal" },
    ],
  });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Flyer text-region palette sampling (owner-approved blend + text-color fixes).
// The composited text box must read as part of the template design, so we
// sample the LOCAL background color of the uploaded raster underneath each text
// region (corners + edge midpoints → per-channel median, robust against the old
// lettering inside the box) AND the ORIGINAL lettering color of that region
// (dominant color cluster that differs from the background — the old text).
// Flyer template mode only; social template mode never samples.
// ---------------------------------------------------------------------------

const SAMPLE_LONG_SIDE = 160; // decode the template at ≤160px for background sampling (fast, area-averaged)
const FG_SAMPLE_LONG_SIDE = 384; // higher-res decode so text strokes stay ≥2-3px wide
const FG_BG_DISTANCE = 50; // max-channel distance from the background → counts as a foreground candidate
const FG_MIN_CANDIDATE_RATIO = 0.002; // candidates must be ≥0.2% of the region's pixels
const FG_BIN_COUNT = 5; // 5×5×5 color buckets for the dominant-cluster search

function decodeRgba(dataUrl: string, sampleWidth: number, sampleHeight: number): Buffer | null {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sampleWidth}" height="${sampleHeight}" viewBox="0 0 ${sampleWidth} ${sampleHeight}"><image href="${dataUrl}" x="0" y="0" width="${sampleWidth}" height="${sampleHeight}"/></svg>`;
    return new Resvg(svg).render().pixels;
  } catch (err) {
    console.error("region palette sampling failed:", err);
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminanceOf(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const rgbToHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((channel) => clampByte(channel).toString(16).padStart(2, "0")).join("")}`;

export interface RegionPalettes {
  /** Opaque surface per text region (blends the box with the design). */
  backgrounds: Record<string, string>;
  /** Original lettering color per text region (the template's text color). */
  foregrounds: Record<string, string>;
}

/**
 * Resolve the template-replica input for a render request. Flyer template mode
 * samples per-region surfaces AND lettering colors from the raster, and builds
 * a pixel-level INPAINTED copy of the template (original lettering removed from
 * replaced text regions) so the region shows the template's true background and
 * the new text composites directly on top — no opaque surface box. Region
 * backgrounds are also sampled for IMAGE regions (both formats, R4 — the
 * opaque backing behind a replaced logo needs the card color around the old
 * logo so the replacement blends seamlessly).
 */
function buildTemplateReplica(input: RenderRequest): TemplateReplicaInput | undefined {
  if (!input.templateImage || !input.templateRegions || !input.regionText) return undefined;
  const base: TemplateReplicaInput = {
    templateImage: input.templateImage,
    templateRegions: input.templateRegions,
    regionText: input.regionText,
    ...(input.regionImages ? { regionImages: input.regionImages } : {}),
    ...(input.templateWidth ? { templateWidth: input.templateWidth } : {}),
    ...(input.templateHeight ? { templateHeight: input.templateHeight } : {}),
  };
  const { backgrounds, foregrounds } = sampleRegionPalettes(input.templateImage, input.templateRegions, input.templateWidth, input.templateHeight);
  const imageInkBoxes = measureImageRegionInks(input.templateImage, input.templateRegions, input.templateWidth, input.templateHeight);
  const replica = { ...base, regionBackgrounds: backgrounds, regionForegrounds: foregrounds, ...(Object.keys(imageInkBoxes).length ? { imageInkBoxes } : {}) };
  if (input.type !== "flyer") return replica;
  // Additive regions (Aug 20, e121b3fd) have NO original lettering to remove —
  // they are drawn on TOP of existing content, so they must be EXCLUDED from
  // inpainting or their underlying pixels would be erased (the very content
  // the additive box is meant to sit over, byte-unchanged).
  const replaceable = input.templateRegions.filter((r) => !r.additive);
  const inpainted = inpaintTemplateBackground(input.templateImage, replaceable, input.regionText, input.templateWidth, input.templateHeight);
  return inpainted ? { ...replica, templateImageInpainted: inpainted.imageDataUrl, inkBoxes: inpainted.inkBoxes, ...(inpainted.regionSurfaceLum ? { regionSurfaceLum: inpainted.regionSurfaceLum } : {}) } : replica;
}

/**
 * For each text region of a flyer template, produce both an opaque surface
 * color and the original lettering color, sampled from the raster. Falls back
 * to empty maps (the caller then uses legacy surface / vision text color) if
 * the raster can't be decoded.
 */
export function sampleRegionPalettes(templateImage: string, regions: TemplateRegion[], templateWidth?: number, templateHeight?: number): RegionPalettes {
  const textRegions = regions.filter((region) => region.kind === "text");
  const imageRegions = regions.filter((region) => region.kind === "image");
  if (!textRegions.length && !imageRegions.length) return { backgrounds: {}, foregrounds: {} };
  // Sample coordinates: natural template dims when known, else assume square.
  const aspect = templateWidth && templateHeight ? templateHeight / templateWidth : 1;
  const bgHeight = Math.max(1, Math.round(SAMPLE_LONG_SIDE * aspect));
  const fgHeight = Math.max(1, Math.round(FG_SAMPLE_LONG_SIDE * aspect));
  const bgPixels = decodeRgba(templateImage, SAMPLE_LONG_SIDE, bgHeight);
  const fgPixels = textRegions.length ? decodeRgba(templateImage, FG_SAMPLE_LONG_SIDE, fgHeight) : null;
  if (!bgPixels || (textRegions.length && !fgPixels)) return { backgrounds: {}, foregrounds: {} };

  const backgrounds: Record<string, string> = {};
  const foregrounds: Record<string, string> = {};
  for (const region of textRegions) {
    const bg = sampleBackgroundProbes(region, bgPixels, SAMPLE_LONG_SIDE, bgHeight);
    const fg = sampleForeground(region, fgPixels!, FG_SAMPLE_LONG_SIDE, fgHeight, bg);
    // Contrast guard runs against the EFFECTIVE text color (sampled lettering
    // first, then the vision-detected color), nudging the surface only when the
    // copy would otherwise be unreadable — always within template hues.
    const effectiveText = fg ?? region.textColor;
    if (effectiveText) guardContrast(bg, effectiveText);
    backgrounds[region.id] = rgbToHex(bg);
    if (fg) foregrounds[region.id] = fg;
  }
  // Image regions (R4 — logo backing): sample the ring AROUND the rect so the
  // opaque backing matches the card behind the old logo, not the logo itself.
  for (const region of imageRegions) {
    backgrounds[region.id] = rgbToHex(sampleRegionRing(region, bgPixels, SAMPLE_LONG_SIDE, bgHeight));
  }
  return { backgrounds, foregrounds };
}

/** Background-only view of the palettes (kept for callers/tests). */
export function sampleRegionBackgrounds(templateImage: string, regions: TemplateRegion[], templateWidth?: number, templateHeight?: number): Record<string, string> {
  return sampleRegionPalettes(templateImage, regions, templateWidth, templateHeight).backgrounds;
}

/** Foreground-only view of the palettes (the template's original lettering colors). */
export function sampleRegionForegrounds(templateImage: string, regions: TemplateRegion[], templateWidth?: number, templateHeight?: number): Record<string, string> {
  return sampleRegionPalettes(templateImage, regions, templateWidth, templateHeight).foregrounds;
}

/**
 * Measure the TRUE ink bounds of the old image inside an IMAGE region (R4 —
 * "old logo doesn't disappear"): the vision region rect is often smaller than
 * the logo's actual ink, so the opaque backing behind a replacement must cover
 * the real ink, not just the rect. Masks pixels against the RING color (the
 * card around the logo) inside an EXPANDED search window (12% beyond each
 * rect edge) and returns the ink rect in TEMPLATE-fractional coords (like
 * region x/y/w/h). Returns {} when nothing differs (decorative region — the
 * renderer falls back to the region rect).
 */
const IMAGE_INK_SAMPLE_LONG = 480;
export function measureImageRegionInks(templateImage: string, regions: TemplateRegion[], templateWidth?: number, templateHeight?: number): Record<string, InkBox> {
  const imageRegions = regions.filter((r) => r.kind === "image");
  if (!imageRegions.length) return {};
  const aspect = templateWidth && templateHeight ? templateHeight / templateWidth : 1;
  const H = Math.max(1, Math.round(IMAGE_INK_SAMPLE_LONG * aspect));
  const pixels = decodeRgba(templateImage, IMAGE_INK_SAMPLE_LONG, H);
  if (!pixels) return {};
  const W = IMAGE_INK_SAMPLE_LONG;
  const out: Record<string, InkBox> = {};
  for (const region of imageRegions) {
    const rx0 = region.x * W, ry0 = region.y * H, rw = region.w * W, rh = region.h * H;
    const mx = Math.max(8, Math.round(rw * 0.12));
    const my = Math.max(8, Math.round(rh * 0.12));
    const x0 = Math.max(0, Math.floor(rx0 - mx)), y0 = Math.max(0, Math.floor(ry0 - my));
    const x1 = Math.min(W - 1, Math.ceil(rx0 + rw + mx)), y1 = Math.min(H - 1, Math.ceil(ry0 + rh + my));
    const bg = sampleRegionRing(region, pixels, W, H);
    let ix0 = Infinity, iy0 = Infinity, ix1 = -1, iy1 = -1, count = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4;
        const d = Math.max(Math.abs(pixels[i] - bg[0]), Math.abs(pixels[i + 1] - bg[1]), Math.abs(pixels[i + 2] - bg[2]));
        if (d > 24) {
          if (x < ix0) ix0 = x;
          if (x > ix1) ix1 = x;
          if (y < iy0) iy0 = y;
          if (y > iy1) iy1 = y;
          count++;
        }
      }
    }
    if (count > 20 && ix1 >= ix0 && iy1 >= iy0) {
      const f0 = Math.max(0, Math.min(1, ix0 / W));
      const f1 = Math.max(0, Math.min(1, (ix1 + 1) / W));
      const g0 = Math.max(0, Math.min(1, iy0 / H));
      const g1 = Math.max(0, Math.min(1, (iy1 + 1) / H));
      out[region.id] = { fx: f0, fy: g0, fw: Math.max(0.02, f1 - f0), fh: Math.max(0.02, g1 - g0) };
    }
  }
  return out;
}
/**
 * Background color around an IMAGE region (R4 — logo backing): 8 probe points
 * in the ring just OUTSIDE the region rect (corners + edge midpoints, a few
 * percent beyond each edge, clamped to the raster) → per-channel median. This
 * yields the card color the old logo sat on, so the opaque backing behind a
 * replaced logo blends seamlessly with the template.
 */
function sampleRegionRing(region: TemplateRegion, pixels: Buffer, sampleWidth: number, sampleHeight: number): [number, number, number] {
  const x0 = region.x * sampleWidth;
  const y0 = region.y * sampleHeight;
  const x1 = (region.x + region.w) * sampleWidth;
  const y1 = (region.y + region.h) * sampleHeight;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const dx = Math.max(2, Math.round(Math.min(w, sampleWidth * 0.03)));
  const dy = Math.max(2, Math.round(Math.min(h, sampleHeight * 0.03)));
  const pts: Array<[number, number]> = [
    [x0 - dx, y0 - dy], [x0 + w / 2, y0 - dy], [x1 + dx, y0 - dy],
    [x0 - dx, y0 + h / 2], [x1 + dx, y0 + h / 2],
    [x0 - dx, y1 + dy], [x0 + w / 2, y1 + dy], [x1 + dx, y1 + dy],
  ];
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (const [px, py] of pts) {
    const cx = Math.max(0, Math.min(sampleWidth - 1, Math.round(px)));
    const cy = Math.max(0, Math.min(sampleHeight - 1, Math.round(py)));
    const i = (cy * sampleWidth + cx) * 4;
    rs.push(pixels[i]);
    gs.push(pixels[i + 1]);
    bs.push(pixels[i + 2]);
  }
  return [median(rs), median(gs), median(bs)];
}
/**
 * Local background under a text region: 8 probe points (corners + edge
 * midpoints, inset so the old centered lettering rarely lands on a probe) →
 * per-channel median. No contrast guard here — the caller applies it.
 */
function sampleBackgroundProbes(region: TemplateRegion, pixels: Buffer, sampleWidth: number, sampleHeight: number): [number, number, number] {
  const x0 = region.x * sampleWidth;
  const y0 = region.y * sampleHeight;
  const x1 = (region.x + region.w) * sampleWidth;
  const y1 = (region.y + region.h) * sampleHeight;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const insetX = Math.min(Math.max(1, Math.round(w * 0.06)), Math.max(1, Math.floor(w / 2) - 1));
  const insetY = Math.min(Math.max(1, Math.round(h * 0.06)), Math.max(1, Math.floor(h / 2) - 1));
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  // 8 probe points: corners + edge midpoints, inset so the old lettering
  // (usually centered) rarely lands on a probe. Median is robust if it does.
  const probes = [
    [x0 + insetX, y0 + insetY], [x1 - insetX, y0 + insetY],
    [x0 + insetX, y1 - insetY], [x1 - insetX, y1 - insetY],
    [cx, y0 + insetY], [cx, y1 - insetY],
    [x0 + insetX, cy], [x1 - insetX, cy],
  ];
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (const [px, py] of probes) {
    const sx = Math.max(0, Math.min(sampleWidth - 1, Math.round(px)));
    const sy = Math.max(0, Math.min(sampleHeight - 1, Math.round(py)));
    const idx = (sy * sampleWidth + sx) * 4;
    rs.push(pixels[idx]);
    gs.push(pixels[idx + 1]);
    bs.push(pixels[idx + 2]);
  }
  return [median(rs), median(gs), median(bs)];
}

/**
 * Nudge the surface away from the effective text color if they'd collide, so
 * edited copy stays readable while the box keeps the template's local
 * hue/lightness direction.
 */
function guardContrast(bg: [number, number, number], textColor: string) {
  const [tr, tg, tb] = hexToRgb(textColor);
  if (Math.abs(luminanceOf(bg[0], bg[1], bg[2]) - luminanceOf(tr, tg, tb)) < 60) {
    if (luminanceOf(tr, tg, tb) > 128) {
      bg[0] *= 0.45; bg[1] *= 0.45; bg[2] *= 0.45; // text is light → darken surface
    } else {
      bg[0] += (255 - bg[0]) * 0.55; bg[1] += (255 - bg[1]) * 0.55; bg[2] += (255 - bg[2]) * 0.55; // text is dark → lighten surface
    }
  }
}

/**
 * Original lettering color of a text region: the dominant color cluster among
 * pixels that differ meaningfully from the local background. Anti-aliased edge
 * pixels spread across the histogram, so the largest 5×5×5 bucket (followed by
 * a per-channel median) converges on the solid glyph color; when several text
 * lines use different colors, the largest block (usually the headline) wins.
 * Returns undefined when the region holds no confident text (empty box, or a
 * decode/contrast edge case) — the caller then falls back to vision/default.
 */
function sampleForeground(region: TemplateRegion, pixels: Buffer, sampleWidth: number, sampleHeight: number, bg: [number, number, number]): string | undefined {
  const [br, bgc, bb] = bg;
  const x0 = Math.max(0, Math.floor(region.x * sampleWidth));
  const y0 = Math.max(0, Math.floor(region.y * sampleHeight));
  const x1 = Math.min(sampleWidth - 1, Math.ceil((region.x + region.w) * sampleWidth) - 1);
  const y1 = Math.min(sampleHeight - 1, Math.ceil((region.y + region.h) * sampleHeight) - 1);
  if (x1 <= x0 || y1 <= y0) return undefined;

  const buckets = new Map<number, number[]>();
  let candidates = 0;
  let area = 0;
  const step = 256 / FG_BIN_COUNT;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = (y * sampleWidth + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      area++;
      if (Math.max(Math.abs(r - br), Math.abs(g - bgc), Math.abs(b - bb)) < FG_BG_DISTANCE) continue; // background-ish (or AA mid-tones hugging the bg)
      candidates++;
      const key = Math.min(FG_BIN_COUNT - 1, Math.floor(r / step)) * FG_BIN_COUNT * FG_BIN_COUNT
        + Math.min(FG_BIN_COUNT - 1, Math.floor(g / step)) * FG_BIN_COUNT
        + Math.min(FG_BIN_COUNT - 1, Math.floor(b / step));
      let bucket = buckets.get(key);
      if (!bucket) { bucket = []; buckets.set(key, bucket); }
      bucket.push(r, g, b);
    }
  }
  if (area === 0) return undefined;
  if (candidates < Math.max(8, Math.floor(area * FG_MIN_CANDIDATE_RATIO))) return undefined; // no real text, just noise/decor

  let best: number[] | undefined;
  for (const bucket of buckets.values()) if (!best || bucket.length > best.length) best = bucket;
  if (!best || best.length < 8) return undefined;

  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let i = 0; i < best.length; i += 3) { rs.push(best[i]); gs.push(best[i + 1]); bs.push(best[i + 2]); }
  const r = median(rs), g = median(gs), b = median(bs);
  // The dominant cluster must still genuinely differ from the background, else
  // it was AA noise and we'd rather fall back to vision/default.
  if (Math.max(Math.abs(r - br), Math.abs(g - bgc), Math.abs(b - bb)) < FG_BG_DISTANCE * 0.6) return undefined;
  return rgbToHex([r, g, b]);
}

// ---------------------------------------------------------------------------
// Pixel-level background inpainting (owner-approved: "background behind the
// text matched pixel by pixel — no colored box"). Flyer template mode only.
//
// For every REPLACED text region we remove the template's original lettering
// from the raster itself: pixels that differ from the local background are
// masked (glyph cores + anti-aliased halo), then filled from the surrounding
// background (multi-source nearest-neighbor BFS for cores, neighbor average for
// the faint AA halo). The modified raster becomes the render's base layer, so
// outside the NEW glyphs the region pixels ≈ the template's true background
// (delta near zero), and the new text (in the sampled lettering color) is
// composited directly on top. Anti-ghosting is preserved BY CONSTRUCTION — old
// glyphs are physically removed, not covered by a box.
// ---------------------------------------------------------------------------

const INPAINT_MAX_LONG_SIDE = 4096; // decode bound (R4: matches native output cap so the inpainted base is never upscaled)
const INPAINT_HARD_DIST = 34; // max-channel delta from bg → glyph core (masked + inpainted)
const INPAINT_SOFT_DIST = 20; // max-channel delta → faint AA halo (neighbor-averaged)
const INPAINT_MAX_FILL = 96; // BFS distance cap (glyph strokes are thin)
// Manual text-ERASURE thresholds (owner text-ghosting fix, task 0ba6568c). The
// render-time logo/replacement inpainter is deliberately conservative: it keeps
// ANY pixel whose ink is within INPAINT_HARD_DIST=34 of its local background
// (so it never eats the design), and only erases anti-aliased halos that hug a
// glyph core. That edge-conservatism is right when REPLACING one logo with
// another, but WRONG for full text-erasure: text whose color is close to its
// background (light-gray on white, text on a pale card) can sit entirely below
// the 34 threshold and partially survive, leaving the faint "ghost" the owner
// sees. Text regions in the manual-authoring pivot are stamped for erasure
// ENTIRELY, so this path uses stricter thresholds, erases every soft halo, and
// dilates the mask one pixel so no anti-aliased rim survives.
const ERASE_HARD_DIST = 16; // mask anything more than this from local bg
const ERASE_SOFT_DIST = 6; // anything above this is candidate AA ink (no hug-core rule)
export interface InpaintOptions {
  /** Aggressive full-text-erasure mode (manual pivot). Default false = render-time logo/replacement behaviour (unchanged). */
  aggressive?: boolean;
  /**
   * Owner decision (task 59e17c23): on UPLOADED custom-raster templates, the
   * aggressive full-text-erasure path fills each erased text region with a
   * STRAIGHT WHITE box instead of local-fill (BFS nearest-neighbor) blending.
   * This guarantees no ghost / no smear / no blend artifacts on ANY background
   * (local-fill is provably unclean on photo/texture, light|dark boundary and
   * low-contrast-on-photo — failure-class matrix e51c4b81). Only valid with
   * aggressive:true; the conservative logo/replacement path (aggressive:false)
   * is untouched and never sets this.
   */
  whiteFill?: boolean;
}


// --- minimal PNG encoder (RGBA → PNG, filter 0, deflate) --------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Per-pixel local background map for a region box: a coarse grid of cell
 * medians (robust to glyph pixels inside a cell), smoothed against neighbor
 * cells, then bilinearly interpolated PER PIXEL ON DEMAND. This is what lets the
 * inpaint mask stay LOCAL — a gradient or photo background no longer looks like
 * "glyph cores" just because it is far from the region's single median color.
 * Returns a closure sample(x, y) → [r, g, b] with x,y REGION-LOCAL coords. No
 * full-resolution array is materialized (R4 — the inpaint now runs at the
 * template's native resolution; a bw×bh×3 Float32Array at 3600×4656 would cost
 * ~200 MB, the coarse grid is kilobytes).
 */
function buildLocalBgMap(pixels: Buffer, W: number, x0: number, y0: number, x1: number, y1: number, fallback: [number, number, number]): (x: number, y: number) => [number, number, number] {
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const cell = Math.max(20, Math.round(Math.max(bw, bh) / 22));
  const gw = Math.max(2, Math.ceil(bw / cell));
  const gh = Math.max(2, Math.ceil(bh / cell));
  const cw = bw / gw;
  const ch = bh / gh;
  const cells = new Float32Array(gw * gh * 3);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const xs = Math.floor(gx * cw);
      const xe = Math.min(bw - 1, Math.ceil((gx + 1) * cw));
      const ys = Math.floor(gy * ch);
      const ye = Math.min(bh - 1, Math.ceil((gy + 1) * ch));
      const sx = Math.max(1, Math.round((xe - xs) / 10));
      const sy = Math.max(1, Math.round((ye - ys) / 10));
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      for (let y = ys; y <= ye; y += sy) {
        for (let x = xs; x <= xe; x += sx) {
          const i = ((y0 + y) * W + (x0 + x)) * 4;
          rs.push(pixels[i]);
          gs.push(pixels[i + 1]);
          bs.push(pixels[i + 2]);
        }
      }
      const o = (gy * gw + gx) * 3;
      if (rs.length) {
        cells[o] = median(rs);
        cells[o + 1] = median(gs);
        cells[o + 2] = median(bs);
      } else {
        cells[o] = fallback[0];
        cells[o + 1] = fallback[1];
        cells[o + 2] = fallback[2];
      }
    }
  }
  // Smooth pass: a cell that is far from the median of its neighbors (a glyph
  // covering the whole cell, e.g. a big "O") is replaced by the neighbor median.
  const sm = new Float32Array(gw * gh * 3);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const o = (gy * gw + gx) * 3;
      let nr: number[] = [], ng: number[] = [], nb: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = gy + dy, nx = gx + dx;
          if (ny < 0 || ny >= gh || nx < 0 || nx >= gw) continue;
          const no = (ny * gw + nx) * 3;
          nr.push(cells[no]);
          ng.push(cells[no + 1]);
          nb.push(cells[no + 2]);
        }
      }
      if (nr.length) {
        const mr = median(nr), mg = median(ng), mb = median(nb);
        const dr = Math.abs(cells[o] - mr), dg = Math.abs(cells[o + 1] - mg), db = Math.abs(cells[o + 2] - mb);
        if (Math.max(dr, dg, db) > 70) {
          sm[o] = mr; sm[o + 1] = mg; sm[o + 2] = mb;
        } else {
          sm[o] = cells[o]; sm[o + 1] = cells[o + 1]; sm[o + 2] = cells[o + 2];
        }
      } else {
        sm[o] = cells[o]; sm[o + 1] = cells[o + 1]; sm[o + 2] = cells[o + 2];
      }
    }
  }
  return (x: number, y: number): [number, number, number] => {
    const fy = Math.min(gh - 1.001, y / ch);
    const gy0 = Math.floor(fy);
    const gy1 = Math.min(gh - 1, gy0 + 1);
    const ty = fy - gy0;
    const fx = Math.min(gw - 1.001, x / cw);
    const gx0 = Math.floor(fx);
    const gx1 = Math.min(gw - 1, gx0 + 1);
    const tx = fx - gx0;
    const i00 = (gy0 * gw + gx0) * 3;
    const i10 = (gy0 * gw + gx1) * 3;
    const i01 = (gy1 * gw + gx0) * 3;
    const i11 = (gy1 * gw + gx1) * 3;
    return [
      sm[i00] * (1 - tx) * (1 - ty) + sm[i10] * tx * (1 - ty) + sm[i01] * (1 - tx) * ty + sm[i11] * tx * ty,
      sm[i00 + 1] * (1 - tx) * (1 - ty) + sm[i10 + 1] * tx * (1 - ty) + sm[i01 + 1] * (1 - tx) * ty + sm[i11 + 1] * tx * ty,
      sm[i00 + 2] * (1 - tx) * (1 - ty) + sm[i10 + 2] * tx * (1 - ty) + sm[i01 + 2] * (1 - tx) * ty + sm[i11 + 2] * tx * ty,
    ];
  };
}

/**
 * Remove the original lettering from a region box of an RGBA buffer and return
 * the INK bounding box of the removed lettering (region-local pixel coords) —
 * used by the geometry pass to align/size the composited copy to the original
 * lettering extent. Returns undefined when the region had no masked text.
 * The mask compares every pixel to its LOCAL background (interpolated from a
 * coarse grid) instead of one flat region color, so gradient and photo
 * backgrounds stay intact and only true lettering is removed — no visible box.
 */
function inpaintRegion(pixels: Buffer, W: number, x0: number, y0: number, x1: number, y1: number, bg: [number, number, number], opts?: InpaintOptions): { inkX0: number; inkY0: number; inkX1: number; inkY1: number; bandRows: number; firstBandRows: number } | undefined {
  const aggressive = !!opts?.aggressive;
  const HARD = aggressive ? ERASE_HARD_DIST : INPAINT_HARD_DIST;
  const SOFT = aggressive ? ERASE_SOFT_DIST : INPAINT_SOFT_DIST;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const lbg = buildLocalBgMap(pixels, W, x0, y0, x1, y1, bg);
  const kind = new Uint8Array(bw * bh); // 0 = keep, 1 = glyph core, 2 = AA halo
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      const li = (y - y0) * bw + (x - x0);
      const lb = lbg(x - x0, y - y0);
      const d = Math.max(Math.abs(pixels[i] - lb[0]), Math.abs(pixels[i + 1] - lb[1]), Math.abs(pixels[i + 2] - lb[2]));
      if (d > HARD) kind[li] = 1;
      else if (d > SOFT) kind[li] = 2;
    }
  }
  // Aggressive (full text-erasure) mode: the soft-only-if-hugs-core rule below
  // protects design accents for logo-replacement, but for erasing WHOLE text
  // regions it leaves a faint anti-aliased outline of the old lettering (the
  // owner's "not fully blended"). In aggressive mode we erase every soft halo.
  if (!aggressive) {
    // Soft pixels are only inpainted when they HUG a glyph core (anti-aliased
    // halo). Standalone soft pixels (design borders, shadows, subtle accents)
    // are keep pixels — the region edge must not eat the template's design.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const li = (y - y0) * bw + (x - x0);
        if (kind[li] !== 2) continue;
        let hasHard = false;
        for (let dy = -1; dy <= 1 && !hasHard; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
            if (kind[(ny - y0) * bw + (nx - x0)] === 1) { hasHard = true; break; }
          }
        }
        if (!hasHard) kind[li] = 0;
      }
    }
  } else {
    // Dilate the mask by one pixel: an anti-aliased glyph edge's outermost
    // pixel can sit just under even the strict SOFT threshold (a faint 1px
    // rim). Any KEEP pixel whose 8-neighbourhood contains a masked pixel and
    // that itself differs from the local bg by at least 2 is promoted to the
    // halo, so the erased region swallows the full glyph footprint with no
    // surviving sliver ghost.
    const DILATE_D = Math.max(1, Math.round(ERASE_SOFT_DIST / 2));
    const rk = new Uint8Array(kind);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const li = (y - y0) * bw + (x - x0);
        if (rk[li] !== 0) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
            if (rk[(ny - y0) * bw + (nx - x0)] !== 0) { near = true; break; }
          }
        }
        if (!near) continue;
        const i = (y * W + x) * 4;
        const lb = lbg(x - x0, y - y0);
        const d = Math.max(Math.abs(pixels[i] - lb[0]), Math.abs(pixels[i + 1] - lb[1]), Math.abs(pixels[i + 2] - lb[2]));
        if (d > DILATE_D) kind[li] = 2;
      }
    }
  }
  const dist = new Int32Array(bw * bh);
  for (let i = 0; i < dist.length; i++) if (kind[i] !== 0) dist[i] = INPAINT_MAX_FILL + 1;
  const outR = new Uint8Array(bw * bh);
  const outG = new Uint8Array(bw * bh);
  const outB = new Uint8Array(bw * bh);
  const queue = new Int32Array(bw * bh);
  let head = 0, tail = 0;

  // Multi-source BFS: seeds are KEEP pixels adjacent (8-way) to glyph cores.
  // Each core pixel gets the color of its nearest keep pixel (Manhattan-ish).
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const li = (y - y0) * bw + (x - x0);
      if (kind[li] !== 1) continue;
      let found = false;
      for (let dy = -1; dy <= 1 && !found; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          if (kind[(ny - y0) * bw + (nx - x0)] === 0) {
            const si = (ny * W + nx) * 4;
            outR[li] = pixels[si];
            outG[li] = pixels[si + 1];
            outB[li] = pixels[si + 2];
            dist[li] = 1;
            queue[tail++] = li;
            found = true;
          }
        }
      }
      if (!found) dist[li] = INPAINT_MAX_FILL + 1; // isolated core → bg fallback later
    }
  }
  while (head < tail) {
    const li = queue[head++];
    const dcur = dist[li];
    if (dcur >= INPAINT_MAX_FILL) continue;
    const cx = li % bw;
    const cy = (li / bw) | 0;
    const px = x0 + cx;
    const py = y0 + cy;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = px + dx, ny = py + dy;
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const nli = (ny - y0) * bw + (nx - x0);
      if (kind[nli] === 1 && dist[nli] > dcur + 1) {
        dist[nli] = dcur + 1;
        outR[nli] = outR[li];
        outG[nli] = outG[li];
        outB[nli] = outB[li];
        queue[tail++] = nli;
      }
    }
  }
  // AA halo (soft) pixels: average of the 8 neighbors' final colors, then pulled
  // 30% toward the local background so no tinted ghost halo survives.
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const li = (y - y0) * bw + (x - x0);
      if (kind[li] !== 2) continue;
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const nli = (ny - y0) * bw + (nx - x0);
          const ni = (ny * W + nx) * 4;
          if (kind[nli] === 0) { sr += pixels[ni]; sg += pixels[ni + 1]; sb += pixels[ni + 2]; }
          else if (kind[nli] === 1) { sr += outR[nli]; sg += outG[nli]; sb += outB[nli]; }
          else continue;
          n++;
        }
      }
      if (n) {
        const lb = lbg(x - x0, y - y0);
        outR[li] = Math.round((sr / n) * 0.7 + lb[0] * 0.3);
        outG[li] = Math.round((sg / n) * 0.7 + lb[1] * 0.3);
        outB[li] = Math.round((sb / n) * 0.7 + lb[2] * 0.3);
      } else { const lb = lbg(x - x0, y - y0); outR[li] = lb[0]; outG[li] = lb[1]; outB[li] = lb[2]; }
    }
  }
  // Ink bbox of the original lettering (glyph cores + AA halo) — computed from
  // the MASK, so the band detector below sees the pristine lettering even after
  // the write-back has overwritten pixels.
  let inkX0 = Infinity, inkY0 = Infinity, inkX1 = -1, inkY1 = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const li = (y - y0) * bw + (x - x0);
      if (kind[li] === 0) continue;
      if (x < inkX0) inkX0 = x;
      if (x > inkX1) inkX1 = x;
      if (y < inkY0) inkY0 = y;
      if (y > inkY1) inkY1 = y;
    }
  }
  // ROW-BAND count (R4 follow-up, light-template placement): count horizontal
  // text rows in the ink box; rows with ≥3 mask pixels are text; consecutive
  // text rows merge into a band (gaps ≤2 rows are line spacing). The FIRST
  // band's height (rows) lets a single-line replacement size to one original
  // line of a multi-line block.
  let bands = 0, firstH = 0, curH = 0, emptyRun = 0, inBand = false;
  if (inkX1 >= inkX0) {
    for (let y = Math.max(y0, inkY0); y <= Math.min(y1, inkY1); y++) {
      let c = 0;
      for (let x = Math.max(x0, inkX0); x <= Math.min(x1, inkX1); x++) {
        if (kind[(y - y0) * bw + (x - x0)] !== 0 && ++c >= 3) break;
      }
      if (c >= 3) {
        if (!inBand) { bands++; inBand = true; }
        curH++;
        emptyRun = 0;
      } else if (inBand) {
        emptyRun++;
        if (emptyRun > 2) {
          if (bands === 1) firstH = curH;
          inBand = false;
          curH = 0;
          emptyRun = 0;
        }
      }
    }
    if (inBand && bands === 1) firstH = curH;
  }
  const bandRows = bands > 0 ? bands : 1;
  const firstBandRows = bands > 0 ? Math.max(1, firstH) : 1;
  // Write back (glyph cores + halo; keep pixels untouched).
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const li = (y - y0) * bw + (x - x0);
      if (kind[li] === 0) continue;
      const o = (y * W + x) * 4;
      if (dist[li] > INPAINT_MAX_FILL && kind[li] === 1) {
        // unreached core (isolated blob) → local background
        const lb = lbg(x - x0, y - y0);
        pixels[o] = lb[0]; pixels[o + 1] = lb[1]; pixels[o + 2] = lb[2];
      } else {
        pixels[o] = outR[li]; pixels[o + 1] = outG[li]; pixels[o + 2] = outB[li];
      }
    }
  }
  if (inkX1 < inkX0) return undefined;
  return { inkX0, inkY0, inkX1, inkY1, bandRows, firstBandRows };
}

/**
 * Build a pixel-level INPAINTED copy of the flyer template: the original
 * lettering inside every REPLACED text region is removed (masked + filled from
 * the surrounding background) so the region reconstructs the template's true
 * background. Also returns each removed lettering's INK bounding box in
 * fractional region-local coordinates ({fx, fy, fw, fh} ∈ [0,1] within the
 * region rect) — the geometry pass consumes these to align and size the
 * composited copy to the original lettering. Returns undefined on failure (the
 * caller then falls back to the legacy opaque-surface path). Flyer mode only.
 */
export interface InpaintResult {
  imageDataUrl: string;
  inkBoxes: Record<string, InkBox>;
  /**
   * Per text-region POST-ERASE surface luminance (0-255), sampled from the
   * erased base at the region rect. e51c4b81 Fix 3 uses it to make the
   * white-on-white contrast guard SURFACE-AWARE: flip near-white ink to dark
   * only when the region was actually whitewashed (surface lum high); keep
   * light ink when the ink-masked erase preserved a dark surface.
   */
  regionSurfaceLum?: Record<string, number>;
}
export function inpaintTemplateBackground(templateImage: string, regions: TemplateRegion[], regionText: Record<string, string>, templateWidth?: number, templateHeight?: number, opts?: InpaintOptions): InpaintResult | undefined {
  const textRegions = regions.filter((region) => region.kind === "text" && typeof regionText[region.id] === "string");
  if (!textRegions.length) return undefined;
  const aspect = templateWidth && templateHeight ? templateHeight / templateWidth : 1;
  let W = templateWidth && templateWidth > 0 ? Math.round(templateWidth) : 1275;
  let H = templateWidth && templateHeight && templateHeight > 0 ? Math.round(templateHeight) : Math.round(W * aspect);
  const longSide = Math.max(W, H);
  if (longSide > INPAINT_MAX_LONG_SIDE) {
    const scale = INPAINT_MAX_LONG_SIDE / longSide;
    W = Math.max(64, Math.round(W * scale));
    H = Math.max(64, Math.round(H * scale));
  }
  const pixels = decodeRgba(templateImage, W, H);
  if (!pixels) return undefined;
  try {
    const inkBoxes: Record<string, InkBox> = {};
    // Replaceable image blocks (photos/logos) in pixel coords + 1px halo. The
    // aggressive white-fill must NEVER erase a replaceable image, including the
    // padded rim added around each text box (fix b91769d7).
    const imageBlocks = regions
      .filter((r) => r.kind === "image")
      .map((r) => ({
        x0: Math.max(0, Math.floor(r.x * W) - 2),
        y0: Math.max(0, Math.floor(r.y * H) - 2),
        x1: Math.min(W - 1, Math.ceil((r.x + r.w) * W) + 1),
        y1: Math.min(H - 1, Math.ceil((r.y + r.h) * H) + 1),
      }));
    // Small erasure pad so a text-region box that under-shoots its lettering by
    // a few px still erases all of it (box drift robustness). ~4% of the long
    // side (a few tens of px at full res) bridges small vertical gaps between
    // detected text boxes. The pad is added only in the aggressive white-fill
    // path and never bleeds into an image region.
    const ERASE_PAD_PX = Math.max(8, Math.round(0.04 * Math.max(W, H)));
    for (const region of textRegions) {
      const x0 = Math.max(0, Math.floor(region.x * W));
      const y0 = Math.max(0, Math.floor(region.y * H));
      const x1 = Math.min(W - 1, Math.ceil((region.x + region.w) * W) - 1);
      const y1 = Math.min(H - 1, Math.ceil((region.y + region.h) * H) - 1);
      if (x1 <= x0 || y1 <= y0) continue;
      // OWNER DECISION (task 59e17c23): on the aggressive full-text-erasure path
      // (uploaded custom-raster templates) each erased text region becomes a
      // STRAIGHT WHITE box — the full delivered region rect, painted #ffffff.
      // This replaces local-fill (BFS) blending, which provably ghosts/smears on
      // photo/texture, light|dark boundary and low-contrast-on-photo backgrounds.
      // A solid white fill is the deterministic guaranteed-clean tradeoff the
      // owner accepted. The region rect already fully covers the lettering (the
      // aggressive detector-box tightening), so the white area is precisely the
      // clean editing surface. The conservative (aggressive:false) logo/replacement
      // path below is untouched.
      if (opts?.aggressive && opts?.whiteFill) {
        // OWNER-DIRECTED per-region policy (task d6435a4b): e51c4b81 Fix 2 was
        // per-PIXEL ink-masked everywhere, which UNDER-ERASED real simple-white
        // rasters — low-contrast / antialiased / thin lettering pixels the mask
        // did not flag survived behind the recomposed text (gpt-4o: "original
        // lettering visible behind new text"). The fix: decide PER-REGION.
        //   * PAPER regions — a mostly-flat background (white/cream/dark card)
        //     with sparse lettering (low ink fraction) — are FULLY EMPTIED:
        //     the whole text box is painted solid white (the deterministic
        //     59e17c23 flat guarantee → residual-original-ink 0%, no ghosting).
        //   * BUSY regions — a text box sitting ON dense art / a photo / a
        //     texture (high ink fraction, e.g. the flame hero) — keep the
        //     INK-MASKED fill so the art is preserved and not turned into a
        //     white void. This is the flame-art hard-outlier protection.
        // Non-text image blocks (photos/logos/art) are always excluded.
        const px0 = Math.max(0, x0 - ERASE_PAD_PX);
        const py0 = Math.max(0, y0 - ERASE_PAD_PX);
        const px1 = Math.min(W - 1, x1 + ERASE_PAD_PX);
        const py1 = Math.min(H - 1, y1 + ERASE_PAD_PX);
        const bw = px1 - px0 + 1;
        const bh = py1 - py0 + 1;
        const inImg = (x: number, y: number) =>
          imageBlocks.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
        // --- classify: busy art-backed vs flat paper ---
        // ink fraction = share of pixels differing from their row's local
        // background by > 28. Flat paper + sparse lettering → LOW; dense
        // art/photo/pattern → HIGH.
        let inkPx = 0, totPx = 0;
        for (let y = y0; y <= y1; y++) {
          const rowBg = buildLocalBgMap(pixels, W, x0, y, x1, y, [255, 255, 255]);
          for (let x = x0; x <= x1; x++) {
            const i = (y * W + x) * 4;
            const lb = rowBg(x - x0, 0);
            const d = Math.max(Math.abs(pixels[i] - lb[0]), Math.abs(pixels[i + 1] - lb[1]), Math.abs(pixels[i + 2] - lb[2]));
            totPx++;
            if (d > 28) inkPx++;
          }
        }
        const busy = totPx > 0 && inkPx / totPx > 0.34;
        if (!busy) {
          // PAPER: deterministic full empty — whole box + pad → white (never art).
          for (let y = py0; y <= py1; y++) {
            for (let x = px0; x <= px1; x++) {
              if (inImg(x, y)) continue;
              const o = (y * W + x) * 4;
              pixels[o] = 255; pixels[o + 1] = 255; pixels[o + 2] = 255;
            }
          }
        } else {
          // BUSY/ART: ink-masked fill — preserve art, erase confident lettering.
          const mask = new Uint8Array(bw * bh);
          for (let ry = 0; ry < bh; ry++) {
            const y = py0 + ry;
            const rowBg = buildLocalBgMap(pixels, W, px0, y, px1, y, [255, 255, 255]);
            for (let rx = 0; rx < bw; rx++) {
              const x = px0 + rx;
              const i = (y * W + x) * 4;
              const lb = rowBg(x - px0, y - y);
              const d = Math.max(Math.abs(pixels[i] - lb[0]), Math.abs(pixels[i + 1] - lb[1]), Math.abs(pixels[i + 2] - lb[2]));
              if (d > ERASE_SOFT_DIST) mask[ry * bw + rx] = 1;
            }
          }
          // 1px dilation (aggressive AA rim) so no sliver ghost survives.
          const rk = new Uint8Array(mask);
          for (let ry = 0; ry < bh; ry++) {
            const y = py0 + ry;
            for (let rx = 0; rx < bw; rx++) {
              const x = px0 + rx;
              const li = ry * bw + rx;
              if (rk[li] !== 0) continue;
              let near = false;
              for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < px0 || nx > px1 || ny < py0 || ny > py1) continue;
                if (rk[(ny - py0) * bw + (nx - px0)] !== 0) { near = true; break; }
              }
              if (!near) continue;
              const i = (y * W + x) * 4;
              const rowBg = buildLocalBgMap(pixels, W, px0, y, px1, y, [255, 255, 255]);
              const lb = rowBg(x - px0, 0);
              const d = Math.max(Math.abs(pixels[i] - lb[0]), Math.abs(pixels[i + 1] - lb[1]), Math.abs(pixels[i + 2] - lb[2]));
              if (d > 1) mask[li] = 1;
            }
          }
          // Per-row no-ink fallback: a row with almost no masked ink is left
          // alone (never stretch a white void across flame art).
          const rowInk = new Uint32Array(bh);
          for (let ry = 0; ry < bh; ry++) for (let rx = 0; rx < bw; rx++) if (mask[ry * bw + rx]) rowInk[ry]++;
          const ROW_MIN = Math.max(3, Math.round(bw * 0.006));
          for (let ry = 0; ry < bh; ry++) {
            if (rowInk[ry] < ROW_MIN) continue;
            const y = py0 + ry;
            for (let rx = 0; rx < bw; rx++) {
              if (!mask[ry * bw + rx]) continue;
              const x = px0 + rx;
              if (inImg(x, y)) continue;
              const o = (y * W + x) * 4;
              pixels[o] = 255; pixels[o + 1] = 255; pixels[o + 2] = 255;
            }
          }
        }
        // The whole region is now a clean editing surface; geometry callers
        // span the full region.
        inkBoxes[region.id] = { fx: 0, fy: 0, fw: 1, fh: 1 };
        continue;
      }
      const bg = sampleBackgroundProbes(region, pixels, W, H);
      const ink = inpaintRegion(pixels, W, x0, y0, x1, y1, bg, opts);
      if (ink) {
        const bw = x1 - x0 + 1;
        const bh = y1 - y0 + 1;
        // R4 follow-up: when the region's original lettering spans MULTIPLE
        // text rows (e.g. a whole card region), the ink box height is the whole
        // block — a single-line replacement must size to one ROW, not the block.
        // inpaintRegion reports the row-band count + first band's height (rows).
        inkBoxes[region.id] = {
          fx: (ink.inkX0 - x0) / bw,
          fy: (ink.inkY0 - y0) / bh,
          fw: (ink.inkX1 - ink.inkX0 + 1) / bw,
          fh: (ink.inkY1 - ink.inkY0 + 1) / bh,
          ...(ink.bandRows > 1 ? { lines: ink.bandRows, firstLineFh: Math.max(0.05, ink.firstBandRows / bh) } : {}),
        };
      }
    }
    // HORIZONTAL-GAP FILL (fix b91769d7 + FIX 2 e51c4b81): gpt-4o often SPLITS a
    // full-width lettering line into left+right boxes, leaving the span between
    // them un-erased → ghost. For every row inside at least one detected text
    // region, union all text x-extents on that row, but (FIX 2) white-fill only
    // the INK-MASKED pixels so flame/art content under a widened box is preserved
    // and no white void is stretched where there is no lettering. Rows with
    // almost no masked ink are left alone. Never touches a replaceable image.
    if (opts?.aggressive && opts?.whiteFill && textRegions.length) {
      const inImg = (px_: number, py_: number) =>
        imageBlocks.some((b) => px_ >= b.x0 && px_ <= b.x1 && py_ >= b.y0 && py_ <= b.y1);
      const rowBoxes = new Array<Array<[number, number]>>(H);
      for (const region of textRegions) {
        const b0 = Math.max(0, Math.floor(region.y * H));
        const b1 = Math.min(H - 1, Math.ceil((region.y + region.h) * H) - 1);
        const bx0 = Math.max(0, Math.floor(region.x * W));
        const bx1 = Math.min(W - 1, Math.ceil((region.x + region.w) * W) - 1);
        for (let y = b0; y <= b1; y++) (rowBoxes[y] ||= []).push([bx0, bx1]);
      }
      // Group rows that share a contiguous union band so we build ONE
      // buildLocalBgMap per band (efficient, stable bg per row).
      const bands = new Map<number, { y0: number; y1: number; ux0: number; ux1: number }>();
      for (let y = 0; y < H; y++) {
        const boxes = rowBoxes[y];
        if (!boxes || !boxes.length) continue;
        let ux0 = W, ux1 = -1;
        for (const [a, b] of boxes) { if (a < ux0) ux0 = a; if (b > ux1) ux1 = b; }
        if (ux1 < 0) continue;
        const last = bands.size ? [...bands.entries()].pop()![1] : null;
        if (last && y <= last.y1 + 1 && ux0 <= last.ux1 + 2 && ux1 >= last.ux0 - 2) {
          last.y1 = y;
          last.ux0 = Math.min(last.ux0, ux0);
          last.ux1 = Math.max(last.ux1, ux1);
        } else {
          bands.set(y, { y0: y, y1: y, ux0, ux1 });
        }
      }
      for (const band of bands.values()) {
        const bw = band.ux1 - band.ux0 + 1;
        for (let y = band.y0; y <= band.y1; y++) {
          let inkCount = 0;
          const isInk = new Uint8Array(bw);
          const rowBg = buildLocalBgMap(pixels, W, band.ux0, y, band.ux1, y, [255, 255, 255]);
          for (let rx = 0; rx < bw; rx++) {
            const x = band.ux0 + rx;
            const i = (y * W + x) * 4;
            const lb = rowBg(x - band.ux0, 0);
            const d = Math.max(Math.abs(pixels[i] - lb[0]), Math.abs(pixels[i + 1] - lb[1]), Math.abs(pixels[i + 2] - lb[2]));
            if (d > ERASE_SOFT_DIST) { isInk[rx] = 1; inkCount++; }
          }
          if (inkCount < Math.max(2, Math.round(bw * 0.004))) continue; // no real ink on this row
          for (let rx = 0; rx < bw; rx++) {
            if (!isInk[rx]) continue;
            const x = band.ux0 + rx;
            if (inImg(x, y)) continue;
            const o = (y * W + x) * 4;
            pixels[o] = 255; pixels[o + 1] = 255; pixels[o + 2] = 255;
          }
        }
      }
    }
    const png = encodePng(W, H, pixels);
    // e51c4b81 Fix 3 support: measure each erased text region's POST-ERASE
    // surface luminance so the composite-time contrast guard can tell a
    // genuinely whitewashed box (flip near-white ink to dark) from a dark
    // surface the ink-masked fill preserved (keep light ink readable).
    const regionSurfaceLum: Record<string, number> = {};
    const lum01 = 0.2126, lum02 = 0.7152, lum03 = 0.0722;
    for (const region of textRegions) {
      const x0 = Math.max(0, Math.floor(region.x * W));
      const x1 = Math.min(W - 1, Math.ceil((region.x + region.w) * W) - 1);
      const y0 = Math.max(0, Math.floor(region.y * H));
      const y1 = Math.min(H - 1, Math.ceil((region.y + region.h) * H) - 1);
      let sum = 0, n = 0;
      for (let y = y0; y <= y1; y += 2) {
        for (let x = x0; x <= x1; x += 2) {
          const i = (y * W + x) * 4;
          sum += lum01 * pixels[i] + lum02 * pixels[i + 1] + lum03 * pixels[i + 2];
          n++;
        }
      }
      if (n) regionSurfaceLum[region.id] = sum / n;
    }
    return { imageDataUrl: `data:image/png;base64,${png.toString("base64")}`, inkBoxes, regionSurfaceLum };
  } catch (err) {
    console.error("background inpainting failed:", err);
    return undefined;
  }
}

/**
 * Manual text-box authoring pivot (task e0f2e06f, owner-directed): produce a
 * TEXT-ERASED copy of a template raster where EVERY detected text region's
 * lettering is inpainted away (background/photo preserved) — "like the text
 * was never there". Images are untouched. Unlike normal render-time inpainting
 * (which only erases regions that carry a replacement), this erases ALL text
 * regions regardless of their text, because the user now authors text manually.
 * Returns a PNG data URL, or undefined if there is nothing to erase / decode
 * fails (callers fall back to the raw template).
 */
export function eraseAllTemplateText(
  templateImage: string,
  regions: TemplateRegion[],
  templateWidth?: number,
  templateHeight?: number,
): string | undefined {
  const textRegions = regions.filter((r) => r.kind === "text");
  if (!textRegions.length) return undefined;
  const regionText: Record<string, string> = {};
  for (const r of textRegions) regionText[r.id] = "";
  // Aggressive full-text-erasure mode (owner ghosting fix, task 0ba6568c): the
  // manual-authoring pivot erases ENTIRE text regions, so we use stricter
  // thresholds + relaxed halo rule + 1px dilation (see ERASE_* constants).
  // OWNER DECISION (task 59e17c23): uploaded custom-raster templates now fill the
  // erased region with a solid WHITE box (whiteFill) rather than local-fill, so
  // the result is deterministic-clean on any background (no ghost/smear).
  return inpaintTemplateBackground(templateImage, regions, regionText, templateWidth, templateHeight, { aggressive: true, whiteFill: true })?.imageDataUrl;
}
