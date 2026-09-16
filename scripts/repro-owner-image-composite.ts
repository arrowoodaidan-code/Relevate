/**
 * Faithful repro of the OWNER's uploaded-template defect (task 3c6145cf):
 * replacement photos not compositing into image regions.
 *
 * Uses the actual owner test fixture (791×1024 open-house flyer) + the actual
 * detected regions.json (5 image regions: photo-1, logo-1, photo-2..4). Renders
 * via renderMarketingPng twice: once filling every image region with a solid-RED
 * photo, once with solid-BLUE. If regionImages composite, the two renders differ
 * materially AND each region carries photo ink; if they are dropped (the defect)
 * the renders are ~identical and regions show the template's own content.
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { renderMarketingPng, type RenderRequest } from "../src/lib/render";
import type { TemplateRegion } from "../src/lib/prompts";

const OUT = "/home/team/shared/uploaded-template-test/final-render/repro-3c6145cf";
await mkdir(OUT, { recursive: true });

const TW = 791, TH = 1024;
const baseBuf = await readFile("/home/team/shared/uploaded-template-test/erased-base-design-canvas.png");
const baseUrl = `data:image/png;base64,${baseBuf.toString("base64")}`;

const regionsRaw = JSON.parse(
  await readFile("/home/team/shared/uploaded-template-test/final-render/regions.json", "utf8"),
) as TemplateRegion[];

function solidPng(width: number, height: number, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`;
  return `data:image/png;base64,${new Resvg(svg).render().asPng().toString("base64")}`;
}

const redPhoto = solidPng(300, 200, "#ff0000");
const bluePhoto = solidPng(300, 200, "#0000ff");

const imageIds = regionsRaw.filter((r) => r.kind === "image").map((r) => r.id);
console.log("image regions:", imageIds.join(", "));

const regionText: Record<string, string> = {};
for (const r of regionsRaw) if (r.kind === "text") regionText[r.id] = "NEW COPY " + r.label;

const baseReq: RenderRequest = {
  type: "flyer",
  title: "COMPOSITE TEST",
  body: "test body",
  agentName: "t",
  templateImage: baseUrl,
  templateRegions: regionsRaw,
  templateWidth: TW,
  templateHeight: TH,
  regionText,
  regionImages: {},
};

function allRegions(photo: string): Record<string, string> {
  const m: Record<string, string> = {};
  for (const id of imageIds) m[id] = photo;
  return m;
}

async function renderWith(photo: string, tag: string): Promise<{ buf: Buffer; w: number; h: number }> {
  const url = await renderMarketingPng({ ...baseReq, regionImages: allRegions(photo) });
  const buf = Buffer.from(url.split(",")[1], "base64");
  await writeFile(`${OUT}/${tag}.png`, buf);
  // decode size for region sampling
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><image href="data:image/png;base64,${buf.toString("base64")}" x="0" y="0" width="${TW}" height="${TH}"/></svg>`;
  const r = new Resvg(svg).render();
  return { buf, w: r.width, h: r.height };
}

const red = await renderWith(redPhoto, "repro-red");
const blue = await renderWith(bluePhoto, "repro-blue");

readPixels: {
}

function pix(buf: Buffer): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><image href="data:image/png;base64,${buf.toString("base64")}" x="0" y="0" width="${TW}" height="${TH}"/></svg>`;
  return new Resvg(svg).render().pixels as Uint8Array;
}
const a = pix(red.buf), b = pix(blue.buf);

let fail = 0;
console.log("\n=== Per-region composite check (red vs blue) ===");
for (const id of imageIds) {
  const r = regionsRaw.find((x) => x.id === id)!;
  const x0 = Math.floor(r.x * TW), y0 = Math.floor(r.y * TH);
  const x1 = Math.min(TW - 1, Math.ceil((r.x + r.w) * TW) - 1);
  const y1 = Math.min(TH - 1, Math.ceil((r.y + r.h) * TH) - 1);
  let diff = 0, total = 0, redInk = 0, blueInk = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * TW + x) * 4;
    total++;
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (d > 60) diff++;
    const ar = a[i], ag = a[i + 1], ab = a[i + 2];
    const br = b[i], bg = b[i + 1], bb = b[i + 2];
    if (ar > 200 && ag < 80 && ab < 80) redInk++;
    if (bb > 200 && br < 80 && bg < 80) blueInk++;
  }
  const df = diff / total, rf = redInk / total, bf = blueInk / total;
  const ok = df > 0.2 || (rf + bf) > 0.3;
  console.log(`  ${id.padEnd(8)} diff=${(df * 100).toFixed(1).padStart(5)}%  red=${(rf * 100).toFixed(1)}%  blue=${(bf * 100).toFixed(1)}%  ${ok ? "PASS" : "FAIL — photo NOT composited"}`);
  if (!ok) fail++;
}

console.log(`\n${fail === 0 ? "ALL image regions composite" : fail + " image region(s) FAIL — photos dropped"}`);
process.exit(fail ? 1 : 0);
