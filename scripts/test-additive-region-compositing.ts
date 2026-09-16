/**
 * EMPIRICAL VERIFICATION — additive editor region compositing (task 65e6bc1e, WS1).
 *
 * Question: when the editor sends an ADDITIVE region (editor-ADDED box) as an extra
 * TemplateRegion in /api/render, does the compositor draw its content ON TOP of the
 * base raster deterministically (draw-on-top), NOT erase-then-place (no inpainting/
 * erase logic wiping whatever sits under a new box)?
 *
 * Method: build a synthetic flyer base whose raster contains WHITE "lettering bars"
 * (pre-existing template content) under a region box. Render the same box twice —
 * once additive:true, once plain non-additive (control) — through the real pipeline
 * (validateRenderRequest -> renderMarketingPng = what /api/render calls). Decode the
 * OUTPUT and count surviving white pixels across the WHOLE image (the base is placed
 * inside a letterboxed satori frame, so fractional box coords shift — a full-image
 * white count is frame-robust).
 *   - ADDITIVE  -> white bars SURVIVE (draw-on-top; base kept byte-unchanged).
 *   - NON-additive control (existing inpaint path) -> bars ERASED (lettering ink).
 *
 * Run:  bun scripts/test-additive-region-compositing.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { renderMarketingPng, validateRenderRequest } from "../src/lib/render.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = join(__dirname, "..");
const SHARED = join(SITE, ".."); // /home/team/shared
const outDir = join(SHARED, "render-samples/additive-verify");
await mkdir(outDir, { recursive: true });

// --- Synthetic 800x1100 flyer base: dark bg + 4 WHITE lettering bars under the box ---
function buildBaseSvg(): string {
  const W = 800, H = 1100;
  let shapes = `<rect width="${W}" height="${H}" fill="#0a1a0a"/>`;
  // 4 thin white bars at y 0.42/0.47/0.52/0.57 (x 0.24-0.76), simulating template lettering
  for (const dy of [0.0, 0.05, 0.10, 0.15]) {
    shapes += `<rect x="${0.24 * W}" y="${(0.42 + dy) * H}" width="${0.52 * W}" height="6" fill="#ffffff"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${shapes}</svg>`;
}
const BASE_SVG = buildBaseSvg();
const basePng = new Resvg(BASE_SVG).render().asPng();
const BASE = `data:image/png;base64,${basePng.toString("base64")}`;
await writeFile(join(outDir, "0-base-template.png"), basePng);

// Region box covering the bars (0.20-0.80 x 0.40-0.60).
const box = { x: 0.2, y: 0.4, w: 0.6, h: 0.2 };

async function render(name: string, additive: boolean) {
  const id = additive ? "ADDED_caption1" : "caption1";
  const region: any = {
    id, kind: "text", label: "other",
    x: box.x, y: box.y, w: box.w, h: box.h,
    fontSizePx: 40, align: "left",
    textColor: additive ? "#00FF00" : "#ffffff", // green for additive (isolate white bars)
    fontWeight: "bold",
    ...(additive ? { additive: true } : {}),
  };
  const payload: any = {
    type: "flyer", title: "t", body: "SYNTHETIC ADDITIVE-BEHAVIOR TEST",
    templateImage: BASE, templateWidth: 800, templateHeight: 1100,
    templateRegions: [region], regionText: { [id]: "A" },
  };
  const check = validateRenderRequest(payload);
  if (!check.ok) { console.log(`❌ ${name}: rejected — ${check.error}`); return null; }
  const png = Buffer.from((await renderMarketingPng(check.data)).split(",")[1]!, "base64");
  await writeFile(join(outDir, `${name}.png`), png);
  return png;
}

// Frame-robust: count ALL white pixels (the lettering bars) in the output.
function countWhite(png: Buffer): number {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><image href="data:image/png;base64,${png.toString("base64")}" width="${w}" height="${h}"/></svg>`).render();
  const px = r.pixels;
  let white = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200) white++;
  return white;
}

const baseWhite = countWhite(basePng);
const addPng = await render("1-additive-draw-on-top", true);
const nonPng = await render("2-nonadditive-control", false);
const addWhite = addPng ? countWhite(addPng) : 0;
const nonWhite = nonPng ? countWhite(nonPng) : 0;

console.log("\n=== ADDITIVE REGION COMPOSITING VERIFICATION ===");
console.log(`  base template white-bars:          ${baseWhite}`);
console.log(`  ADDITIVE render  (draw-on-top?):   ${addWhite} white px preserved`);
console.log(`  NON-additive (inpaint control):    ${nonWhite} white px preserved`);
console.log("\nVERDICT:");
const preserved = addWhite >= baseWhite * 0.5;   // additive keeps the bars
const erased = nonWhite < baseWhite * 0.15;       // control erased the bars
if (preserved) console.log("  ✅ ADDITIVE regions composite DRAW-ON-TOP — pre-existing content under the box SURVIVES.");
else console.log("  ❌ ADDITIVE region ERASED the underlying content (erase-then-place).");
console.log(`     additive kept ${addWhite} white px vs control kept ${nonWhite} (base had ${baseWhite})`);
if (!erased) console.log("     (note: non-additive control did not fully erase — possible lettering-ink sampling nuance; see PNGs)");
console.log("Artifacts:", outDir);
