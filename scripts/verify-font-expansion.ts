/**
 * Relevate — deterministic verify for the Round-2 font library expansion
 * (task 3f084d2b): three new distinct writing-style / calligraphy faces in the
 * bundled renderer, reachable through the custom builder (DesignDoc).
 * =========================================================================
 * Renders the SAME text at the SAME font size through renderDesignDoc for each
 * new family and asserts:
 *
 *   - ink is present inside the box for every new family (the TTF loaded and
 *     Satori composited real glyphs — not a silently-empty fallback)
 *   - the three new faces produce measurably DIFFERENT ink widths than one
 *     another and than the sans control (they are genuinely distinct faces,
 *     not one weight silently substituted for all)
 *   - Handwriting 700 renders and differs from Handwriting 400 (bold face is
 *     registered and used)
 *
 * Families under test (registry names → bundled file):
 *   Relevate Calligraphy  (Sacramento-Regular.ttf)
 *   Relevate Handwriting  (AmaticSC-Regular.ttf   400 / AmaticSC-Bold.ttf 700)
 *   Relevate Retro        (Pacifico-Regular.ttf)
 *
 * Self-contained (no external fixtures), deterministic, follows the existing
 * probe/verify style of the repo.
 *
 * Run: bun scripts/verify-font-expansion.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { renderDesignDoc } from "../src/lib/render-design";
import type { DesignDoc, DesignFontFamily, DesignFontWeight } from "../src/lib/design";

const OUT = "/tmp/font-expansion-verify";
await mkdir(OUT, { recursive: true });
const W = 900, H = 200;

/** RGBA-backed solid PNG via Resvg (matches render-design decode convention). */
function solidPng(width: number, height: number, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`;
  return `data:image/png;base64,${new Resvg(svg).render().asPng().toString("base64")}`;
}
function decodePng(dataUrl: string, w: number, h: number): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${dataUrl}" x="0" y="0" width="${w}" height="${h}"/></svg>`;
  return new Resvg(svg).render().pixels as Uint8Array;
}
/** Ink (x,y) bounds of dark pixels in a mostly-white region. */
function inkBounds(pixels: Uint8Array, w: number, h: number) {
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      if (lum < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  return { minX, maxX, minY, maxY, count, width: count ? maxX - minX + 1 : 0, height: count ? maxY - minY + 1 : 0 };
}

const TEXT = "HANDWRITING TEST";
const Bg = solidPng(W, H, "#ffffff");

function makeDoc(family: DesignFontFamily, weight: DesignFontWeight): DesignDoc {
  return {
    format: "flyer",
    width: W,
    height: H,
    layers: [
      { id: "bg", type: "image", rect: { x: 0, y: 0, w: W, h: H }, imageData: Bg, objectFit: "cover" },
      {
        id: "t",
        type: "text",
        rect: { x: 20, y: 20, w: W - 40, h: H - 40 },
        text: TEXT,
        fontFamily: family,
        fontWeight: weight,
        fontSize: 96,
        color: "#111111",
        align: "left",
        lineHeight: 1.0,
      },
    ],
  };
}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`); }
}

const CASES: Array<{ label: string; family: DesignFontFamily; weight: DesignFontWeight }> = [
  { label: "Calligraphy 400", family: "calligraphy", weight: 400 },
  { label: "Handwriting 400", family: "handwriting", weight: 400 },
  { label: "Handwriting 700", family: "handwriting", weight: 700 },
  { label: "Retro 400", family: "retro", weight: 400 },
  { label: "Allura 400", family: "script-allura", weight: 400 },
  { label: "Hand Script 400", family: "script-hand", weight: 400 },
  { label: "Condensed Alt 400", family: "condensed-alt", weight: 400 },
  { label: "Condensed Alt 700", family: "condensed-alt", weight: 700 },
];

// Render every new face first.
const pixels = new Map<string, Uint8Array>();
const results = new Map<string, ReturnType<typeof inkBounds>>();
for (const c of CASES) {
  const doc = makeDoc(c.family, c.weight);
  const rendered = await renderDesignDoc(doc);
  const bw = rendered.width, bh = rendered.height;
  const bytes = decodePng(rendered.dataUrl, bw, bh);
  const bounds = inkBounds(bytes, bw, bh);
  pixels.set(c.label, bytes);
  results.set(c.label, bounds);
  await writeFile(`${OUT}/${c.label.replace(/\s+/g, "-").toLowerCase()}.png`, Buffer.from(rendered.dataUrl.split(",")[1], "base64"));
  check(`${c.label}: renders a non-empty PNG`, rendered.dataUrl.length > 1000, `len=${rendered.dataUrl.length}`);
  check(`${c.label}: ink present inside text box (non-blank)`, bounds.count > 200, `ink=${bounds.count}`);
}

/** Count differing RGBA bytes between two rendered frames (proof of distinct glyphs). */
function diffCount(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d;
}

// The three faces must be measurably different from the sans control AND from
// each other — compared by whole-image pixel diff, which is robust even when
// fitTextLayer caps a wide calligraphic face to the box width. A face that
// shares the EXACT same glyphs as another yields ~0 diff; genuinely distinct
// bundled fonts (even a regular/bold pair of one family) differ by thousands.
const sansRendered = await renderDesignDoc(makeDoc("sans", 400));
const sansPixels = decodePng(sansRendered.dataUrl, sansRendered.width, sansRendered.height);
const DIFF_THRESHOLD = 3000; // well below any genuinely-distinct pair, far above any identity
console.log("  pairwise pixel diffs (vs sans / between faces):");
const labels = CASES.map((c) => c.label);
const pairDiffs = new Map<string, number>();
for (const a of [...labels, "Sans 400"]) {
  const pa = a === "Sans 400" ? sansPixels : pixels.get(a)!;
  for (const b of [...labels, "Sans 400"]) {
    if (a >= b) continue;
    const key = `${a} | ${b}`;
    const d = diffCount(pa, pixels.get(b) ?? sansPixels);
    pairDiffs.set(key, d);
    console.log(`    diff ${key} = ${d}`);
  }
}
let distinct = 0;
for (const [key, d] of pairDiffs) {
  if (d >= DIFF_THRESHOLD) { distinct++; check(`${key}: distinct`, true); }
  else { check(`${key}: distinct`, false, `diff=${d} below threshold`); }
}
check(`All pixel diff checks distinct (genuinely different glyphs)`, distinct === pairDiffs.size, `${distinct}/${pairDiffs.size}`);
check("Bold (Handwriting 700) differs from regular (Handwriting 400)", diffCount(pixels.get("Handwriting 400")!, pixels.get("Handwriting 700")!) >= 1000);
check("Every new face differs from the sans control", [...labels].every((l) => diffCount(pixels.get(l)!, sansPixels) >= DIFF_THRESHOLD));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

console.log(`\nFont-expansion verify PASSED — PNGs at ${OUT}`);
