/**
 * Relevate — d6435a4b: REAL-RASTER residual-original-ink verification.
 * ==================================================================
 * The deterministic flat-fixture matrix passes, but the owner's real simple-white
 * uploads still showed ORIGINAL lettering surviving behind the recomposed text
 * (the e51c4b81 ink-masked per-pixel erase under-erased real rasters). The fix
 * (owner-directed) is PER-REGION: a text region that sits on mostly-flat "paper"
 * (low ink fraction) is FULLY EMPTIED (solid white → 0.00% residual, no ghosting),
 * while a text region sitting ON dense art/photo (high ink fraction) keeps the
 * ink-masked fill so the art is not voided to white. Non-text image blocks
 * (photos/logos/art) are always excluded from the fill.
 *
 * This script runs the SAME live inpaint code path over the SAVED real simple-white
 * fixture (template PNG + its analyze-regions.json) and reports residual-original-ink
 * per text region. Residual-original-ink = fraction of pixels in the text box that
 * are still non-white (with image-block pixels excluded — those are the preserved
 * photo/logo, not lettering). Target: ≈0% on text-bearing regions; art/photo blocks
 * must remain preserved (not voided).
 *
 * Run: bun scripts/verify-real-raster-simplewhite.ts [fixture-dir] [template-file]
 *
 * LOCAL-SCALE CAVEAT (Aug 26, B): in this local bun session the encodePng
 * dataURL round-trip corrupts at ~780×1024 (output PNG comes back garbled/dark —
 * corners 0,0,0 — which is NOT a renderer defect; the SE's Vercel /api/render
 * flow produced valid full-res inpainted bases). Run this script on a
 * downsample ≤ ~512px (e.g. PIL LANCZOS 390×512) where the round-trip is
 * reliable; sanity-check the emitted PNG with PIL (should be bright, corners
 * white). Full-res confirmation is the SE's live re-gate in Vercel.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { inpaintTemplateBackground } from "../src/lib/render";
import type { TemplateRegion } from "../src/lib/prompts";

const base = process.argv[2] ?? "/home/team/shared/live-validate/e51c4b81-final-simplewhite";
const tmplArg = process.argv[3];
const tmplFile = tmplArg
  ? (tmplArg.startsWith("/") ? tmplArg : `${base}/${tmplArg}`)
  : `${base}/fixture-simplewhite-flyer.png`;
const regionsFileCandidates = [`${base}/analyze-regions.json`, `${base}/live-analyze-regions.json`];
const raw = await readFile(tmplFile);
const dataUrl = `data:image/png;base64,${raw.toString("base64")}`;
let regionsRaw: unknown = null;
let regionsFile = "";
for (const c of regionsFileCandidates) {
  try { regionsRaw = JSON.parse(await readFile(c, "utf8")); regionsFile = c; break; }
  catch { /* try next */ }
}
if (!regionsRaw) { console.error(`no regions JSON found under ${base} (tried ${regionsFileCandidates.join(", ")})`); process.exit(1); }
const regions: TemplateRegion[] = Array.isArray(regionsRaw) ? regionsRaw : (regionsRaw as { regions: TemplateRegion[] }).regions;

// Natural size of the fixture (what /api/render worked on).
const sizeSvg = '<svg xmlns="http://www.w3.org/2000/svg"><image href="' + dataUrl + '"/></svg>';
const dim = new Resvg(sizeSvg, { font: { loadSystemFonts: true } });
const W = dim.width, H = dim.height;
const templateDataUrl = dataUrl;

const OUT = "/tmp/real-raster-simplewhite";
await mkdir(OUT, { recursive: true });

function decodePng(buf: Buffer): Uint8Array {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><image href="' + dataUrl + '" x="0" y="0" width="' + W + '" height="' + H + '"/></svg>';
  return new Resvg(svg).render().pixels as Uint8Array;
}
const origPx = decodePng(raw);

const textRegions = regions.filter((r) => r.kind === "text");
const imageBlocks = regions
  .filter((r) => r.kind === "image")
  .map((r) => ({
    x0: Math.max(0, Math.floor(r.x * W)),
    y0: Math.max(0, Math.floor(r.y * H)),
    x1: Math.min(W - 1, Math.ceil((r.x + r.w) * W) - 1),
    y1: Math.min(H - 1, Math.ceil((r.y + r.h) * H) - 1),
  }));
const inImg = (x: number, y: number) => imageBlocks.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);

// Synthesize non-empty regionText so every text region is treated as editable text.
const regionText: Record<string, string> = {};
for (const r of textRegions) regionText[r.id] = "replacement";

const result = inpaintTemplateBackground(templateDataUrl, regions, regionText, W, H, {
  aggressive: true,
  whiteFill: true,
});
if (!result?.imageDataUrl) {
  console.log("❌ inpaintTemplateBackground returned no result");
  process.exit(1);
}
await writeFile(`${OUT}/a-inpainted-base.png`, Buffer.from(result.imageDataUrl.split(",")[1], "base64"));
await writeFile(`${OUT}/b-original.png`, raw);
const outPx = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><image href="' + result.imageDataUrl + '" x="0" y="0" width="' + W + '" height="' + H + '"/></svg>').render().pixels as Uint8Array;

const lum = (i: number) => 0.299 * origPx[i] + 0.587 * origPx[i + 1] + 0.114 * origPx[i + 2];
const outLum = (i: number) => 0.299 * outPx[i] + 0.587 * outPx[i + 1] + 0.114 * outPx[i + 2];

console.log(`\n=== REAL-RASTER residual-original-ink (simple-white) ===`);
console.log(`fixture: ${tmplFile}`);
console.log(`size ${W}×${H}; text regions ${textRegions.length}; image blocks ${imageBlocks.length}`);
console.log("residual-original-ink = non-white pixels remaining in a text box, image-block pixels excluded\n");

function residualFor(r: TemplateRegion) {
  const x0 = Math.max(0, Math.floor(r.x * W));
  const x1 = Math.min(W - 1, Math.ceil((r.x + r.w) * W) - 1);
  const y0 = Math.max(0, Math.floor(r.y * H));
  const y1 = Math.min(H - 1, Math.ceil((r.y + r.h) * H) - 1);
  let ink = 0, tot = 0, whiteBefore = 0, whiteAfter = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (inImg(x, y)) continue; // preserved photo/logo, not lettering
    const i = (y * W + x) * 4;
    tot++;
    if (lum(i) < 200) whiteBefore++;
    if (outLum(i) < 200) ink++;
    else if (outLum(i) > 250) whiteAfter++;
  }
  return { residual: tot ? ink / tot : 0, origDarkFrac: tot ? whiteBefore / tot : 0 };
}

let allPass = true;
for (const r of textRegions) {
  const { residual, origDarkFrac } = residualFor(r);
  const pct = (residual * 100).toFixed(3);
  const label = (r.label ?? r.id).padEnd(12);
  if (origDarkFrac < 0.6) {
    // primarily a flat-lettering region → must be fully emptied
    const ok = residual <= 0.03;
    if (!ok) allPass = false;
    console.log(`${ok ? "✅" : "❌"} ${r.id} ${label} x=${r.x.toFixed(2)} y=${r.y.toFixed(2)} residual ${pct}% (orig-dark ${(origDarkFrac*100).toFixed(1)}%) ${ok ? "PASS" : "RESIDUAL!!"}`);
  } else {
    // art/photographic region → reported, not hard-failed (bounded by design)
    console.log(`⏳ ${r.id} ${label} x=${r.x.toFixed(2)} y=${r.y.toFixed(2)} residual ${pct}% (orig-dark ${(origDarkFrac*100).toFixed(1)}% — BUSY/ART region, ink-masked, reported)`);
  }
}

console.log(allPass ? "\n✅ ALL flat text regions emptied (residual-original-ink ≈ 0)" : "\n❌ Some flat text regions still show residual lettering");
console.log(`\nEvidence: ${OUT}/ (a-inpainted-base.png, b-original.png) — feed a-inpainted-base.png to the gpt-4o readability gate next.`);
process.exit(allPass ? 0 : 1);
