/**
 * REPRODUCTION for task 524f8e4b (lead + tester defect report):
 * "a designed flyer rendered with brokerage and responsible-broker values
 * SUPPLIED produced a footer containing only 'Your local real estate expert'
 * + 'EQUAL HOUSING OPPORTUNITY' — no brokerage-name line, no disclosure line".
 *
 * Renders the SC acceptance case (jurisdiction SC, brokerageName + brokerName
 * supplied, NO licence numbers — SC requires none, sc-no-license-number-no-phone)
 * against all four native templates, PLUS an identical control with the
 * brokerage/broker fields omitted. Pixel-measures the bottom disclosure band of
 * each pair so the extra ink of the supplied brokerage is MEASURED, not assumed,
 * and saves every PNG for visual inspection.
 */
import { renderMarketingPng } from "../src/lib/render";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

const OUT = "/home/team/shared/render-samples/sc-disclosure/";
await mkdir(OUT, { recursive: true });

// SC acceptance case — exactly what a South Carolina agent supplies: the full
// brokerage firm name and the responsible broker's name. Licence fields left
// EMPTY deliberately (SC requires none — negative finding sc-no-license-number-
// no-phone); phone is an agent contact field, NOT a demanded disclosure.
const scCase: Record<string, unknown> = {
  type: "flyer",
  brandedTemplate: "flyer-hero",
  title: "Charming Colonial on Shem Creek",
  body: "Four bedrooms, deep water dock, five minutes from Old Village. Built 1998, renovated kitchen, new roof 2024.",
  agentName: "Dana Ruiz",
  agentPhone: "(843) 555-0134",
  jurisdiction: "SC",
  brokerageName: "Palmetto Coast Properties",
  brokerName: "Marta Reyes",
};
const control: Record<string, unknown> = { ...scCase };
delete control.brokerageName;
delete control.brokerName;

const CASES: [string, string, "flyer" | "social"][] = [
  ["flyer-hero", "flyer-hero", "flyer"],
  ["flyer-classic", "flyer-classic", "flyer"],
  ["social-photo", "social-photo", "social"],
  ["social-classic", "social-classic", "social"],
];

for (const [name, templateId, kind] of CASES) {
  const withB: any = { ...scCase, type: kind, brandedTemplate: templateId };
  const without: any = { ...control, type: kind, brandedTemplate: templateId };
  const pngA: string = (await renderMarketingPng(withB)) as unknown as string;
  const pngB: string = (await renderMarketingPng(without)) as unknown as string;
  await writeFile(`${OUT}sc-${name}.png`, Buffer.from(pngA.slice("data:image/png;base64,".length), "base64"));
  await writeFile(`${OUT}sc-${name}-no-brokerage.png`, Buffer.from(pngB.slice("data:image/png;base64,".length), "base64"));
}

function decodePng(buf: Buffer): { w: number; h: number; px: (x: number, y: number) => [number, number, number] } {
  let off = 8, w = 0, h = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === "IDAT") idat.push(Buffer.from(data));
    off += 12 + len;
    if (type === "IEND") break;
  }
  if (colorType !== 6) throw new Error(`unsupported colorType ${colorType}`);
  const bpp = 4, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const prev = new Uint8Array(stride);
  const rows: Uint8Array[] = [];
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const inRow = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = inRow[i];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      cur[i] = v;
    }
    rows.push(cur); prev.set(cur);
  }
  return { w, h, px: (x, y) => [rows[y][x * 4], rows[y][x * 4 + 1], rows[y][x * 4 + 2]] };
}
const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
/** Text-line groups in [y0, imgH): a row is ink if >=3 dark pixels. */
function measureLines(buf: Buffer, y0: number): { top: number; height: number; inkPixels: number; span: number }[] {
  const img = decodePng(buf);
  const rowInk: { ink: number; first: number; last: number }[] = [];
  for (let y = y0; y < img.h; y++) {
    let ink = 0, first = -1, last = -1;
    for (let x = 0; x < img.w; x++) {
      const [r, g, b] = img.px(x, y);
      if (lum(r, g, b) < 0.45) { ink++; if (first < 0) first = x; last = x; }
    }
    rowInk.push({ ink, first, last });
  }
  const groups: { top: number; height: number; inkPixels: number; span: number }[] = [];
  let cur: { top: number; rows: { ink: number; first: number; last: number }[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const inkRows = cur.rows.filter((r) => r.ink > 0);
    const span = inkRows.length ? Math.max(...inkRows.map((r) => r.last - r.first)) : 0;
    groups.push({ top: cur.top, height: cur.rows.length, inkPixels: cur.rows.reduce((a, r) => a + r.ink, 0), span });
    cur = null;
  };
  for (let i = 0; i < rowInk.length; i++) {
    if (rowInk[i].ink >= 3) { if (!cur) cur = { top: y0 + i, rows: [] }; cur.rows.push(rowInk[i]); }
    else flush();
  }
  flush();
  return groups.filter((g) => g.height > 2);
}

console.log("=== BOTTOM-BAND LINE GROUPS (with brokerage vs control) ===");
for (const [name] of CASES) {
  const bufA = await readFile(`${OUT}sc-${name}.png`);
  const bufB = await readFile(`${OUT}sc-${name}-no-brokerage.png`);
  const img = decodePng(bufA);
  const y0 = Math.round(img.h * 0.75);
  const ga = measureLines(bufA, y0);
  const gb = measureLines(bufB, y0);
  console.log(`--- ${name} (canvas ${img.w}x${img.h}, band from y=${y0})`);
  console.log(`    with brokerage/broker : ${JSON.stringify(ga.map((g) => [g.top, g.height, g.span]))}`);
  console.log(`    without (control)     : ${JSON.stringify(gb.map((g) => [g.top, g.height, g.span]))}`);
  const extra = ga.length - gb.length;
  console.log(`    line-count delta      : ${extra >= 0 ? "+" : ""}${extra}`);
}
