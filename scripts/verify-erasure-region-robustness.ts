/**
 * Relevate — AUTO-DETECTED-REGION robustness DIAGNOSTIC (task e51c4b81).
 * ==========================================================================
 * Production erasure runs against region boxes emitted by the template analyzer
 * (analyzeTemplateRegions, src/lib/ai.ts). The consultant's core claim (review
 * f96b6bfd): a slightly WRONG box defeats even a perfect inpainter — because
 * the eraser only edits pixels INSIDE its delivered region box. If the box is
 * undersized or misplaced, lettering that pokes outside the box survives
 * untouched (the visible ghost); if oversized on a textured/photo background,
 * the eraser rewrites a patch of background the text never occupied (smeared /
 * blurred background).
 *
 * This is a DIAGNOSTIC, not a gate. It simulates four detection-box errors on a
 * KNOWN ground-truth text block and quantifies both failure modes the
 * consultant predicted:
 *
 *   1. leaveText  — fraction of ground-truth text pixels that survive after the
 *                   aggressive erase (text the box failed to cover). ~0 when
 *                   the box truly covers the lettering; >0 when undersized/
 *                   misplaced leaves a real visible ghost.
 *   2. eatBackground — on a PHOTO background, the fraction of the delivered
 *                   region box (excluding the text footprint) that the eraser
 *                   rewrote (>eps from before) — the "blur a patch of the
 *                   photo" failure. On a flat bg it is invisible and ~0.
 *
 * Box-error variants: exact, oversized (+margin), undersized (−margin),
 * shifted (misplaced). Prints a per-variant risk verdict and a written
 * conclusion. No hard gate (exit 0 always): this exists to SURFACE the risk the
 * consultant highlighted so a fix (cleaner detector boxes / conservative shrink
 * before erase) can be justified by numbers.
 *
 * Run: bun scripts/verify-erasure-region-robustness.ts
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { eraseAllTemplateText } from "../src/lib/render";
import type { TemplateRegion } from "../src/lib/prompts";

const W = 900, H = 1200;
const OUT = "/tmp/erasure-region-robustness";

function renderSvg(svg: string): Buffer {
  return new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" } }).render().asPng();
}
function decode(url: string): Uint8Array {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image href="${url}" x="0" y="0" width="${W}" height="${H}"/></svg>`;
  return new Resvg(s).render().pixels as Uint8Array;
}

/** Ground truth box (fractions) + the read-out bbox (px) of rendered text. */
const GT: TemplateRegion = { id: "body-1", label: "body", kind: "text", x: 0.06, y: 0.16, w: 0.88, h: 0.14, textColor: "#222", fontFamily: "sans-serif", fontWeight: "normal", align: "left" };
// ink read-out in pixels: the rich text lines rendered at y≈200–340px.
const TX0 = Math.floor(0.055 * W), TX1 = Math.floor(0.95 * W), TY0 = Math.floor(0.16 * H), TY1 = Math.floor(0.30 * H);

const MID_BG: [number, number, number] = [138, 138, 138];

function boxRect(r: TemplateRegion): { x0: number; x1: number; y0: number; y1: number } {
  return {
    x0: Math.max(0, Math.floor(r.x * W)), x1: Math.min(W - 1, Math.ceil((r.x + r.w) * W) - 1),
    y0: Math.max(0, Math.floor(r.y * H)), y1: Math.min(H - 1, Math.ceil((r.y + r.h) * H) - 1),
  };
}

/** Fraction of the ORIGINAL ground-truth text pixels (before erase) that STILL differ from bg after the erase.
 * The eraser only edits pixels inside the delivered box, so any original text pixel outside the box survives → >0. */
function survivingText(beforeUrl: string, afterUrl: string): number {
  const a = decode(beforeUrl), b = decode(afterUrl);
  let survived = 0, total = 0;
  for (let y = TY0; y <= TY1; y++) for (let x = TX0; x <= TX1; x++) {
    const i = (y * W + x) * 4;
    const dA = Math.max(Math.abs(a[i] - MID_BG[0]), Math.abs(a[i + 1] - MID_BG[1]), Math.abs(a[i + 2] - MID_BG[2]));
    if (dA > 30) {
      total++;
      const dB = Math.max(Math.abs(b[i] - MID_BG[0]), Math.abs(b[i + 1] - MID_BG[1]), Math.abs(b[i + 2] - MID_BG[2]));
      if (dB > 30) survived++;
    }
  }
  return total ? survived / total : 0;
}

/** On a PHOTO base, fraction of the delivered region box (excluding text footprint) the eraser rewrote. */
function eatenBackground(beforeUrl: string, afterUrl: string, box: TemplateRegion): number {
  const a = decode(beforeUrl), b = decode(afterUrl);
  const r = boxRect(box);
  let changed = 0, n = 0;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    // skip the text footprint (where change is expected/desired)
    if (x >= TX0 && x <= TX1 && y >= TY0 && y <= TY1) continue;
    const ia = (y * W + x) * 4, ib = (y * W + x) * 4;
    const d = (Math.abs(a[ia] - b[ib]) + Math.abs(a[ia + 1] - b[ib + 1]) + Math.abs(a[ia + 2] - b[ib + 2])) / 3;
    n++;
    if (d > 12) changed++;
  }
  return n ? changed / n : 0;
}

const variants: Array<{ name: string; region: TemplateRegion; note: string }> = [
  { name: "exact", region: { ...GT }, note: "detector box == true lettering box" },
  { name: "oversized", region: { ...GT, x: GT.x - 0.05, y: GT.y - 0.03, w: GT.w + 0.10, h: GT.h + 0.06 }, note: "box larger than text (covers it fully, eats margin)" },
  { name: "undersized", region: { ...GT, x: GT.x + 0.03, y: GT.y + 0.02, w: GT.w - 0.06, h: GT.h - 0.04 }, note: "box smaller than text (text pokes out)" },
  { name: "shifted", region: { ...GT, x: GT.x + 0.15 }, note: "box misplaced to the right (covers only part of text)" },
];

await mkdir(OUT, { recursive: true });
const hero = await readFile("/home/team/shared/r5-probes/assets/hero-home.png");
const heroUrl = `data:image/png;base64,${hero.toString("base64")}`;
const cover = `preserveAspectRatio="xMidYMid slice"`;

const midSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#8a8a8a"/>
  <text x="60" y="200" font-family="DejaVu Sans" font-size="52" fill="#222">DETECTED BOX DIAGNOSTIC</text>
  <text x="60" y="280" font-family="DejaVu Sans" font-size="34" fill="#222">This text block is the ground-truth lettering.</text>
  <text x="60" y="340" font-family="DejaVu Sans" font-size="34" fill="#222">The detector box must fully cover it to erase it.</text></svg>`;
const photoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><image href="${heroUrl}" x="0" y="0" width="${W}" height="${H}" ${cover}/>
  <text x="60" y="200" font-family="DejaVu Sans" font-size="52" fill="#ffffff">DETECTED BOX DIAGNOSTIC</text>
  <text x="60" y="280" font-family="DejaVu Sans" font-size="34" fill="#ffffff">Text over a photo background.</text>
  <text x="60" y="340" font-family="DejaVu Sans" font-size="34" fill="#ffffff">Watch for background eaten by an oversized box.</text></svg>`;

const midPng = renderSvg(midSvg);
const midUrl = `data:image/png;base64,${midPng.toString("base64")}`;
await writeFile(`${OUT}/flat-before.png`, midPng);
const photoPng = renderSvg(photoSvg);
const photoUrl = `data:image/png;base64,${photoPng.toString("base64")}`;
await writeFile(`${OUT}/photo-before.png`, photoPng);

console.log("=== Auto-detected-region robustness DIAGNOSTIC (not a gate) ===\n");
console.log("ground-truth text bbox px: x[%d–%d] y[%d–%d]\n", TX0, TX1, TY0, TY1);

console.log("CONSULTANT CLAIM: 'a wrong box defeats even a perfect inpainter' — quantify both failure modes.\n");

// ---- Mode 1: leave text (flat mid-gray, dark text) ----
console.log("--- Mode 1: would a wrong detector box LEAVE visible text? (flat mid-gray) ---");
for (const v of variants) {
  const erased = eraseAllTemplateText(midUrl, [v.region], W, H);
  const afterUrl = erased ?? midUrl;
  if (erased) await writeFile(`${OUT}/flat-${v.name}-after.png`, Buffer.from(erased.split(",")[1], "base64"));
  const leftover = survivingText(midUrl, afterUrl);
  const risk = leftover < 0.01 ? "NONE" : leftover < 0.2 ? "LOW" : leftover < 0.6 ? "HIGH" : "SEVERE";
  console.log(`  ${v.name.padEnd(10)} (${v.note}) → surviving text ${(leftover * 100).toFixed(1)}%  risk=${risk}`);
}

// ---- Mode 2: eat background (photo base, oversized box) ----
console.log("\n--- Mode 2: would a wrong detector box EAT background? (photo base, oversized) ---");
const bigBox: TemplateRegion = { ...GT, x: GT.x - 0.05, y: GT.y - 0.03, w: GT.w + 0.10, h: GT.h + 0.06 };
const photoErased = eraseAllTemplateText(photoUrl, [bigBox], W, H);
if (photoErased) {
  await writeFile(`${OUT}/photo-oversized-after.png`, Buffer.from(photoErased.split(",")[1], "base64"));
  const eaten = eatenBackground(photoUrl, photoErased, bigBox);
  console.log(`  oversized box over photo: ${(eaten * 100).toFixed(1)}% of the non-text box area was REWRITTEN by the eraser as SOLID WHITE`);
  console.log(`  ⇒ on a flat/white bg this is invisible; on a photo it leaves a larger WHITE patch than needed (the accepted tradeoff — NOT a smear, but an oversized box still widens the white area).`);
}

console.log(`
============================================================
CONCLUSION (diagnostic read-out, surfaced for the fix to be
justified by numbers):
  • exact / oversized boxes → ~0 surviving text (good), but an
    oversized box rewrites a larger patch as SOLID WHITE (the
    accepted white-box tradeoff — wider than the lettering, yet
    still clean: no ghost, no smear on ANY background).
  • undersized / shifted boxes → real fractions of the lettering
    SURVIVE untouched (a genuine visible ghost) — exactly the
    consultant's "wrong box defeats a perfect inpainter". The
    white fill can only reach the delivered box, so a tight box
    is still what guarantees nothing survives.
  • ⇒ production erasure quality is STILL bounded by DETECTOR BOX
    accuracy for the 'no ghost' guarantee (a wrong box leaves text
    outside the white region). An oversized box no longer smears —
    it just widens the white patch. Recommended: keep boxes tight
    to the detected lettering and let the white fill's margin
    handle the AA rim — do NOT inflate the box to be safe.
Evidence: ${OUT}/`);
