/**
 * Dev tool: gradient-background flyer template for the background-inpaint QA.
 * The card behind the text has a VERTICAL GRADIENT + a faint leaf accent, so a
 * flat sampled-color box is unmistakable (mid-tone band over the gradient),
 * while pixel-level inpainting must reproduce the true gradient everywhere.
 * Writes /home/team/shared/render-samples/gradient-template-flyer.png.
 * Usage: bun scripts/make-gradient-template.ts
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
  h("div", {
    style: {
      position: "absolute", top: 300, left: 90, width: W - 180, height: 330, borderRadius: 14, border: "2px solid #cfc6b2",
      // vertical gradient: light at top → slightly deeper at bottom
      backgroundImage: "linear-gradient(180deg, #e4ecdf 0%, #efe9dc 55%, #d9d3c2 100%)",
      padding: "34px 40px", display: "flex", flexDirection: "column", justifyContent: "center",
    },
  },
    h("div", { style: { color: "#2f3b32", fontSize: 52, fontWeight: 700 } }, "2847 Willow Creek Lane"),
    h("div", { style: { color: "#5c6b5e", fontSize: 30, marginTop: 12 } }, "Saturday 1–4 PM  •  4 beds  •  3 baths"),
    h("div", { style: { color: "#4a554b", fontSize: 26, marginTop: 16, lineHeight: 1.5 } }, "Tour a sun-filled home with an updated kitchen and a backyard made for easy entertaining."),
    // faint accent that must survive inpainting (it is NOT text)
    h("div", { style: { position: "absolute", top: 40, right: 46, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(47,59,50,0.10)" } }),
  ),
  h("div", { style: { position: "absolute", top: 700, left: 90, width: W - 180, height: 120, backgroundColor: "#e5dcc8", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#5c5342", fontSize: 30, fontWeight: 700, letterSpacing: 1 } }, "BOOK YOUR PRIVATE TOUR TODAY"),
  h("div", { style: { position: "absolute", top: 1450, left: 90, width: W - 180, display: "flex", flexDirection: "row", justifyContent: "space-between", color: "#6b6355", fontSize: 26 } },
    h("div", {}, "Maya Chen  |  Sunnyside Realty"),
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
await writeFile("/home/team/shared/render-samples/gradient-template-flyer.png", png);
console.log(`wrote gradient-template-flyer.png (${(png.length / 1024).toFixed(0)} KB, ${W}×${H})`);
