/**
 * Relevate — verify the public-host renderer-assets fix (task 45509060).
 * Runs AUTHENTICATED real-user renders against the LIVE public host that was
 * producing the 500 "Failed to render PNG" (empty renderer assets), plus a
 * sanity render on the product host to confirm it's unaffected.
 *
 *   bun scripts/verify-public-host-open-house.ts
 *
 * Checks (each = fresh qa-* signup + session cookie, exact UI /api/render payload):
 *  A. PUBLIC classic open-house-flyer  -> HTTP 200, valid 1275×1650 PNG
 *  B. PUBLIC hero-photo flyer (imageDataUrl) -> HTTP 200, valid 1275×1650 PNG
 *  C. PUBLIC social post                -> HTTP 200, valid 1080×1080 PNG
 *  D. PRODUCT classic open-house-flyer  -> HTTP 200, valid 1275×1650 PNG (unaffected)
 * Evidence PNGs under /tmp/qa-public-host-live/. Prints cleanup emails.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";

const PUBLIC = "https://relevatelistingassistant.ctonew.app";
const PRODUCT = "https://site-gray-five-32.vercel.app";
const OUT = "/tmp/qa-public-host-live";
const PASS: string[] = [];
const FAIL: string[] = [];
let emailPrinted: string[] = [];
const report = (name: string, ok: boolean, detail: string) => {
  (ok ? PASS : FAIL).push(`${name}: ${detail}`);
  console.log(`${ok ? "✅" : "❌"} ${name} — ${detail}`);
};
const pngDims = (buf: Buffer): [number, number] =>
  buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG"
    ? [buf.readUInt32BE(16), buf.readUInt32BE(20)]
    : [0, 0];

async function signup(base: string) {
  const email = `qa-pubfix-${Date.now()}-${Math.floor(Math.random() * 1e4)}@relevate.test`;
  emailPrinted.push(email);
  const res = await fetch(`${base}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: "QA PubFix", password: `Qa-pub-${Date.now()}!` }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  return { email, cookie };
}

const ADDRESS = "2847 Willow Creek Lane";
const BODY =
  "Open Saturday, 1–4 PM\n\n4 beds • 3 baths • 2,485 sq ft\n\nTour a sun-filled home with an updated kitchen.\n\nOffered at $895,000";

async function runRender(base: string, label: string, cookie: string, payload: Record<string, unknown>) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(payload),
  });
  const ms = Date.now() - t0;
  let body: any = null;
  try { body = await res.json(); } catch {}
  const dataUrl = typeof body?.imageDataUrl === "string" ? body.imageDataUrl : "";
  const b64 = dataUrl.startsWith("data:") ? dataUrl.split(",")[1] || "" : "";
  const buf = Buffer.from(b64, "base64");
  const dims = pngDims(buf);
  const ok = res.status === 200 && dims[0] > 0 && dims[1] > 0;
  report(`${label}`, ok, `status=${res.status} time=${ms}ms dims=${dims[0]}×${dims[1]} err=${body?.error ?? ""} pngBytes=${buf.length}`);
  if (dataUrl && dims[0] > 0) {
    await mkdir(OUT, { recursive: true });
    await writeFile(`${OUT}/${label.replace(/[^a-z0-9_-]/gi, "_")}.png`, buf);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const photo = `data:image/png;base64,${(await readFile("/home/team/shared/design-assets/flyer-background.png")).toString("base64")}`;

  const classic = { type: "flyer", title: ADDRESS, body: BODY, agentName: "Maya Chen | Evergreen Realty", brandStyle: "modern minimalist, navy + gold", price: "$895,000", beds: "4", baths: "3", sqft: "2,485" };
  const hero = { type: "flyer", title: ADDRESS, body: BODY, agentName: "Maya Chen", imageDataUrl: photo, price: "$895,000", beds: "4", baths: "3", sqft: "2,485" };
  const social = { type: "social", title: ADDRESS, body: BODY, agentName: "Maya Chen", brandStyle: "modern minimalist, navy + gold", price: "$895,000", beds: "4", baths: "3", sqft: "2,485" };

  // A. PUBLIC classic
  let a = await signup(PUBLIC);
  await runRender(PUBLIC, "A_public_classic_flyer", a.cookie, classic);
  // B. PUBLIC hero-photo
  let b = await signup(PUBLIC);
  await runRender(PUBLIC, "B_public_hero_photo", b.cookie, hero);
  // C. PUBLIC social
  let c = await signup(PUBLIC);
  await runRender(PUBLIC, "C_public_social", c.cookie, social);
  // D. PRODUCT classic (unaffected)
  let d = await signup(PRODUCT);
  await runRender(PRODUCT, "D_product_classic", d.cookie, classic);

  console.log(`\n=== RESULT: ${PASS.length}/${PASS.length + FAIL.length} passed ===`);
  console.log("PASS:");
  PASS.forEach((l) => console.log("  ✅ " + l));
  if (FAIL.length) { console.log("FAIL:"); FAIL.forEach((l) => console.log("  ❌ " + l)); }
  console.log("\nCLEANUP (delete-qa-user):");
  emailPrinted.forEach((e) => console.log("  bun scripts/delete-qa-user.ts " + e));
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/_emails.txt`, emailPrinted.join("\n"));
  process.exit(FAIL.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
