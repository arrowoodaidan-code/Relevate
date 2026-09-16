/**
 * Generate small selector thumbnails from full-res native template PNGs,
 * using only Node's zlib (no sharp/ImageMagick/PIL). Decodes PNG, box-filters
 * down to a target width, re-encodes PNG with CRC32 + zlib deflate.
 * Usage: bun scripts/make-template-thumbs.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { join } from "node:path";

const SRC = "/home/team/shared/native-templates";
const OUT = "/home/team/shared/site/public/templates";
const TARGET_W = 140; // display width in the selector; aspect preserved

const crc = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf: Buffer): number => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ t[(c ^ buf[i]) & 0xff];
    return (c ^ -1) >>> 0;
  };
})();

function decodePNG(buf: Buffer) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat: Buffer[] = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} unsupported`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`color type ${colorType} unsupported`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * channels);
  const bpp = channels;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, channels, rgba: out };
}

function resizeBox(rgba: Buffer, srcW: number, srcH: number, ch: number, tw: number) {
  const th = Math.max(1, Math.round((srcH * tw) / srcW));
  const out = Buffer.alloc(tw * th * ch);
  for (let dy = 0; dy < th; dy++) {
    const sy0 = Math.floor((dy * srcH) / th);
    const sy1 = Math.max(sy0, Math.floor(((dy + 1) * srcH) / th) - 1);
    for (let dx = 0; dx < tw; dx++) {
      const sx0 = Math.floor((dx * srcW) / tw);
      const sx1 = Math.max(sx0, Math.floor(((dx + 1) * srcW) / tw) - 1);
      for (let c = 0; c < ch; c++) {
        let sum = 0, n = 0;
        for (let sy = sy0; sy <= sy1; sy++)
          for (let sx = sx0; sx <= sx1; sx++) {
            sum += rgba[(sy * srcW + sx) * ch + c]; n++;
          }
        out[(dy * tw + dx) * ch + c] = Math.round(sum / n);
      }
    }
  }
  return { w: tw, h: th, data: out };
}

function chunk(type: string, data: Buffer) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function encodePNG(w: number, h: number, ch: number, rgba: Buffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * ch;
  const rawLines = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    rawLines[y * (stride + 1)] = 0; // filter none
    rgba.copy(rawLines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(rawLines, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const FILES = {
  "flyer-hero": "flyer-hero.png",
  "flyer-classic": "flyer-classic.png",
  "social-photo": "social-photo.png",
  "social-classic": "social-classic.png",
};

mkdirSync(OUT, { recursive: true });
for (const [id, file] of Object.entries(FILES)) {
  const { w, h, channels, rgba } = decodePNG(readFileSync(join(SRC, file)));
  const { w: tw, h: th, data } = resizeBox(rgba, w, h, channels, TARGET_W);
  const size = encodePNG(tw, th, channels, data);
  const outPath = join(OUT, `${id}.png`);
  writeFileSync(outPath, size);
  console.log(`✓ ${id} ${w}x${h} -> ${tw}x${th} (${Math.round(size.length / 1024)} KB)`);
}
console.log("Done.");
