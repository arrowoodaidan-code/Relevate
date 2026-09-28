/**
 * Measure the bottom disclosure band of a rendered flyer PNG (task 524f8e4b
 * reproduction support): prints the text-line groups in [75% height, end).
 * Usage: bun scripts/measure-footer.ts <png-path> [y0]
 */
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

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
function measureLines(buf: Buffer, y0: number, dark: boolean): { top: number; height: number; inkPixels: number; span: number }[] {
  const img = decodePng(buf);
  const rowInk: { ink: number; first: number; last: number }[] = [];
  for (let y = y0; y < img.h; y++) {
    let ink = 0, first = -1, last = -1;
    for (let x = 0; x < img.w; x++) {
      const [r, g, b] = img.px(x, y);
      const hit = dark ? lum(r, g, b) < 0.45 : lum(r, g, b) > 0.8;
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

const file = process.argv[2];
const dark = process.argv[3] !== "light";
const buf = await readFile(file);
const img = decodePng(buf);
const y0 = process.argv[4] ? Number(process.argv[4]) : Math.round(img.h * 0.75);
console.log(`${file} (${img.w}x${img.h}, band from y=${y0}, polarity=${dark ? "dark-ink" : "light-ink"}):`);
console.log(JSON.stringify(measureLines(buf, y0, dark).map((g) => [g.top, g.height, g.span])));
