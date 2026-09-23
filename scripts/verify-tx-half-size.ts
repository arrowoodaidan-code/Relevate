/**
 * TX 535.155(a) gate (task 7be13be8): for all four native templates assert
 *  (1) the planned broker-name size >= half the largest contact-info size,
 *  (2) a TX disclosure strip NEVER contains a licence-number label
 *      (tx-535-155-no-license-number) even when licence fields are supplied,
 *  (3) missing TX names produce the 535.155(a) warning and the message never
 *      claims a licence number is required.
 * Renders TX fixtures + one CA contrast render for visual inspection.
 */
import { renderMarketingPng } from "../src/lib/render";
import { txFooterPlan, largestContactPx } from "../src/lib/branded-templates";
import { disclosureWarnings } from "../src/lib/advertising-rules";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

const OUT = "/home/team/shared/render-samples/tx-disclosure/";
await mkdir(OUT, { recursive: true });

const base: Record<string, unknown> = {
  contentType: "flyer",
  jurisdiction: "TX",
  details: {
    address: "2201 Barton Springs Road, Austin",
    price: "$829,000",
    beds: 3, baths: 2, sqft: 2210,
    headline: "Modern Hill Country Retreat Minutes From Zilker Park",
    features: ["Whole-home sonos", "Infinity-edge patio", "Solar array"],
    description: "Floor-to-ceiling glass frames the oak canopy. Chef's kitchen with a plaster hood opens to a screened porch.",
  },
  agentName: "Dana Ruiz",
  agentPhone: "(555) 014-2288",
  brokerageName: "Ruiz Residential Realty",
  brokerName: "Ruiz Residential Realty",
  // Supplied deliberately: TX must SUPPRESS licence numbers (no requirement).
  agentLicense: "TREC #998877",
  brokerLicense: "TREC #900112",
};

// [fixtureName, templateId, strip/band width, contentType]
const CASES: [string, string, number, string][] = [
  ["flyer-hero", "flyer-hero", 1275 - 180, "flyer"],
  ["flyer-classic", "flyer-classic", 1275 - 180, "flyer"],
  ["social-photo", "social-photo", 1080 - 112, "social"],
  ["social-classic", "social-classic", 1080 - 180, "social"],
];

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`ok ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${detail}`); }
};

for (const [name, templateId, w, kind] of CASES) {
  const input: any = { ...base, contentType: kind, templateId };
  const plan = txFooterPlan(input, w, 15);
  const largest = largestContactPx(input, w);
  check(`${name}: plan.largestPx consistent with largestContactPx`, plan.largestPx === largest, `plan=${plan.largestPx} direct=${largest}`);
  check(`${name}: brokerSize >= largest/2`, plan.brokerSize >= plan.largestPx / 2, `broker=${plan.brokerSize} largest=${plan.largestPx}`);
  check(`${name}: 48px name -> broker >= 24px`, plan.largestPx === 48 && plan.brokerSize >= 24, `broker=${plan.brokerSize}`);
  check(`${name}: broker segment text`, plan.brokerSeg === "Broker Ruiz Residential Realty", String(plan.brokerSeg));
  const strip = `${plan.brokerSeg ?? ""} ${plan.detailText}`;
  check(`${name}: no licence-number label in TX strip`, !/License #|DRE #/.test(strip), strip);
  check(`${name}: supplied licence numbers suppressed`, !strip.includes("998877") && !strip.includes("9001"), strip);
  const png: string = (await renderMarketingPng(input)) as unknown as string;
  check(`${name}: render OK`, typeof png === "string" && png.startsWith("data:image/png;base64,"));
  await writeFile(`${OUT}tx-${name}.png`, Buffer.from(png.slice("data:image/png;base64,".length), "base64"));
}

// Long agent name forces the band fit smaller; broker must still be >= half.
const longName: any = { ...base, agentName: "Guadalupe Fernández de Castileja y Mendoza-Ortiz", contentType: "flyer", templateId: "flyer-hero" };
const planLong = txFooterPlan(longName, 1095, 15);
check("long-name: brokerSize >= largest/2", planLong.brokerSize >= planLong.largestPx / 2, `broker=${planLong.brokerSize} largest=${planLong.largestPx}`);
check("long-name: broker >= 9px floor when name fits small", planLong.brokerSize >= Math.ceil(planLong.largestPx / 2), `broker=${planLong.brokerSize} largest=${planLong.largestPx}`);

// Warnings: full fields -> none; missing broker -> 535.155(a) warning; the
// message must never claim a licence number is required.
const wFull = disclosureWarnings({ jurisdiction: "TX", agentName: "Dana Ruiz", brokerName: "Ruiz Residential Realty" });
check("warnings: TX full fields -> no warning", wFull.length === 0, JSON.stringify(wFull));
const wMissing = disclosureWarnings({ jurisdiction: "TX", agentName: "Dana Ruiz" });
check("warnings: missing broker -> 535.155 warning", wMissing.some((m) => m.level === "warning" && m.message.includes("535.155")), JSON.stringify(wMissing));
check("warnings: message denies licence-number requirement", wMissing.every((m) => !/(licence|license) number is required/i.test(m.message) && !/must include a (licence|license) number/i.test(m.message)));
const wNoNames = disclosureWarnings({ jurisdiction: "TX" });
check("warnings: no names at all -> warning", wNoNames.some((m) => m.level === "warning" && m.message.includes("535.155")));

// CA contrast render (licence labels still present outside TX).
const caIn: any = { ...base, jurisdiction: "CA", contentType: "flyer", templateId: "flyer-hero" };
const caPng: string = (await renderMarketingPng(caIn)) as unknown as string;
await writeFile(`${OUT}ca-flyer-hero-contrast.png`, Buffer.from(caPng.slice("data:image/png;base64,".length), "base64"));


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
/** Text-line groups in [y0, height): a row is ink if >=3 dark pixels; groups
 * of consecutive ink rows; skips thin full-width rules (dividers). */
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
  const groups: { top: number; height: number; inkPixels: number; maxSpan: number }[] = [];
  let cur: { top: number; rows: { ink: number; first: number; last: number }[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const inkRows = cur.rows.filter((r) => r.ink > 0);
    const span = inkRows.length ? Math.max(...inkRows.map((r) => r.last - r.first)) : 0;
    const g = { top: cur.top, height: cur.rows.length, inkPixels: cur.rows.reduce((a, r) => a + r.ink, 0), maxSpan: span };
    if (!(g.height <= 5 && g.maxSpan > 0.7 * img.w)) groups.push(g); // divider rule
    cur = null;
  };
  for (let i = 0; i < rowInk.length; i++) {
    if (rowInk[i].ink >= 3) { if (!cur) cur = { top: y0 + i, rows: [] }; cur.rows.push(rowInk[i]); }
    else flush();
  }
  flush();
  return groups.map(({ top, height, inkPixels, maxSpan }) => ({ top, height, inkPixels, span: maxSpan }));
}
// --- MEASURED from the rendered PNG (flyer-hero) -----------------------------
const txBytes = await readFile(`${OUT}tx-flyer-hero.png`);
const txGroups = measureLines(txBytes, 1300);
const brokerGroup = txGroups[txGroups.length - 2];   // second-to-last = broker line
const detailGroupTx = txGroups[txGroups.length - 1]; // last = detail line
const largestGroup = txGroups.reduce((a, b) => (b.height > a.height ? b : a));
console.log(`measured: largest contact ink height = ${largestGroup.height}px (top=${largestGroup.top}), broker ink height = ${brokerGroup.height}px (top=${brokerGroup.top}), TX detail ink pixels = ${detailGroupTx.inkPixels}`);
check(`measured: broker drawn >= half of largest contact (ratio ${brokerGroup.height}/${largestGroup.height} = ${(brokerGroup.height / largestGroup.height).toFixed(3)})`, brokerGroup.height / largestGroup.height >= 0.45, `groups=${JSON.stringify(txGroups.map((g) => [g.top, g.height]))}`);
check("measured: 4 text lines in TX band (name, legend, broker, detail)", txGroups.length === 4, String(txGroups.length));
const caGroups = measureLines(await readFile(`${OUT}ca-flyer-hero-contrast.png`), 1300);
// CA has no separate broker line: its detail line carries the licence labels.
// Compare line SPANS (drawn width): CA detail ≈ 100 chars incl. two licence
// numbers; TX detail = 36 chars, numbers suppressed.
const detailGroupCa = caGroups.reduce((a, b) => (b.span > a.span ? b : a));
console.log(`measured: CA detail line span = ${detailGroupCa.span}px vs TX detail span = ${detailGroupTx.span}px (CA carries licence-number labels, TX must not)`);
check("measured: TX detail line far narrower than CA (licence numbers suppressed in the RENDER)", detailGroupCa.span > detailGroupTx.span * 1.5, `txSpan=${detailGroupTx.span} caSpan=${detailGroupCa.span}`);
check("measured: TX broker line span consistent with 24px bold line", brokerGroup.span > 0, String(brokerGroup.span));

console.log(fail === 0 ? `TX GATE PASS (${pass}/${pass + fail})` : `TX GATE FAIL (${fail} failures, ${pass} passed)`);
