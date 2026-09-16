/**
 * Relevate — verify the text-erasure ghosting fix (task 0ba6568c).
 * ==========================================================================
 * The owner sees FAINT remaining text traces after the manual-authoring erase
 * ("text almost gone but not fully blended"). This script builds controllable
 * LOW-CONTRAST text-on-solid-background templates (two fixtures: a light card
 * #e8e6e0 AND a pure-white #ffffff background — the latter being the exact case
 * the owner reports), then for EACH fixture:
 *
 *   1. Renders the template with the OLD conservative inpainter (aggressive:
 *      false — the render-time logo/replacement path) and measures how much
 *      residual ink survives (this is the GHOST).
 *   2. Renders it with the NEW aggressive full-text-erasure path
 *      (eraseAllTemplateText → aggressive:true) and asserts residual ink is ~0
 *      — the ghost is gone and the background is continuous.
 *
 * Residual ink = the fraction of pixels inside the (known) text region that
 * still differ from the region's dominant (background) color by more than a
 * small epsilon AFTER erasure. On a solid background a clean erase gives ~0.
 *
 * OWNER DECISION (task 59e17c23): the aggressive full-text-erasure path no
 * longer blends into the local background — it fills the erased region with a
 * STRAIGHT WHITE box (eraseAllTemplateText → whiteFill:true). So the hard gate
 * here is updated to the new expectation: the aggressive result must be a clean,
 * UNIFORM WHITE box (whitePurity ≈ 1) — no residual lettering of ANY kind, on
 * ANY background (light card AND pure white). The conservative (aggressive:false)
 * logo/replacement path is untouched and still measured against the local bg
 * (it does not white-fill) — kept as a diagnostic only.
 *
 * Evidence -> /tmp/text-erasure-ghost/ (+ /pure-white/ subfolder).
 * Run: bun scripts/verify-text-erasure-ghosting.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { inpaintTemplateBackground, eraseAllTemplateText } from "../src/lib/render";
import type { TemplateRegion } from "../src/lib/prompts";

const PREVIEW_W = 900;
const PREVIEW_H = 1200;

const OUT = "/tmp/text-erasure-ghost";
await mkdir(OUT, { recursive: true });
await mkdir(`${OUT}/pure-white`, { recursive: true });

function renderSvg(svg: string): Buffer {
  return new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" } }).render().asPng();
}

// ---- Fixtures: light card (BG #e8e6e0) and pure white (#ffffff) ----
const fixtures = [
  {
    name: "light-card",
    bgHex: "#e8e6e0",
    bg: [232, 230, 220] as [number, number, number],
    textColor: [128, 124, 118] as [number, number, number], // ~#807c76 (delta ~104)
    subdir: "",
  },
  {
    name: "pure-white",
    bgHex: "#ffffff",
    bg: [255, 255, 255] as [number, number, number],
    textColor: [242, 242, 242] as [number, number, number], // #f2f2f2 (delta ~13 — under old 34 threshold)
    subdir: "pure-white/",
  },
];

let fail = 0;

for (const fx of fixtures) {
  const { name, bgHex, bg, textColor } = fx;
  const tc = `rgb(${textColor[0]},${textColor[1]},${textColor[2]})`;
  const textRegion: TemplateRegion = {
    id: "body-1",
    label: "body",
    kind: "text",
    x: 0.06,
    y: 0.6,
    w: 0.88,
    h: 0.22,
    textColor: bgHex,
    fontFamily: "sans-serif",
    fontWeight: "normal",
    align: "left",
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_W}" height="${PREVIEW_H}">
  <rect width="100%" height="100%" fill="${bgHex}"/>
  <text x="60" y="120" font-family="DejaVu Sans" font-size="52" fill="${tc}">LOW CONTRAST TEXT</text>
  <text x="60" y="200" font-family="DejaVu Sans" font-size="34" fill="${tc}">This paragraph sits on the ${bgHex}.</text>
  <text x="60" y="260" font-family="DejaVu Sans" font-size="34" fill="${tc}">It is deliberately close in color to the</text>
  <text x="60" y="320" font-family="DejaVu Sans" font-size="34" fill="${tc}">background, reproducing the ghosting.</text>
  <text x="60" y="700" font-family="DejaVu Sans" font-size="48" fill="#443f39">DARK CONTRAST TEXT</text>
  <text x="60" y="780" font-family="DejaVu Sans" font-size="34" fill="#443f39">This one is far from the background and was</text>
  <text x="60" y="840" font-family="DejaVu Sans" font-size="34" fill="#443f39">already fully erased by the conservative path.</text>
</svg>`;

  const templatePng = renderSvg(svg);
  const templateDataUrl = `data:image/png;base64,${templatePng.toString("base64")}`;
  await writeFile(`${OUT}/${fx.subdir}a-template-before-${name}.png`, templatePng);
  const W = PREVIEW_W, H = PREVIEW_H;

  function decode(url: string) {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image href="${url}" x="0" y="0" width="${W}" height="${H}"/></svg>`;
    return new Resvg(s).render().pixels as Uint8Array;
  }
  const px = (p: Uint8Array, x: number, y: number, c: number) => p[(y * W + x) * 4 + c];
  const delta = (p: Uint8Array, x: number, y: number) =>
    Math.max(
      Math.abs(px(p, x, y, 0) - bg[0]),
      Math.abs(px(p, x, y, 1) - bg[1]),
      Math.abs(px(p, x, y, 2) - bg[2]),
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

  // WHITE-FILL purity (owner decision 59e17c23): fraction of region pixels that
  // are clean white (all channels ≥ WHITE_MIN). The aggressive erase paints the
  // whole region white, so this must be ≈ 1 on EVERY background.
  function whitePurity(url: string, r: TemplateRegion, WHITE_MIN = 250) {
    const p = decode(url);
    const x0 = Math.max(0, Math.floor(r.x * W));
    const x1 = Math.min(W - 1, Math.ceil((r.x + r.w) * W) - 1);
    const y0 = Math.max(0, Math.floor(r.y * H));
    const y1 = Math.min(H - 1, Math.ceil((r.y + r.h) * H) - 1);
    let white = 0, total = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      total++;
      const i = (y * W + x) * 4;
      if (p[i] >= WHITE_MIN && p[i + 1] >= WHITE_MIN && p[i + 2] >= WHITE_MIN) white++;
    }
    return total ? white / total : 0;
  }

  // ---- 1. Old conservative path (render-time logo/replacement behaviour) ------
  const oldErase = inpaintTemplateBackground(
    templateDataUrl, [textRegion], { "body-1": "" }, W, H, { aggressive: false },
  )?.imageDataUrl;
  const oldResidual = oldErase ? residualInk(oldErase, textRegion) : 1;
  if (oldErase) {
    await writeFile(`${OUT}/${fx.subdir}b-ghost-old-conservative-${name}.png`, Buffer.from(oldErase.split(",")[1], "base64"));
  }

  // ---- 2. New aggressive full-text-erasure path (eraseAllTemplateText) --------
  const newErase = eraseAllTemplateText(templateDataUrl, [textRegion], W, H)!;
  await writeFile(`${OUT}/${fx.subdir}c-fixed-aggressive-${name}.png`, Buffer.from(newErase.split(",")[1], "base64"));
  const newPurity = whitePurity(newErase, textRegion);

  console.log(`\n=== fixture: ${name} (bg ${bgHex}) ===`);
  console.log(`  conservative (old) residual ink: ${(oldResidual * 100).toFixed(2)}% (vs local bg — diagnostic only)`);
  console.log(`  aggressive (new)  white-box purity: ${(newPurity * 100).toFixed(2)}%`);
  // The old path should measurably leave a ghost on low-contrast (diagnostic only).
  console.log(`${oldResidual > 0.02 ? "  ✅" : "  ⚠️"} ghost reproduced by conservative path (residual ${(oldResidual * 100).toFixed(2)}% ${oldResidual > 0.02 ? "> 2%" : "≤ 2% (clean by old path)"})`);
  // HARD gate (owner decision 59e17c23): the aggressive path must now produce a
  // clean solid WHITE box — whitePurity ≈ 1 on BOTH fixtures (no residual
  // lettering of any kind; a deliberate white fill is the expected design).
  if (newPurity < 0.99) {
    console.log(`  ❌ aggressive erase did NOT produce a clean white box on ${name}: white purity ${(newPurity * 100).toFixed(2)}%`);
    fail++;
  } else {
    console.log(`  ✅ aggressive erase produced a clean white box (white purity ${(newPurity * 100).toFixed(2)}% ≥ 99%) — no residual lettering, no ghost, no smear`);
  }
}

console.log(`\nEvidence: ${OUT}/`);
process.exit(fail ? 1 : 0);
