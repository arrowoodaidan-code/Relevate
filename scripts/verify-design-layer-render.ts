/**
 * Relevate — deterministic verify for the from-scratch DesignDoc renderer
 * (business plan rev 35, task eb4522e6).
 * =========================================================================
 * Renders known DesignDocs through renderDesignDoc (Satori + Resvg, bundled
 * Relevate fonts) to BOTH flyer (1275×1650) and social (1080×1080) output and
 * probes the resulting pixels:
 *
 *  - exact output dimensions for both surfaces
 *  - text ink present at its expected region (dark glyph pixels inside its box)
 *  - a solid-color image composites its color inside its box (object-fit cover)
 *  - shape fill/stroke/ellipse render
 *  - Z-ORDER: a later layer occludes an earlier one at their overlap
 *  - ROTATION: a rotated layer moves ink away from the axis-aligned box corner
 *    (44° about center) vs the same layer unrotated.
 *
 * Self-contained (no external fixtures — shapes + an inline solid SVG image),
 * deterministic, follows the existing probe/verify style of the repo.
 *
 * Run: bun scripts/verify-design-layer-render.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { renderDesignDoc } from "../src/lib/render-design";
import type { DesignDoc } from "../src/lib/design";

const OUT = "/tmp/design-layer-render";
await mkdir(OUT, { recursive: true });

const FLY_W = 1275, FLY_H = 1650;
const SOC_W = 1080, SOC_H = 1080;

function solidPng(width: number, height: number, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`;
  return `data:image/png;base64,${new Resvg(svg).render().asPng().toString("base64")}`;
}
/** Decode a rendered PNG data URL back to RGBA bytes at its native size. */
function decodePng(dataUrl: string, w: number, h: number): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${dataUrl}" x="0" y="0" width="${w}" height="${h}"/></svg>`;
  return new Resvg(svg).render().pixels as Uint8Array;
}
function px(pixels: Uint8Array, w: number, x: number, y: number): [number, number, number] {
  const i = (Math.round(y) * w + Math.round(x)) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
}
function closeTo(rgb: [number, number, number], hex: string, tol = 40): boolean {
  const v = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  return Math.abs(rgb[0] - r) <= tol && Math.abs(rgb[1] - g) <= tol && Math.abs(rgb[2] - b) <= tol;
}
function luminance(rgb: [number, number, number]) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`); }
}

const RED = "#cc3333";

// ---------------------------------------------------------------------------
// 1. Flyer + social surface rendering with text + image + shape, z-order.
// ---------------------------------------------------------------------------
const flyerDoc: DesignDoc = {
  width: FLY_W, height: FLY_H, background: "#ffffff",
  layers: [
    { id: "bg", type: "shape", rect: { x: 0, y: 0, w: FLY_W, h: FLY_H }, fill: "#f5f0e6" },
    { id: "title", type: "text", rect: { x: 150, y: 120, w: 975, h: 140 }, text: "1234 Maple Street", fontSize: 92, color: "#123123", fontFamily: "display", fontWeight: 700, align: "center" },
    { id: "photo", type: "image", rect: { x: 187, y: 350, w: 900, h: 560 }, imageData: solidPng(300, 200, RED), objectFit: "cover" },
    { id: "body", type: "text", rect: { x: 150, y: 1000, w: 975, h: 260 }, text: "Beautiful 4-bed, 3-bath home in a quiet neighborhood with a private backyard.", fontSize: 40, color: "#333333", align: "left" },
    { id: "cta", type: "shape", rect: { x: 487, y: 1450, w: 300, h: 80 }, fill: "#1e7a46", radius: 14 },
    { id: "ctaText", type: "text", rect: { x: 487, y: 1450, w: 300, h: 80 }, text: "OPEN HOUSE", fontSize: 30, color: "#ffffff", align: "center", fontWeight: 700 },
  ],
};

console.log("=== DesignDoc renderer: flyer 1275×1650 ===");
const flyer = await renderDesignDoc(flyerDoc);
const fpx = decodePng(flyer.dataUrl, FLY_W, FLY_H);
check("output is exactly 1275×1650", flyer.width === FLY_W && flyer.height === FLY_H, `${flyer.width}x${flyer.height}`);
check("background fills canvas (light beige at corner)", closeTo(px(fpx, FLY_W, 10, 10), "#f5f0e6", 30), `${px(fpx, FLY_W, 10, 10)}`);
// Full-res image-layer gate: the image must fill its ENTIRE box (top, center,
// AND bottom all = image color). Regression: background-image divs only filled
// the upper portion at 1275×1650; <img>+objectFit fills the whole box.
const imgBox = { x0: 187, y0: 350, x1: 1087, y1: 910 };
const topP = px(fpx, FLY_W, 640, imgBox.y0 + 12);
const centerP = px(fpx, FLY_W, 640, (imgBox.y0 + imgBox.y1) / 2);
const bottomP = px(fpx, FLY_W, 640, imgBox.y1 - 12);
check("full-res image composites at TOP of box (red)", closeTo(topP, RED, 25), `${topP}`);
check("full-res image composites at CENTER of box (red)", closeTo(centerP, RED, 25), `${centerP}`);
check("full-res image composites at BOTTOM of box (red)", closeTo(bottomP, RED, 25), `${bottomP}`);
// text ink: title glyphs are dark green-ish (#123123) present in the title band
let titleInk = 0;
for (let y = 120; y < 260; y++) for (let x = 300; x < 975; x++) if (luminance(px(fpx, FLY_W, x, y)) < 100) titleInk++;
check(`title text ink present in its band (${titleInk} dark px)`, titleInk > 200, `ink=${titleInk}`);
// body text ink present (dark #333)
let bodyInk = 0;
for (let y = 1000; y < 1260; y++) for (let x = 150; x < 700; x++) if (luminance(px(fpx, FLY_W, x, y)) < 110) bodyInk++;
check(`body text ink present (${bodyInk} dark px)`, bodyInk > 150, `ink=${bodyInk}`);
// cta shape + its white text (dark background present inside cta box)
check("cta shape fill renders (green)", closeTo(px(fpx, FLY_W, 640, 1500), "#1e7a46", 25), `${px(fpx, FLY_W, 640, 1500)}`);
let ctaWhite = 0;
for (let y = 1450; y < 1530; y++) for (let x = 487; x < 787; x++) if (luminance(px(fpx, FLY_W, x, y)) > 235) ctaWhite++;
check("cta white text ink present inside green box", ctaWhite > 80, `white=${ctaWhite}`);

console.log("=== DesignDoc renderer: social 1080×1080 ===");
const socialDoc: DesignDoc = {
  width: SOC_W, height: SOC_H, background: "#ffffff",
  layers: [
    { id: "bg", type: "shape", rect: { x: 0, y: 0, w: SOC_W, h: SOC_H }, fill: "#1f2d22" },
    { id: "photo", type: "image", rect: { x: 140, y: 140, w: 800, h: 560 }, imageData: solidPng(400, 300, "#2a6f97"), objectFit: "cover" },
    { id: "title", type: "text", rect: { x: 120, y: 760, w: 840, h: 120 }, text: "OPEN HOUSE", fontSize: 72, color: "#ffffff", fontFamily: "display", fontWeight: 700, align: "center", letterSpacing: 6 },
    { id: "sub", type: "text", rect: { x: 120, y: 900, w: 840, h: 90 }, text: "Sunday 1–4pm", fontSize: 40, color: "#f5d97a", align: "center" },
  ],
};
const social = await renderDesignDoc(socialDoc);
const spx = decodePng(social.dataUrl, SOC_W, SOC_H);
check("output is exactly 1080×1080", social.width === SOC_W && social.height === SOC_H, `${social.width}x${social.height}`);
check("social background fill (dark green at corner)", closeTo(px(spx, SOC_W, 10, 10), "#1f2d22", 25), `${px(spx, SOC_W, 10, 10)}`);
check("social image composites its color (blue) inside its box", closeTo(px(spx, SOC_W, 540, 420), "#2a6f97", 25), `${px(spx, SOC_W, 540, 420)}`);
let socialInk = 0;
for (let y = 760; y < 880; y++) for (let x = 200; x < 880; x++) if (luminance(px(spx, SOC_W, x, y)) > 225) socialInk++;
check(`social title white ink present (${socialInk} light px)`, socialInk > 200, `ink=${socialInk}`);

// ---------------------------------------------------------------------------
// 2. Z-order: a later layer occludes an earlier one at their overlap.
// ---------------------------------------------------------------------------
console.log("=== DesignDoc renderer: z-order ===");
const zDoc: DesignDoc = {
  width: 400, height: 400, background: "#ffffff",
  layers: [
    { id: "bottom", type: "shape", rect: { x: 100, y: 100, w: 200, h: 200 }, fill: "#ff0000" },
    // later layer overlaps the top-left quadrant of bottom
    { id: "top", type: "shape", rect: { x: 150, y: 80, w: 120, h: 80 }, fill: "#0000ff" },
  ],
};
const z = await renderDesignDoc(zDoc);
const zpx = decodePng(z.dataUrl, 400, 400);
check("later layer occludes earlier at overlap (blue)", closeTo(px(zpx, 400, 200, 105), "#0000ff", 20), `${px(zpx, 400, 200, 105)}`);
check("non-overlap part of bottom still red", closeTo(px(zpx, 400, 125, 260), "#ff0000", 20), `${px(zpx, 400, 125, 260)}`);

// ---------------------------------------------------------------------------
// 3. Rotation: a 44°-rotated square moves ink off the axis-aligned box corner.
// ---------------------------------------------------------------------------
console.log("=== DesignDoc renderer: rotation ===");
function rotDoc(rotation: number | undefined): DesignDoc {
  return {
    width: 400, height: 400, background: "#ffffff",
    layers: [
      { id: "sq", type: "shape", rect: { x: 150, y: 150, w: 100, h: 100 }, fill: "#000000", rotation },
    ],
  };
}
const unrot = await renderDesignDoc(rotDoc(undefined));
const unpx = decodePng(unrot.dataUrl, 400, 400);
const rot = await renderDesignDoc(rotDoc(44));
const rpx = decodePng(rot.dataUrl, 400, 400);
// axis-aligned box top-left corner (150,150): unrotated => black, rotated 44° => white
const cornerUn = luminance(px(unpx, 400, 152, 152));
const cornerRot = luminance(px(rpx, 400, 152, 152));
check("unrotated square covers its box corner (dark)", cornerUn < 60, `lum=${cornerUn}`);
check("rotated square leaves the axis-aligned corner empty (light)", cornerRot > 200, `lum=${cornerRot}`);
// center stays covered in both
check("rotated square still covers its center", luminance(px(rpx, 400, 200, 200)) < 60, `lum=${luminance(px(rpx, 400, 200, 200))}`);

// ---------------------------------------------------------------------------
// 4. Shape ellipse + stroke render.
// ---------------------------------------------------------------------------
console.log("=== DesignDoc renderer: shape stroke/ellipse ===");
const shapeDoc: DesignDoc = {
  width: 300, height: 300, background: "#ffffff",
  layers: [
    { id: "e", type: "shape", shape: "ellipse", rect: { x: 50, y: 50, w: 200, h: 200 }, fill: "#ffaa00", stroke: "#000000", strokeWidth: 8 },
  ],
};
const shp = await renderDesignDoc(shapeDoc);
const shpx = decodePng(shp.dataUrl, 300, 300);
check("ellipse center is the fill color (orange)", closeTo(px(shpx, 300, 150, 150), "#ffaa00", 20), `${px(shpx, 300, 150, 150)}`);
check("ellipse corner is transparent/white (not fill)", !closeTo(px(shpx, 300, 55, 55), "#ffaa00", 25), `${px(shpx, 300, 55, 55)}`);

console.log("=== DesignDoc renderer: new font families distinct ===");
const FF_W = 900, FF_H = 200;
const ffBg = solidPng(FF_W, FF_H, "#ffffff");
function fontFidDoc(family, weight) {
  return {
    format: "flyer",
    width: FF_W,
    height: FF_H,
    layers: [
      { id: "bg", type: "image", rect: { x: 0, y: 0, w: FF_W, h: FF_H }, imageData: ffBg, objectFit: "cover" },
      { id: "t", type: "text", rect: { x: 20, y: 20, w: FF_W - 40, h: FF_H - 40 }, text: "HANDWRITING TEST", fontFamily: family, fontWeight: weight, fontSize: 96, color: "#111111", align: "left", lineHeight: 1.0 },
    ],
  };
}
async function ffPixels(family, weight) {
  const r = await renderDesignDoc(fontFidDoc(family, weight));
  return decodePng(r.dataUrl, FF_W, FF_H);
}
const FF_THRESHOLD = 3000;
const ff = {
  sans: await ffPixels("sans", 400),
  calligraphy: await ffPixels("calligraphy", 400),
  handwriting: await ffPixels("handwriting", 400),
  handwriting700: await ffPixels("handwriting", 700),
  retro: await ffPixels("retro", 400),
};
let ffInk = 0;
for (let ii = 0; ii < ff.calligraphy.length; ii++) if (ff.calligraphy[ii] < 128) ffInk++;
check(`calligraphy renders non-empty ink (${ffInk} dark px)`, ffInk > 300, `ink=${ffInk}`);
const ffPairs = [
  ["calligraphy vs sans", ff.calligraphy, ff.sans],
  ["calligraphy vs handwriting", ff.calligraphy, ff.handwriting],
  ["calligraphy vs retro", ff.calligraphy, ff.retro],
  ["handwriting vs sans", ff.handwriting, ff.sans],
  ["handwriting vs retro", ff.handwriting, ff.retro],
  ["retro vs sans", ff.retro, ff.sans],
  ["handwriting bold vs regular", ff.handwriting700, ff.handwriting],
];
for (const [label, a, b] of ffPairs) {
  let d = 0;
  for (let ii = 0; ii < a.length; ii++) if (a[ii] !== b[ii]) d++;
  check(`${label} render distinct glyphs (diff=${d})`, d >= FF_THRESHOLD, `diff=${d}`);
}


await writeFile(`${OUT}/flyer.png`, Buffer.from(flyer.dataUrl.split(",")[1], "base64"));
await writeFile(`${OUT}/social.png`, Buffer.from(social.dataUrl.split(",")[1], "base64"));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
