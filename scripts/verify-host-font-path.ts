/**
 * Relevate — host-path resolution gate for the font library (task 3f084d2b).
 * =========================================================================
 * WHY THIS EXISTS
 *   The lead flagged a risk of the exact "asset resolves locally but not
 *   on-host" bug class from the DE review: the custom-builder renderer
 *   (render-design.ts) and the template-replica fit engine
 *   (branded-templates.ts) both resolve fonts via:
 *
 *       BT_DIR = dirname(fileURLToPath(import.meta.url))   // = src/lib
 *       FIRST candidate   = join(BT_DIR, "assets", "<family>.ttf")
 *                          // = src/lib/assets/<family>.ttf  (the on-host store)
 *       FALLBACK candidate = /home/team/shared/design-assets/fonts/...  (sandbox only)
 *
 *   The fallback path exists only in this dev sandbox — it does NOT exist on
 *   the deployed host. Therefore every family MUST resolve via its FIRST
 *   candidate (src/lib/assets), or on-host it silently drops to default sans.
 *
 * WHAT THIS GATE PROVES
 *   For every registered face (native 6 + expanded custom faces), it:
 *     1. computes the exact first-candidate path the renderer will try,
 *     2. asserts that path EXISTS and yields a byte-valid TrueType/OpenType
 *        font (real sfnt magic — not an empty/zero-byte placeholder),
 *     3. reads the font through that exact path and confirms it is non-empty
 *        and larger than a token TTF header, and
 *     4. asserts the sandbox-only fallback is NOT required for any face
 *        (i.e., the first candidate is authoritative).
 *   Plus a render check: render the SAME text at SAME size through
 *   renderDesignDoc for each new family and assert real distinct ink is
 *   produced (the face actually composites, not a silent empty fallback).
 *
 * Self-contained, deterministic, no external fixtures.
 * Run: bun scripts/verify-host-font-path.ts
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { renderDesignDoc } from "../src/lib/render-design";
import type { DesignDoc, DesignFontFamily, DesignFontWeight } from "../src/lib/design";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const ASSETS_DIR = join(REPO, "src", "lib", "assets");
const FALLBACK_OK = existsSync("/home/team/shared/design-assets/fonts");

let pass = 0, fail = 0;
function check(ok: boolean, label: string) {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}`); }
}

/**
 * Mirror the exact first-candidate path the renderers use. Kept duplicated
 * here on purpose so this gate is independent of the renderer's own table
 * (it validates the actual file that ships, not the code's claim).
 * family → [weight, relative filename in src/lib/assets]
 */
const EXPECTED_FIRST_CANDIDATE: Record<string, Array<[number, string]>> = {
  sans:        [[400, "DejaVuSans.ttf"],        [700, "DejaVuSans-Bold.ttf"]],
  serif:       [[400, "DejaVuSerif.ttf"],       [700, "DejaVuSerif-Bold.ttf"]],
  mono:        [[400, "DejaVuSansMono.ttf"],    [700, "DejaVuSansMono-Bold.ttf"]],
  "Relevate Calligraphy": [[400, "Sacramento-Regular.ttf"]],
  "Relevate Handwriting": [[400, "AmaticSC-Regular.ttf"], [700, "AmaticSC-Bold.ttf"]],
  "Relevate Retro":       [[400, "Pacifico-Regular.ttf"]],
};

console.log(`Repo            : ${REPO}`);
console.log(`On-host asset dir: ${ASSETS_DIR}`);
console.log(`Sandbox fallback present: ${FALLBACK_OK}`);
console.log(`\n[C1] every registered face resolves via src/lib/assets (first candidate)\n`);

const SFNT = (b: Uint8Array) =>
  (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) ||      // TrueType
  String.fromCharCode(b[0], b[1], b[2], b[3]) === "OTTO" ||       // CFF OTF
  String.fromCharCode(b[0], b[1], b[2], b[3]) === "true" ||       // TrueType alt
  String.fromCharCode(b[0], b[1], b[2], b[3]) === "ttcf";         // collection

for (const [family, weights] of Object.entries(EXPECTED_FIRST_CANDIDATE)) {
  for (const [weight, file] of weights) {
    const p = join(ASSETS_DIR, file);
    const label = `${family} ${weight} → src/lib/assets/${file}`;
    if (!existsSync(p)) {
      check(false, `${label} — FILE MISSING from on-host asset dir`);
      continue;
    }
    let buf: Uint8Array;
    try {
      buf = new Uint8Array(await readFile(p));
    } catch (e) {
      check(false, `${label} — unreadable: ${(e as Error).message}`);
      continue;
    }
    check(buf.length > 32, `${label} — non-empty (${buf.length} bytes)`);
    check(SFNT(buf.subarray(0, 4)), `${label} — valid TrueType/OpenType magic`);
  }
}

console.log(`\n[C2] no face depends on the sandbox-only fallback path\n`);
for (const [family, weights] of Object.entries(EXPECTED_FIRST_CANDIDATE)) {
  for (const [weight, file] of weights) {
    const p = join(ASSETS_DIR, file);
    const fb = `/home/team/shared/design-assets/fonts/${file}`;
    const srcExists = existsSync(p);
    const fbExists = existsSync(fb);
    // A face is "host-safe" if the first candidate exists. Even if the fallback
    // also happened to exist, the first candidate wins, so the host is covered.
    check(srcExists, `${family} ${weight} — resolves first-candidate; fallback${fbExists ? " (orphan, unused)" : " absent on host"}`);
  }
}

console.log(`\n[C3] render: each new family composites real distinct ink via src/lib path\n`);
const W = 900, H = 200;
function solidPng(width: number, height: number, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`;
  return `data:image/png;base64,${new Resvg(svg).render().asPng().toString("base64")}`;
}
function decodePng(dataUrl: string, w: number, h: number): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${dataUrl}" x="0" y="0" width="${w}" height="${h}"/></svg>`;
  return new Resvg(svg).render().pixels as Uint8Array;
}
function inkCount(pixels: Uint8Array, w: number, h: number): number {
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2] < 128) count++;
    }
  }
  return count;
}
function diffCount(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d;
}
// renderDesignDoc takes SHORT registry ids ("calligraphy"/"handwriting"/
// "retro") — the same ids the custom builder's DesignDoc uses — and returns
// { dataUrl, width, height }. Long display names live in DESIGN_FONT_CATALOG.
const TEXT = "HANDWRITING TEST";
const Bg = solidPng(W, H, "#ffffff");
function makeDoc(family: DesignFontFamily, weight: DesignFontWeight): DesignDoc {
  return {
    width: W, height: H,
    layers: [
      { id: "bg", type: "image", rect: { x: 0, y: 0, w: W, h: H }, imageData: Bg, objectFit: "cover" },
      { id: "t", type: "text", rect: { x: 20, y: 20, w: W - 40, h: H - 40 }, text: TEXT, fontFamily: family, fontWeight: weight, fontSize: 96, color: "#111111", align: "left", lineHeight: 1.0 },
    ],
  };
}
const DIFF_THRESHOLD = 3000;
const CASES: Array<{ label: string; family: DesignFontFamily; weight: DesignFontWeight }> = [
  { label: "Calligraphy 400", family: "calligraphy", weight: 400 },
  { label: "Handwriting 400", family: "handwriting", weight: 400 },
  { label: "Handwriting 700", family: "handwriting", weight: 700 },
  { label: "Retro 400", family: "retro", weight: 400 },
];
const pixels = new Map<string, Uint8Array>();
for (const c of CASES) {
  const rendered = await renderDesignDoc(makeDoc(c.family, c.weight));
  const bw = rendered.width, bh = rendered.height;
  const bytes = decodePng(rendered.dataUrl, bw, bh);
  const k = inkCount(bytes, bw, bh);
  pixels.set(c.label, bytes);
  check(rendered.dataUrl.length > 1000, `${c.label}: renders a non-empty PNG (len=${rendered.dataUrl.length})`);
  check(k > 200, `${c.label}: ink present (non-blank), ink=${k}`);
}
const sansRendered = await renderDesignDoc(makeDoc("sans", 400));
const sansPixels = decodePng(sansRendered.dataUrl, sansRendered.width, sansRendered.height);
const labels = CASES.map((c) => c.label);
// Pairwise whole-image pixel diff: genuinely distinct faces differ by thousands;
// a face sharing the exact same glyphs yields ~0.
for (const a of [...labels, "Sans 400"]) {
  const pa = a === "Sans 400" ? sansPixels : pixels.get(a)!;
  for (const b of [...labels, "Sans 400"]) {
    if (a >= b) continue;
    const d = diffCount(pa, pixels.get(b) ?? sansPixels);
    check(d >= DIFF_THRESHOLD, `${a} | ${b}: distinct (diff=${d})`);
  }
}
check([...labels].every((l) => diffCount(pixels.get(l)!, sansPixels) >= DIFF_THRESHOLD), `every new face differs from the sans control`);
check(diffCount(pixels.get("Handwriting 400")!, pixels.get("Handwriting 700")!) >= 1000, "Bold (Handwriting 700) differs from regular (Handwriting 400)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
