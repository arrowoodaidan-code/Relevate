/**
 * Design Engineer B — task 226be8d1 guard: native template override wiring.
 *
 * Proves that the client's BrandedTemplateSelector choice (an explicit
 * `brandedTemplate` field) is (1) accepted by validateRenderRequest and
 * (2) HONORED by the renderer — i.e. the explicit layout beats the
 * photo-presence auto-dispatch — and that each layout renders at its correct
 * native canvas dimensions.
 *
 * Usage: bun scripts/verify-branded-template-override.ts
 */
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { renderMarketingPng, validateRenderRequest } from "../src/lib/render.ts";

const PHOTO = "/home/team/shared/native-templates/sample-property-photo.jpg";
const BODY = "Sun-filled 4-bed, 3-bath craftsman on a quiet cul-de-sac. " +
  "Open living space with a chef's kitchen, quartz island, and a private fenced yard.";
const BASE = {
  title: "2847 Willow Creek Lane",
  agentName: "Aidan Arrowood",
  brandStyle: "forest modern",
  price: "$749,000", beds: "4", baths: "3", sqft: "2,485", agentPhone: "(843) 250-4438",
};

function pngDims(png: Buffer): { w: number; h: number } {
  // PNGSIG(8) + IHDR len/type(8) → width/height are bytes 16..23 of the file.
  return {
    w: png.readUInt32BE(16),
    h: png.readUInt32BE(20),
  };
}

/** Minimal 8-bit PNG → RGBA decoder (unfilter + inflate; no external deps). */
function decodePNG(buf: Buffer): { w: number; h: number; rgba: Buffer } {
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
  return { w, h, rgba: out };
}

function lum(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Count "dark ink" pixels (name/body/bullet text = C.ink #173024 on light bg). */
function darkInk(rgba: Buffer, w: number, x: number, y: number, bw: number, bh: number): number {
  let n = 0;
  for (let yy = y; yy < y + bh; yy++) {
    for (let xx = x; xx < x + bw; xx++) {
      const i = (yy * w + xx) * 4;
      if (rgba[i + 3] > 128 && lum(rgba[i], rgba[i + 1], rgba[i + 2]) < 90) n++;
    }
  }
  return n;
}

/** Count "light ink" pixels (tag green #7fc9a4 / mint text on dark bg). */
function lightInk(rgba: Buffer, w: number, x: number, y: number, bw: number, bh: number): number {
  let n = 0;
  for (let yy = y; yy < y + bh; yy++) {
    for (let xx = x; xx < x + bw; xx++) {
      const i = (yy * w + xx) * 4;
      if (rgba[i + 3] > 128 && lum(rgba[i], rgba[i + 1], rgba[i + 2]) > 160) n++;
    }
  }
  return n;
}

async function render(raw: Record<string, unknown>): Promise<Buffer> {
  const check = validateRenderRequest(raw as never);
  if (!check.ok) throw new Error(`validateRenderRequest rejected: ${check.error}`);
  if (raw.brandedTemplate !== undefined && (check.data as any).brandedTemplate !== raw.brandedTemplate) {
    throw new Error(`brandedTemplate was not passed through validateRenderRequest (expected ${raw.brandedTemplate}, got ${(check.data as any).brandedTemplate})`);
  }
  const dataUrl = await renderMarketingPng(check.data);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

let pass = 0, fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

async function main() {
  const photoDataUrl = `data:image/jpeg;base64,${(await readFile(PHOTO)).toString("base64")}`;

  console.log("== 1. validateRenderRequest accepts + passes through brandedTemplate ==");
  ok(validateRenderRequest({ ...BASE, type: "flyer", body: BODY, brandedTemplate: "flyer-hero" }).ok, "flyer-hero accepted");
  ok(validateRenderRequest({ ...BASE, type: "social", body: BODY, brandedTemplate: "social-photo" }).ok, "social-photo accepted");
  const thru = validateRenderRequest({ ...BASE, type: "flyer", body: BODY, brandedTemplate: "flyer-classic" } as never);
  ok(thru.ok && (thru as any).data.brandedTemplate === "flyer-classic", "brandedTemplate passed through to render input");

  console.log("== 2. explicit override BEATS photo-presence auto-dispatch ==");
  // Auto flyer + photo → flyer-hero; auto flyer no-photo → flyer-classic.
  const autoFlyerPhoto = await render({ ...BASE, type: "flyer", body: BODY, imageDataUrl: photoDataUrl });
  const overrideFlyerClassicPhoto = await render({ ...BASE, type: "flyer", body: BODY, imageDataUrl: photoDataUrl, brandedTemplate: "flyer-classic" });
  ok(!overrideFlyerClassicPhoto.equals(autoFlyerPhoto), "flyer override=classic (with photo) differs from auto flyer (hero-with-photo) → override respected");

  const autoFlyerNoPhoto = await render({ ...BASE, type: "flyer", body: BODY });
  const overrideFlyerHeroNoPhoto = await render({ ...BASE, type: "flyer", body: BODY, brandedTemplate: "flyer-hero" });
  // A photo layout forced with no photo must NOT crash; it gracefully degrades
  // to the classic (no-photo) variant, producing the same render as auto-no-photo.
  ok(overrideFlyerHeroNoPhoto.equals(autoFlyerNoPhoto), "flyer override=hero (no photo) degrades gracefully to classic (no crash, == auto no-photo)");

  const autoSocialPhoto = await render({ ...BASE, type: "social", body: BODY, imageDataUrl: photoDataUrl });
  const overrideSocialClassicPhoto = await render({ ...BASE, type: "social", body: BODY, imageDataUrl: photoDataUrl, brandedTemplate: "social-classic" });
  ok(!overrideSocialClassicPhoto.equals(autoSocialPhoto), "social override=classic (with photo) differs from auto social (photo) → override respected");

  const autoSocialNoPhoto = await render({ ...BASE, type: "social", body: BODY });
  const overrideSocialPhotoNoPhoto = await render({ ...BASE, type: "social", body: BODY, brandedTemplate: "social-photo" });
  ok(overrideSocialPhotoNoPhoto.equals(autoSocialNoPhoto), "social override=photo (no photo) degrades gracefully to classic (no crash, == auto no-photo)");

  console.log("== 3. explicit overrides render at correct native canvas ==");
  ok(pngDims(await render({ ...BASE, type: "flyer", body: BODY, brandedTemplate: "flyer-hero" })).h === 1650, "flyer-hero → 1275×1650");
  ok(pngDims(await render({ ...BASE, type: "flyer", body: BODY, brandedTemplate: "flyer-classic" })).h === 1650, "flyer-classic → 1275×1650");
  ok(pngDims(await render({ ...BASE, type: "social", body: BODY, brandedTemplate: "social-photo" })).h === 1080, "social-photo → 1080×1080");
  ok(pngDims(await render({ ...BASE, type: "social", body: BODY, brandedTemplate: "social-classic" })).h === 1080, "social-classic → 1080×1080");

  // ---------------------------------------------------------------------------
  // 4. Deterministic no-intersection regression (owner defects, Aug 23) —
  //     layout geometry must not overlap / silently clip. Pixel-based, raw PNG
  //     decode (no vision dependency), so it runs in CI/bare-node.
  // ---------------------------------------------------------------------------
  const FLYER_W = 1275;
  const SIX_BULLETS =
    "• Sun-filled 4-bed, 3-bath craftsman on a quiet cul-de-sac.\n" +
    "• Open living space with a chef's kitchen and quartz island.\n" +
    "• Primary suite with a spa bath and generous closet space.\n" +
    "• Fenced backyard with a covered porch for morning coffee.\n" +
    "• Two-car garage with EV outlet and a smart thermostat.\n" +
    "• Walkable to downtown shops, dining, and the greenway.\n" +
    "This home blends character, quality, and convenience.";
  const AGENT_LONG = "Alexandrina von Hohenzollern-Sigmaringen-Rothschild-Beaumont";

  // 4a. flyer-classic, 6 bullets — the 5th/6th row must NOT be covered by the
  //     opaque body card (bug: gridH capped at 2 rows while flexWrap laid out 3).
  //     gridTop=800, rowH = 2*26*1.35 + 22 = 92.2, gap 20 → rows:
  //       row1 y[800,892], row2 y[892,984], row3 y[984,1076]; BODY_TOP ≈ 1096.
  {
    const png = await render({ ...BASE, type: "flyer", body: SIX_BULLETS, brandedTemplate: "flyer-classic" });
    const { w, rgba } = decodePNG(png);
    const r3 = darkInk(rgba, w, 90, 984, 1095, 92);      // row 3 band
    const r2 = darkInk(rgba, w, 90, 892, 1095, 92);      // row 2 band (sanity)
    const gap = darkInk(rgba, w, 90, 1077, 1095, 18);    // grid→card gap (must be clear)
    ok(r2 > 80, `4a flyer-classic 6-bullets: row2 has bullet ink (${r2}px)`);
    ok(r3 > 80, `4a flyer-classic 6-bullets: row3 (5th/6th) visible, not covered by card (${r3}px)`);
    ok(gap < 30, `4a flyer-classic 6-bullets: grid→card gap clear of text (${gap}px)`);
  }

  // 4b. long agent name — must fit-box (≤2 lines) and NOT bleed into the
  //     rightmost mark column or the canvas edge.
  {
    const png = await render({ ...BASE, agentName: AGENT_LONG, type: "flyer", body: BODY, brandedTemplate: "flyer-classic" });
    const { w, rgba } = decodePNG(png);
    // Agent band at FOOTER+16 = 1478 (w=1095, X=90). Mark sits right:0 (~x1160+).
    const markZone = darkInk(rgba, w, 1130, 1478, FLYER_W - 1130, 84);
    const nameZone = darkInk(rgba, w, 90, 1478, 700, 84);
    ok(nameZone > 60, `4b flyer-classic long name: name ink rendered in band (${nameZone}px)`);
    ok(markZone < 25, `4b flyer-classic long name: no name-ink bleed into right mark/canvas zone (${markZone}px)`);
  }

  // 4c. social tags — 5 long tags must WRAP to 2 lines (never silently clipped
  //     by nowrap+overflow hidden). Verified on social-classic (solid dark bg);
  //     social-photo shares the exact same tagFit/wrap/TAG_TOP code path.
  //     Control: tags sit on their own trailing line, so stripTrailingHashtagBlock
  //     renders the SAME body with/without the tag line — the wrap band's extra
  //     light-ink vs the identical no-tag body is exactly the wrapped tag text.
  {
    const PROSE = "Stunning lakeside retreat with panoramic water views.";
    const PROSE_TAGS = PROSE + "\n" +
      "#WaterfrontLivingWithPanoramicViews #ChefsKitchenWithQuartzIsland " +
      "#MoveInReadyCornerLot #OpenHouseThisSaturday #PrivateFencedBackyard";
    const png = await render({ ...BASE, type: "social", body: PROSE_TAGS, brandedTemplate: "social-classic" });
    const plain = await render({ ...BASE, type: "social", body: PROSE, brandedTemplate: "social-classic" });
    const { w, rgba } = decodePNG(png);
    const { rgba: plainRgba } = decodePNG(plain);
    // TAG_TOP=896; two long-tag lines span ~y[898,950] (divider pushed to ~976
    // when they wrap, so it stays clear below). Band excludes the body (≤889)
    // and the no-tag agent band (≥952).
    const tagBand = { x: 110, y: 898, bw: 860, bh: 52 };
    const withTags = lightInk(rgba, w, tagBand.x, tagBand.y, tagBand.bw, tagBand.bh);
    const noTags = lightInk(plainRgba, w, tagBand.x, tagBand.y, tagBand.bw, tagBand.bh);
    ok(withTags > noTags + 300, `4c social-classic 5 long-tags: wrapped tag lines add ink vs identical no-tag body (${withTags} vs ${noTags}, Δ=${withTags - noTags})`);
  }

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error("GUARD FAILED:", e); process.exit(1); });
