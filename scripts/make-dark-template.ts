/**
 * Dev tool: generate a DARK-background flyer template with LIGHT text for the
 * text-color-matching fix QA. Dark forest design (deep green bg, dark card,
 * cream/gold lettering) via the same Satori+Resvg stack the renderer uses.
 * Writes /home/team/shared/render-samples/dark-template-flyer.png.
 * Usage: bun scripts/make-dark-template.ts
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { createElement as h } from "react";

const W = 1275;
const H = 1650;

const [sans, sansBold, serif, serifBold] = await Promise.all([
  readFile("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
  readFile("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
  readFile("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
  readFile("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"),
]);

const tree = h(
  "div",
  { style: { width: W, height: H, position: "relative", backgroundColor: "#0a1a0a", fontFamily: "Relevate Sans", overflow: "hidden", color: "#f2e9d0", display: "flex", flexDirection: "column" } },
  h("div", { style: { position: "absolute", top: 0, left: 0, width: W, height: 230, backgroundColor: "#0d2412", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 90 } },
    h("div", { style: { color: "#d4a017", fontSize: 26, fontWeight: 700, letterSpacing: 4 } }, "EVERGREEN REALTY"),
    h("div", { style: { color: "#f2e9d0", fontSize: 46, fontWeight: 700, marginTop: 6 } }, "OPEN HOUSE"),
  ),
  h("div", { style: { position: "absolute", top: 300, left: 90, width: W - 180, height: 330, backgroundColor: "#10241a", borderRadius: 14, border: "2px solid #1c3a28", padding: "34px 40px", display: "flex", flexDirection: "column", justifyContent: "center" } },
    h("div", { style: { color: "#f2e9d0", fontSize: 52, fontWeight: 700 } }, "2847 Willow Creek Lane"),
    h("div", { style: { color: "#d1fae5", fontSize: 30, marginTop: 12 } }, "Saturday 1–4 PM  •  4 beds  •  3 baths"),
    h("div", { style: { color: "#e5e7eb", fontSize: 26, marginTop: 16, lineHeight: 1.5 } }, "Tour a sun-filled home with an updated kitchen and a backyard made for easy entertaining."),
  ),
  h("div", { style: { position: "absolute", top: 700, left: 90, width: W - 180, height: 120, backgroundColor: "#14301e", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#f2e9d0", fontSize: 30, fontWeight: 700, letterSpacing: 1 } }, "BOOK YOUR PRIVATE TOUR TODAY"),
  h("div", { style: { position: "absolute", top: 1450, left: 90, width: W - 180, display: "flex", flexDirection: "row", justifyContent: "space-between", color: "#d1fae5", fontSize: 26 } },
    h("div", {}, "Maya Chen  |  Evergreen Realty"),
    h("div", {}, "(555) 014-2208  •  maya@relevate.ai"),
  ),
);

const svg = await satori(tree, {
  width: W,
  height: H,
  fonts: [
    { name: "Relevate Sans", data: sans, weight: 400, style: "normal" },
    { name: "Relevate Sans", data: sansBold, weight: 700, style: "normal" },
    { name: "Relevate Serif", data: serif, weight: 400, style: "normal" },
    { name: "Relevate Serif", data: serifBold, weight: 700, style: "normal" },
  ],
});

const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
await mkdir("/home/team/shared/render-samples", { recursive: true });
await writeFile("/home/team/shared/render-samples/dark-template-flyer.png", png);
console.log(`wrote dark-template-flyer.png (${(png.length / 1024).toFixed(0)} KB, ${W}×${H})`);
