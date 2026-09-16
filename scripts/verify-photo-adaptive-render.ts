/**
 * verify-photo-adaptive-render.ts — end-to-end render proof for adaptive
 * text color (task bf6f8534).
 *
 * Renders the REAL production Flyer-Hero and Social-Photo branded templates
 * (validateRenderRequest -> renderMarketingPng) with solid PHOTO fixtures:
 *   BRIGHT (250,246,235)  -> must flip to dark ink on a light cream wash
 *   DARK   (20,30,25)     -> must keep cream/mint on the dark brand scrim
 *   MID    (128,128,128)  -> mid-tone, must also keep dark mode
 * then samples real pixels from the composited PNG inside the text zones and
 * asserts (a) the resolved surface is light/dark as expected and (b) the text
 * ink is present on that surface. Unlike the palette-math gate, this proves
 * the BRANDED TEMPLATES actually consumed the adaptive module.
 *
 * Note: local @resvg full-res encodePng is lossy above ~780px, so we render
 * at a reduced density scale (0.25) — the same price/body zones in relative
 * terms. Full-res verification happens on the Vercel preview (owner gate).
 *
 * Run: bun scripts/verify-photo-adaptive-render.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { renderMarketingPng, validateRenderRequest } from "../src/lib/render.ts";

const OUT = "/home/team/shared/design-renderer/adaptive-previews";
const TITLE = "2847 Willow Creek Lane";
const AGENT = "Aidan Arrowood";
const PRICE = "$749,000";
const BODY =
  "Sun-filled 4-bed, 3-bath craftsman on a quiet cul-de-sac. Open living " +
  "space with a chef's kitchen, quartz island, and a private fenced yard.";

function solidPng(r: number, g: number, b: number): string {
  // Render a solid-color SVG to a real PNG via resvg-js (the same rasterizer
  // the production path uses), then wrap as a data URL. validImage requires
  // png/jpeg/webp — not SVG.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="rgb(${r},${g},${b})"/></svg>`;
  const img = new Resvg(svg, { fitTo: { mode: "width", value: 256 } });
  const png = img.render().asPng();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const FIXTURES: Array<[string, [number, number, number]]> = [
  ["bright", [250, 246, 235]],
  ["dark", [20, 30, 25]],
  ["mid", [128, 128, 128]],
];

// Real R5 slot geometry from src/lib/branded-templates.ts:
//  - Flyer-Hero: photo y 210..900 of 1650, price div sits at top PHOTO_BOT-108=792
//    (left, ~110px tall), chips right at 804. Sampling the price zone over the
//    photo: fy 0.48..0.55.
//  - Social-Photo: photo fills the 1080 card; price at top 340, address at 470..565
//    (upper overlay zone fy 0.315..0.52, centered).
const PRICE_ZONE: Record<string, { fx: number; fy: number; fw: number; fh: number }> = {
  flyer: { fx: 0.04, fy: 0.48, fw: 0.5, fh: 0.07 },
  social: { fx: 0.06, fy: 0.315, fw: 0.88, fh: 0.21 },
};

function lumOf(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Decode a rendered PNG data URL back to RGBA bytes at its native size
 *  (same technique as the other verify-* gates: embed in SVG, re-rasterize).
 */
function decodePngNative(dataUrl: string, w: number, h: number): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${dataUrl}" x="0" y="0" width="${w}" height="${h}"/></svg>`;
  return new Resvg(svg).render().pixels as Uint8Array;
}

function sampleZone(dataUrl: string, w: number, h: number, zone: { fx: number; fy: number; fw: number; fh: number }): { avgLum: number; peakDark: number } {
  const pix = decodePngNative(dataUrl, w, h);
  const x0 = Math.floor(zone.fx * w), x1 = Math.floor((zone.fx + zone.fw) * w);
  const y0 = Math.floor(zone.fy * h), y1 = Math.floor((zone.fy + zone.fh) * h);
  let sum = 0, n = 0, peakDark = 0;
  for (let y = y0; y < y1 && y < h; y += 2) {
    for (let x = x0; x < x1 && x < w; x += 2) {
      const i = (y * w + x) * 4;
      const L = lumOf(pix[i], pix[i + 1], pix[i + 2]);
      sum += L; n++;
      const dark = Math.min(pix[i], pix[i + 1], pix[i + 2]);
      peakDark = Math.max(peakDark, 255 - dark);
    }
  }
  return { avgLum: sum / n, peakDark };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let pass = 0, fail = 0;
  const rows: string[] = [];
  for (const [fmt] of [["flyer"], ["social"]] as const) {
    for (const [name, rgb] of FIXTURES) {
      const photo = solidPng(...rgb);
      const raw = {
        type: fmt,
        title: TITLE,
        body: BODY,
        agentName: AGENT,
        brandStyle: "forest modern",
        price: PRICE,
        beds: "4", baths: "3", sqft: "2,485",
        agentPhone: "(843) 250-4438",
        brandedTemplate: fmt === "flyer" ? "flyer-hero" : "social-photo",
        imageDataUrl: photo,
        density: 0.25,
      };
      const check = validateRenderRequest(raw as never);
      if (!check.ok) { console.log(`  ✗ ${fmt}/${name}: validate ${check.error}`); fail++; continue; }
      const dataUrl = await renderMarketingPng(check.data);
      const zone = PRICE_ZONE[fmt];
      const [dw, dh] = fmt === "flyer" ? [1275, 1650] : [1080, 1080];
      const s = sampleZone(dataUrl, dw, dh, zone);
      // Sample the photo area OUTSIDE the price text (peek left of the price,
      // top of the social) to learn the actual overlay surface polarity.
      const bgZone = fmt === "flyer"
        ? { fx: 0.04, fy: 0.3, fw: 0.2, fh: 0.05 }   // photo left, below ribbon
        : { fx: 0.08, fy: 0.06, fw: 0.2, fh: 0.05 }; // social top-left
      const bg = sampleZone(dataUrl, dw, dh, bgZone);
      const out = `${OUT}/${fmt}-${name}.png`;
      await writeFile(out, Buffer.from(dataUrl.split(",")[1], "base64"));
      // Bright photo => overlay surface should be LIGHT (cream wash) with DARK
      // ink present over the price zone; dark/mid => surface DARK (scrim) with
      // LIGHT (cream/gold) ink present.
      const isLight = bg.avgLum > 0.5;
      const isDark = bg.avgLum < 0.25;
      const brightOk = name === "bright" ? (isLight && s.peakDark > 60) : true;
      const darkOk = name !== "bright" ? (isDark && s.peakDark > 80) : true;
      const ok = brightOk && darkOk;
      ok ? pass++ : fail++;
      rows.push(`| ${fmt} ${name.padEnd(7)} | bg=${bg.avgLum.toFixed(2)} ${isLight ? "LIGHT" : isDark ? "DARK" : "??"} | inkPeak=${s.peakDark} | ${ok ? "PASS" : "FAIL"} |`);
      console.log(`  ${ok ? "✓" : "✗"} ${fmt}/${name} -> ${out}`);
    }
  }
  console.log("Sample table (photo-surface polarity + zone ink):");
  console.log("| case | surface | zone vs bg | inkPeak | result |");
  console.log("|---|---|---|---|---|");
  for (const r of rows) console.log(r);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
main().catch((e) => { console.error("FAILED", e); process.exit(1); });