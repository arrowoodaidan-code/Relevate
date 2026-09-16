/**
 * Verify manual text-box authoring pivot (task e0f2e06f).
 * Drives renderMarketingPng exactly as app.tsx manual mode does and asserts:
 *   1. text-erased base removes lettering from TEXT regions, preserves images
 *   2. manual render keeps text gone, adds user text, renders swapped photo
 * Evidence -> /tmp/manual-pivot-verify/
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { renderMarketingPng, eraseAllTemplateText } from "../src/lib/render";
import type { TemplateRegion } from "../src/lib/prompts";
import { Resvg } from "@resvg/resvg-js";

const OUT = "/tmp/manual-pivot-verify";
const FIX = "/home/team/shared/render-samples/analyze-template-objects";
const W = 1080, H = 1350;
const PASS: string[] = [], FAIL: string[] = [];
const report = (n: string, ok: boolean, d: string) => { (ok ? PASS : FAIL).push(`${n}: ${d}`); console.log(`${ok ? "✅" : "❌"} ${n} — ${d}`); };
const asset = async (p: string) => `data:image/png;base64,${(await readFile(p)).toString("base64")}`;
function dec(u: string) { const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image href="${u}" x="0" y="0" width="${W}" height="${H}"/></svg>`; return new Resvg(svg).render().pixels as Uint8Array; }
const px = (p: Uint8Array, x: number, y: number) => { const i = (y * W + x) * 4; return [p[i], p[i + 1], p[i + 2]]; };
const delta = (a: number[], b: number[]) => Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1]), Math.abs(a[2]-b[2]));
function regionPct(a: Uint8Array, b: Uint8Array, r: TemplateRegion, step = 2) {
  const x0 = Math.max(0, Math.floor(r.x * W)), y0 = Math.max(0, Math.floor(r.y * H));
  const x1 = Math.min(W - 1, Math.ceil((r.x + r.w) * W) - 1), y1 = Math.min(H - 1, Math.ceil((r.y + r.h) * H) - 1);
  let changed = 0, total = 0;
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) { total++; if (delta(px(a, x, y), px(b, x, y)) > 30) changed++; }
  return total ? changed / total : 0;
}
await mkdir(OUT, { recursive: true });
const regions = (JSON.parse(await readFile(`${FIX}/regions.json`, "utf8")) as { regions: TemplateRegion[] }).regions;
const textRegions = regions.filter((r) => r.kind === "text");
const imageRegions = regions.filter((r) => r.kind === "image");
const tpl = await asset(`${FIX}/multi-object-template.png`);
await writeFile(`${OUT}/before-template.png`, Buffer.from(tpl.split(",")[1], "base64"));
const before = dec(tpl);

// 1. text-erased base
const erased = eraseAllTemplateText(tpl, regions, W, H)!;
await writeFile(`${OUT}/after-inpainted-base.png`, Buffer.from(erased.split(",")[1], "base64"));
const erasedPx = dec(erased);
const textPcts = textRegions.map((r) => regionPct(before, erasedPx, r));
const imgPcts = imageRegions.map((r) => regionPct(before, erasedPx, r, 3));
report("1. TEXT erased from base", textPcts.every((p) => p > 0.01), `text-region changed fractions: [${textPcts.map((p) => p.toFixed(3)).join(", ")}]`);
report("2. images preserved in base", imgPcts.every((p) => p < 0.02), `image-region changed fractions: [${imgPcts.map((p) => p.toFixed(3)).join(", ")}]`);

// 3. manual render
const manualText: TemplateRegion = { id: "add-text-1", label: "other", kind: "text", x: 0.1, y: 0.52, w: 0.8, h: 0.1, textColor: "#c22b1f", fontFamily: "sans-serif", fontWeight: "bold", align: "center", additive: true, fontSizePx: 60 };
const swap = await asset(`${FIX}/swap-blue.png`);
const out = await renderMarketingPng({ type: "flyer", title: "Manual text test", body: "x", templateImage: erased, templateRegions: [...imageRegions, manualText], regionText: { "add-text-1": "SOLD • MANUAL TEXT" }, regionImages: { "photo-1": swap }, templateWidth: W, templateHeight: H })!;
const png = Buffer.from(out.split(",")[1], "base64");
await writeFile(`${OUT}/after-manual-render.png`, png);
const dims = png.length > 24 && png.toString("ascii", 1, 4) === "PNG" ? [png.readUInt32BE(16), png.readUInt32BE(20)] : [0, 0];
report("3a. render PNG at native size", dims[0] === W && dims[1] === H, `got ${dims[0]}x${dims[1]}`);
const renderPx = dec(out);
// manual text present (red ink in manual text box)
const mtPct = regionPct(erasedPx, renderPx, manualText, 2);
report("3b. user manual text renders", mtPct > 0.01, `manual text-box changed fraction: ${mtPct.toFixed(3)} (added ink vs erased base)`);
// swapped photo present: photo box differs substantially from the erased base
const photo = imageRegions.find((r) => r.label === "photo")!;
const swapPct = regionPct(erasedPx, renderPx, photo, 2);
report("3c. swapped photo renders", swapPct > 0.3, `hero-photo box changed fraction: ${swapPct.toFixed(3)} (blue swap vs original photo)`);
// original text still gone in render (text boxes other than manual == erased base)
const otherText = textRegions.filter((r) => !(r.x + r.w / 2 >= manualText.x && r.x + r.w / 2 <= manualText.x + manualText.w && r.y + r.h / 2 >= manualText.y && r.y + r.h / 2 <= manualText.y + manualText.h));
const gonePcts = otherText.map((r) => regionPct(erasedPx, renderPx, r, 2));
report("3d. no original template text in render", gonePcts.every((p) => p < 0.02), `non-manual text boxes unchanged from erased base: [${gonePcts.map((p) => p.toFixed(3)).join(", ")}]`);

console.log("\n=== Result ===");
console.log(`PASS: ${PASS.length}  FAIL: ${FAIL.length}  → ${OUT}/`);
process.exit(FAIL.length ? 1 : 0);
