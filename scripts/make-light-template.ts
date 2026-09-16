/**
 * Dev tool: generate a LIGHT-background flyer template for blend-fix QA.
 * Renders a warm off-white 8.5x11 flyer design (dark green header band, cream
 * content cards with dark text) via the same Satori+Resvg stack the renderer
 * uses, then writes /home/team/shared/render-samples/light-template-flyer.png.
 * Usage: bun scripts/make-light-template.ts
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
  { style: { width: W, height: H, position: "relative", backgroundColor: "#f7f4ee", fontFamily: "Relevate Sans", overflow: "hidden", color: "#2b2b28", display: "flex", flexDirection: "column" } },
  h("div", { style: { position: "absolute", top: 0, left: 0, width: W, height: 230, backgroundColor: "#1f3a2a", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 90 } },
    h("div", { style: { color: "#e8d5a3", fontSize: 26, fontWeight: 700, letterSpacing: 4 } }, "SUNNYSIDE REALTY"),
    h("div", { style: { color: "#ffffff", fontSize: 46, fontWeight: 700, marginTop: 6 } }, "OPEN HOUSE"),
  ),
  h("div", { style: { position: "absolute", top: 300, left: 90, width: W - 180, height: 330, backgroundColor: "#efe9dc", borderRadius: 14, border: "2px solid #ddd5c3", padding: "34px 40px", display: "flex", flexDirection: "column", justifyContent: "center" } },
    h("div", { style: { color: "#3a3a36", fontSize: 52, fontWeight: 700 } }, "2847 Willow Creek Lane"),
    h("div", { style: { color: "#7a6f5c", fontSize: 30, marginTop: 12 } }, "Saturday 1–4 PM  •  4 beds  •  3 baths"),
    h("div", { style: { color: "#5a554a", fontSize: 26, marginTop: 16, lineHeight: 1.5 } }, "Tour a sun-filled home with an updated kitchen and a backyard made for easy entertaining."),
  ),
  h("div", { style: { position: "absolute", top: 700, left: 90, width: W - 180, height: 120, backgroundColor: "#e5dcc8", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#5c5342", fontSize: 30, fontWeight: 700, letterSpacing: 1 } }, "BOOK YOUR PRIVATE TOUR TODAY"),
  h("div", { style: { position: "absolute", top: 1450, left: 90, width: W - 180, display: "flex", flexDirection: "row", justifyContent: "space-between", color: "#6b6355", fontSize: 26 } },
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
await writeFile("/home/team/shared/render-samples/light-template-flyer.png", png);
console.log(`wrote light-template-flyer.png (${(png.length / 1024).toFixed(0)} KB, ${W}×${H})`);
