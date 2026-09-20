/**
 * Text STYLE & COLOR FIDELITY regression test — template-replica flyer regions.
 *
 * Versioned companion to /tmp/test-template-replica-full.ts (color/blend) and
 * the original contract test. Proves the style/color workstream end to end:
 *
 *  PART A — font-match unit fixtures (pure, no render):
 *    detected style → matched bundled family/weight/tracking/case transform,
 *    including the honest limits (light→400, small-caps→uppercase,
 *    italic→upright). Round 2: script→Relevate Script (Great Vibes),
 *    display→Relevate Display (Playfair), condensed→Relevate Condensed (Bebas);
 *    script/condensed are single-weight 400 faces by design.
 *
 *  PART B — renderer contract for the NEW region fields:
 *    validateRenderRequest (render.ts sanitizeRegions) accepts and PRESERVES
 *    italic/letterSpacingPx/textTransform/condensed-family, and REJECTS
 *    malformed values; the same sanitizeRegions backs templates.ts saved-
 *    template CRUD.
 *
 *  PART C — composited style fidelity on a KNOWN-typography flyer template
 *    (scripts/make-style-template.ts): the rendered PNG actually changes with
 *    transform (uppercase), tracking (letter-spacing widens the ink extent),
 *    family (serif vs sans), and weight (bold covers more ink than normal);
 *    "light" renders byte-identical to "normal" (both resolve to registered 400).
 *    Round 2: display/script/condensed render DISTINCT from the default face
 *    (proves the OFL faces actually register and render — a missing registry
 *    entry would silently fall back to DejaVu Sans and match the sans baseline),
 *    and condensed is measurably NARROWER than sans at the same size.
 *
 *  PART D — social path untouched: a social template render carrying the new
 *    style fields is byte-identical to the same render without them (style
 *    fidelity is flyer-only by design — owner parked social).
 *
 * Usage: bun scripts/test-render-style-fidelity.ts   (exit 0 = all green)
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { matchRegionTypography, applyTextTransform, resolveRegionTypography } from "../src/lib/font-match.ts";
import { renderMarketingPng, validateRenderRequest, sampleRegionBackgrounds } from "../src/lib/render.ts";
import { Resvg } from "@resvg/resvg-js";

const dir = "/home/team/shared/render-samples";
const asset = async (p: string) => `data:image/png;base64,${(await readFile(p)).toString("base64")}`;
const results: string[] = [];
const ok = (cond: boolean, label: string) => results.push(`${cond ? "✅" : "❌"} ${label}`);

// ---------------------------------------------------------------------------
// PART A — font-match unit fixtures
// ---------------------------------------------------------------------------
{
  const serifBold = matchRegionTypography({ fontFamily: "serif", fontWeight: "bold", letterSpacingPx: 2, textTransform: "uppercase" });
  ok(serifBold.fontFamily === "Relevate Serif" && serifBold.fontWeight === 700 && serifBold.letterSpacing === "2px" && serifBold.textTransform === "uppercase",
    `A1 serif+bold → Serif 700, "2px", uppercase (got ${serifBold.fontFamily}/${serifBold.fontWeight}/${serifBold.letterSpacing}/${serifBold.textTransform})`);

  const sansNormal = matchRegionTypography({ fontFamily: "sans-serif", fontWeight: "normal", textTransform: "none" });
  ok(sansNormal.fontFamily === "Relevate Sans" && sansNormal.fontWeight === 400 && sansNormal.textTransform === "none" && sansNormal.letterSpacing === undefined,
    `A2 sans+normal → Sans 400, no tracking, no transform (got ${sansNormal.fontFamily}/${sansNormal.fontWeight}/${sansNormal.letterSpacing}/${sansNormal.textTransform})`);

  const mono = matchRegionTypography({ fontFamily: "mono", fontWeight: "bold" });
  ok(mono.fontFamily === "Relevate Mono" && mono.fontWeight === 700, `A3 mono+bold → Mono 700 (got ${mono.fontFamily}/${mono.fontWeight})`);

  const script = matchRegionTypography({ fontFamily: "script", fontWeight: "bold" });
  ok(script.fontFamily === "Relevate Script" && script.fontWeight === 400,
    `A4 script → Relevate Script 400 (Great Vibes single-weight; got ${script.fontFamily}/${script.fontWeight})`);

  const displayLight = matchRegionTypography({ fontFamily: "display", fontWeight: "light" });
  ok(displayLight.fontFamily === "Relevate Display" && displayLight.fontWeight === 400,
    `A5 display+light → Relevate Display 400 (light resolves to nearest REGISTERED weight 400; got ${displayLight.fontFamily}/${displayLight.fontWeight})`);
  const displayBold = matchRegionTypography({ fontFamily: "display", fontWeight: "bold" });
  ok(displayBold.fontFamily === "Relevate Display" && displayBold.fontWeight === 700,
    `A13 display+bold → Relevate Display 700 (Playfair Bold; got ${displayBold.fontFamily}/${displayBold.fontWeight})`);
  const condensed = matchRegionTypography({ fontFamily: "condensed", fontWeight: "bold" });
  ok(condensed.fontFamily === "Relevate Condensed" && condensed.fontWeight === 400,
    `A14 condensed → Relevate Condensed 400 even when bold (Bebas single-weight by design; got ${condensed.fontFamily}/${condensed.fontWeight})`);
  const scriptNormal = matchRegionTypography({ fontFamily: "script", fontWeight: "normal", textTransform: "none" });
  ok(scriptNormal.fontFamily === "Relevate Script" && scriptNormal.textTransform === "none",
    `A15 script+normal → Relevate Script, no transform (got ${scriptNormal.fontFamily}/${scriptNormal.textTransform})`);

  const defaults = matchRegionTypography({});
  ok(defaults.fontFamily === "Relevate Sans" && defaults.fontWeight === 400, `A6 no signals → Sans 400 (got ${defaults.fontFamily}/${defaults.fontWeight})`);

  const negative = matchRegionTypography({ fontFamily: "sans-serif", letterSpacingPx: -2 });
  ok(negative.letterSpacing === "-2px", `A7 negative tracking "-2px" (got ${negative.letterSpacing})`);

  ok(applyTextTransform("Open House\nSat 1–4 PM", "uppercase") === "OPEN HOUSE\nSAT 1–4 PM",
    "A8 uppercase transform preserves newlines + uppercases content");
  ok(applyTextTransform("Open House", "none") === "Open House", "A9 no-transform leaves content untouched");
  ok(applyTextTransform("Open House", "uppercase") === "OPEN HOUSE", "A10 small-caps → uppercase approximation (documented)");

  const italic = matchRegionTypography({ fontFamily: "sans-serif", italic: true });
  ok(italic.fontStyle === "normal", "A11 italic:true → upright (no italic face bundled; flag preserved on the region)");

  const resolved = resolveRegionTypography({ id: "h", label: "headline", kind: "text", x: 0.1, y: 0.1, w: 0.8, h: 0.1, fontFamily: "sans-serif", fontWeight: "bold", letterSpacingPx: 6, textTransform: "uppercase" }, "Open House");
  ok(resolved.content === "OPEN HOUSE" && resolved.fontFamily === "Relevate Sans" && resolved.fontWeight === 700 && resolved.letterSpacing === "6px",
    "A12 resolveRegionTypography returns matched style + transformed content together");
}

// ---------------------------------------------------------------------------
// Fixture template (known typography) + region geometry
// ---------------------------------------------------------------------------
await mkdir(dir, { recursive: true });
const styleTemplate = await asset(`${dir}/style-template-flyer.png`);
const socialTemplate = await asset("/home/team/shared/design-assets/social-background.png");
const headlineRegion = (overrides: Record<string, unknown> = {}) => ({
  id: "headline", kind: "text", label: "headline", x: 0.0706, y: 0.1818, w: 0.8588, h: 0.0727,
  textColor: "#f2e9d0", fontFamily: "sans-serif", fontWeight: "bold", fontSizePx: 56, align: "center",
  ...overrides,
});
// Round 2: region helpers for the fixture's display/script/condensed bands
// (make-style-template.ts paints these with the same registered face names).
const displayRegion = (overrides: Record<string, unknown> = {}) => ({
  id: "display", kind: "text", label: "subheadline", x: 0.0706, y: 0.3152, w: 0.8588, h: 0.0727,
  textColor: "#f2e9d0", fontFamily: "display", fontWeight: "bold", fontSizePx: 40, align: "center",
  ...overrides,
});
const scriptRegion = (overrides: Record<string, unknown> = {}) => ({
  id: "script", kind: "text", label: "body", x: 0.0706, y: 0.4, w: 0.8588, h: 0.0788,
  textColor: "#d4a017", fontFamily: "script", fontWeight: "normal", fontSizePx: 46, align: "center",
  ...overrides,
});
const condensedRegion = (overrides: Record<string, unknown> = {}) => ({
  id: "condensed", kind: "text", label: "cta", x: 0.0706, y: 0.4909, w: 0.8588, h: 0.0545,
  textColor: "#f2e9d0", fontFamily: "condensed", fontWeight: "normal", fontSizePx: 42, align: "center",
  ...overrides,
});

async function renderFlyer(region: Record<string, unknown>, text: string): Promise<Buffer> {
  const check = validateRenderRequest({
    type: "flyer", title: "ignored", body: "ignored",
    templateImage: styleTemplate, templateWidth: 1275, templateHeight: 1650,
    templateRegions: [region], regionText: { [String(region.id)]: text },
  });
  if (!check.ok) throw new Error(`validateRenderRequest rejected: ${check.error}`);
  const dataUrl = await renderMarketingPng(check.data);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

// Ink stats inside the headline box of a rendered flyer (surface-relative):
// pixels differing from the sampled region surface by >50 max-channel are
// "ink" (the composited lettering). Returns count + horizontal extent.
function inkStats(png: Buffer, surfaceHex: string, box: [number, number, number, number] = [90, 1185, 300, 420]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1275" height="1650" viewBox="0 0 1275 1650"><image href="data:image/png;base64,${png.toString("base64")}" width="1275" height="1650"/></svg>`;
  const px = new Resvg(svg).render().pixels;
  const [br, bgc, bb] = [parseInt(surfaceHex.slice(1, 3), 16), parseInt(surfaceHex.slice(3, 5), 16), parseInt(surfaceHex.slice(5, 7), 16)];
  const [x0, x1, y0, y1] = box;
  let count = 0, minX = Infinity, maxX = -Infinity;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * 1275 + x) * 4;
    if (Math.max(Math.abs(px[i] - br), Math.abs(px[i + 1] - bgc), Math.abs(px[i + 2] - bb)) > 50) {
      count++; if (x < minX) minX = x; if (x > maxX) maxX = x;
    }
  }
  return { count, extent: minX === Infinity ? 0 : maxX - minX };
}

// ---------------------------------------------------------------------------
// PART B — renderer contract for the new region fields
// ---------------------------------------------------------------------------
{
  const rich = headlineRegion({ italic: true, letterSpacingPx: 8, textTransform: "uppercase" });
  const check = validateRenderRequest({
    type: "flyer", title: "ignored", body: "ignored",
    templateImage: styleTemplate, templateWidth: 1275, templateHeight: 1650,
    templateRegions: [rich], regionText: { headline: "Open House" },
  });
  ok(check.ok, `B1 new fields accepted by validateRenderRequest (${check.ok ? "" : check.error})`);
  if (check.ok) {
    const region = check.data.templateRegions![0];
    ok(region.italic === true && region.letterSpacingPx === 8 && region.textTransform === "uppercase" && region.textColor === "#f2e9d0" && region.fontSizePx === 56 && region.align === "center",
      `B2 fields preserved through sanitization (italic=${region.italic} ls=${region.letterSpacingPx} tt=${region.textTransform})`);
  }
  const rejects: Array<[Record<string, unknown>, string]> = [
    [{ textTransform: "weird" }, "invalid textTransform"],
    [{ letterSpacingPx: "abc" }, "non-numeric letterSpacingPx"],
    [{ letterSpacingPx: 5000 }, "out-of-range letterSpacingPx"],
    [{ italic: "yes" }, "non-boolean italic"],
  ];
  for (const [overrides, label] of rejects) {
    const bad = validateRenderRequest({
      type: "flyer", title: "ignored", body: "ignored",
      templateImage: styleTemplate, templateWidth: 1275, templateHeight: 1650,
      templateRegions: [headlineRegion(overrides)], regionText: { headline: "x" },
    });
    ok(!bad.ok, `B3 ${label} rejected (${bad.ok ? "should reject, passed" : bad.error})`);
  }
  // Same sanitizeRegions backs templates.ts CRUD (validateRegions) — verified by
  // shared code path; the templates module is not imported here to keep the
  // test free of DATABASE_URL requirements.
  // Round 2: the condensed family is a first-class category end-to-end.
  const condensed = validateRenderRequest({
    type: "flyer", title: "ignored", body: "ignored",
    templateImage: styleTemplate, templateWidth: 1275, templateHeight: 1650,
    templateRegions: [condensedRegion({ fontFamily: "condensed" })], regionText: { condensed: "FOR SALE" },
  });
  ok(condensed.ok && condensed.data.templateRegions![0].fontFamily === "condensed",
    `B4 fontFamily \"condensed\" accepted and preserved (${condensed.ok ? "" : condensed.error})`);
}

// ---------------------------------------------------------------------------
// PART C — composited style fidelity on the known-typography flyer
// ---------------------------------------------------------------------------
const surfaceHex = sampleRegionBackgrounds(styleTemplate, [headlineRegion()] as never, 1275, 1650).headline ?? "#10241a";

async function pair(label: string, regionA: Record<string, unknown>, textA: string, regionB: Record<string, unknown>, textB: string, opts: { box?: [number, number, number, number]; surface?: string } = {}) {
  const [pngA, pngB] = await Promise.all([renderFlyer(regionA, textA), renderFlyer(regionB, textB)]);
  const same = pngA.equals(pngB);
  const box = opts.box ?? [90, 1185, 300, 420];
  const surface = opts.surface ?? surfaceHex;
  const a = inkStats(pngA, surface, box), b = inkStats(pngB, surface, box);
  await writeFile(`${dir}/style-fidelity-${label}-a.png`, pngA);
  await writeFile(`${dir}/style-fidelity-${label}-b.png`, pngB);
  return { same, a, b, sizeA: pngA.length, sizeB: pngB.length };
}

const r1 = await pair("transform",
  headlineRegion({ fontWeight: "bold", textTransform: "none" }), "Open House",
  headlineRegion({ fontWeight: "bold", textTransform: "uppercase" }), "Open House");
ok(!r1.same && r1.a.extent > 0, `C1 uppercase transform changes composited glyphs (mixed-case ink extent ${r1.a.extent}px vs uppercase ${r1.b.extent}px, byte-diff ${!r1.same})`);

const r2 = await pair("tracking",
  headlineRegion({ fontWeight: "bold", textTransform: "uppercase", letterSpacingPx: 0 }), "Open House",
  headlineRegion({ fontWeight: "bold", textTransform: "uppercase", letterSpacingPx: 8 }), "Open House");
ok(!r2.same, `C2 letter-spacing changes the render (byte-diff ${!r2.same})`);
ok(r2.b.extent > r2.a.extent + 24, `C3 letter-spacing WIDENS the ink extent (${r2.a.extent}px → ${r2.b.extent}px; must grow >24px)`);

const r3 = await pair("family",
  headlineRegion({ fontFamily: "sans-serif", fontWeight: "bold", textTransform: "uppercase", letterSpacingPx: 8 }), "Open House",
  headlineRegion({ fontFamily: "serif", fontWeight: "bold", textTransform: "uppercase", letterSpacingPx: 8 }), "Open House");
ok(!r3.same, `C4 family change (sans→serif) alters composited glyphs (byte-diff ${!r3.same}); unit A1/A4 prove the matched family is Relevate Serif`);

const r4 = await pair("weight",
  headlineRegion({ fontFamily: "sans-serif", fontWeight: "normal", textTransform: "uppercase", letterSpacingPx: 8 }), "Open House",
  headlineRegion({ fontFamily: "sans-serif", fontWeight: "bold", textTransform: "uppercase", letterSpacingPx: 8 }), "Open House");
ok(!r4.same, `C5 weight change (normal→bold) alters composited glyphs (byte-diff ${!r4.same})`);
ok(r4.b.count > r4.a.count * 1.05, `C6 bold covers measurably more ink than normal (${r4.a.count} → ${r4.b.count} ink px; unit asserts bold→700)`);

const r5 = await pair("light-vs-normal",
  headlineRegion({ fontFamily: "sans-serif", fontWeight: "light", textTransform: "uppercase", letterSpacingPx: 8 }), "Open House",
  headlineRegion({ fontFamily: "sans-serif", fontWeight: "normal", textTransform: "uppercase", letterSpacingPx: 8 }), "Open House");
ok(r5.same, `C7 "light" renders BYTE-IDENTICAL to "normal" (both resolve to the registered 400; got sizeA=${r5.sizeA} sizeB=${r5.sizeB})`);
// Round 2 — dedicated display/script/condensed faces actually register + render.
// Each new face is compared against the DEFAULT face (DejaVu Sans) inside the
// SAME box: if the registry entry were missing/wrong, satori would silently fall
// back to DejaVu Sans and the render would be byte-identical to the sans case.
const displayBox: [number, number, number, number] = [90, 1185, 520, 640];
const scriptBox: [number, number, number, number] = [90, 1185, 660, 790];
const condensedBox: [number, number, number, number] = [90, 1185, 810, 900];
const r6 = await pair("display-vs-sans",
  displayRegion({ fontFamily: "sans-serif", fontWeight: "bold" }), "Your Dream Home Awaits",
  displayRegion({ fontFamily: "display", fontWeight: "bold" }), "Your Dream Home Awaits", { box: displayBox, surface: "#10241a" });
ok(!r6.same, `C8 display (Playfair) renders DISTINCT from the default sans face (byte-diff ${!r6.same})`);
const r7 = await pair("script-vs-sans",
  scriptRegion({ fontFamily: "sans-serif", fontWeight: "normal" }), "Come tour our featured listing",
  scriptRegion({ fontFamily: "script", fontWeight: "normal" }), "Come tour our featured listing", { box: scriptBox, surface: "#0d2412" });
ok(!r7.same, `C9 script (Great Vibes) renders DISTINCT from the default sans face (byte-diff ${!r7.same})`);
const r8 = await pair("condensed-vs-sans",
  condensedRegion({ fontFamily: "sans-serif", fontWeight: "normal" }), "FOR SALE • OPEN THIS WEEKEND",
  condensedRegion({ fontFamily: "condensed", fontWeight: "normal" }), "FOR SALE • OPEN THIS WEEKEND", { box: condensedBox, surface: "#10241a" });
ok(!r8.same, `C10 condensed (Bebas) renders DISTINCT from the default sans face (byte-diff ${!r8.same})`);
ok(r8.b.extent < r8.a.extent * 0.85, `C11 condensed is measurably NARROWER than sans at the same size (${r8.a.extent}px → ${r8.b.extent}px; must be <85% of sans)`);
const r9 = await pair("display-bold-vs-normal",
  displayRegion({ fontWeight: "normal" }), "Your Dream Home Awaits",
  displayRegion({ fontWeight: "bold" }), "Your Dream Home Awaits", { box: displayBox, surface: "#10241a" });
ok(!r9.same, `C12 display bold (Playfair Bold 700) renders DISTINCT from display normal (400) (byte-diff ${!r9.same})`);

// ---------------------------------------------------------------------------
// PART D — social path untouched (style fidelity is flyer-only by design)
// ---------------------------------------------------------------------------
{
  const base = {
    type: "social" as const, title: "ignored", body: "ignored",
    templateImage: socialTemplate, templateWidth: 1080, templateHeight: 1080,
    templateRegions: [{ id: "headline", kind: "text", label: "headline", x: 0.12, y: 0.3, w: 0.7, h: 0.12, textColor: "#f8f5ec", fontFamily: "sans-serif", fontWeight: "bold", fontSizePx: 56, align: "center" }],
    regionText: { headline: "OPEN HOUSE" },
  };
  const checkA = validateRenderRequest(base);
  const checkB = validateRenderRequest({ ...base, templateRegions: [{ ...base.templateRegions[0], italic: true, letterSpacingPx: 6, textTransform: "uppercase" }] });
  if (checkA.ok && checkB.ok) {
    const [a, b] = await Promise.all([renderMarketingPng(checkA.data), renderMarketingPng(checkB.data)]);
    const same = a === b;
    ok(same, `D1 social template render with style fields is byte-identical to without (${same ? "IDENTICAL ✓" : "DIFFERS ✗ — social path must stay untouched"})`);
  } else {
    ok(false, `D1 social validation failed (${checkA.ok ? "" : checkA.error} / ${checkB.ok ? "" : checkB.error})`);
  }
}

// PNG sanity: rendered outputs are real 1275×1650 PNGs
const sampleFiles = (await readdir(dir)).filter((n) => n.startsWith("style-fidelity-"));
for (const f of sampleFiles) {
  const buf = await readFile(`${dir}/${f}`);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  ok(w === 1275 && h === 1650, `PNG ${f} is 1275×1650 (got ${w}×${h})`);
}

console.log(results.join("\n"));
const failed = results.filter((r) => r.includes("❌"));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
