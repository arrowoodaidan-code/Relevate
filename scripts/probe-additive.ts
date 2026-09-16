/**
 * Deterministic pixel probe for the ADDITIVE draw-on-top compositor (e121b3fd).
 *
 * Verifies four things about editor-ADDED regions (additive:true, FE's
 * ADDED_PREFIX boxes) on a synthetic 1080×1080 SOCIAL template replica (no
 * inpaint noise in the base — the cleanest read of draw-on-top):
 *   1. Additive TEXT region: no opaque surface box, no erase — the template
 *      lettering UNDER the box survives (sampled on the dark band) and the box
 *      background pixels equal the base template (byte-unchanged).
 *   2. Additive IMAGE (logo, objectFit contain) region: no opaque backing rect
 *      — box margins/corners equal the base gradient (a backing would flatten
 *      the gradient to one sampled color).
 *   3. DETECTED (non-additive) image region KEEPS the backing rect — a corner
 *      under it differs from base in the SAME build (regression guard that the
 *      detected path is unchanged).
 * Then a FLYER check (768×1024 synthetic is fine — region coords are
 * template-fractional):
 *   4. Additive TEXT on a flyer is EXCLUDED from inpainting — the lettering
 *      band under the box is NOT erased (remains ≠ local background), whereas
 *      a detected region on the same band WOULD be inpainted.
 */
import { Resvg } from "@resvg/resvg-js";
import type { RenderRequest } from "../src/lib/render";
import { renderMarketingPng, inpaintTemplateBackground } from "../src/lib/render";

const W = 1080;
const H = 1080;

function b64(b: Buffer) {
  return `data:image/png;base64,${b.toString("base64")}`;
}

/** Render an SVG string to a PNG data URL via Resvg. */
function svgPng(svg: string): string {
  return b64(Buffer.from(new Resvg(svg).render().asPng()));
}

/** Decode a PNG data URL to an RGBA Buffer at w×h via Resvg wrap. */
function decodePixels(url: string, w: number, h: number): Buffer | null {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${url}" x="0" y="0" width="${w}" height="${h}"/></svg>`;
    return new Resvg(svg).render().pixels;
  } catch {
    return null;
  }
}

function px(buf: Buffer, w: number, x: number, y: number) {
  const o = (y * w + x) * 4;
  return [buf[o], buf[o + 1], buf[o + 2]];
}

function lum(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const results: string[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  results.push(`${ok ? "✅" : "❌"} ${name}: ${detail}`);
  if (!ok) failures++;
}

// --- Synthetic SOCIAL base template (1080×1080) -----------------------------
const SOCIAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#f0ece4"/>
  <rect x="0" y="120" width="${W}" height="80" fill="#1f1f24"/>
  <linearGradient id="a" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#2e9e6b"/><stop offset="1" stop-color="#3aa0c9"/>
  </linearGradient>
  <rect x="0" y="420" width="${W}" height="120" fill="url(#a)"/>
  <linearGradient id="b" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#4a90d9"/><stop offset="1" stop-color="#7b3fa0"/>
  </linearGradient>
  <rect x="0" y="640" width="${W}" height="240" fill="url(#b)"/>
</svg>`;
const socialTpl = svgPng(SOCIAL_SVG);
const socialBase = decodePixels(socialTpl, W, H)!;

// Small solid image to drop into image regions (logo → objectFit contain).
const imgGreen = svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#1c7c3a"/></svg>`);

// --- Render A: ADDITIVE text + ADDITIVE logo + DETECTED logo ---------------
const additiveText: any = {
  id: "add-text-1", label: "other", kind: "text",
  x: 0.05, y: 0.1, w: 0.5, h: 0.22,
  textColor: "#ffffff", fontFamily: "sans-serif", fontWeight: "normal", align: "left",
  fontSizePx: 96, additive: true,
};
const additiveLogo: any = {
  id: "add-img-1", label: "logo", kind: "image",
  x: 0.1, y: 0.4, w: 0.8, h: 0.11, additive: true,
};
const detectedLogo: any = {
  id: "det-img-1", label: "logo", kind: "image",
  x: 0.1, y: 0.65, w: 0.8, h: 0.16,
};

const reqA: RenderRequest = {
  type: "social", body: "Additive replica body",
  templateImage: socialTpl, templateWidth: W, templateHeight: H,
  templateRegions: [additiveText, additiveLogo, detectedLogo],
  regionText: { "add-text-1": "OPEN HOUSE" },
  regionImages: { "add-img-1": imgGreen, "det-img-1": imgGreen },
};
const outA = await renderMarketingPng(reqA);
const outAbuf = decodePixels(outA, W, H)!;

// 1. Additive text box: sample on the dark band (y=150) at the RIGHT edge of
//    the box (x=560, well clear of the left-aligned glyphs, box x ends 594).
const t1 = px(outAbuf, W, 560, 130);
check(
  "additive TEXT preserves underlying band (no surface box / no erase)",
  lum(t1[0], t1[1], t1[2]) < 90,
  `band px @(560,130)=rgb(${t1.join(",")}) (base ~ #1f1f24)`,
);
// Band pixel must equal the base template exactly (draw-on-top, nothing altered).
const t1base = px(socialBase, W, 560, 130);
check(
  "additive TEXT box background == base template (byte-unchanged)",
  Math.abs(t1[0] - t1base[0]) <= 3 && Math.abs(t1[1] - t1base[1]) <= 3 && Math.abs(t1[2] - t1base[2]) <= 3,
  `box bg rgb(${t1.join(",")}) vs base rgb(${t1base.join(",")})`,
);

// 2. Additive logo box (band A, x108–972, y432–540): contain ⇒ the small green
//    image sits centered (x~486–594), so a corner margin reflects the BASE
//    band-A gradient, NOT a flat backing.
const gx = 130, gy = 445;
const cAdd = px(outAbuf, W, gx, gy);
const cBase = px(socialBase, W, gx, gy);
check(
  "additive IMAGE margin == base gradient (no opaque backing rect)",
  Math.abs(cAdd[0] - cBase[0]) <= 6 && Math.abs(cAdd[1] - cBase[1]) <= 6 && Math.abs(cAdd[2] - cBase[2]) <= 6,
  `margin rgb(${cAdd.join(",")}) vs base gradient rgb(${cBase.join(",")})`,
);

// 3. DETECTED logo (band B): backing rect flattens the gradient ⇒ differs.
const dAdd = px(outAbuf, W, 700, 850); // corner inside detected box (y 0.65+0.16 → 0.81*1080=875)
const dBase = px(socialBase, W, 700, 850);
const diff = Math.abs(dAdd[0] - dBase[0]) + Math.abs(dAdd[1] - dBase[1]) + Math.abs(dAdd[2] - dBase[2]);
check(
  "DETECTED image corner keeps backing (differs from base gradient) — detected path unchanged",
  diff > 30,
  `det corner rgb(${dAdd.join(",")}) vs base rgb(${dBase.join(",")}) Δ=${diff}`,
);

// --- Flyer inpaint-exclusion (direct function check — artifact-free) --------
// inpainting is what erases original lettering under a REPLACED text region.
// buildTemplateReplica filters ADDITIVE regions out of the regions passed to
// inpaintTemplateBackground. Verify: an ADDITIVE-only region set yields NO
// inpaint (returns undefined), while a DETECTED region set DOES inpaint its
// region's pixels. This is the exact filter the renderer applies, checked
// directly so it can't be masked by a synthetic-template frame artifact.
const FW = 768, FH = 1024;
const flyerTpl = svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH}"><rect width="${FW}" height="${FH}" fill="#efece4"/><rect x="0" y="300" width="${FW}" height="90" fill="#20242b"/></svg>`);
const addFlyerText: any = {
  id: "add-text-f", label: "other", kind: "text",
  x: 0.05, y: 0.3, w: 0.9, h: 0.12, textColor: "#ffffff",
  fontFamily: "sans-serif", fontWeight: "normal", align: "left", fontSizePx: 64, additive: true,
};
const detFlyerText: any = {
  id: "det-text-f", label: "other", kind: "text",
  x: 0.05, y: 0.3, w: 0.9, h: 0.12, textColor: "#ffffff",
  fontFamily: "sans-serif", fontWeight: "normal", align: "left", fontSizePx: 64,
};
const inpAdd = inpaintTemplateBackground(flyerTpl, [addFlyerText].filter((r) => !r.additive), { "add-text-f": "X" }, FW, FH);
const inpDet = inpaintTemplateBackground(flyerTpl, [detFlyerText], { "det-text-f": "X" }, FW, FH);
check(
  "additive TEXT region is EXCLUDED from inpaint (no inpaint produced)",
  inpAdd === undefined,
  inpAdd ? "inpaint unexpectedly produced" : "inpaintTemplateBackground returned undefined for the additive-only set (correct)",
);
check(
  "DETECTED text region IS inpainted (control)",
  inpDet !== undefined,
  inpDet ? "detected region inpainted (returns a base)" : "detected region NOT inpainted (unexpected)",
);

console.log("ADDITIVE PROBE");
console.log(results.join("\n"));
console.log(failures === 0 ? `✅ ${results.length}/${results.length} passed` : `❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
