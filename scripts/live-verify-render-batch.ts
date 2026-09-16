/**
 * Relevate — independent post-deploy live verification for the renderer batch
 * (pixel-level background inpainting + font/typography fidelity), v1.0.0.
 * ==========================================================================
 * Run AFTER the batch deploy lands, against PRODUCTION (not localhost):
 *   PROD_URL=https://site-gray-five-32.vercel.app bun scripts/live-verify-render-batch.ts
 * (PROD_URL defaults to https://site-gray-five-32.vercel.app)
 *
 * Uses a throwaway qa-* account. Cleanup afterwards:
 *   bun scripts/delete-qa-user.ts <email printed at end>
 *
 * Checks (independent verification hand — does NOT use the design engineers'
 * test code paths; drives the exact public API):
 *  0. signup (session cookie)
 *  1. (c) branded flyer render  -> 200 + valid PNG, 1275×1650
 *  2. (c) branded social render -> 200 + valid PNG, 1080×1080
 *  3. template-replica SOCIAL render (sanity — social must stay untouched)
 *  4. (a)+(b) template flyer render on the LIGHT fixture: region background
 *     pixels ≈ template background outside new glyphs (no black box, blends),
 *     and glyph pixels are DARK ≈ template lettering #3a3a36
 *  5. (a)+(b) same on the DARK fixture: background blends dark, glyph pixels
 *     LIGHT ≈ template lettering #f2e9d0
 *  6. (d) checkout still live: throwaway -> Stripe cs_live_ URL
 *  7. (d) demo account -> HTTP 403 never-billing guarantee
 *
 * Evidence PNGs are written to /tmp/qa-batch-live/.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";

const BASE = process.env.PROD_URL || "https://site-gray-five-32.vercel.app";
const DEMO_EMAIL = "relevaterealestate.auto@gmail.com";
const DEMO_PASS = "AidanA415!";
const OUT = "/tmp/qa-batch-live";

const PASS: string[] = [];
const FAIL: string[] = [];
const report = (name: string, ok: boolean, detail: string) => {
  (ok ? PASS : FAIL).push(`${name}: ${detail}`);
  console.log(`${ok ? "✅" : "❌"} ${name} — ${detail}`);
};

// ---- helpers --------------------------------------------------------------
async function jsonFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { res, body: body as Record<string, unknown> | null };
}
const pngDims = (buf: Buffer): [number, number] =>
  buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG"
    ? [buf.readUInt32BE(16), buf.readUInt32BE(20)]
    : [0, 0];

// pixel sampling on a PNG data URL (same approach as scripts/render-regression.ts)
function decodePixels(dataUrl: string, width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${dataUrl}" x="0" y="0" width="${width}" height="${height}"/></svg>`;
  return new Resvg(svg).render().pixels;
}
const sample = (px: Uint8Array, width: number, height: number, fx: number, fy: number): [number, number, number] => {
  const x = Math.max(0, Math.min(width - 1, Math.round(fx * width)));
  const y = Math.max(0, Math.min(height - 1, Math.round(fy * height)));
  const i = (y * width + x) * 4;
  return [px[i], px[i + 1], px[i + 2]];
};
const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const maxDelta = (a: [number, number, number], b: [number, number, number]) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

const asset = async (p: string) => `data:image/png;base64,${(await readFile(p)).toString("base64")}`;
const lightFlyer = await asset("/home/team/shared/render-samples/light-template-flyer.png");
const darkFlyer = await asset("/home/team/shared/render-samples/dark-template-flyer.png");

await mkdir(OUT, { recursive: true });

// ---- 0. signup ------------------------------------------------------------
const email = `qa-batch-${Date.now()}@relevate.test`;
const signup = await fetch(`${BASE}/api/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, name: "QA Batch Verify", password: "Qa-batch-2026!" }),
});
const setCookie = signup.headers.get("set-cookie") || "";
const cookie = setCookie.split(";")[0];
report("signup", signup.status === 201 && setCookie.toLowerCase().includes("session"), `status ${signup.status}, session cookie ${cookie ? "✓" : "MISSING"}`);
const authHeaders = { "Content-Type": "application/json", Cookie: cookie };

async function renderAndSave(name: string, payload: Record<string, unknown>): Promise<{ ok: boolean; dataUrl?: string; buf?: Buffer; status?: number; err?: string }> {
  const { res, body } = await jsonFetch("/api/render", { method: "POST", headers: authHeaders, body: JSON.stringify(payload) });
  const dataUrl = body && typeof body.imageDataUrl === "string" ? body.imageDataUrl : undefined;
  if (res.status === 200 && dataUrl) {
    const buf = Buffer.from(dataUrl.split(",")[1], "base64");
    await writeFile(`${OUT}/${name}.png`, buf);
    return { ok: true, dataUrl, buf, status: res.status };
  }
  return { ok: false, status: res.status, err: (body && (body.error as string)) || "no imageDataUrl" };
}

// ---- 1/2. (c) branded renders ----------------------------------------------
const flyer = await renderAndSave("flyer-branded", {
  type: "flyer", title: "2847 Willow Creek Lane",
  body: "Open Saturday, 1–4 PM\n\n4 beds • 3 baths • 2,485 sq ft\n\nTour a sun-filled home with an updated kitchen and a backyard made for entertaining.\n\nOffered at $895,000",
  agentName: "Maya Chen | Evergreen Realty", brandStyle: "modern minimalist, navy + gold",
});
{
  const [w, h] = flyer.buf ? pngDims(flyer.buf) : [0, 0];
  report("(c) branded-flyer-render", flyer.ok && w === 1275 && h === 1650, `${flyer.status || "?"} ${flyer.ok ? `${w}×${h} PNG ✓` : flyer.err}`);
}

const social = await renderAndSave("social-branded", {
  type: "social", title: "A Fresh Start in Northwood",
  body: "Just listed: a bright 3-bedroom home with an open kitchen and room to gather.\n\nDM Maya for a private tour.",
  agentName: "Maya Chen | Evergreen Realty", brandStyle: "warm minimal, forest green + amber",
});
{
  const [w, h] = social.buf ? pngDims(social.buf) : [0, 0];
  report("(c) branded-social-render", social.ok && w === 1080 && h === 1080, `${social.status || "?"} ${social.ok ? `${w}×${h} PNG ✓` : social.err}`);
}

// ---- 3. template-replica SOCIAL sanity (social path must stay untouched) ----
const socialBg = await asset("/home/team/shared/design-assets/social-background.png");
const tplSocial = await renderAndSave("tpl-social", {
  type: "social", title: "ignored", body: "fallback copy",
  templateImage: socialBg, templateWidth: 1080, templateHeight: 1080,
  templateRegions: [
    { id: "headline", kind: "text", label: "headline", x: 0.12, y: 0.14, w: 0.72, h: 0.16, textColor: "#f8f5ec", fontFamily: "serif", fontWeight: "bold", fontSizePx: 54, align: "left" },
    { id: "body", kind: "text", label: "body", x: 0.12, y: 0.4, w: 0.7, h: 0.14, textColor: "#d1fae5", fontFamily: "sans-serif", fontSizePx: 26, align: "left" },
  ],
  regionText: { headline: "Just Listed\nWillow Creek", body: "A light-filled home with room to gather.\nDM for a private tour." },
});
{
  const [w, h] = tplSocial.buf ? pngDims(tplSocial.buf) : [0, 0];
  report("template-replica-social", tplSocial.ok && w === 1080 && h === 1080, `${tplSocial.status || "?"} ${tplSocial.ok ? `${w}×${h} PNG ✓` : tplSocial.err}`);
}

// ---- 4/5. (a)+(b) template flyer light + dark fixtures ---------------------
// Region geometry matches scripts/render-regression.ts §8c/8d (card region).
const cardRegion = [{ id: "card", kind: "text", label: "headline", x: 0.0706, y: 0.1818, w: 0.847, h: 0.2 }];
const cardText = { card: "2847 Willow Creek Lane\nSaturday 1–4 PM  •  4 beds  •  3 baths" };

async function verifyFlyerFixture(label: string, fixture: string, expectedGlyphLum: "dark" | "light") {
  const tplPx = decodePixels(fixture, 1275, 1650);
  const name = `tpl-flyer-${label}`;
  const r = await renderAndSave(name, {
    type: "flyer", title: "ignored", body: "ignored",
    templateImage: fixture, templateWidth: 1275, templateHeight: 1650,
    templateRegions: cardRegion, regionText: cardText,
  });
  if (!r.ok) { report(`(a+b) ${name}`, false, `${r.status}: ${r.err}`); return; }
  const outPx = decodePixels(r.dataUrl!, 1275, 1650);

  // (a) probes inside the region, away from the new glyph lines (box corners)
  const probes: Array<[number, number]> = [
    [0.0706 + 0.08 * 0.847, 0.1818 + 0.08 * 0.2],
    [0.0706 + 0.92 * 0.847, 0.1818 + 0.08 * 0.2],
    [0.0706 + 0.92 * 0.847, 0.1818 + 0.92 * 0.2],
  ];
  const aOk: boolean[] = [];
  const aDetail: string[] = [];
  for (const [fx, fy] of probes) {
    const out = sample(outPx, 1275, 1650, fx, fy);
    const tpl = sample(tplPx, 1275, 1650, fx, fy);
    const delta = maxDelta(out, tpl);
    const dirOk = expectedGlyphLum === "light" ? lum(out) > 150 : lum(out) < 120;
    aOk.push(delta < 60 && dirOk);
    aDetail.push(`(${fx.toFixed(3)},${fy.toFixed(3)}) out=${out.join(",")} tpl=${tpl.join(",")} Δ${delta.toFixed(0)} lum${lum(out).toFixed(0)}`);
  }
  report(`(a) ${name} region-bg-blends`, aOk.every(Boolean), aDetail.join(" | "));

  // (b) glyph color: min/max luminance over the region must match template
  //     lettering (light fixture → DARK glyphs <100; dark fixture → LIGHT >160)
  let min = 255, max = 0;
  const x0 = Math.max(0, Math.round(0.0706 * 1275)), y0 = Math.max(0, Math.round(0.1818 * 1650));
  const x1 = Math.min(1274, Math.round((0.0706 + 0.847) * 1275)), y1 = Math.min(1649, Math.round((0.1818 + 0.2) * 1650));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * 1275 + x) * 4;
    const l = 0.2126 * outPx[i] + 0.7152 * outPx[i + 1] + 0.0722 * outPx[i + 2];
    if (l < min) min = l;
    if (l > max) max = l;
  }
  const bOk = expectedGlyphLum === "light" ? min < 100 : max > 160;
  report(`(b) ${name} glyph-color`, bOk, `region min-lum ${min.toFixed(0)} / max-lum ${max.toFixed(0)} ${expectedGlyphLum === "light" ? "(expect DARK glyphs <100 ≈ #3a3a36)" : "(expect LIGHT glyphs >160 ≈ #f2e9d0)"}`);
}

await verifyFlyerFixture("light", lightFlyer, "light"); // light template → dark glyphs
await verifyFlyerFixture("dark", darkFlyer, "dark");   // dark template → cream glyphs

// ---- 6/7. (d) checkout -----------------------------------------------------
const co = await jsonFetch("/api/create-checkout-session", {
  method: "POST", headers: authHeaders, body: JSON.stringify({ priceLookupKey: "pro" }),
});
const coUrl = co.body && typeof co.body.url === "string" ? co.body.url : "";
report("(d) checkout-throwaway-live", co.res.status === 200 && coUrl.includes("checkout.stripe.com") && coUrl.includes("cs_live_"), `status ${co.res.status} ${coUrl ? `url has cs_live_ ✓` : (co.body && (co.body.error as string)) || "no url"}`);

const demoSig = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASS }),
});
const demoSetCookie = demoSig.headers.get("set-cookie") || "";
const demoCookie = demoSetCookie.split(";")[0];
const demoCo = await jsonFetch("/api/create-checkout-session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: demoCookie },
  body: JSON.stringify({ priceLookupKey: "team" }),
});
const demoBlocked =
  demoCo.res.status === 403 ||
  (demoCo.res.status === 200 && demoCo.body && demoCo.body.success === false && String(demoCo.body.error || "").includes("never require billing"));
report("(d) checkout-demo-403", demoCo.res.status === 403 || demoBlocked, `status ${demoCo.res.status} ${demoCo.body && (demoCo.body.error as string) ? `msg: ${demoCo.body.error}` : ""}`);

console.log(`\n=== LIVE BATCH VERIFICATION against ${BASE} ===`);
console.log(`Test user: ${email}  (cleanup: bun scripts/delete-qa-user.ts ${email})`);
console.log(`Evidence PNGs: ${OUT}/`);
console.log(`${PASS.length}/${PASS.length + FAIL.length} checks passed`);
process.exit(FAIL.length ? 1 : 0);
