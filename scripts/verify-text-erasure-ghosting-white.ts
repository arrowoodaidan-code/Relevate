/**
 * Relevate — DIAGNOSTIC (not gated): text-erasure ghosting on a PURE-WHITE background.
 * ==========================================================================
 * The owner reports residual blur specifically on a WHITE background (the gated
 * verify-text-erasure-ghosting.ts only covers a light-card #e8e6e0 fixture).
 *
 * This script builds LOW-CONTRAST near-white text on a pure-white background —
 * the exact worst case where the conservative inpainter's fixed 34-delta mask
 * threshold under-masks (its ghost), and tests whether the aggressive path
 * (eraseAllTemplateText → aggressive:true) fully removes it.
 *
 * Residual ink = fraction of pixels in the known text region still differing
 * from the background by > eps after erasure.
 *
 * Run: bun scripts/verify-text-erasure-ghosting-white.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { inpaintTemplateBackground, eraseAllTemplateText } from "../src/lib/render";
import type { TemplateRegion } from "../src/lib/prompts";

const PREVIEW_W = 900;
const PREVIEW_H = 1200;
const BG: [number, number, number] = [255, 255, 255]; // pure white
// Low-contrast near-white ink: delta ≈ (253,253,253) vs white — well UNDER the
// conservative mask threshold (34), so the old path should leave a ghost, and
// the OLD path may even fail to fully mask. This is the reported white-bg case.
const TEXT_COLOR = [242, 242, 242]; // #f2f2f2 — delta 13 vs white
const tc = `rgb(${TEXT_COLOR[0]},${TEXT_COLOR[1]},${TEXT_COLOR[2]})`;

const OUT = "/tmp/text-erasure-ghost-white";
await mkdir(OUT, { recursive: true });

function renderSvg(svg: string): Buffer {
  return new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" } }).render().asPng();
}

const textRegion: TemplateRegion = {
  id: "body-1",
  label: "body",
  kind: "text",
  x: 0.06,
  y: 0.6,
  w: 0.88,
  h: 0.22,
  textColor: "#f2f2f2",
  fontFamily: "sans-serif",
  fontWeight: "normal",
  align: "left",
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_W}" height="${PREVIEW_H}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="60" y="120" font-family="DejaVu Sans" font-size="52" fill="${tc}">WHITE BG LOW CONTRAST</text>
  <text x="60" y="200" font-family="DejaVu Sans" font-size="34" fill="${tc}">Near-white text on pure white — the case</text>
  <text x="60" y="260" font-family="DejaVu Sans" font-size="34" fill="${tc}">the owner reports as residual blur.</text>
  <text x="60" y="320" font-family="DejaVu Sans" font-size="34" fill="${tc}">It is deliberately within 34 of the bg.</text>
  <text x="60" y="700" font-family="DejaVu Sans" font-size="48" fill="#443f39">DARK CONTRAST TEXT</text>
  <text x="60" y="780" font-family="DejaVu Sans" font-size="34" fill="#443f39">Far from background — control.</text>
</svg>`;

const templatePng = renderSvg(svg);
const templateDataUrl = `data:image/png;base64,${templatePng.toString("base64")}`;
await writeFile(`${OUT}/a-template-before.png`, templatePng);
const W = PREVIEW_W, H = PREVIEW_H;

function decode(url: string) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image href="${url}" x="0" y="0" width="${W}" height="${H}"/></svg>`;
  return new Resvg(s).render().pixels as Uint8Array;
}
const px = (p: Uint8Array, x: number, y: number, c: number) => p[(y * W + x) * 4 + c];
const delta = (p: Uint8Array, x: number, y: number) =>
  Math.max(
    Math.abs(px(p, x, y, 0) - BG[0]),
    Math.abs(px(p, x, y, 1) - BG[1]),
    Math.abs(px(p, x, y, 2) - BG[2]),
  );

function residualInk(url: string, r: TemplateRegion, eps = 10) {
  const p = decode(url);
  const x0 = Math.max(0, Math.floor(r.x * W));
  const x1 = Math.min(W - 1, Math.ceil((r.x + r.w) * W) - 1);
  const y0 = Math.max(0, Math.floor(r.y * H));
  const y1 = Math.min(H - 1, Math.ceil((r.y + r.h) * H) - 1);
  let ink = 0, total = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { total++; if (delta(p, x, y) > eps) ink++; }
  return total ? ink / total : 0;
}

// ---- Conservative (old) path — the owner's ghost on white ----
const oldErase = inpaintTemplateBackground(
  templateDataUrl, [textRegion], { "body-1": "" }, W, H, { aggressive: false },
)?.imageDataUrl;
const oldResidual = oldErase ? residualInk(oldErase, textRegion) : 1;
if (oldErase) await writeFile(`${OUT}/b-ghost-old-conservative.png`, Buffer.from(oldErase.split(",")[1], "base64"));

// ---- Aggressive (new) path ----
const newErase = eraseAllTemplateText(templateDataUrl, [textRegion], W, H)!;
await writeFile(`${OUT}/c-fixed-aggressive.png`, Buffer.from(newErase.split(",")[1], "base64"));
const newResidual = residualInk(newErase, textRegion);

console.log("=== text-erasure ghosting on PURE-WHITE background (diagnostic) ===");
console.log(`conservative (old) residual ink: ${(oldResidual * 100).toFixed(2)}%`);
console.log(`aggressive (new)  residual ink: ${(newResidual * 100).toFixed(2)}%`);
console.log(`${oldResidual > 0.02 ? "✅ ghost reproduced by conservative path (white export)" : "⚠️ conservative path already clean on this fixture"}`);
if (newResidual > 0.01) {
  console.log(`❌ aggressive erase STILL leaves residual ink on white: ${(newResidual * 100).toFixed(2)}% — this is the owner's reported blur risk`);
} else {
  console.log(`✅ aggressive erase fully removed white-bg text (residual ${(newResidual * 100).toFixed(2)}% ≤ 1%) — background continuous`);
}
console.log(`\nEvidence: ${OUT}/`);
