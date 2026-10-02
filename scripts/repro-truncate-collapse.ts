/**
 * Repro + measurement for task c2a8c6ab (P1): the design renderer's truncation
 * cap paints ~1 character per 1.6 lines instead of the text that fits.
 *
 * THE BUG (origin/main a1fa255, src/lib/render-design.ts:176):
 *   const cap = Math.max(1, Math.floor((fitted.fontSize * fitted.lines * 1.6) / (fitted.fontSize || 1)));
 * fitted.fontSize cancels out → cap = floor(lines * 1.6): 1 line keeps 1
 * character, 2 lines keep 3, 5 lines keep 8 — then "…". An overflowing caption
 * is painted as a gibberish-length fragment instead of as much as fits.
 *
 * WHAT THIS SCRIPT MEASURES (numbers, not impressions):
 *  1. Per fixture layer: the fit verdict (fontSize/lines/truncated), the
 *     PRE-FIX cap and string it would paint (quoted verbatim from the old
 *     formula), and the string designExportText paints on THIS tree.
 *  2. The REAL render path: renderDesignDoc — the exact function
 *     /api/render-design calls — renders the doc, and the painted band of each
 *     layer is decoded from the PNG (zlib inflate + unfilter, the SC-gate
 *     technique) measuring ink-line groups, ink pixels and ink span per layer.
 *
 * Run: bun scripts/repro-truncate-collapse.ts [before|after]
 * PNGs land in /home/team/shared/render-samples/truncate-collapse/<suffix>-*.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join } from "node:path";
import { makeTextLayer, type DesignDoc } from "../src/lib/design";
import { designExportText, fitTextLayer, renderDesignDoc } from "../src/lib/render-design";

const SUFFIX = process.argv[2] ?? "tree";
const OUT_DIR = "/home/team/shared/render-samples/truncate-collapse";
mkdirSync(OUT_DIR, { recursive: true });

// The pre-fix cap, quoted verbatim from render-design.ts:176 @ a1fa255 — the
// formula the fix replaces, so this script states both sides on any tree.
function preFixCap(fitted: { fontSize: number; lines: number }): number {
  return Math.max(1, Math.floor((fitted.fontSize * fitted.lines * 1.6) / (fitted.fontSize || 1)));
}

const CAPTION =
  "Charming three bedroom craftsman with a wraparound porch, rebuilt kitchen, " +
  "sunny breakfast nook, and a fenced backyard garden that glows on summer " +
  "evenings. Two-car garage, new roof, walk to the Saturday market and the " +
  "blue-ribbon elementary school. Open house Saturday 1 to 4.";

const doc: DesignDoc = {
  width: 1275,
  height: 1650,
  background: "#ffffff",
  layers: [
    // 1. Multi-line truncated caption: roomy width, shallow height — several
    //    wrapped lines fit, and the fit engine keeps exactly those.
    makeTextLayer({
      id: "caption",
      text: CAPTION,
      rect: { x: 90, y: 120, w: 420, h: 150 },
      fontSize: 44,
      lineHeight: 1.3,
    }),
    // 2. One-line tight box (the WYSIWYG gate's own fixture shape): minSize
    //    wraps the text to several lines, only ONE fits the height.
    makeTextLayer({
      id: "oneline",
      text: "Charming three bedroom craftsman home in the historic district",
      rect: { x: 90, y: 480, w: 110, h: 28 },
      fontSize: 48,
      lineHeight: 1,
    }),
    // 3. One-line WIDE box: a single wrapped line fits the height but not the
    //    width, so the engine keeps one long line — the old cap paints 1 char.
    makeTextLayer({
      id: "onelineWide",
      text: "Charming three bedroom craftsman home in the historic district",
      rect: { x: 90, y: 760, w: 600, h: 26 },
      fontSize: 40,
      lineHeight: 1,
    }),
  ],
};

// --- 1. String-level truth ---------------------------------------------------
for (const layer of doc.layers) {
  if (layer.type !== "text") continue;
  const t = layer as Extract<(typeof doc.layers)[number], { type: "text" }>;
  const fitted = fitTextLayer(t);
  const cap = preFixCap(fitted);
  const old = t.text.length > cap ? `${t.text.slice(0, cap)}…` : `${t.text}…`;
  const now = designExportText(t, fitted);
  const same = old === now ? "  (== pre-fix)" : "  (!= pre-fix — behavior changed)";
  console.log(`\n[${t.id}] fitted=${JSON.stringify(fitted)}`);
  console.log(`  pre-fix cap=${cap} chars -> painted ${old.length} chars: ${JSON.stringify(old)}`);
  console.log(`  THIS TREE paints ${now.length} chars: ${JSON.stringify(now)}${same}`);
  const buggy = /\n/.test(now) === false && now.length <= cap + 1;
  if (fitted.truncated && buggy && cap < 10) {
    console.log(`  ** COLLAPSE PRESENT: ${fitted.lines} fitted line(s) but only ${now.length} painted chars **`);
  }
}

// --- 2. PNG-level truth (the real render path) -------------------------------
const { dataUrl, width, height } = await renderDesignDoc(doc);
const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
writeFileSync(join(OUT_DIR, `${SUFFIX}-caption-doc.png`), png);
console.log(`\nrendered ${width}x${height} PNG -> ${OUT_DIR}/${SUFFIX}-caption-doc.png`);

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
  return { w, h, px: (x, y) => [rows[y]![x * 4]!, rows[y]![x * 4 + 1]!, rows[y]![x * 4 + 2]!] };
}
const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const img = decodePng(png);
for (const layer of doc.layers) {
  if (layer.type !== "text") continue;
  const t = layer as Extract<(typeof doc.layers)[number], { type: "text" }>;
  // Band = the layer rect widened 10px each side and 60px below (flex-start
  // paint can re-wrap downward in the browser; 60px ≈ two minSize lines).
  const x0 = Math.max(0, t.rect.x - 10), x1 = Math.min(img.w - 1, t.rect.x + t.rect.w + 10);
  const y0 = Math.max(0, t.rect.y - 5), y1 = Math.min(img.h - 1, t.rect.y + t.rect.h + 60);
  let groups = 0, ink = 0, span = 0, inGroup = false, groupFirst = -1, groupLast = -1;
  for (let y = y0; y <= y1; y++) {
    let rowFirst = -1, rowLast = -1, rowInk = 0;
    for (let x = x0; x <= x1; x++) {
      const [r, g, b] = img.px(x, y);
      if (lum(r, g, b) < 0.45) { rowInk++; if (rowFirst < 0) rowFirst = x; rowLast = x; }
    }
    ink += rowInk;
    if (rowInk >= 3) {
      if (!inGroup) { inGroup = true; groupFirst = rowFirst; groupLast = rowLast; groups++; }
      if (rowFirst >= 0) { if (groupFirst < 0) groupFirst = rowFirst; groupLast = Math.max(groupLast, rowLast); }
    } else if (inGroup) { inGroup = false; span = Math.max(span, groupLast - groupFirst); }
  }
  if (inGroup) span = Math.max(span, groupLast - groupFirst);
  console.log(
    `[${t.id}] band x=${x0}..${x1} y=${y0}..${y1}: ink-line groups=${groups} inkPixels=${ink} widestSpan=${span}px`,
  );
}
