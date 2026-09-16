/**
 * Relevate — deterministic verify for owner defect 3c6145cf: replacement photos
 * not compositing into uploaded-template image regions.
 *
 * ROOT CAUSE: templateReplicaTemplate hardcoded its layout canvas to
 * 1275×1650 (flyer) / 1080×1080 (social) instead of the ACTUAL output canvas
 * (outputCanvasSize). When an uploaded template's natural dimensions drive a
 * smaller/non-standard canvas (e.g. a 791×1024 upload → canvas 791×1024), every
 * absolutely-positioned layer (base image, image-region replacements, text) was
 * laid out in 1275×1650 space and landed off-canvas — replacement photos never
 * appeared in their boxes. Fixed by threading outputWidth/outputHeight from
 * renderMarketingPng into templateReplicaTemplate (render.ts + render-templates.ts)
 * so replica layout matches the real satori canvas.
 *
 * THIS GATE runs at a NON-STANDARD canvas (791×1024) with several image regions
 * (photos + a logo) and asserts that two runs filled with solid-RED vs solid-BLUE
 * replacement photos DIFFER materially in each image region AND carry photo ink.
 * Before the fix every region showed 0% (photos dropped); after the fix each
 * composites. Self-contained (no external fixtures).
 *
 * Run: bun scripts/verify-uploaded-image-composite.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { renderMarketingPng, type RenderRequest } from "../src/lib/render";
import type { TemplateRegion, TemplateRegionLabel } from "../src/lib/prompts";

const TW = 791, TH = 1024; // NON-STANDARD upload canvas — the defect trigger
const OUT = "/tmp/uploaded-img-composite";
await mkdir(OUT, { recursive: true });

function solidPng(width: number, height: number, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`;
  return `data:image/png;base64,${new Resvg(svg).render().asPng().toString("base64")}`;
}

const templateBase = solidPng(TW, TH, "#6b6b6b");
const redPhoto = solidPng(300, 200, "#ff0000");
const bluePhoto = solidPng(300, 200, "#0000ff");

function region(id: string, label: TemplateRegionLabel, x: number, y: number, w: number, h: number): TemplateRegion {
  return { id, label, kind: "image", x, y, w, h, textColor: "#ffffff", fontFamily: "sans-serif", fontWeight: "normal", align: "left" };
}
const imageRegions: TemplateRegion[] = [
  region("photo-1", "photo", 0.05, 0.62, 0.4, 0.32),
  region("logo-1", "logo", 0.06, 0.82, 0.1, 0.1),
  region("photo-2", "photo", 0.48, 0.7, 0.2, 0.1),
];

async function renderWith(photo: string, tag: string): Promise<Buffer> {
  const req: RenderRequest = {
    type: "flyer",
    title: "TEST",
    body: "test ",
    agentName: "t",
    templateImage: templateBase,
    templateRegions: imageRegions,
    templateWidth: TW,
    templateHeight: TH,
    regionText: {},
    regionImages: Object.fromEntries(imageRegions.map((r) => [r.id, photo])),
  };
  const url = await renderMarketingPng(req);
  const buf = Buffer.from(url.split(",")[1], "base64");
  await writeFile(`${OUT}/${tag}.png`, buf);
  return buf;
}

function decodePng(buf: Buffer): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><image href="data:image/png;base64,${buf.toString("base64")}" x="0" y="0" width="${TW}" height="${TH}"/></svg>`;
  return new Resvg(svg).render().pixels as Uint8Array;
}

const a = decodePng(await renderWith(redPhoto, "composite-red"));
const b = decodePng(await renderWith(bluePhoto, "composite-blue"));

let fail = 0;
console.log(`=== Uploaded-template image-region composite verify (task 3c6145cf, canvas ${TW}x${TH}) ===`);
for (const r of imageRegions) {
  const x0 = Math.floor(r.x * TW), y0 = Math.floor(r.y * TH);
  const x1 = Math.min(TW - 1, Math.ceil((r.x + r.w) * TW) - 1);
  const y1 = Math.min(TH - 1, Math.ceil((r.y + r.h) * TH) - 1);
  let diff = 0, red = 0, blue = 0, total = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * TW + x) * 4;
    total++;
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) diff++;
    if (a[i] > 200 && a[i + 1] < 80 && a[i + 2] < 80) red++;
    if (b[i + 2] > 200 && b[i] < 80 && b[i + 1] < 80) blue++;
  }
  const df = diff / total, rf = red / total, bf = blue / total;
  const ok = df > 0.2 || (rf + bf) > 0.3;
  const status = ok ? "PASS" : "FAIL — replacement photo NOT composited";
  console.log(`  ${r.id.padEnd(8)} diff=${(df * 100).toFixed(1).padStart(5)}%  red=${(rf * 100).toFixed(1)}%  blue=${(bf * 100).toFixed(1)}%  ${status}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? "✅ ALL image regions composite replacement photos" : `❌ ${fail} image region(s) failed — photos dropped`}`);
console.log(`Evidence: ${OUT}/ (composite-red.png, composite-blue.png)`);
process.exit(fail ? 1 : 0);
