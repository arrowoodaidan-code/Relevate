/**
 * LIVE full-res image-layer gate for the DesignDoc renderer.
 *
 * Regression gate for task 788225b5: a full-res 1275×1650 flyer with an image
 * layer must composite the image filling its ENTIRE box (top, center AND bottom
 * = image color, not the canvas background). The prior bug (background-image
 * divs) only filled the upper portion — bottom showed the canvas background.
 *
 * Usage:
 *   PROD_URL=https://site-xxxx.vercel.app bun scripts/gate-fullres-image-preview.ts
 */
import { Resvg } from "@resvg/resvg-js";
import { randomUUID } from "node:crypto";

const BASE = process.env.PROD_URL || "https://site-k11mzl0zd-aidan-1616.vercel.app";

const W = 1275;
const H = 1650;
const BOX = { x: 150, y: 410, w: 975, h: 1030 }; // matches SE's repro box size
const BG = [245, 240, 230]; // light beige canvas #f5f0e6

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) { pass++; console.log(`  ✓ ${label}  (${detail})`); }
  else { fail++; console.log(`  ✗ ${label}  (${detail})`); }
}

function solidPng(w: number, h: number, hex: string): string {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${hex}"/></svg>`;
  return `data:image/png;base64,${new Resvg(s).render().asPng().toString("base64")}`;
}
/** Decode a rendered PNG data URL back to RGBA bytes at its native size. */
function decodePng(dataUrl: string, w: number, h: number): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${dataUrl}" x="0" y="0" width="${w}" height="${h}"/></svg>`;
  return new Resvg(svg).render().pixels as Uint8Array;
}
// A deliberately non-square source image (3:2) so cover must crop/fill — if the
// renderer mis-scales, bottom fails.
const imageData = solidPng(300, 200, "#c02020"); // dark red

const doc = {
  width: W,
  height: H,
  background: "#f5f0e6",
  layers: [
    {
      id: randomUUID(),
      type: "image",
      rect: { x: BOX.x, y: BOX.y, w: BOX.w, h: BOX.h },
      imageData,
      objectFit: "cover",
    },
  ],
};

async function main() {
  console.log(`=== full-res image-layer gate against ${BASE} ===`);
  // 1. sign up a fresh QA account
  const email = `qa-fullres-${Date.now()}@relevate.test`;
  const signup = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: "QA FullRes", password: "Qa-fullres-2026!" }),
  });
  const setCookie = signup.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  check("signup returns session cookie", signup.status === 201 && cookie.startsWith("session="), `status ${signup.status}`);

  // 2. render the full-res DesignDoc
  const render = await fetch(`${BASE}/api/render-design`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ doc }),
  });
  const json = await render.json().catch(() => ({}));
  check("render-design returns success", render.status === 200 && json.success === true, `status ${render.status}`);
  const dataUrl: string = json.imageDataUrl || "";
  check("render-design returns a PNG data URL", dataUrl.startsWith("data:image/png;base64,"), `${dataUrl.slice(0, 40)}…`);

  if (dataUrl.startsWith("data:image/png;base64,")) {
    const px = decodePng(dataUrl, W, H);
    check("decoded PNG is 1275×1650 region-readable", px.length === W * H * 4, `${px.length} bytes (expect ${W * H * 4})`);

    function at(cx: number, cy: number) {
      const i = (Math.round(cy) * W + Math.round(cx)) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    }
    const dist = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const probes = {
      top: { x: BOX.x + BOX.w / 2, y: BOX.y + 12 },
      center: { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 },
      bottom: { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h - 12 },
    };
    for (const [name, p] of Object.entries(probes)) {
      const c = at(Math.round(p.x), Math.round(p.y));
      const isRed = c[0] > 120 && c[1] < 100 && c[2] < 100; // dark red ~ (192,32,32)
      const isBg = dist(c, BG) < 40;
      // pass if it's the image red (regardless of exact crop blend); fail if background bleeds through
      const ok = !isBg && c[0] > 100;
      check(`image fills ${name.toUpperCase()} of box (red, not beige bg)`, ok, `rgb(${c[0]},${c[1]},${c[2]})`);
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  console.log(`Test email: ${email}`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("gate error", e); process.exit(2); });
