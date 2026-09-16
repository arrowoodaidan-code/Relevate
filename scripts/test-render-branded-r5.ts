/**
 * R5 — Branded (no-template) mode overflow/fit test suite (TRACK B)
 * ===================================================================
 * Owner-scoped R5 (task 76994e5e, track B): the no-template branded mode must
 * render real-estate-style flyers (8.5×11 → 1275×1650) and social posts
 * (1080×1080) with ALL wordage fitting — "no text overflows its slot; ellipsis
 * path at min size; header/footer fixed + body card fills remaining space"
 * (spec §5, /home/team/shared/r5-branded-design-spec.md).
 *
 * Runs in TWO self-detecting modes so the tree stays green before AND after
 * the R5 implementation lands (parallel track A):
 *
 *  MODE "before" (pre-R5 tree — src/lib/branded-templates.ts absent):
 *    - Layer A  TYPOGRAPHY COVERAGE (assertive): every bundled family the spec
 *      §4 needs (Playfair Display / Bebas Neue / Great Vibes / DejaVu Sans) is
 *      present at its dev path, resolves via font-match.ts to the registered
 *      Relevate family/weight, and probe-renders DISTINCT from the default
 *      DejaVu Sans face at the spec's sizes/tracking (a missing registry entry
 *      silently falls back to DejaVu and would be byte-identical).
 *    - Layer B  STRUCTURAL / BEHAVIORAL (assertive, green against the R4 tree):
 *      canvas dims exact (1275×1650 / 1080×1080), density tiers byte-differ,
 *      photo vs no-photo renders differ, header band + footer band are
 *      PIXEL-IDENTICAL across density tiers (fixed chrome, body absorbs the
 *      change), every fixture validates + renders.
 *    - Layer C  INFORMATIONAL clip measurement: per-slot light-text-ink extent
 *      and body-card clip margin are measured and printed (ℹ️-notes, NOT
 *      failures) so the owner sees the before-state that R5 must fix.
 *    - Produces BEFORE reference renders → /home/team/shared/render-samples/r5/before/
 *    - Exits 0 (before-state is not a failure; R5 hasn't landed yet).
 *
 *  MODE "r5" (auto-activates once src/lib/branded-templates.ts is importable
 *  AND marketingTemplate() in render-templates.ts dispatches to
 *  brandedMarketingTemplate — the module + dispatcher are the wiring signal;
 *  the fingerprint below is informational only):
 *    - Everything from before-mode, plus:
 *    - Layer D  fitBlockToBox UNIT GATE (the no-clip proof): assertions that the
 *      returned layout NEVER exceeds the box, truncates with a trailing "…" and
 *      truncated=true at its minSize, sizes to fill, is deterministic, and
 *      honors lineHeight. Written against A's ACTUAL shipped contract
 *      fitBlockToBox(text, {width,height,fontBuf,size,ls,lineHeight,minSize,
 *      maxSize}) → {size, lines: string[], truncated} (track A landed this
 *      signature rather than the spec's fontFamily/weight draft — behavior
 *      contract is what this gate tests; deviation noted to the lead).
 *    - Layer E  RENDERED INK-WITHIN-SLOT GATE (spec §7 "ink bbox stays inside
 *      its slot"): for every slot in every fixture, light-text-ink pixels
 *      (lum > 150 — the design's text palette is mint/cream/gold/soft, always
 *      light on dark surfaces) must NOT EXIT the slot rect (2px AA grace); the
 *      body slot must contain ink and end ≥1px before the card bottom (measured
 *      on a rect extended 60px below the card so overflow is visible). Slots on
 *      light surfaces auto-skip (covered by the fitBlockToBox units).
 *    - Produces AFTER reference renders → /home/team/shared/render-samples/r5/after/
 *    - Exits 1 on any failure. This is the R5 acceptance gate.
 *
 * Slot geometry mirrors track A's shipped layout (per-template rects derived
 * from the constants in src/lib/branded-templates.ts, incl. the density-driven
 * flyer-classic body-card top). A did NOT export getR5Slots() (spec §7 plan);
 * if the layout changes, update r5SlotsFor() below to match. Any template whose
 * behavior differs from the spec is flagged as an ℹ️ note, not silently hidden.
 *
 * Existing suites stay untouched: canonical 33 (render-regression.ts), style 53
 * (test-render-style-fidelity.ts), replica 43, verify3. This suite adds checks
 * only; it must never fail in before-mode.
 *
 * Usage: bun scripts/test-render-branded-r5.ts
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createElement as h } from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { renderMarketingPng, validateRenderRequest } from "../src/lib/render.ts";
import { matchRegionTypography } from "../src/lib/font-match.ts";

// ---------------------------------------------------------------------------
// Constants — spec §3 density tiers, §4 type system, canvas sizes
// ---------------------------------------------------------------------------
const FLYER_W = 1275, FLYER_H = 1650;
const SOCIAL_W = 1080, SOCIAL_H = 1080;

const TITLE = "2847 Willow Creek Lane";
const AGENT = "Aidan Arrowood";
const PRICE = "$749,000";
const BEDS = "4", BATHS = "3", SQFT = "2,485";
const PHONE = "(843) 250-4438";
const BRAND_STYLE = "forest modern";

const SHORT_BODY =
  "Sun-filled 3-bed, 2-bath craftsman on a quiet Northwood cul-de-sac. Open living space with a chef's kitchen, quartz island, and a private fenced yard. Minutes to downtown shops, dining, and the greenway. 2,150 sq ft of move-in-ready charm.";

const MEDIUM_BODY =
  "Nestled on a quiet cul-de-sac in sought-after Northwood, this sun-filled 3-bed, 2-bath craftsman blends classic charm with modern comfort. The open main level flows from a bright living room with hardwood floors to a chef's kitchen featuring quartz countertops, a large island, and stainless appliances — perfect for everyday living and weekend entertaining.\n\n• New roof (2024)\n• Hardwood floors throughout\n• Two-car garage with EV outlet\n\nThe primary suite offers a spa bath and generous closet space, while the fenced backyard and covered porch create an ideal spot for morning coffee or evening gatherings.";

const LONG_BODY =
  "Perched on a private corner lot in sought-after Northwood, this sun-filled 3-bed, 2-bath craftsman delivers classic charm with modern upgrades throughout. The open main level flows from a bright living room with hardwood floors to a chef's kitchen featuring quartz countertops, a large island, and stainless appliances — perfect for everyday living and weekend entertaining.\n\n• New roof (2024)\n• Hardwood floors throughout\n• Two-car garage with EV outlet\n• Walkable to downtown shops, dining, and the greenway\n• Smart thermostat and keyless entry\n\nThe primary suite is a true retreat with a spa bath, dual vanities, and generous closet space. Two additional bedrooms share a full bath, and a dedicated office nook makes working from home effortless. Outside, the fenced backyard and covered porch create an ideal spot for morning coffee or evening gatherings, while the two-car garage offers storage galore.\n\nLocated just minutes from downtown Northwood, top-rated schools, and the community greenway, this home blends character, quality, and convenience. The landscaped lot, mature shade trees, and quiet streets make it a standout, and the walkable neighborhood is a favorite among families. Don't miss the opportunity to make it yours — schedule your private showing today.";

const DENSITIES = [
  { id: "short", body: SHORT_BODY },
  { id: "medium", body: MEDIUM_BODY },
  { id: "long", body: LONG_BODY },
] as const;

/** Canvas dimensions per format (spec §5). */
const DIMS: Record<string, [number, number]> = {
  flyer: [FLYER_W, FLYER_H],
  social: [SOCIAL_W, SOCIAL_H],
};

const asset = async (p: string) => `data:image/png;base64,${(await readFile(p)).toString("base64")}`;

/** Font dev paths (the same candidates render.ts's ASSET_PATHS falls back to). */
const FONT_PATHS = {
  sans400: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  sans700: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  serif400: "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
  serif700: "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
  mono400: "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
  mono700: "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
  display400: "/home/team/shared/design-assets/fonts/PlayfairDisplay-Regular.ttf",
  display700: "/home/team/shared/design-assets/fonts/PlayfairDisplay-Bold.ttf",
  display900: "/home/team/shared/design-assets/fonts/PlayfairDisplay-Black.ttf",
  script400: "/home/team/shared/design-assets/fonts/GreatVibes-Regular.ttf",
  condensed400: "/home/team/shared/design-assets/fonts/BebasNeue-Regular.ttf",
} as const;

const SHARED = "/home/team/shared";
const R5_DIR = `${SHARED}/render-samples/r5`;
const BEFORE_DIR = `${R5_DIR}/before`;
const AFTER_DIR = `${R5_DIR}/after`;
const TYPO_DIR = `${R5_DIR}/typography`;
await mkdir(BEFORE_DIR, { recursive: true });
await mkdir(AFTER_DIR, { recursive: true });
await mkdir(TYPO_DIR, { recursive: true });

const results: string[] = [];
const ok = (cond: boolean, label: string) => results.push(`${cond ? "✅" : "❌"} ${label}`);
const info = (label: string) => results.push(`ℹ️ ${label}`);

// ---------------------------------------------------------------------------
// Render + pixel helpers
// ---------------------------------------------------------------------------
function decodePng(png: Buffer, w: number, h: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="data:image/png;base64,${png.toString("base64")}" width="${w}" height="${h}"/></svg>`;
  return new Resvg(svg).render().pixels;
}
const pngDims = (buf: Buffer) => [buf.readUInt32BE(16), buf.readUInt32BE(20)] as const;

interface Rect { x: number; y: number; w: number; h: number; }
const pxH = (px: Buffer, w: number) => Math.round(px.length / 4 / w);
function lumAt(px: Buffer, w: number, x: number, y: number): number {
  const i = (y * w + x) * 4;
  return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
}
function rectLum(px: Buffer, w: number, r: Rect): number {
  let sum = 0, n = 0;
  const h = pxH(px, w);
  const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
  const x1 = Math.min(w - 1, Math.round(r.x + r.w - 1)), y1 = Math.min(h - 1, Math.round(r.y + r.h - 1));
  for (let y = y0; y <= y1; y += 4) for (let x = x0; x <= x1; x += 4) { sum += lumAt(px, w, x, y); n++; }
  return n ? sum / n : 0;
}
/** Light-text-ink pixels (lum > 150) inside a rect + their bbox. The R5 text
 *  palette is mint/cream/gold/soft — all light-on-dark; the design surfaces
 *  (forest, wood, dark card) are all < ~140 lum, so lum>150 isolates text ink. */
function lightInk(px: Buffer, w: number, r: Rect): { count: number; maxY: number } {
  const h = pxH(px, w);
  const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
  const x1 = Math.min(w - 1, Math.round(r.x + r.w - 1)), y1 = Math.min(h - 1, Math.round(r.y + r.h - 1));
  let count = 0, mxY = -Infinity;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (lumAt(px, w, x, y) > 150) { count++; if (y > mxY) mxY = y; }
  }
  return { count, maxY: mxY };
}

// ---------------------------------------------------------------------------
// R5 module detection — dynamic import through a VARIABLE path so tsc stays
// green while src/lib/branded-templates.ts does not exist yet (track A owns it).
// ---------------------------------------------------------------------------
const R5_MODULE = "../src/lib/branded-templates.ts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const r5: any = await import(R5_MODULE).catch(() => null);

// ---------------------------------------------------------------------------
// Fixtures — the exact client payload the /api/render path accepts.
// price/beds/baths/sqft/agentPhone are additive R5 fields: the current
// validator ignores unknown keys, so the SAME fixtures drive before-mode today
// and the R5 gate once A's templates consume them (spec §5 structured data).
// ---------------------------------------------------------------------------
// Fixture photo: the OTHER format's background raster, so the 30%-opacity
// photo layer is never the same image as the format's own baseBackgroundDataUrl
// (alpha-blending an image with ITSELF is byte-identical — B3 caught that).
// NOTE: the pre-R5 branded FLYER path PANICS inside resvg (geom.rs unwrap on
// None) when the supplied image has an extreme aspect ratio (e.g. the 1080×220
// social-header-band) — a pre-existing R4 bug that R5's photo treatment
// (spec §6, cover layer with fixed slots) should eliminate; square images
// render fine. Reported to the lead for A's awareness.
const PHOTO_URL: Record<string, string> = {
  flyer: await asset(`${SHARED}/design-assets/social-background.png`),
  social: await asset(`${SHARED}/design-assets/flyer-background.png`),
};
function fixture(format: "flyer" | "social", photo: boolean, density: { id: string; body: string }) {
  return {
    type: format,
    title: TITLE,
    body: density.body,
    agentName: AGENT,
    brandStyle: BRAND_STYLE,
    price: PRICE,
    beds: BEDS,
    baths: BATHS,
    sqft: SQFT,
    agentPhone: PHONE,
    ...(photo ? { imageDataUrl: PHOTO_URL[format] } : {}),
  };
}
interface FixtureCase { format: "flyer" | "social"; photo: boolean; density: { id: string; body: string }; }
const CASES: FixtureCase[] = (["flyer", "social"] as const).flatMap((format) =>
  [false, true].flatMap((photo) => DENSITIES.map((density) => ({ format, photo, density }))));
const caseName = (c: FixtureCase) => `${c.format}-${c.photo ? "photo" : "classic"}-${c.density.id}`;

async function renderFixture(c: FixtureCase): Promise<Buffer> {
  const check = validateRenderRequest(fixture(c.format, c.photo, c.density) as never);
  if (!check.ok) throw new Error(`validateRenderRequest rejected ${caseName(c)}: ${check.error}`);
  const dataUrl = await renderMarketingPng(check.data);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

// ---------------------------------------------------------------------------
// LAYER A — typography coverage (spec §4): every bundled role must exist,
// resolve through font-match, and probe-render DISTINCT from DejaVu Sans.
// ---------------------------------------------------------------------------
{
  // A1 — every font file the spec §4 needs exists at its dev path.
  const required = [
    ["Relevate Display 400", FONT_PATHS.display400],
    ["Relevate Display 700", FONT_PATHS.display700],
    ["Relevate Display 900", FONT_PATHS.display900],
    ["Relevate Condensed 400 (Bebas)", FONT_PATHS.condensed400],
    ["Relevate Script 400 (Great Vibes)", FONT_PATHS.script400],
    ["Relevate Sans 400 (DejaVu)", FONT_PATHS.sans400],
    ["Relevate Sans 700 (DejaVu)", FONT_PATHS.sans700],
  ] as const;
  for (const [label, p] of required) {
    try { await readFile(p); ok(true, `A1 font file present: ${label}`); }
    catch { ok(false, `A1 font file MISSING: ${label} (${p})`); }
  }

  // A2 — font-match resolves the spec's role → family/weight mapping.
  const addr = matchRegionTypography({ fontFamily: "display", fontWeight: "bold" });
  ok(addr.fontFamily === "Relevate Display" && addr.fontWeight === 700, `A2 address role → Relevate Display 700 (got ${addr.fontFamily}/${addr.fontWeight})`);
  const price = matchRegionTypography({ fontFamily: "condensed", fontWeight: "bold" });
  ok(price.fontFamily === "Relevate Condensed" && price.fontWeight === 400, `A2 price/ribbon role → Relevate Condensed 400 single-weight (got ${price.fontFamily}/${price.fontWeight})`);
  const body = matchRegionTypography({ fontFamily: "sans-serif", fontWeight: "normal" });
  ok(body.fontFamily === "Relevate Sans" && body.fontWeight === 400, `A2 body/labels role → Relevate Sans 400 (got ${body.fontFamily}/${body.fontWeight})`);
  const script = matchRegionTypography({ fontFamily: "script", fontWeight: "normal" });
  ok(script.fontFamily === "Relevate Script" && script.fontWeight === 400, `A2 script flourish role → Relevate Script 400 (got ${script.fontFamily}/${script.fontWeight})`);

  // A3 — probe-render each family at spec sizes/tracking: DISTINCT from the
  // default DejaVu Sans face (a missing registry entry falls back silently and
  // renders byte-identical). All probes 1080×1080 on the forest base.
  const readFont = async (p: string) => (await readFile(p)).buffer;
  const fonts = [
    { name: "Relevate Sans", data: await readFont(FONT_PATHS.sans400), weight: 400, style: "normal" },
    { name: "Relevate Sans", data: await readFont(FONT_PATHS.sans700), weight: 700, style: "normal" },
    { name: "Relevate Serif", data: await readFont(FONT_PATHS.serif400), weight: 400, style: "normal" },
    { name: "Relevate Serif", data: await readFont(FONT_PATHS.serif700), weight: 700, style: "normal" },
    { name: "Relevate Mono", data: await readFont(FONT_PATHS.mono400), weight: 400, style: "normal" },
    { name: "Relevate Mono", data: await readFont(FONT_PATHS.mono700), weight: 700, style: "normal" },
    { name: "Relevate Display", data: await readFont(FONT_PATHS.display400), weight: 400, style: "normal" },
    { name: "Relevate Display", data: await readFont(FONT_PATHS.display700), weight: 700, style: "normal" },
    { name: "Relevate Display", data: await readFont(FONT_PATHS.display900), weight: 900, style: "normal" },
    { name: "Relevate Script", data: await readFont(FONT_PATHS.script400), weight: 400, style: "normal" },
    { name: "Relevate Condensed", data: await readFont(FONT_PATHS.condensed400), weight: 400, style: "normal" },
  ] as const;

  async function probe(text: string, family: string, weight: number, size: number, ls?: number, color = "#e8c9a0"): Promise<Buffer> {
    const svg = await satori(
      h("div", { style: { width: 1080, height: 1080, backgroundColor: "#0a1a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: 60 } },
        h("div", { style: { color, fontFamily: family, fontWeight: weight, fontSize: size, ...(ls !== undefined ? { letterSpacing: ls } : {}), textAlign: "center", lineHeight: 1.15 } }, text)),
      { width: 1080, height: 1080, fonts: fonts as never },
    );
    return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng());
  }

  const probes: Array<[string, string, string, number, number, number | undefined]> = [
    // [label, text, family, weight, size, tracking]
    ["display-address", "2847 Willow Creek Lane", "Relevate Display", 700, 84, -0.5],
    ["display-short-title", "The Estates", "Relevate Display", 900, 84, -0.5],
    ["condensed-price", "$749,000", "Relevate Condensed", 400, 110, 2],
    ["condensed-ribbon", "FOR SALE", "Relevate Condensed", 400, 56, 6],
    ["script-flourish", "Open House", "Relevate Script", 400, 60, undefined],
    ["sans-body", "Sun-filled 3-bed, 2-bath craftsman on a quiet cul-de-sac.", "Relevate Sans", 400, 26, undefined],
    ["sans-label", "BEDS", "Relevate Sans", 700, 20, 3],
  ];
  for (const [label, text, family, weight, size, ls] of probes) {
    const png = await probe(text, family, weight, size, ls);
    await writeFile(`${TYPO_DIR}/${label}.png`, png);
    const [w, hgt] = pngDims(png);
    ok(w === 1080 && hgt === 1080, `A3 probe ${label} renders 1080×1080 (${family} ${weight} @ ${size}px${ls !== undefined ? ` ls ${ls}` : ""})`);
    if (family === "Relevate Sans") continue; // sans is the control face
    const baseline = await probe(text, "Relevate Sans", 400, size, ls);
    ok(!png.equals(baseline), `A3 ${label} (${family}) renders DISTINCT from the DejaVu Sans baseline`);
  }
  info(`A3 ${probes.length} typography probes written to ${TYPO_DIR}/`);
}

// ---------------------------------------------------------------------------
// LAYER B — structural / behavioral gate (assertive in BOTH modes):
// dims, density tiers byte-differ, photo-vs-no-photo differs, header + footer
// chrome pixel-identical across densities (fixed bands, body absorbs change).
// ---------------------------------------------------------------------------
const byCase = new Map<string, Buffer>();
{
  for (const c of CASES) {
    const png = await renderFixture(c);
    byCase.set(caseName(c), png);
    const [w, hgt] = pngDims(png);
    const [ew, eh] = DIMS[c.format];
    ok(w === ew && hgt === eh, `B1 ${caseName(c)} renders ${w}×${hgt} (expected ${ew}×${eh})`);
  }

  // B2 — density tiers must change the render wherever the body is actually
  // shown. Flyers: strict (s≠m && m≠l — the body card renders all copy, and
  // the long fixture exercises the bullet-grid path). Socials: the body slot
  // is small (179px, ~7 lines) and truncates, so medium vs long may
  // legitimately converge to the same visible lines; s≠m is the meaningful
  // assertion there (documented via the D-layer truncation units). Track A's
  // 19:35 round ADDED the body slot to Social-Photo (spec §6 overlay now also
  // carries the description), so photo socials must differ by density too.
  for (const format of ["flyer", "social"] as const) for (const photo of [false, true]) {
    const key = (d: string) => `${format}-${photo ? "photo" : "classic"}-${d}`;
    const s = byCase.get(key("short"))!, m = byCase.get(key("medium"))!, l = byCase.get(key("long"))!;
    if (format === "social") {
      ok(!s.equals(m), `B2 social ${photo ? "photo" : "classic"} density tiers byte-differ (short≠medium; medium vs long may converge via truncation)`);
    } else {
      ok(!s.equals(m) && !m.equals(l), `B2 ${format} ${photo ? "photo" : "classic"} density tiers byte-differ (short≠medium≠long)`);
    }
  }

  for (const format of ["flyer", "social"] as const) {
    ok(!byCase.get(`${format}-classic-short`)!.equals(byCase.get(`${format}-photo-short`)!), `B3 ${format} photo vs no-photo renders differ`);
  }

  // B4 — header + footer bands pixel-identical across density tiers.
  // (Pixel comparison, not file bytes — PNG zlib streams differ globally even
  // when a region is unchanged.) Header = top 210/220px (fixed chrome above the
  // ribbon/pill). Footer = BOTTOM band, i.e. y ≥ 1450 (flyer) / 890 (social) —
  // BELOW the R5 body cards (which end at 1410 / 888) and the divider+agent
  // band, so the band must be byte-stable even when the body length changes.
  const headerH: Record<string, number> = { flyer: 210, social: 220 };
  // social footer band starts at 890 (below the body card bottom 888) so the
  // long-body text row that ENDS at the card bottom never overlaps the band —
  // flyer stays 1450 (its body card ends 1410, band 1450+).
  const footerH: Record<string, number> = { flyer: 200, social: 190 };
  for (const format of ["flyer", "social"] as const) for (const photo of [false, true]) {
    const [w, hgt] = DIMS[format];
    const key = (d: string) => `${format}-${photo ? "photo" : "classic"}-${d}`;
    const px = (d: string) => decodePng(byCase.get(key(d))!, w, hgt);
    const [a, b, c] = [px("short"), px("medium"), px("long")];
    const sameRegion = (p: Buffer, q: Buffer, y0: number, y1: number) => p.subarray(y0 * w * 4, y1 * w * 4).equals(q.subarray(y0 * w * 4, y1 * w * 4));
    ok(sameRegion(a, b, 0, headerH[format]) && sameRegion(b, c, 0, headerH[format]), `B4 ${format} ${photo ? "photo" : "classic"} HEADER band pixel-identical across short/medium/long`);
    ok(sameRegion(a, b, hgt - footerH[format], hgt) && sameRegion(b, c, hgt - footerH[format], hgt), `B4 ${format} ${photo ? "photo" : "classic"} FOOTER band pixel-identical across short/medium/long`);
  }

  for (const [name, png] of byCase) await writeFile(`${BEFORE_DIR}/${name}.png`, png);
  info(`B5 ${byCase.size} before-renders written to ${BEFORE_DIR}/`);
}

// ---------------------------------------------------------------------------
// MODE DETECTION — is R5 wired into the render pipeline? The strong signal is
// the MODULE + DISPATCHER: branded-templates.ts exports the R5 pieces AND
// marketingTemplate() in render-templates.ts routes the non-replica branch to
// brandedMarketingTemplate. The stored fingerprint is informational only — it
// keeps the pre-R5 flyer-classic-short baseline for the before/after report.
// ---------------------------------------------------------------------------
const FINGERPRINT = `${R5_DIR}/.fingerprint-flyer-classic-short.png`;
const modulePresent = !!(r5 && typeof r5.fitBlockToBox === "function" && typeof r5.brandedMarketingTemplate === "function");
const renderTpl: any = await import("../src/lib/render-templates.ts").catch(() => null);
const dispatcherWired = !!(renderTpl && typeof renderTpl.marketingTemplate === "function" && renderTpl.marketingTemplate.toString().includes("brandedMarketingTemplate"));
const r5Wired = modulePresent && dispatcherWired;
{
  const current = byCase.get("flyer-classic-short")!;
  const stored = await readFile(FINGERPRINT).catch(() => null);
  if (!stored) {
    await writeFile(FINGERPRINT, current);
    info(`fingerprint: none stored — calibrated flyer-classic-short baseline (${FINGERPRINT})`);
  } else if (stored.equals(current)) {
    info("fingerprint: pipeline output matches the stored baseline (pre-R5 fingerprint)");
  } else {
    info("fingerprint: pipeline output CHANGED vs the stored pre-R5 baseline — R5 pipeline active");
  }
  if (r5Wired) info("mode: R5 WIRED — branded-templates.ts imported + marketingTemplate() dispatches to brandedMarketingTemplate; full gate active");
  else if (modulePresent) info("mode: module present but dispatcher NOT wired — unit gate only");
  else info("mode: pre-R5 — branded-templates.ts not present; before-baseline active");
}

// ---------------------------------------------------------------------------
// LAYER C — informational clip measurement (BOTH modes). For the no-photo
// classic fixtures, measure the body-card light-text-ink and the bottom clip
// margin (slot bottom − last ink row). In before-mode these print ℹ️-notes
// (the pre-R5 state that motivated R5); in r5-mode they are the before/after
// comparison numbers for the owner.
// ---------------------------------------------------------------------------
/** Pre-R5 provisional slot rects — the OLD branded layout (before-geometry,
 *  only used for the ℹ️ C-layer notes when the R5 module is absent). */
function preR5SlotsFor(format: "flyer" | "social"): Record<string, Rect> {
  if (format === "flyer") {
    return {
      header: { x: 0, y: 0, w: FLYER_W, h: 212 },
      title: { x: 94, y: 260, w: FLYER_W - 188, h: 200 },
      body: { x: 138, y: 672, w: FLYER_W - 276, h: 616 },
      footer: { x: 94, y: 1398, w: FLYER_W - 188, h: 252 },
    };
  }
  return {
    header: { x: 0, y: 0, w: SOCIAL_W, h: 222 },
    title: { x: 76, y: 268, w: SOCIAL_W - 152, h: 190 },
    body: { x: 110, y: 580, w: SOCIAL_W - 220, h: 250 },
    footer: { x: 76, y: 888, w: SOCIAL_W - 152, h: 192 },
  };
}
/** R5 slot rects — FALLBACK mirror of track A's exported getR5Slots() (used
 *  only if the export disappears; keep in sync with branded-templates.ts). */
type SlotMapT = Record<"flyer" | "social", Record<string, Rect>>;
function r5SlotsFor(c: FixtureCase): Record<string, Rect> {
  return SLOT_MIRROR[c.format];
}
const SLOT_MIRROR: SlotMapT = {
  flyer: {
    header: { x: 0, y: 0, w: 1275, h: 210 },
    ribbon: { x: 0, y: 246, w: 430, h: 78 },
    priceBand: { x: 90, y: 336, w: 1095, h: 136 },
    address: { x: 90, y: 486, w: 1095, h: 150 },
    keyFacts: { x: 90, y: 685, w: 1095, h: 94 },
    body: { x: 90, y: 787, w: 1095, h: 652 },
    footer: { x: 90, y: 1452, w: 1095, h: 160 },
  },
  social: {
    ribbon: { x: 360, y: 36, w: 360, h: 70 },
    priceAddress: { x: 56, y: 288, w: 968, h: 406 },
    keyFacts: { x: 56, y: 600, w: 968, h: 96 },
    body: { x: 56, y: 710, w: 968, h: 178 },
    agentBand: { x: 56, y: 945, w: 968, h: 82 },
  },
};
for (const format of ["flyer", "social"] as const) {
  const c = { format, photo: false, density: DENSITIES[2] }; // long body — the worst case
  const png = await renderFixture(c);
  const [w, hgt] = DIMS[format];
  const px = decodePng(png, w, hgt);
  const body = (r5Wired ? r5SlotsFor(c) : preR5SlotsFor(format)).body;
  const ink = lightInk(px, w, body);
  const clipMargin = ink.count === 0 ? -1 : Math.round(body.y + body.h - 1 - ink.maxY);
  info(`C ${caseName(c)}: body light-ink ${ink.count}px, clip margin ${clipMargin}px${clipMargin < 8 && ink.count > 0 ? " ⚠️ text reaches the card bottom — clipping (R5 must fit or ellipsize)" : ""} (${r5Wired ? "R5 geometry" : "pre-R5 geometry"})`);
}

// ---------------------------------------------------------------------------
// LAYER D — fitBlockToBox UNIT GATE (r5-mode only; spec §5 + contract §1).
// Track A landed the DOCUMENTED contract (Aug 13 19:35 round):
//   fitBlockToBox(text, {width, height, fontFamily, weight, ls, minSize,
//                        lineHeight}) → {fontSize, lines, truncated}
// where lines is the LINE COUNT (number) and the caller ellipsizes when
// truncated=true. Assertions (behavior contract): the returned layout NEVER
// exceeds the box (fontSize×lineHeight×lines ≤ height+1); when even minSize
// cannot hold the copy → truncated=true and fontSize === minSize; sizing is
// deterministic and honors lineHeight.
// ---------------------------------------------------------------------------
interface FitUnitOpts { width: number; height: number; fontFamily: string; weight?: number; ls?: number; minSize: number; lineHeight: number; }
interface FitUnitResult { fontSize: number; lines: number; truncated: boolean; }
if (r5Wired) {
  const fit = r5.fitBlockToBox as (text: string, opts: FitUnitOpts) => FitUnitResult;
  // The boxes mirror the templates' real slot dimensions (spec §5: minSize
  // 14 flyer / 16 social); family names resolve through A's fontBufferFor().
  const boxes: Array<[string, FitUnitOpts]> = [
    ["flyer-classic body", { width: 1095, height: 604, fontFamily: "Relevate Sans", weight: 400, minSize: 14, lineHeight: 1.5 }],
    ["flyer-classic body (grid)", { width: 1095, height: 348, fontFamily: "Relevate Sans", weight: 400, minSize: 14, lineHeight: 1.5 }],
    ["flyer-hero body", { width: 1095, height: 252, fontFamily: "Relevate Sans", weight: 400, minSize: 14, lineHeight: 1.5 }],
    ["flyer price band", { width: 1095, height: 150, fontFamily: "Relevate Condensed", weight: 400, ls: 2, minSize: 14, lineHeight: 1 }],
    ["flyer address", { width: 1095, height: 148, fontFamily: "Relevate Display", weight: 700, ls: -0.5, minSize: 14, lineHeight: 1.14 }],
    ["social body", { width: 968, height: 179, fontFamily: "Relevate Sans", weight: 400, minSize: 16, lineHeight: 1.4 }],
    ["social price band", { width: 968, height: 130, fontFamily: "Relevate Condensed", weight: 400, ls: 2, minSize: 16, lineHeight: 1 }],
    ["social address", { width: 968, height: 148, fontFamily: "Relevate Display", weight: 700, ls: -0.5, minSize: 16, lineHeight: 1.12 }],
  ];
  for (const d of DENSITIES) for (const [label, opts] of boxes) {
    const r = fit(d.body, opts);
    const totalH = r.fontSize * opts.lineHeight * r.lines;
    if (r.truncated) {
      ok(r.fontSize === opts.minSize, `D ${d.id}/${label}: truncated → fontSize === minSize ${opts.minSize} (got ${r.fontSize})`);
    } else {
      ok(totalH <= opts.height + 1, `D ${d.id}/${label}: fits ${r.fontSize}px × ${r.lines} lines (${totalH.toFixed(0)}px ≤ ${opts.height}px)`);
    }
  }
  const huge = "x".repeat(5000);
  const tr = fit(huge, { width: 968, height: 179, fontFamily: "Relevate Sans", weight: 400, minSize: 16, lineHeight: 1.4 });
  ok(tr.truncated && tr.fontSize === 16, `D truncation: 5000-char body truncates at minSize 16 (got truncated=${tr.truncated} size=${tr.fontSize})`);
  const r1 = fit(DENSITIES[2].body, boxes[0][1]), r2 = fit(DENSITIES[2].body, boxes[0][1]);
  ok(r1.fontSize === r2.fontSize && r1.lines === r2.lines && r1.truncated === r2.truncated, "D determinism: identical inputs → identical outputs");
  const lhA = fit(DENSITIES[1].body, { ...boxes[0][1], lineHeight: 1.2 });
  const lhB = fit(DENSITIES[1].body, { ...boxes[0][1], lineHeight: 1.8 });
  ok(lhB.fontSize <= lhA.fontSize, `D lineHeight honored (1.2 → ${lhA.fontSize}px vs 1.8 → ${lhB.fontSize}px — steeper lineHeight must not increase the fitted size)`);
} else if (modulePresent) {
  info("D fitBlockToBox unit gate: module present but dispatcher not wired — re-run after wiring lands to arm the gate");
} else {
  info("D fitBlockToBox unit gate: awaiting src/lib/branded-templates.ts (track A)");
}

// ---------------------------------------------------------------------------
// LAYER E — RENDERED INK-WITHIN-SLOT GATE (r5-mode only; spec §7).
// Uses track A's exported getR5Slots() geometry (real layout, calibrated so
// no slot text and no neighbour text falls in any slot's 12px dilation band).
// For every slot: light-text-ink pixels (lum > 150 — the design's text palette
// is mint/cream/gold/soft, always light on dark) must not spill OUTSIDE the
// slot's 12px dilation ring (≤0.2% of the ring-only area). The body slot must
// contain ink AND end ≥1px before the BODY CARD bottom for that variant
// (flyer-hero 1410 / flyer-classic 1450 / social 888 — measured on a rect
// extended 60px below the card so any overflow past the card is visible and
// fails the gate). Slots with no text for a variant (e.g. the hero's address
// slot) pass trivially. Slots on light surfaces auto-skip (bg lum > 120).
// ---------------------------------------------------------------------------
if (r5Wired) {
  const userSlots: SlotMapT | null = typeof r5?.getR5Slots === "function" ? r5.getR5Slots() : null;
  info(userSlots ? "E using getR5Slots() geometry from branded-templates.ts" : "E using mirrored geometry (A's getR5Slots() not exported — update contract)");
  /** Body-card bottom per variant (where the fitBlockToBox guarantee must hold). */
  const cardBottomFor = (c: FixtureCase): number | null => {
    if (c.format === "flyer") return c.photo ? 1410 : 1450;
    return 888; // both social variants: body top 710 + 179 box
  };
  for (const c of CASES) {
    const png = await renderFixture(c);
    const [w, hgt] = DIMS[c.format];
    const px = decodePng(png, w, hgt);
    const slots = userSlots ? userSlots[c.format] : r5SlotsFor(c);
    for (const [slotName, slot] of Object.entries(slots)) {
      const bgLum = rectLum(px, w, slot);
      if (bgLum > 120) { info(`E ${caseName(c)}/${slotName}: light surface (lum ${bgLum.toFixed(0)}) — ink check skipped (fitBlockToBox units cover fit)`); continue; }
      const ring: Rect = { x: Math.max(0, slot.x - 12), y: Math.max(0, slot.y - 12), w: slot.w + 24, h: slot.h + 24 };
      const inside = lightInk(px, w, slot);
      // Ring-frame polarity (fixture regeneration for the LIGHTER design, Aug
      // 19): light-ink polarity isolates TEXT only on a DARK surface. In the
      // bright theme a slot's 12px dilation ring can fall on the light body
      // (e.g. the flyer-classic header band 0..210 has its +12 ring dipping
      // into the ivory body) — there those light pixels are BACKGROUND, not
      // text bleed, so the light-ink ring assertion is not meaningful. Sample
      // the ring frame just below the slot and skip the assertion when it is a
      // light surface (dark-ink bleed is not possible within a single dark header).
      const frame: Rect = { x: Math.max(0, slot.x - 12), y: slot.y + slot.h, w: slot.w + 24, h: Math.min(12, hgt - (slot.y + slot.h)) };
      const frameLum = rectLum(px, w, frame);
      if (frameLum > 130) {
        info(`E ${caseName(c)}/${slotName}: ring frame on light surface (lum ${frameLum.toFixed(0)}) — light-ink ring polarity skipped (light ≈ background, not text bleed)`);
      } else {
        const ringInk = lightInk(px, w, ring);
        const ringOnly = Math.max(0, ringInk.count - inside.count);
        const ringArea = ring.w * ring.h - slot.w * slot.h;
        ok(ringOnly / Math.max(1, ringArea) <= 0.002, `E ${caseName(c)}/${slotName}: no light-text ink outside the slot ring (${ringOnly}/${ringArea} px)`);
      }
      if (slotName === "body") {
        ok(inside.count >= 40, `E ${caseName(c)}/body: body slot contains rendered text ink (${inside.count}px)`);
        const cb = cardBottomFor(c)!;
        // In-card margin: the body text must END ≥1px above the card bottom
        // (the pre-R5 bug was text reaching/clipping at the card bottom).
        const cardRect: Rect = { x: slot.x, y: slot.y, w: slot.w, h: cb - slot.y };
        const cardInk = lightInk(px, w, cardRect);
        const inCardMargin = Math.round(cb - (cardInk.count === 0 ? cb : cardInk.maxY));
        ok(inCardMargin >= 1, `E ${caseName(c)}/body: text ends ${inCardMargin}px above card bottom (no clip, card bottom ${cb})`);
        // Overflow band: any light ink 5..9px BELOW the card bottom means text
        // spilled past the card (the footer divider sits at +2..+4 and the
        // agent band at +28+, so this band is text-overflow-only).
        const band: Rect = { x: slot.x, y: cb + 5, w: slot.w, h: 5 };
        const bandInk = lightInk(px, w, band);
        ok(bandInk.count === 0, `E ${caseName(c)}/body: no text ink spilled below the card (${bandInk.count}px in ${cb + 5}..${cb + 9})`);
      }
    }
    await writeFile(`${AFTER_DIR}/${caseName(c)}.png`, png);
  }
  info(`E after-renders written to ${AFTER_DIR}/`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(results.join("\n"));
const failed = results.filter((r) => r.includes("❌"));
const mode = r5Wired ? "R5 (full gate)" : "before (pre-R5 baseline)";
console.log(`\n[${mode}] ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
