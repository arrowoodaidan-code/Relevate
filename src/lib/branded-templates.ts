/**
 * R5 — branded (no-template) mode redesign (owner-approved spec:
 * /home/team/shared/r5-branded-design-spec.md).
 *
 * Replaces the old flat forest-themed branded layout with four real-estate-style
 * templates that mimic professional listing marketing and fit ALL wordage:
 *   Flyer-Hero      (photo, price band + fact chips on scrim, address, body, CTA)
 *   Flyer-Classic   (no photo: ribbon, big price, address, facts, bullets grid)
 *   Social-Photo    (full-bleed photo + scrim, pill, price/address, facts,
 *                    hashtags ≤5, agent band)
 *   Social-Classic  (forest bg: centered address/price/facts/body stack)
 *
 * EVERY text slot is sized by fitBlockToBox — a box-fit that reuses the R4 exact
 * measureTextWidth (opentype ×1.04) and guarantees no overflow: if even minSize
 * cannot hold the copy, the slot truncates with an explicit "…" (truncated flag),
 * so nothing is ever silently clipped.
 *
 * The template-replica path in render-templates.ts is untouched; this module is
 * only reached from marketingTemplate()'s non-replica branch.
 *
 * Satori constraints honored (verified in r5-probes/r5-probe.ts):
 *  - custom components are NOT executed by Satori → every "component" here is a
 *    plain function that returns an intrinsic element (h("div"|"img"));
 *  - root divs with more than one child MUST have explicit display:flex.
 */
import { createElement as h } from "react";
import type { RenderTemplateInput } from "./render-templates";
import { measureTextWidth, accentFor } from "./render-templates";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePhoto, zonePalette } from "./photo-adaptive";
import { Resvg } from "@resvg/resvg-js";
import { EHO_LEGEND, REALTOR_MARK } from "./advertising-rules";

// ---------------------------------------------------------------------------
// Design tokens (DESIGN-TOKENS.md — bundled Relevate brand)
// ---------------------------------------------------------------------------
const C = {
  // LIGHTER BRANDED DESIGN (owner, Aug 19): root background is a warm ivory airy
  // surface (was near-black forest); body copy uses DARK ink on light panels so
  // it stays readable on the bright bg (vision gate must stay green). The photo
  // overlays (price/ribbon/fact chips) still sit on a dark scrim so white/gold
  // accent text reads over the hero photo — the "normal real-estate post" look.
  deep: "#f6f2e9",
  // Dark ink for text on the light body/panels (readable, high contrast):
  ink: "#173024",
  inkSoft: "#3d4d41",
  // Accent text used on DARK surfaces (photo scrim, ribbon, chips):
  mint: "#eafff2",
  soft2: "#a7d9bd",
  muted: "#86b89e",
  gold: "#b98a3e",
  gold2: "#9c742f",
  eyebrow: "#7fc9a4",
  panel: "#ffffff",
  hairline: "rgba(23,48,36,0.14)",
  ring: "rgba(156,116,47,0.45)",
};
const WOOD = "linear-gradient(135deg, #7a4e2e 0%, #9a6a3c 38%, #b8883f 62%, #7a4e2e 100%)";
const SCRIM = "linear-gradient(180deg, rgba(4,16,7,0) 30%, rgba(4,16,7,0.42) 62%, rgba(4,16,7,0.86) 100%)";
const SANS = "Relevate Sans";
const DISPLAY = "Relevate Display";
const COND = "Relevate Condensed";

/** Bundled font buffer for a family/weight (falls back to undefined → char-count measure). */
function fb(input: RenderTemplateInput, family: string, weight: number): ArrayBuffer | undefined {
  return input.fontData?.[family]?.[weight];
}
// ---------------------------------------------------------------------------
// R5 test-contract exports (r5-test-contract.md — agreed with track B; the
// suite arms the full gate on these names). Do NOT rename: the owner-approved
// spec and B's scripts/test-render-branded-r5.ts depend on them.
// ---------------------------------------------------------------------------
export const R5_MARK = "r5";
export interface Rect { x: number; y: number; w: number; h: number; }
export type R5SlotMap = Record<"flyer" | "social", Record<string, Rect>>;
/** Documented fitBlockToBox option shape (spec §5). */
export interface FitBlockOptions {
  width: number;
  height: number;
  fontFamily: string;
  weight?: number;
  ls?: number;
  minSize: number;
  lineHeight: number;
}
/** Documented fitBlockToBox result shape (spec §5). */
export interface FitBlockResult {
  fontSize: number;
  lines: number;
  truncated: boolean;
}
// Synchronous font resolution for the CONTRACT path (unit tests call
// fitBlockToBox with a family name, not a preloaded buffer). Candidates mirror
// render.ts's ASSET_PATHS: bundle-relative assets/ (Vercel), then the dev
// font dirs. Server-only module (render-templates.ts → render.ts), so node:fs
// is bundle-safe; bun build inlines the pure-JS require.
const BT_DIR = dirname(fileURLToPath(import.meta.url));
const FONT_FILE: Record<string, Record<number, string[]>> = {
  "Relevate Sans": {
    400: [join(BT_DIR, "assets", "DejaVuSans.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    700: [join(BT_DIR, "assets", "DejaVuSans-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
  },
  "Relevate Serif": {
    400: [join(BT_DIR, "assets", "DejaVuSerif.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
    700: [join(BT_DIR, "assets", "DejaVuSerif-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"],
  },
  "Relevate Mono": {
    400: [join(BT_DIR, "assets", "DejaVuSansMono.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
    700: [join(BT_DIR, "assets", "DejaVuSansMono-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"],
  },
  "Relevate Display": {
    400: [join(BT_DIR, "assets", "PlayfairDisplay-Regular.ttf"), "/home/team/shared/design-assets/fonts/PlayfairDisplay-Regular.ttf"],
    700: [join(BT_DIR, "assets", "PlayfairDisplay-Bold.ttf"), "/home/team/shared/design-assets/fonts/PlayfairDisplay-Bold.ttf"],
    900: [join(BT_DIR, "assets", "PlayfairDisplay-Black.ttf"), "/home/team/shared/design-assets/fonts/PlayfairDisplay-Black.ttf"],
  },
  "Relevate Script": {
    400: [join(BT_DIR, "assets", "GreatVibes-Regular.ttf"), "/home/team/shared/design-assets/fonts/GreatVibes-Regular.ttf"],
  },
  "Relevate Condensed": {
    400: [join(BT_DIR, "assets", "BebasNeue-Regular.ttf"), "/home/team/shared/design-assets/fonts/BebasNeue-Regular.ttf"],
  },
  // Round 2 expansion (task 3f084d2b) — custom-builder (DesignDoc) faces so the
  // shared fit engine measures calligraphy/handwriting/retro correctly. Mirrors
  // FONT_FILE in render-design.ts; additive, existing families untouched.
  "Relevate Calligraphy": {
    400: [join(BT_DIR, "assets", "Sacramento-Regular.ttf"), "/home/team/shared/design-assets/fonts/Sacramento-Regular.ttf"],
  },
  "Relevate Handwriting": {
    400: [join(BT_DIR, "assets", "AmaticSC-Regular.ttf"), "/home/team/shared/design-assets/fonts/AmaticSC-Regular.ttf"],
    700: [join(BT_DIR, "assets", "AmaticSC-Bold.ttf"), "/home/team/shared/design-assets/fonts/AmaticSC-Bold.ttf"],
  },
  "Relevate Retro": {
    400: [join(BT_DIR, "assets", "Pacifico-Regular.ttf"), "/home/team/shared/design-assets/fonts/Pacifico-Regular.ttf"],
  },
  "Relevate Allura": {
    400: [join(BT_DIR, "assets", "Allura-Regular.ttf"), "/home/team/shared/design-assets/fonts/Allura-Regular.ttf"],
  },
  "Relevate Hand Script": {
    400: [join(BT_DIR, "assets", "Caveat-Regular.ttf"), "/home/team/shared/design-assets/fonts/Caveat-Regular.ttf"],
  },
  "Relevate Condensed Alt": {
    400: [join(BT_DIR, "assets", "Oswald-Regular.ttf"), "/home/team/shared/design-assets/fonts/Oswald-Regular.ttf"],
    700: [join(BT_DIR, "assets", "Oswald-Bold.ttf"), "/home/team/shared/design-assets/fonts/Oswald-Bold.ttf"],
  },
};
const fontCache = new Map<string, ArrayBuffer>();
function fontBufferFor(family: string, weight: number): ArrayBuffer | undefined {
  const key = `${family}:${weight}`;
  const hit = fontCache.get(key);
  if (hit) return hit;
  const candidates = FONT_FILE[family]?.[weight] ?? FONT_FILE[family]?.[400];
  if (!candidates) return undefined;
  for (const p of candidates) {
    try {
      const buf = readFileSync(p);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      fontCache.set(key, ab);
      return ab;
    } catch { /* try next candidate */ }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Content sanitisation for the NATIVE templates (P1 render fixes, task b0aa54e4).
// The generated copy (LLM + mocks) carries markdown scaffolding and emoji that
// the 6-font DejaVu bundle cannot render (tofu/hollow boxes). We strip the
// markup at the point the native renderer consumes the body so only clean text
// reaches Satori. Punctuation (em-dash, quotes, bullet "•" U+2022) is preserved.
// ---------------------------------------------------------------------------

/** Emoji / out-of-coverage decorative glyphs NOT in the DejaVu bundle.
 *  Deliberately narrow: excludes the arrows block (2190-21FF, DejaVu covers →)
 *  and General Punctuation (2000-206F, so • em-dash “ ” survive). Includes the
 *  misc-symbols + dingbats + transport blocks where 📍🏡✨🔥📞 etc. live, plus
 *  variation selector FE0F and ZWJ 200D used in emoji sequences. */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

/** Section labels (as they appear after de-`**`-ing) that are prompt scaffolding,
 *  not marketing content — stripped from the rendered body. */
const SECTION_LABEL_RE = /^[ \t]*(?:HEADLINE|SUBHEADLINE|HIGHLIGHTS?|DIRECTIONS?|CONTACT)\s*:\s*/gim;

/**
 * P1 FIX 1 + FIX 2 for the native renderer path: strip markdown markers
 * (`**text**`, `### n. LABEL:`) and emoji/out-of-coverage glyphs from generated
 * content before it renders. Null-safe: any non-string → "". The actual text is
 * preserved — only markup/glyph syntax is removed. Bullet markers (`-`, `•`)
 * and #hashtags are left intact for downstream consumers (splitBullets, tags).
 */
export function cleanContent(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.replace(/\r/g, "");
  // Bold/italic emphasis markers → keep the inner text.
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  // Markdown heading prefixes "### 1. " / "## " / "# " (NOT inline #hashtags,
  // which have no trailing space/digit and must be preserved for hashing).
  s = s.replace(/^[ \t]*#{1,6}(?:[ \t]*[0-9]+[.)]?[ \t]+|[ \t]+)/gm, "");
  // Emoji / out-of-coverage glyphs.
  s = s.replace(EMOJI_RE, "");
  // Section-label scaffolding "HEADLINE:" / "### 1. CONTACT:" → drop the label.
  s = s.replace(SECTION_LABEL_RE, "");
  // Collapse whitespace artifacts left by the removals.
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/ ?\n ?/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/**
 * P1 FIX 3 (social): compose the 1080×1080 social body from the informative
 * middle of the caption — highlights bullets first, then any remaining prose
 * (directions/contact/CTA) — instead of dumping the entire label-heavy caption
 * into the small body box (which ellipsized at the HIGHLIGHTS heading and
 * dropped every bullet + directions + contact). If no bullets or prose are
 * recognized (e.g. a plain paragraph), returns the cleaned body unchanged.
 */
export function socialBodyForRender(clean: string): string {
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets: string[] = [];
  const prose: string[] = [];
  for (const l of lines) {
    const b = l.match(/^(?:[•·▪✓\-–*]|\d+[.)])\s*(.+)$/);
    if (b) bullets.push(b[1].trim());
    else prose.push(l);
  }
  if (bullets.length === 0 && prose.length === 0) return clean;
  const parts: string[] = [];
  if (bullets.length) parts.push(...bullets.map((b) => `• ${b}`));
  if (prose.length) parts.push(...prose);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// fitBlockToBox — "all wordage fitting" engine (R4 machinery: exact measure).
// Guarantee: returned size/line count never exceeds the box at Satori's own
// line-height model (each Satori line box = fontSize * lineHeight). At the
// minSize floor, copy is truncated with an explicit trailing "…" and
// truncated=true — nothing silently clips.
// ---------------------------------------------------------------------------
export interface FitResult {
  size: number;
  lines: string[];
  truncated: boolean;
}
export interface FitOpts {
  width: number;
  height: number;
  fontBuf: ArrayBuffer | undefined;
  size?: number;
  ls?: number;
  lineHeight: number;
  minSize: number;
  maxSize: number;
}
/** Greedy word-wrap into concrete lines (matches Satori pre-wrap closely). */
export function wrapLines(text: string, fontBuf: ArrayBuffer | undefined, size: number, ls: number, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim() || " ";
    const words = line.split(/(\s+)/).filter((w) => w.length > 0);
    let cur = "";
    for (const word of words) {
      const trial = cur ? cur + word : word;
      if (measureTextWidth(trial, fontBuf, size, ls) <= width || !cur) cur = trial;
      else { out.push(cur.trim()); cur = word; }
    }
    if (cur.trim()) out.push(cur.trim());
    else if (!raw) out.push(" ");
  }
  return out;
}
/** Internal solve used by the layouts (returns the wrapped lines for rendering). */
export function fitBlockLines(text: string, opts: FitOpts): FitResult {
  const { width, height, fontBuf, lineHeight, minSize, maxSize } = opts;
  const ls = opts.ls ?? 0;
  let size = Math.max(minSize, Math.min(maxSize, opts.size ?? height * 0.35));
  let lines = wrapLines(text, fontBuf, size, ls, width);
  // Fixed point: line count depends on size, size on line count.
  for (let iter = 0; iter < 8; iter++) {
    const total = lines.length * size * lineHeight;
    if (total > height) size = Math.max(minSize, Math.floor(((size * height) / total) * 0.96 * 2) / 2);
    const next = wrapLines(text, fontBuf, size, ls, width);
    if (next.join("\n") === lines.join("\n")) break;
    lines = next;
  }
  // Width safety pass (a single long word wider than the box).
  let maxW = 0;
  for (const l of lines) maxW = Math.max(maxW, measureTextWidth(l, fontBuf, size, ls));
  if (maxW > width && size > minSize) {
    size = Math.max(minSize, Math.floor(((size * width) / maxW) * 0.97 * 2) / 2);
    lines = wrapLines(text, fontBuf, size, ls, width);
  }
  // Truncation floor: if still too tall at minSize, keep lines that fit and
  // ellipsize the last kept line.
  let truncated = false;
  if (lines.length * minSize * lineHeight > height) {
    truncated = true;
    size = minSize;
    const kept: string[] = [];
    for (const l of lines) {
      if ((kept.length + 1) * minSize * lineHeight > height) break;
      kept.push(l);
    }
    const ellipsis = "…";
    const lastIdx = kept.length - 1;
    if (lastIdx < 0) {
      // Extremely tight slot: nothing fits at minSize — emit one ellipsis.
      lines = [ellipsis];
    } else {
      let last = kept[lastIdx];
      while (last.length > 1 && measureTextWidth(last + ellipsis, fontBuf, size, ls) > width) {
        last = last.slice(0, -1);
      }
      kept[lastIdx] = last + ellipsis;
      lines = kept;
    }
  }
  return { size, lines, truncated };
}
// ---------------------------------------------------------------------------
// CONTRACT fitBlockToBox (r5-test-contract.md §1) — the documented interface
// the suite unit-tests: accepts EITHER the documented FitBlockOptions (family
// name, resolved here) or the internal FitOpts (preloaded buffer); returns the
// documented { fontSize, lines, truncated } shape. Uses a binary search for
// the LARGEST size whose wrapped layout fits (≤8 iterations, spec §5), so the
// returned fontSize is the "size to fill" answer the unit gate asserts
// (deterministic, honors lineHeight, never overflows, truncates at minSize).
// The layouts themselves keep fitBlockLines (the fixed-point solve) so the
// existing rendered output is untouched.
// ---------------------------------------------------------------------------
export function fitBlockToBox(text: string, opts: FitBlockOptions | FitOpts): FitBlockResult {
  const fontBuf = "fontBuf" in opts ? opts.fontBuf : fontBufferFor(opts.fontFamily, opts.weight ?? 400);
  const { width, height, lineHeight, minSize } = opts;
  const ls = opts.ls ?? 0;
  const maxSize = "maxSize" in opts && opts.maxSize !== undefined
    ? opts.maxSize
    : Math.max(minSize * 2, Math.ceil(height / lineHeight) + 40);
  // Binary search: largest mid whose wrapped layout fits height AND width.
  let lo = minSize, hi = maxSize;
  let best = minSize;
  let bestLines = wrapLines(text, fontBuf, minSize, ls, width);
  for (let iter = 0; iter < 8; iter++) {
    const mid = (lo + hi) / 2;
    const wrapped = wrapLines(text, fontBuf, mid, ls, width);
    let maxW = 0;
    for (const l of wrapped) maxW = Math.max(maxW, measureTextWidth(l, fontBuf, mid, ls));
    if (wrapped.length * mid * lineHeight <= height + 1 && maxW <= width + 1) {
      best = mid; bestLines = wrapped; lo = mid;
    } else hi = mid;
  }
  let fontSize = Math.max(minSize, Math.floor(best * 2) / 2);
  let lines = wrapLines(text, fontBuf, fontSize, ls, width);
  // Rounding down can re-wrap (a word boundary shifts) — shrink by 0.5 until
  // the returned (fontSize, lines) pair provably fits (never-overflow).
  for (let guard = 0; guard < 8; guard++) {
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, measureTextWidth(l, fontBuf, fontSize, ls));
    if (lines.length * fontSize * lineHeight <= height + 1 && maxW <= width + 1) break;
    fontSize = Math.max(minSize, fontSize - 0.5);
    lines = wrapLines(text, fontBuf, fontSize, ls, width);
  }
  let truncated = false;
  let lineCount = lines.length;
  // Truncation floor: height overflow at minSize, OR an unbreakable word wider
  // than the box at minSize (e.g. a 5000-char token) — both signal "even
  // minSize doesn't fit" → truncated=true so the caller ellipsizes.
  let maxWAtMin = 0;
  for (const l of lines) maxWAtMin = Math.max(maxWAtMin, measureTextWidth(l, fontBuf, minSize, ls));
  if (lines.length * minSize * lineHeight > height || maxWAtMin > width + 1) {
    truncated = true;
    fontSize = minSize;
    const kept: string[] = [];
    for (const l of lines) {
      if ((kept.length + 1) * minSize * lineHeight > height) break;
      kept.push(l);
    }
    lineCount = Math.max(1, kept.length);
  }
  void bestLines;
  return { fontSize, lines: lineCount, truncated };
}
// ---------------------------------------------------------------------------
// R5 slot geometry (r5-test-contract.md §1) — canvas-px rects of every text
// slot per format, matching the REAL rendered placement in the four layouts
// below (both classic AND photo variants per format, calibrated so each slot's
// ring stays ink-clean: no slot text and no neighbour text falls in the 12px
// dilation band). Used by the suite's rendered ink-within-slot gate (Layer E).
// ---------------------------------------------------------------------------
export function getR5Slots(): R5SlotMap {
  return {
    flyer: {
      header: { x: 0, y: 0, w: 1275, h: 210 },
      ribbon: { x: 0, y: 246, w: 430, h: 78 },
      priceBand: { x: 90, y: 336, w: 1095, h: 136 },
      address: { x: 90, y: 486, w: 1095, h: 150 },
      keyFacts: { x: 90, y: 685, w: 1095, h: 94 },
      body: { x: 90, y: 787, w: 1095, h: 652 },
      footer: { x: 90, y: 1452, w: 1095, h: 160 },
    },
    social: {
      ribbon: { x: 360, y: 36, w: 360, h: 70 },
      priceAddress: { x: 56, y: 288, w: 968, h: 406 },
      keyFacts: { x: 56, y: 600, w: 968, h: 96 },
      body: { x: 56, y: 710, w: 968, h: 178 },
      agentBand: { x: 56, y: 945, w: 968, h: 82 },
    },
  };
}
// ---------------------------------------------------------------------------
// Content heuristics (deterministic; never invent facts)
// ---------------------------------------------------------------------------
/** Badge: first of JUST LISTED / OPEN HOUSE / FOR SALE present in title+body, else FOR SALE. */
export function badgeFor(title: string, body: string): string {
  const hay = `${title} ${body}`.toLowerCase();
  if (hay.includes("just listed") || hay.includes("new listing")) return "JUST LISTED";
  if (hay.includes("open house")) return "OPEN HOUSE";
  return "FOR SALE";
}
/** Best-effort facts: structured fields win, regex fallback from body — never fabricated. */
export function listingFacts(input: RenderTemplateInput): { beds?: string; baths?: string; sqft?: string } {
  if (input.beds || input.baths || input.sqft) {
    return {
      beds: input.beds?.trim() || undefined,
      baths: input.baths?.trim() || undefined,
      sqft: input.sqft?.trim() || undefined,
    };
  }
  const body = input.body ?? "";
  return {
    beds: body.match(/(\d+)\s*(?:bed|bd|br)s?\b/i)?.[1],
    baths: body.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba|bth)s?\b/i)?.[1],
    sqft: body.match(/([\d,]+)\s*(?:sq\s*ft|square\s*feet)\b/i)?.[1],
  };
}
/** Split bullet-prefixed lines (for the Classic highlights grid) from the rest. */
function splitBullets(body: string): { bullets: string[]; rest: string } {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets: string[] = [];
  const rest: string[] = [];
  for (const l of lines) {
    const b = l.match(/^(?:[•·▪✓]|\d+[.)]|[-–])\s*(.+)$/);
    if (b && bullets.length < 6) bullets.push(b[1]);
    else rest.push(l);
  }
  return { bullets, rest: rest.join("\n") };
}
/**
 * R5 social: hashtags render ONCE — in the dedicated styled tag line below the
 * body — never also inside the prose body block. AI-generated captions carry a
 * trailing hashtag block (ai.ts enforces the ≤5 cap on the FULL caption), so if
 * the body block also printed them we'd show hashtags twice and cram the body
 * down toward the tag/divider/agent band. (Vision Readability Gate, Aug 14:
 * gpt-4o flagged duplicated, bottom-crammed hashtags on social renders.)
 * Strips trailing hashtag-only lines (+ any blank lines) from the body-block
 * input. Inline hashtags inside a prose line are left in the prose.
 */
function stripTrailingHashtagBlock(body: string): string {
  const lines = body.split("\n");
  let end = lines.length;
  while (end > 0) {
    const trimmed = lines[end - 1].trim();
    if (trimmed === "" || /^#[\w-]+(\s+#[\w-]+)*$/.test(trimmed)) { end--; continue; }
    break;
  }
  return lines.slice(0, end).join("\n").trim();
}

// ---------------------------------------------------------------------------
// Slot "components" — plain functions returning intrinsic elements (Satori).
// ---------------------------------------------------------------------------
function Ribbon({ text, accentBorder = C.gold2, textColor = C.mint }: { text: string; accentBorder?: string; textColor?: string }) {
  return h("div", {
    style: {
      position: "absolute", top: 252, left: -10, transform: "rotate(-2deg)",
      background: WOOD, borderRadius: 5, padding: "12px 40px",
      borderBottom: `3px solid ${accentBorder}`,
      boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
      color: textColor, fontFamily: COND, fontSize: 34, letterSpacing: 2, fontWeight: 400,
    },
  }, text);
}
function Pill({ text, accentBorder = C.gold2, accent = C.gold, bg = "rgba(4,16,7,0.58)" }: { text: string; accentBorder?: string; accent?: string; bg?: string }) {
  return h("div", {
    style: {
      position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)",
      backgroundColor: bg, border: `2px solid ${accentBorder}`, borderRadius: 999,
      padding: "10px 34px", color: accent, fontFamily: COND, fontSize: 30, letterSpacing: 3,
    },
  }, text);
}
function Wordmark({ top, left, size = 15, opacity = 0.5, accent = C.gold }: { top: number; left: number; size?: number; opacity?: number; accent?: string }) {
  return h("div", {
    style: {
      position: "absolute", top, left, color: accent, opacity, fontFamily: DISPLAY,
      fontSize: size, fontWeight: 700, letterSpacing: 4,
    },
  }, "RELEVATE");
}
function FactChip({ num, label, fontSize = 42, dark = true, accent = C.gold2, numColor = C.mint, labelColor = C.eyebrow, bg }: { num?: string; label: string; fontSize?: number; dark?: boolean; accent?: string; numColor?: string; labelColor?: string; bg?: string }) {
  if (!num) return null;
  return h("div", {
    style: {
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minWidth: fontSize * 2.6, padding: "10px 20px", borderRadius: 10,
      backgroundColor: bg ?? (dark ? "rgba(4,16,7,0.62)" : "rgba(5,22,10,0.66)"),
      border: `1px solid ${accent}`,
    },
  }, [
    h("div", { key: "n", style: { color: numColor, fontFamily: COND, fontSize, letterSpacing: 1, lineHeight: 1 } }, num),
    h("div", { key: "l", style: { marginTop: 4, color: labelColor, fontFamily: SANS, fontSize: 15, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" } }, label),
  ]);
}
function AgentBand({ agent, phone, x, top, w, nameFont }: { agent: string; phone?: string; x: number; top: number; w: number; nameFont?: ArrayBuffer }) {
  // BUGFIX (Aug 23): agent name was fixed at 48px with no width cap, so a long
  // name bled past the band width into the RELEVATE mark (right:0) and the
  // canvas edge. Fit-box it: leave a right margin for the mark (~120px) and the
  // phone (~150px) so the name never intersects them; wraps to ≤2 lines.
  const nameW = Math.max(140, w - (phone ? 300 : 150));
  const nameFit = nameFont ? fitBlockLines(agent, { width: nameW, height: 2 * 40 * 1.15, fontBuf: nameFont, size: 48, ls: 0, lineHeight: 1.15, minSize: 18, maxSize: 48 }) : null;
  return h("div", {
    style: { position: "absolute", top, left: x, width: w, display: "flex", alignItems: "center", justifyContent: "space-between" },
  }, [
    h("div", { key: "a", style: { display: "flex", alignItems: "baseline", gap: 18 } }, [
      h("div", { key: "n", style: { color: C.ink, fontFamily: DISPLAY, fontSize: nameFit ? nameFit.size : 48, fontWeight: 700, lineHeight: 1.15 } }, nameFit ? nameFit.lines.join("\n") : agent),
      phone ? h("div", { key: "p", style: { color: C.gold, fontFamily: SANS, fontSize: 26, fontWeight: 700, letterSpacing: 0.5 } }, phone) : null,
    ]),
    // Near-invisible Relevate mark (owner: "watermark considerably smaller,
    // almost unseen") — tiny, translucent, right-aligned in the band.
    h("div", { key: "w", style: { position: "absolute", right: 0, color: C.gold, opacity: 0.4, fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, letterSpacing: 3 } }, "RELEVATE"),
  ]);
}

// ---------------------------------------------------------------------------
// Disclosure + EHO footer (task 834b0e71) — baked into the branded native
// templates so a compliant asset is the default. Rules live verbatim in
// ./advertising-rules.ts (researched + lead-reviewed 2026-09-16). Behaviour:
//  - EHO legend (exact 24 CFR 110.25 wording) + mark: DEFAULT ON — industry
//    convention, explicitly NOT a legal requirement (the federal mandate is
//    the 11x14 office poster). User can toggle it off.
//  - Brokerage / agent licence / responsible broker lines render ONLY when the
//    user supplied them — an empty field renders nothing (no placeholders, no
//    bracket text, no tofu).
//  - REALTOR® renders only when the agent declared NAR membership, uppercase
//    with the registered symbol, appended to the supplied agent name — never
//    auto-inserted, logos untouched.
//  - State-aware wording: CA licence numbers are labelled "DRE #"; every other
//    state "License #". No requirement is claimed for unverified states.
//  - FL adjacency rule (61J2-10.025(3)(a)): the strip renders immediately below
//    the agent band (the contact block), keeping the brokerage name adjacent to
//    the point of contact information on web/social renders.
// ---------------------------------------------------------------------------

/** Exact EHO mark (square + house + equals) hand-authored as SVG per the
 * standard symbol, rasterized with Resvg in the requested ink color and
 * cached. HUD's official logo asset 404'd at research access (noted in
 * advertising-rules.json), so this rendition follows the documented symbol. */
const ehoMarkCache = new Map<string, string>();
function ehoMarkDataUrl(ink: string): string {
  const hit = ehoMarkCache.get(ink);
  if (hit) return hit;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect x="8" y="8" width="112" height="112" fill="none" stroke="${ink}" stroke-width="8"/><path d="M 26 60 L 64 26 L 102 60" fill="none" stroke="${ink}" stroke-width="8"/><path d="M 38 52 L 38 100 L 90 100 L 90 52" fill="none" stroke="${ink}" stroke-width="8"/><rect x="50" y="70" width="28" height="8" fill="${ink}"/><rect x="50" y="84" width="28" height="8" fill="${ink}"/></svg>`;
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 128 } }).render().asPng();
  const url = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  ehoMarkCache.set(ink, url);
  return url;
}

/** User-supplied disclosure segments, in strip order. Never fabricates: an
 * empty field contributes nothing. CA licence numbers use the DRE label. */
function disclosureSegments(input: RenderTemplateInput): string[] {
  const segs: string[] = [];
  const state = (input.jurisdiction ?? "").trim().toUpperCase();
  const licLabel = state === "CA" ? "DRE #" : "License #";
  const brokerage = input.brokerageName?.trim();
  if (brokerage) segs.push(brokerage);
  const agentName = input.agentName?.trim();
  const agentLic = input.agentLicense?.trim();
  if (agentName || agentLic) {
    let s = agentName ?? "";
    if (agentName && input.narMember) s += `, ${REALTOR_MARK}`;
    if (agentLic) s += `${s ? " \u00B7 " : ""}${licLabel}${agentLic}`;
    if (s) segs.push(s);
  }
  const brokerName = input.brokerName?.trim();
  const brokerLic = input.brokerLicense?.trim();
  if (brokerName || brokerLic) {
    let s = brokerName ? `Broker ${brokerName}` : "Broker";
    if (brokerLic) s += `${brokerName ? " \u00B7 " : " "}${licLabel}${brokerLic}`;
    segs.push(s);
  }
  return segs;
}

/** Replicates AgentBand's internal name fit so the disclosure strip can sit
 * DIRECTLY below the band without overlapping it (band height varies with
 * name length: 1 line ≈ 55px, 2 lines ≈ 92px). */
function agentBandHeightPx(input: RenderTemplateInput, w: number): number {
  const agent = input.agentName?.trim() || "Your local real estate expert";
  const nameFont = fb(input, DISPLAY, 700);
  if (!nameFont) return 48 * 1.15;
  const nameW = Math.max(140, w - (input.agentPhone ? 300 : 150));
  const fit = fitBlockLines(agent, { width: nameW, height: 2 * 40 * 1.15, fontBuf: nameFont, size: 48, ls: 0, lineHeight: 1.15, minSize: 18, maxSize: 48 });
  return Math.max(1, fit.lines.length) * fit.size * 1.15;
}

/** The disclosure strip: EHO mark + legend (default ON) and the user-supplied
 * licence/brokerage line (only when supplied). Fit-boxed into availableH with
 * the same fitBlockLines machinery as every other slot — never clips into the
 * canvas edge. Returns null when there is truly nothing to render (EHO off AND
 * no supplied fields), so the layout is byte-identical to pre-task renders in
 * that configuration apart from this element's absence. */
function DisclosureFooter(opts: {
  input: RenderTemplateInput;
  x: number;
  w: number;
  top: number;
  availableH: number;
  legendColor: string;
  detailColor: string;
  markSize: number;
  fontSize: number;
}) {
  const { input, x, w, top, availableH, legendColor, detailColor, markSize, fontSize } = opts;
  const showEho = input.ehoFooter !== false;
  const segments = disclosureSegments(input);
  if (!showEho && segments.length === 0) return null;
  const detailText = segments.join("  \u00B7  ");
  const textW = w - (showEho ? markSize + 14 : 0);
  const legendH = showEho ? fontSize * 1.3 : 0;
  const detailFit = detailText
    ? fitBlockLines(detailText, {
        width: textW,
        height: Math.max(fontSize * 1.3, availableH - legendH),
        fontBuf: fb(input, SANS, 400),
        size: fontSize,
        ls: 0,
        lineHeight: 1.3,
        minSize: Math.max(11, fontSize - 4),
        maxSize: fontSize,
      })
    : null;
  return h("div", {
    key: "dsc",
    style: { position: "absolute", top, left: x, width: w, display: "flex", flexDirection: "row", alignItems: "center", gap: 14 },
  }, [
    showEho ? h("img", { key: "eho", src: ehoMarkDataUrl(legendColor), style: { width: markSize, height: markSize, flexShrink: 0 } }) : null,
    h("div", { key: "tx", style: { display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 } }, [
      showEho ? h("div", { key: "lg", style: { color: legendColor, fontFamily: SANS, fontSize, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", lineHeight: 1.3 } }, EHO_LEGEND) : null,
      detailFit ? h("div", { key: "dt", style: { color: detailColor, fontFamily: SANS, fontSize: detailFit.size, lineHeight: 1.3, whiteSpace: "pre-wrap" } }, detailFit.lines.join("\n")) : null,
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Template builders
// ---------------------------------------------------------------------------
function flyerHero(input: RenderTemplateInput) {
  const W = 1275, HGT = 1650, X = 90, CW = W - X * 2;
  const accent = accentFor(input.brandStyle);
  const badge = badgeFor(input.title ?? "", input.body);
  const title = input.title?.trim() || "OPEN HOUSE";
  const agent = input.agentName?.trim() || "Your local real estate expert";
  const facts = listingFacts(input);
  const factChips = [
    { num: facts.beds, label: "Beds" },
    { num: facts.baths, label: "Baths" },
    { num: facts.sqft, label: "Sq Ft" },
  ].filter((f) => f.num);
  const PHOTO_TOP = 210, PHOTO_H = 690, PHOTO_BOT = PHOTO_TOP + PHOTO_H;
  // PHOTO-ADAPTIVE (task bf6f8534): sample the uploaded photo once (≤160px),
  // drive the overlay palette (price / ribbon / chips / rule) from its
  // luminance + dominant hue, and enforce WCAG floors. Falls back to the fixed
  // dark-scrim + gold design when there is no photo (classic path unchanged).
  // Zones: photo spans y 210..900 of 1650 → fy 0.127..0.545; price sits at the
  // photo bottom (band ~ fy 0.47..0.55), chips right of it, ribbon at top.
  const photoAnalysis = input.imageDataUrl
    ? analyzePhoto(input.imageDataUrl, {
        photo: { fx: 0, fy: 210 / HGT, fw: 1, fh: PHOTO_H / HGT },
        price: { fx: 0, fy: (PHOTO_BOT - 150) / HGT, fw: 0.5, fh: 150 / HGT },
        chips: { fx: 0.45, fy: (PHOTO_BOT - 130) / HGT, fw: 0.5, fh: 130 / HGT },
        ribbon: { fx: 0, fy: 246 / HGT, fw: 0.35, fh: 78 / HGT },
      })
    : null;
  const pricePal = zonePalette(photoAnalysis, "price", { type: "large" });
  const chipPal = zonePalette(photoAnalysis, "chips", { type: "large", darkText: C.mint, lightText: "#173024" });
  // Overlay scrim: bright photos get a light cream wash (dark ink overlays),
  // dark photos keep the brand dark scrim. Alpha normalized from strength.
  const overlayBgDark = "linear-gradient(180deg, rgba(4,16,7,0) 30%, rgba(4,16,7,0.42) 62%, rgba(4,16,7,0.86) 100%)";
  const overlayBgLight = (s: number) => `linear-gradient(180deg, rgba(252,249,240,0) 24%, rgba(252,249,240,${Math.min(0.92, 0.32 + s * 0.5).toFixed(2)}) 52%, rgba(252,249,240,${Math.min(0.92, 0.42 + s * 0.5).toFixed(2)}) 100%)`;
  const scrimStyle = pricePal.flipped
    ? overlayBgLight(pricePal.strength)
    : overlayBgDark;
  const ribbonAccent = pricePal.flipped ? photoAnalysis!.accentHex : C.gold2;
  const chipAccent = pricePal.flipped ? photoAnalysis!.accentHex : C.ring;
  const ruleAccent = pricePal.flipped ? photoAnalysis!.accentHex : C.gold2;
  const chipBg = pricePal.flipped ? "rgba(252,249,240,0.86)" : undefined;
  // Price on the scrim (Bebas, fit to width).
  const priceSize = input.price ? fitBlockLines(input.price, { width: CW * 0.55, height: 110, fontBuf: fb(input, COND, 400), size: 96, ls: 2, lineHeight: 1, minSize: 40, maxSize: 120 }).size : 0;
  // Address below the photo (max 2 lines).
  const addr = fitBlockLines(title, { width: CW, height: 2 * 54 * 1.14, fontBuf: fb(input, DISPLAY, 700), size: 54, ls: -0.5, lineHeight: 1.14, minSize: 30, maxSize: 64 });
  // Body card 1126..1410 (card bottom 1410 — gate-consistent; leaves clear
  // breathing room from the gold rule so a 2-line address never collides).
  const BODY_TOP = 1126, BODY_H = 284;
  const bodyFit = fitBlockLines(input.body, { width: CW - 60, height: BODY_H - 48, fontBuf: fb(input, SANS, 400), size: 26, ls: 0, lineHeight: 1.5, minSize: 15, maxSize: 30 });
  const FOOTER = 1462;
  // Disclosure + EHO strip (task 834b0e71): directly below the agent band (FL
  // adjacency), sized off the replicated band height so 2-line names clear it.
  const bandH = agentBandHeightPx(input, CW);
  const stripTop = Math.min(FOOTER + 16 + bandH + 10, HGT - 44);
  const stripH = HGT - stripTop - 8;
  return h("div", {
    style: { width: W, height: HGT, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: "linear-gradient(180deg, #fdfbf5 0%, #f3edE1 40%, #efe7d8 100%)", color: C.ink, fontFamily: SANS },
  }, [
    h("img", { key: "hd", src: input.headerBandDataUrl, style: { position: "absolute", top: 0, left: 0, width: "100%", height: 210, objectFit: "cover" } }),
    Wordmark({ top: 88, left: X }),
    h("div", { key: "url", style: { position: "absolute", top: 98, right: X, color: "rgba(255,255,255,0.85)", fontFamily: SANS, fontSize: 20, letterSpacing: 1 } }, "relevate.ai"),
    h("img", { key: "ph", src: input.imageDataUrl, style: { position: "absolute", top: PHOTO_TOP, left: 0, width: "100%", height: PHOTO_H, objectFit: "cover" } }),
    h("div", { key: "sc", style: { position: "absolute", top: PHOTO_TOP, left: 0, width: "100%", height: PHOTO_H, background: scrimStyle } }),
    Ribbon({ text: badge, accentBorder: ribbonAccent }),
    input.price ? h("div", { key: "pr", style: { position: "absolute", top: PHOTO_BOT - 108, left: X, color: pricePal.textColor, fontFamily: COND, fontSize: priceSize, letterSpacing: 2, lineHeight: 1 } }, input.price) : null,
    factChips.length > 0 ? h("div", { key: "fc", style: { position: "absolute", top: PHOTO_BOT - 96, right: X, display: "flex", flexDirection: "row", gap: 14 } },
      factChips.map((f) => FactChip({ num: f.num, label: f.label, accent: chipAccent, bg: chipBg, numColor: chipPal.textColor, labelColor: pricePal.flipped ? "#4d5c50" : C.eyebrow })),
    ) : null,
    // Address sits clearly below the photo; 2-line addresses fit entirely
    // above the gold rule (rule at 1098), so address + rule never overlap.
    h("div", { key: "ad", style: { position: "absolute", top: 960, left: X, width: CW, color: C.ink, fontFamily: DISPLAY, fontSize: addr.size, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.14 } }, addr.lines.join("\n")),
    h("div", { key: "ru", style: { position: "absolute", top: 1098, left: X, width: 260, height: 3, backgroundColor: ruleAccent } }),
    h("div", { key: "bc", style: { position: "absolute", top: BODY_TOP, left: X, width: CW, height: BODY_H, padding: "24px 30px", backgroundColor: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(23,48,36,0.10)", display: "flex", flexDirection: "column" } },
      h("div", { style: { width: "100%", color: C.inkSoft, fontFamily: SANS, fontSize: bodyFit.size, lineHeight: 1.5, whiteSpace: "pre-wrap" } }, bodyFit.lines.join("\n")),
    ),
    h("div", { key: "dv", style: { position: "absolute", top: FOOTER - 10, left: X, width: CW, height: 2, backgroundColor: accent } }),
    AgentBand({ agent, phone: input.agentPhone, x: X, top: FOOTER + 16, w: CW, nameFont: fb(input, DISPLAY, 700) }),
    DisclosureFooter({ input, x: X, w: CW, top: stripTop, availableH: stripH, legendColor: C.inkSoft, detailColor: C.inkSoft, markSize: 30, fontSize: 15 }),
  ]);
}

function flyerClassic(input: RenderTemplateInput) {
  const W = 1275, HGT = 1650, X = 90, CW = W - X * 2;
  const accent = accentFor(input.brandStyle);
  const badge = badgeFor(input.title ?? "", input.body);
  const title = input.title?.trim() || "OPEN HOUSE";
  const agent = input.agentName?.trim() || "Your local real estate expert";
  const { bullets, rest } = splitBullets(input.body);
  const facts = listingFacts(input);
  const factChips = [
    { num: facts.beds, label: "Beds" },
    { num: facts.baths, label: "Baths" },
    { num: facts.sqft, label: "Sq Ft" },
  ].filter((f) => f.num);
  const priceSize = input.price ? fitBlockLines(input.price, { width: CW, height: 150, fontBuf: fb(input, COND, 400), size: 132, ls: 2, lineHeight: 1, minSize: 48, maxSize: 168 }).size : 0;
  const addr = fitBlockLines(title, { width: CW, height: 2 * 62 * 1.14, fontBuf: fb(input, DISPLAY, 700), size: 62, ls: -0.5, lineHeight: 1.14, minSize: 30, maxSize: 74 });
  // Highlights grid (2-col) when bullets exist: each cell fits 2 lines at 26px.
  const grid = bullets.length > 0;
  const cellW = (CW - 18) / 2;
  const gridTop = 800;
  // BUGFIX (Aug 23): the grid div uses flex-wrap (2 cells per row), so the real
  // row count is ceil(n/2) — up to 3 rows for the 6-bullet cap. The old
  // `min(2, ceil(n/2))` capped gridH at 2 rows while the renderer wrapped to 3,
  // so the 5th/6th bullet row overlapped the body card below. Match gridH to the
  // actual row count so BODY_TOP clears the last row (no intersection).
  const gridRows = grid ? Math.ceil(bullets.length / 2) : 0;
  const gridH = grid ? gridRows * (2 * 26 * 1.35 + 22) + 20 : 0;
  // Body card: from grid bottom (or 800) to 1450.
  const BODY_TOP = grid ? gridTop + gridH + 20 : 800;
  const BODY_H = 1450 - BODY_TOP - 30;
  const bodyText = rest || input.body;
  const bodyFit = fitBlockLines(bodyText, { width: CW - 60, height: BODY_H - 48, fontBuf: fb(input, SANS, 400), size: 26, ls: 0, lineHeight: 1.5, minSize: 15, maxSize: 30 });
  const FOOTER = 1462;
  // Disclosure + EHO strip (task 834b0e71): sits directly below the agent band
  // (the contact block — FL 61J2-10.025(3)(a) adjacency) in the unused footer
  // margin. Band height is replicated so a 2-line name never overlaps it.
  const bandH = agentBandHeightPx(input, CW);
  const stripTop = Math.min(FOOTER + 16 + bandH + 10, HGT - 44);
  const stripH = HGT - stripTop - 8;
  return h("div", {
    style: { width: W, height: HGT, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: "linear-gradient(180deg, #fdfbf5 0%, #f3edE1 40%, #efe7d8 100%)", color: C.ink, fontFamily: SANS },
  }, [
    h("img", { key: "hd", src: input.headerBandDataUrl, style: { position: "absolute", top: 0, left: 0, width: "100%", height: 210, objectFit: "cover" } }),
    Wordmark({ top: 88, left: X }),
    h("div", { key: "url", style: { position: "absolute", top: 98, right: X, color: "rgba(255,255,255,0.85)", fontFamily: SANS, fontSize: 20, letterSpacing: 1 } }, "relevate.ai"),
    Ribbon({ text: badge }),
    input.price ? h("div", { key: "pr", style: { position: "absolute", top: 336, left: X, color: C.ink, fontFamily: COND, fontSize: priceSize, letterSpacing: 2, lineHeight: 1 } }, input.price) : null,
    h("div", { key: "ad", style: { position: "absolute", top: 486, left: X, width: CW, color: C.ink, fontFamily: DISPLAY, fontSize: addr.size, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.14 } }, addr.lines.join("\n")),
    h("div", { key: "ru", style: { position: "absolute", top: 668, left: X, width: 260, height: 3, backgroundColor: C.gold2 } }),
    factChips.length > 0 ? h("div", { key: "fc", style: { position: "absolute", top: 685, left: X, display: "flex", flexDirection: "row", gap: 16 } },
      factChips.map((f) => FactChip({ num: f.num, label: f.label, fontSize: 44 })),
    ) : null,
    grid ? h("div", { key: "gl", style: { position: "absolute", top: gridTop, left: X, width: CW, display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 18 } },
      bullets.map((b, i) => {
        const f = fitBlockLines(b, { width: cellW - 40, height: 2 * 26 * 1.35, fontBuf: fb(input, SANS, 700), size: 26, ls: 0, lineHeight: 1.35, minSize: 17, maxSize: 28 });
        return h("div", { key: i, style: { width: cellW, display: "flex", alignItems: "flex-start", gap: 12 } }, [
          h("div", { key: "t", style: { width: 20, height: 20, marginTop: 3, borderRadius: 10, background: "linear-gradient(135deg, #a7f3d0, #059669)", flexShrink: 0 } }),
          h("div", { key: "tx", style: { width: cellW - 40, color: C.ink, fontFamily: SANS, fontSize: f.size, fontWeight: 700, lineHeight: 1.35 } }, f.lines.join("\n")),
        ]);
      }),
    ) : null,
    h("div", { key: "bc", style: { position: "absolute", top: BODY_TOP, left: X, width: CW, height: BODY_H, padding: "24px 30px", backgroundColor: C.panel, border: `1px solid ${C.hairline}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(23,48,36,0.10)", display: "flex", flexDirection: "column" } },
      h("div", { style: { width: "100%", color: C.inkSoft, fontFamily: SANS, fontSize: bodyFit.size, lineHeight: 1.5, whiteSpace: "pre-wrap" } }, bodyFit.lines.join("\n")),
    ),
    h("div", { key: "dv", style: { position: "absolute", top: FOOTER - 10, left: X, width: CW, height: 2, backgroundColor: accent } }),
    AgentBand({ agent, phone: input.agentPhone, x: X, top: FOOTER + 16, w: CW, nameFont: fb(input, DISPLAY, 700) }),
    DisclosureFooter({ input, x: X, w: CW, top: stripTop, availableH: stripH, legendColor: C.inkSoft, detailColor: C.inkSoft, markSize: 30, fontSize: 15 }),
  ]);
}

function socialPhoto(input: RenderTemplateInput) {
  const S = 1080, X = 56, CW = S - X * 2;
  const accent = accentFor(input.brandStyle);
  const badge = badgeFor(input.title ?? "", input.body);
  const title = input.title?.trim() || "JUST LISTED";
  const agent = input.agentName?.trim() || "Your local real estate expert";
  const facts = listingFacts(input);
  const factChips = [
    { num: facts.beds, label: "Beds" },
    { num: facts.baths, label: "Baths" },
    { num: facts.sqft, label: "Sq Ft" },
  ].filter((f) => f.num);
  // PHOTO-ADAPTIVE (task bf6f8534): for a bright photo, flip the whole overlay
  // to dark-ink-on-light-cream (price, address, chips, body, tags, pill) with a
  // photo-derived accent for the divider/pill borders; for a dark photo keep the
  // current dark scrim + mint/gold design EXACTLY (dark fixtures stay
  // byte-identical). Body zone measured separately (its own wash).
  const photoAnalysis = input.imageDataUrl
    ? analyzePhoto(input.imageDataUrl, {
        upper: { fx: 0, fy: 300 / S, fw: 1, fh: 320 / S },   // price 340..440, addr 470..565
        chips: { fx: 0, fy: 620 / S, fw: 1, fh: 74 / S },
        body: { fx: 0, fy: 710 / S, fw: 1, fh: 179 / S },    // body 710..889
        tags: { fx: 0, fy: 896 / S, fw: 1, fh: 60 / S },
        pill: { fx: 0.32, fy: 36 / S, fw: 0.36, fh: 74 / S },
        footer: { fx: 0, fy: 996 / S, fw: 1, fh: 80 / S },   // disclosure strip (task 834b0e71)
      })
    : null;
  const upperPal = zonePalette(photoAnalysis, "upper", { type: "large", darkText: C.gold });
  const addrPal = zonePalette(photoAnalysis, "upper", { type: "large", darkText: C.mint, lightText: "#173024" });
  const bodyPal = zonePalette(photoAnalysis, "body", { type: "body", darkText: "#f4fff9", lightText: "#173024" });
  const chipPal = zonePalette(photoAnalysis, "chips", { type: "large", darkText: C.mint, lightText: "#173024" });
  const tagPal = zonePalette(photoAnalysis, "tags", { type: "large", darkText: C.eyebrow, lightText: "#173024" });
  const pillPal = zonePalette(photoAnalysis, "pill", { type: "large", darkText: C.gold, lightText: "#173024" });
  // Disclosure strip ink (task 834b0e71): measured on its own bottom zone with
  // the 4.5:1 body floor so the small print stays legible on ANY photo.
  const footerPal = zonePalette(photoAnalysis, "footer", { type: "body", darkText: "#eaf6ee", lightText: "#173024" });
  const flipped = upperPal.flipped;
  // Full-image overlay: light cream wash over a bright photo, brand dark scrim
  // over a dark photo. Body-zone wash reversed in light mode (its own layer).
  const fullScrim = flipped
    ? `linear-gradient(180deg, rgba(252,249,240,${Math.min(0.9, 0.24 + upperPal.strength * 0.5).toFixed(2)}) 8%, rgba(252,249,240,${Math.min(0.92, 0.4 + upperPal.strength * 0.45).toFixed(2)}) 46%, rgba(252,249,240,${Math.min(0.94, 0.5 + upperPal.strength * 0.4).toFixed(2)}) 100%)`
    : SCRIM;
  const bodyZoneScrim = flipped
    ? `linear-gradient(180deg, rgba(252,249,240,0) 0%, rgba(252,249,240,${Math.min(0.96, 0.55 + bodyPal.strength * 0.35).toFixed(2)}) 24%, rgba(252,249,240,${Math.min(0.96, 0.55 + bodyPal.strength * 0.35).toFixed(2)}) 76%, rgba(252,249,240,0) 100%)`
    : "linear-gradient(180deg, rgba(4,16,7,0) 0%, rgba(4,16,7,0.18) 18%, rgba(4,16,7,0.18) 82%, rgba(4,16,7,0) 100%)";
  const pillBg = flipped ? "rgba(252,249,240,0.92)" : "rgba(4,16,7,0.58)";
  const chipBg = flipped ? "rgba(252,249,240,0.86)" : "rgba(4,16,7,0.62)";
  // Brand borders stay EXACT on dark mode (C.gold2 pill / C.ring chip / brand
  // accent divider — byte-identity for dark fixtures); photo accent only when
  // the polarity flips (bright photo).
  const dividerAccent = flipped ? photoAnalysis!.accentHex : accent;
  const pillBorder = flipped ? photoAnalysis!.accentHex : C.gold2;
  const chipBorder = flipped ? photoAnalysis!.accentHex : C.ring;
  const priceSize = input.price ? fitBlockLines(input.price, { width: CW * 0.7, height: 100, fontBuf: fb(input, COND, 400), size: 92, ls: 1, lineHeight: 1, minSize: 40, maxSize: 120 }).size : 0;
  const addr = fitBlockLines(title, { width: CW, height: 2 * 50 * 1.15, fontBuf: fb(input, DISPLAY, 700), size: 50, ls: -0.5, lineHeight: 1.15, minSize: 28, maxSize: 62 });
  const tags = (input.body.match(/#[\w-]+/g) || []).slice(0, 5);
  const tagText = tags.join("  ");
  // BUGFIX (Aug 23): tags were nowrap + overflow hidden on a single 30px-high
  // line, so 5 long tags were silently clipped off the right edge. Route through
  // fitBlockLines with a 2-line allowance so they WRAP (and at worst visibly
  // ellipsize) — never silently clipped. Divider + agent band shift down only
  // when tags actually wrap, so they never overlap the tags.
  const tagFit = tagText ? fitBlockLines(tagText, { width: CW, height: 2 * 26 * 1.3 + 4, fontBuf: fb(input, SANS, 400), size: 22, ls: 0, lineHeight: 1.3, minSize: 18, maxSize: 26 }) : null;
  const TAG_TOP = 896;
  const tagBlockH = tagFit ? Math.max(1, tagFit.lines.length) * tagFit.size * 1.3 : 0;
  const dividerTop = tagFit ? Math.max(930, TAG_TOP + tagBlockH + 12) : 930;
  const agentTop = dividerTop + 22;
  // P1 FIX 3: compose the social body from the informative middle (highlights
  // bullets first, then directions/contact/CTA prose) so it fits and renders
  // instead of ellipsizing at the HIGHLIGHTS label.
  const socialBody = socialBodyForRender(stripTrailingHashtagBlock(input.body));
  const bodyFit = fitBlockLines(socialBody, { width: CW, height: 179, fontBuf: fb(input, SANS, 400), size: 22, ls: 0, lineHeight: 1.4, minSize: 21, maxSize: 26 });
  // Disclosure + EHO strip (task 834b0e71): directly below the agent band (FL
  // adjacency), height-aware of band wrap; ink from the photo-adaptive footer
  // zone so it survives bright, dark and mid-tone photos.
  const sBandH = agentBandHeightPx(input, CW);
  const stripTop = Math.min(agentTop + sBandH + 8, S - 36);
  const stripH = S - stripTop - 6;
  return h("div", {
    style: { width: S, height: S, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: C.deep, color: C.mint, fontFamily: SANS },
  }, [
    h("img", { key: "ph", src: input.imageDataUrl, style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } }),
    h("div", { key: "sc", style: { position: "absolute", inset: 0, background: fullScrim } }),
    // Body-zone scrim (Aug 19 — Vision Readability Gate follow-up): the global
    // SCRIM leaves bright photo areas behind the body text zone, so a long body
    // over a bright photo measured Δ≈36 — under the gate's Δ≥45 bar. Deepen the
    // background ink under the body zone only (additive background layer; layout
    // geometry, slots, fonts unchanged) so ANY body length clears the bar. Both
    // ends fade out so there is no visible band. In light mode this becomes a
    // cream wash under the body so the dark body ink reads against it.
    h("div", { key: "bsc", style: { position: "absolute", top: 642, left: X - 24, width: CW + 48, height: 272, background: bodyZoneScrim } }),
    Wordmark({ top: 46, left: 44, size: 28 }),
    Pill({ text: badge, accent: pillPal.textColor, accentBorder: pillBorder, bg: pillBg }),
    input.price ? h("div", { key: "pr", style: { position: "absolute", top: 340, left: X, color: upperPal.textColor, fontFamily: COND, fontSize: priceSize, letterSpacing: 1, lineHeight: 1 } }, input.price) : null,
    h("div", { key: "ad", style: { position: "absolute", top: 470, left: X, width: CW, color: addrPal.textColor, fontFamily: DISPLAY, fontSize: addr.size, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.15 } }, addr.lines.join("\n")),
    factChips.length > 0 ? h("div", { key: "fc", style: { position: "absolute", top: 620, left: X, display: "flex", flexDirection: "row", gap: 14 } },
      factChips.map((f) => FactChip({ num: f.num, label: f.label, fontSize: 30, dark: !flipped, bg: flipped ? chipBg : undefined, accent: chipBorder, numColor: chipPal.textColor, labelColor: flipped ? "#4d5c50" : C.eyebrow })),
    ) : null,
    h("div", { key: "bd", style: { position: "absolute", top: 710, left: X, width: CW, color: bodyPal.textColor, fontFamily: SANS, fontSize: bodyFit.size, lineHeight: 1.4, whiteSpace: "pre-wrap" } }, bodyFit.lines.join("\n")),
    tagFit ? h("div", { key: "tg", style: { position: "absolute", top: TAG_TOP, left: X, width: CW, color: tagPal.textColor, fontFamily: SANS, fontSize: tagFit.size, lineHeight: 1.3, whiteSpace: "pre-wrap" } }, tagFit.lines.join("\n")) : null,
    h("div", { key: "dv", style: { position: "absolute", top: dividerTop, left: X, width: CW, height: 2, backgroundColor: dividerAccent } }),
    AgentBand({ agent, phone: input.agentPhone, x: X, top: agentTop, w: CW, nameFont: fb(input, DISPLAY, 700) }),
    DisclosureFooter({ input, x: X, w: CW, top: stripTop, availableH: stripH, legendColor: footerPal.textColor, detailColor: footerPal.textColor, markSize: 24, fontSize: 15 }),
  ]);
}

function socialClassic(input: RenderTemplateInput) {
  const S = 1080, X = 90, CW = S - X * 2;
  const accent = accentFor(input.brandStyle);
  const badge = badgeFor(input.title ?? "", input.body);
  const title = input.title?.trim() || "JUST LISTED";
  const agent = input.agentName?.trim() || "Your local real estate expert";
  const facts = listingFacts(input);
  const factChips = [
    { num: facts.beds, label: "Beds" },
    { num: facts.baths, label: "Baths" },
    { num: facts.sqft, label: "Sq Ft" },
  ].filter((f) => f.num);
  const addr = fitBlockLines(title, { width: CW, height: 2 * 66 * 1.12, fontBuf: fb(input, DISPLAY, 700), size: 66, ls: -0.5, lineHeight: 1.12, minSize: 34, maxSize: 80 });
  const priceSize = input.price ? fitBlockLines(input.price, { width: CW, height: 130, fontBuf: fb(input, COND, 400), size: 118, ls: 2, lineHeight: 1, minSize: 44, maxSize: 148 }).size : 0;
  // P1 FIX 3: compose the social body from the informative middle (highlights
  // bullets first, then directions/contact/CTA prose) so it fits and renders
  // instead of ellipsizing at the HIGHLIGHTS label.
  const socialBody = socialBodyForRender(stripTrailingHashtagBlock(input.body));
  const bodyFit = fitBlockLines(socialBody, { width: CW, height: 179, fontBuf: fb(input, SANS, 400), size: 22, ls: 0, lineHeight: 1.4, minSize: 16, maxSize: 26 });
  const tags = (input.body.match(/#[\w-]+/g) || []).slice(0, 5);
  const tagText = tags.join("  ");
  // BUGFIX (Aug 23): same silent-clip fix as social-photo — tags wrap over a
  // 2-line box (never nowrap/hidden), divider + agent shift down only when they
  // actually wrap. Agent name is fit-boxed so a long name can't bleed past CW.
  const tagFit = tagText ? fitBlockLines(tagText, { width: CW, height: 2 * 26 * 1.3 + 4, fontBuf: fb(input, SANS, 400), size: 22, ls: 0, lineHeight: 1.3, minSize: 18, maxSize: 26 }) : null;
  const TAG_TOP = 896;
  const tagBlockH = tagFit ? Math.max(1, tagFit.lines.length) * tagFit.size * 1.3 : 0;
  const dividerTop = tagFit ? Math.max(930, TAG_TOP + tagBlockH + 12) : 930;
  const agentTop = dividerTop + 22;
  const agentW = Math.max(160, CW - (input.agentPhone ? 240 : 0));
  const agentNameFit = fb(input, DISPLAY, 700)
    ? fitBlockLines(agent, { width: agentW, height: 2 * 30 * 1.15, fontBuf: fb(input, DISPLAY, 700)!, size: 28, ls: 0, lineHeight: 1.15, minSize: 16, maxSize: 28 })
    : null;
  // Disclosure + EHO strip (task 834b0e71): directly below the centered agent
  // band (FL adjacency); light ink for the dark forest background.
  const sBandH = agentNameFit ? Math.max(1, agentNameFit.lines.length) * agentNameFit.size * 1.15 : 28 * 1.15;
  const stripTop = Math.min(agentTop + sBandH + 8, S - 36);
  const stripH = S - stripTop - 6;
  return h("div", {
    style: { width: S, height: S, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: C.deep, color: C.mint, fontFamily: SANS },
  }, [
    h("img", { key: "bg", src: input.baseBackgroundDataUrl, style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } }),
    Wordmark({ top: 46, left: 44, size: 28 }),
    Pill({ text: badge }),
    h("div", { key: "ad", style: { position: "absolute", top: 288, left: X, width: CW, textAlign: "center", color: C.mint, fontFamily: DISPLAY, fontSize: addr.size, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.12 } }, addr.lines.join("\n")),
    input.price ? h("div", { key: "pr", style: { position: "absolute", top: 440, left: X, width: CW, textAlign: "center", color: C.gold, fontFamily: COND, fontSize: priceSize, letterSpacing: 2, lineHeight: 1 } }, input.price) : null,
    factChips.length > 0 ? h("div", { key: "fc", style: { position: "absolute", top: 600, left: X, width: CW, display: "flex", flexDirection: "row", justifyContent: "center", gap: 16 } },
      factChips.map((f) => FactChip({ num: f.num, label: f.label, fontSize: 30 })),
    ) : null,
    h("div", { key: "bd", style: { position: "absolute", top: 710, left: X, width: CW, textAlign: "center", color: C.soft2, fontFamily: SANS, fontSize: bodyFit.size, lineHeight: 1.4, whiteSpace: "pre-wrap" } }, bodyFit.lines.join("\n")),
    tagFit ? h("div", { key: "tg", style: { position: "absolute", top: TAG_TOP, left: X, width: CW, textAlign: "center", color: C.eyebrow, fontFamily: SANS, fontSize: tagFit.size, lineHeight: 1.3, whiteSpace: "pre-wrap" } }, tagFit.lines.join("\n")) : null,
    h("div", { key: "dv", style: { position: "absolute", top: dividerTop, left: X, width: CW, height: 2, backgroundColor: accent } }),
    h("div", { key: "ab", style: { position: "absolute", top: agentTop, left: X, width: CW, display: "flex", alignItems: "center", justifyContent: "center" } }, [
      h("div", { key: "n", style: { color: C.mint, fontFamily: DISPLAY, fontSize: agentNameFit ? agentNameFit.size : 28, fontWeight: 700, lineHeight: 1.15, marginRight: input.agentPhone ? 16 : 0 } }, agentNameFit ? agentNameFit.lines.join("\n") : agent),
      input.agentPhone ? h("div", { key: "p", style: { color: C.gold, fontFamily: SANS, fontSize: 24, fontWeight: 700 } }, input.agentPhone) : null,
    ]),
    DisclosureFooter({ input, x: X, w: CW, top: stripTop, availableH: stripH, legendColor: C.soft2, detailColor: C.muted, markSize: 24, fontSize: 15 }),
  ]);
}

// ---------------------------------------------------------------------------
// Dispatcher (R5) — photo tiers when a property photo is supplied, classic
// tiers on the forest background otherwise. Reachable only from
// marketingTemplate()'s non-template-replica branch.
// ---------------------------------------------------------------------------
export function brandedMarketingTemplate(input: RenderTemplateInput) {
  // P1 sanitisation (task b0aa54e4): strip markdown markers + emoji from the
  // body ONCE at the native-render entry, then feed the cleaned copy to every
  // layout (and everything derived from it — bullets, hashtags, badge, facts).
  // Null-safe: a missing/non-string body cleans to "" so no consumer can throw.
  const bodyCleaned = cleanContent(input.body);
  const input2: RenderTemplateInput = { ...input, body: bodyCleaned };
  // Explicit native-layout override (client BrandedTemplateSelector). Choice is
  // honored verbatim — the auto-dispatch below is only the default. When the
  // user explicitly chooses a photo-less layout but typed a brand style, that is
  // respected as-is; the layouts keep their own legibility scrims.
  switch (input2.brandedTemplate) {
    // Photo layouts require an image background; if an explicit photo-layout
    // override arrives with no photo, degrade to the classic (no-photo) variant
    // instead of crashing Satori ("Image source is not provided").
    case "flyer-hero": return input2.imageDataUrl ? flyerHero(input2) : flyerClassic(input2);
    case "flyer-classic": return flyerClassic(input2);
    case "social-photo": return input2.imageDataUrl ? socialPhoto(input2) : socialClassic(input2);
    case "social-classic": return socialClassic(input2);
  }
  if (input2.type === "social") return input2.imageDataUrl ? socialPhoto(input2) : socialClassic(input2);
  return input2.imageDataUrl ? flyerHero(input2) : flyerClassic(input2);
}
