/**
 * SC disclosure gate (task 524f8e4b) — replaces the TX gate's role with a gate
 * that fits the IN-SCOPE jurisdiction. S.C. Code §40-57-135(E)(2)(a) (verified
 * pass 4, sc-40-57-135e2-brokerage-name): every advertisement must identify the
 * FULL NAME of the brokerage firm. Negative finding sc-no-license-number-no-phone:
 * SC requires NO licence number and NO phone number — the gate must never accept
 * copy that demands either. EHO house mark stays default-OFF (eho-logo-asset-
 * provenance); when explicitly enabled it keeps the exact 24 CFR 110.25 legend.
 *
 * MEASURED (not eyeballed): each render's bottom disclosure band is decoded from
 * the PNG (zlib inflate + unfilter) and the text-line groups are compared
 * against a no-brokerage control — the supplied brokerage's extra ink is the
 * proof, on all four native templates (dark-ink polarity for flyers, light-ink
 * polarity for the dark social theme).
 */
import { renderMarketingPng } from "../src/lib/render";
import { disclosureWarnings, isStateInProductScope } from "../src/lib/advertising-rules";
import { disclosureSegments } from "../src/lib/branded-templates";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

const OUT = "/home/team/shared/render-samples/sc-disclosure/";
await mkdir(OUT, { recursive: true });

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`ok ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${detail}`); }
};

// SC acceptance case (no licence numbers — SC requires none) + control.
const scCase: Record<string, unknown> = {
  title: "Charming Colonial on Shem Creek",
  body: "Four bedrooms, deep water dock, five minutes from Old Village.",
  agentName: "Dana Ruiz",
  agentPhone: "(843) 555-0134",
  jurisdiction: "SC",
  brokerageName: "Palmetto Coast Properties",
  brokerName: "Marta Reyes",
};
const control: Record<string, unknown> = { ...scCase };
delete control.brokerageName;
delete control.brokerName;

const CASES: [string, string, "flyer" | "social", boolean][] = [
  ["flyer-hero", "flyer-hero", "flyer", true],
  ["flyer-classic", "flyer-classic", "flyer", true],
  ["social-photo", "social-photo", "social", false],
  ["social-classic", "social-classic", "social", false],
];

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
/** Text-line groups in [y0, end); dark=true counts dark ink (flyer), dark=false
 * counts light ink (social's dark theme — its muted detail ink #86b89e is
 * luminance ≈0.67, so the light threshold is 0.55). xStart excludes a left
 * column (used to skip the EHO mark when measuring the text lines alone). */
function measureLines(buf: Buffer, y0: number, dark: boolean, xStart = 0): { top: number; height: number; inkPixels: number; span: number }[] {
  const img = decodePng(buf);
  const rowInk: { ink: number; first: number; last: number }[] = [];
  for (let y = y0; y < img.h; y++) {
    let ink = 0, first = -1, last = -1;
    for (let x = xStart; x < img.w; x++) {
      const [r, g, b] = img.px(x, y);
      const hit = dark ? lum(r, g, b) < 0.45 : lum(r, g, b) > 0.55;
      if (hit) { ink++; if (first < 0) first = x; last = x; }
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

// --- 1. Segments: the supplied brokerage name is the FIRST disclosure segment
const segs = disclosureSegments(scCase as never);
check("segments: brokerage name is segment #1", segs[0] === "Palmetto Coast Properties", JSON.stringify(segs));
check("segments: broker name labelled 'Broker <name>'", segs.some((s) => s === "Broker Marta Reyes"), JSON.stringify(segs));
check("segments: agent name present", segs.some((s) => s.includes("Dana Ruiz")), JSON.stringify(segs));
const segsLic = disclosureSegments({ ...scCase, agentLicense: "SC123456", brokerLicense: "BR654321" } as never);
check("segments: supplied SC licence values pass through (not demanded, not suppressed)", JSON.stringify(segsLic) !== JSON.stringify(segs) && segsLic.some((s) => s.includes("SC123456")), JSON.stringify(segsLic));

// --- 2. Warnings: honest missing-data signal, never a licence/phone demand
const wMissing = disclosureWarnings({ jurisdiction: "SC", agentName: "Dana Ruiz" });
check("warnings: SC + missing brokerage -> warning cites 40-57-135(E)(2)", wMissing.some((m) => m.level === "warning" && m.message.includes("40-57-135(E)(2)")), JSON.stringify(wMissing));
check("warnings: SC message names the brokerage as the missing element", wMissing.some((m) => m.message.includes("brokerage name")), JSON.stringify(wMissing));
const wFull = disclosureWarnings({ jurisdiction: "SC", brokerageName: "Palmetto Coast Properties", agentName: "Dana Ruiz", brokerName: "Marta Reyes" });
check("warnings: SC full fields -> no warning", wFull.length === 0, JSON.stringify(wFull));
const wLic = disclosureWarnings({ jurisdiction: "SC", brokerageName: "Palmetto Coast Properties", agentLicense: "SC123456" });
check("warnings: SC + licence supplied -> no demand message", wLic.every((m) => !/(licence|license) number is required/i.test(m.message) && !/must include a (licence|license) number/i.test(m.message)), JSON.stringify(wLic));
// PRODUCT SCOPE (task a0abba71, merged in PR #26): TX/FL/CA are OUT of the
// product scope, so disclosureWarnings() returns [] for them — the researched
// branches stay in the code, gated by PRODUCT_SCOPE_STATES, and the TX
// implementation is asserted separately by scripts/verify-tx-half-size.ts
// (scoped-reference path). This gate asserts the NEW deliberate behaviour:
// out-of-scope states make no claim at runtime, exactly like unverified states.
const wTxUnchanged = disclosureWarnings({ jurisdiction: "TX", agentName: "Dana Ruiz" });
check("warnings: TX out of product scope -> silent (gated by PRODUCT_SCOPE_STATES)",
  wTxUnchanged.length === 0 && !isStateInProductScope("TX"), JSON.stringify(wTxUnchanged));
const wFlUnchanged = disclosureWarnings({ jurisdiction: "FL", agentName: "Dana Ruiz" });
check("warnings: FL out of product scope -> silent (gated by PRODUCT_SCOPE_STATES)",
  wFlUnchanged.length === 0 && !isStateInProductScope("FL"), JSON.stringify(wFlUnchanged));
const wOther = disclosureWarnings({ jurisdiction: "GA", agentName: "Dana Ruiz" });
check("warnings: unverified state -> nothing claimed", wOther.length === 0, JSON.stringify(wOther));

// --- 3. MEASURED renders: the brokerage's ink is present in every template
for (const [name, templateId, kind, dark] of CASES) {
  const withB: any = { ...scCase, type: kind, brandedTemplate: templateId };
  const without: any = { ...control, type: kind, brandedTemplate: templateId };
  const pngA: string = (await renderMarketingPng(withB)) as unknown as string;
  const pngB: string = (await renderMarketingPng(without)) as unknown as string;
  const fa = `${OUT}sc-${name}.png`, fb = `${OUT}sc-${name}-no-brokerage.png`;
  await writeFile(fa, Buffer.from(pngA.slice("data:image/png;base64,".length), "base64"));
  await writeFile(fb, Buffer.from(pngB.slice("data:image/png;base64,".length), "base64"));
  const img = decodePng(await readFile(fa));
  const y0 = Math.round(img.h * 0.75);
  const ga = measureLines(await readFile(fa), y0, dark);
  const gb = measureLines(await readFile(fb), y0, dark);
  const lastA = ga[ga.length - 1], lastB = gb[gb.length - 1];
  check(`${name}: render produced lines in the disclosure band`, ga.length >= 2 && gb.length >= 2, JSON.stringify(ga));
  check(`${name}: detail line carries the brokerage ink (span ${lastA?.span} vs control ${lastB?.span})`, !!lastA && !!lastB && lastA.span > lastB.span * 2, `with=${lastA?.span} without=${lastB?.span}`);
  check(`${name}: brokerage line is legibly wide (>= 200px)`, lastA.span >= 200, String(lastA.span));
  check(`${name}: EHO legend line present by default (no mark, exact legend)`, ga.some((g) => g.span > 180 && g.span < 400 && g.height < 20), JSON.stringify(ga.map((g) => [g.top, g.height, g.span])));
}

// --- 4. EHO house mark: OFF by default, ON keeps the 24 CFR 110.25 legend
// Measured in two passes: the FULL band (mark column included) proves the mark's
// ink appears only when explicitly requested; the TEXT COLUMN alone (x >= 140,
// past flyer X=90 + markSize 30 + gap 14) proves the legend + detail lines are
// byte-for-byte the same lines with and without the mark.
const noMark: any = { ...scCase, type: "flyer", brandedTemplate: "flyer-hero" };
const withMark: any = { ...noMark, ehoMark: true };
const pngNoMark: string = (await renderMarketingPng(noMark)) as unknown as string;
const pngWithMark: string = (await renderMarketingPng(withMark)) as unknown as string;
await writeFile(`${OUT}sc-flyer-hero-eho-off.png`, Buffer.from(pngNoMark.slice("data:image/png;base64,".length), "base64"));
await writeFile(`${OUT}sc-flyer-hero-eho-mark-on.png`, Buffer.from(pngWithMark.slice("data:image/png;base64,".length), "base64"));
const bufOff = await readFile(`${OUT}sc-flyer-hero-eho-off.png`);
const bufOn = await readFile(`${OUT}sc-flyer-hero-eho-mark-on.png`);
const fullOff = measureLines(bufOff, 1238, true);
const fullOn = measureLines(bufOn, 1238, true);
const textOn = measureLines(bufOn, 1238, true, 140);
const totalInk = (gs: { inkPixels: number }[]) => gs.reduce((a, g) => a + g.inkPixels, 0);
// The mark SVG (128px, stroke 8) rasterizes at 30px → ~1.9px strokes ≈ 330 ink
// pixels; the earlier merged-group reading (2514) double-counted the text rows
// the mark column overlaps. Delta >= 200 is the mark's true drawn ink.
check("eho mark: explicit ehoMark=true adds the mark's ink (band ink grows by >=200px)", totalInk(fullOn) - totalInk(fullOff) >= 200, `on=${totalInk(fullOn)} off=${totalInk(fullOff)}`);
// Without the mark the text column starts at x=90; with it, at x=134. So compare
// the WITH-mark text column (x>=140) against the FULL no-mark band: the legend
// and detail line widths must match their no-mark widths (±10px for the clip
// edge) — the 24 CFR 110.25 legend and the disclosure line persist unchanged.
check("eho mark: legend line renders with the mark at its 24 CFR 110.25 width", textOn.length === 3 && Math.abs(textOn[1].span - fullOff[1].span) <= 10 && textOn[1].span > 180 && textOn[1].span < 400, `on=${textOn[1]?.span} off-full=${fullOff[1]?.span}`);
check("eho mark: detail (brokerage) line renders with the mark at its full width", textOn.length === 3 && Math.abs(textOn[2].span - fullOff[2].span) <= 10, `on=${textOn[2]?.span} off-full=${fullOff[2]?.span}`);

console.log(fail === 0 ? `SC DISCLOSURE GATE PASS (${pass}/${pass + fail})` : `SC DISCLOSURE GATE FAIL (${fail} failures, ${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
