/**
 * Dev tool: generate a flyer template with KNOWN typography for the
 * text style & color fidelity regression test. Dark forest design with:
 *  - a sans-serif BOLD, ALL-CAPS, widely letter-spaced headline (tracking 8px)
 *  - a serif normal subheadline
 *  - a DISPLAY-serif band (Playfair Display Bold — elegant high-contrast serif)
 *  - a SCRIPT/calligraphy band (Great Vibes — flowing connected strokes)
 *  - a CONDENSED band (Bebas Neue — tall narrow uppercase display face)
 *  - a gold uppercase CTA band
 * Written via the same Satori+Resvg stack the renderer uses, and the bands are
 * painted with the same REGISTERED font names (Relevate Display / Relevate
 * Script / Relevate Condensed), so the template's lettering is an honest
 * known-typography fixture for the round-2 font-variety regression.
 * Writes /home/team/shared/render-samples/style-template-flyer.png.
 * Usage: bun scripts/make-style-template.ts
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import satori, { init } from "satori";
import { Resvg } from "@resvg/resvg-js";
import { createElement as h } from "react";
const W = 1275;
const H = 1650;
const F = "/home/team/shared/design-assets/fonts";
const [sans, sansBold, serif, serifBold, display, displayBold, displayBlack, script, condensed] = await Promise.all([
  readFile("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
  readFile("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
  readFile("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
  readFile("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"),
  readFile(`${F}/PlayfairDisplay-Regular.ttf`),
  readFile(`${F}/PlayfairDisplay-Bold.ttf`),
  readFile(`${F}/PlayfairDisplay-Black.ttf`),
  readFile(`${F}/GreatVibes-Regular.ttf`),
  readFile(`${F}/BebasNeue-Regular.ttf`),
]);
// Explicit init: under plain `bun run` the ESM entry's auto-init resolves
// yoga.wasm next to dist/index.js, which doesn't exist (it lives at the package
// root). The bundled vercel build handles this itself; scripts need init().
await init(() => readFile("/home/team/shared/site/node_modules/satori/yoga.wasm"));
const tree = h(
  "div",
  { style: { width: W, height: H, position: "relative", backgroundColor: "#0a1a0a", fontFamily: "Relevate Sans", overflow: "hidden", color: "#f2e9d0", display: "flex", flexDirection: "column" } },
  // Header band 0..230
  h("div", { style: { position: "absolute", top: 0, left: 0, width: W, height: 230, backgroundColor: "#0d2412", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 90 } },
    h("div", { style: { color: "#d4a017", fontSize: 26, fontWeight: 700, letterSpacing: 4 } }, "EVERGREEN REALTY"),
    h("div", { style: { color: "#f2e9d0", fontSize: 46, fontWeight: 700, marginTop: 6, letterSpacing: 2 } }, "OPEN HOUSE"),
  ),
  // Headline card 300..420 — sans bold ALL CAPS, tracking 8, cream on dark card
  h("div", { style: { position: "absolute", top: 300, left: 90, width: W - 180, height: 120, backgroundColor: "#10241a", borderRadius: 12, border: "2px solid #1c3a28", display: "flex", alignItems: "center", justifyContent: "center" } },
    h("div", { style: { color: "#f2e9d0", fontSize: 56, fontWeight: 700, letterSpacing: 8 } }, "OPEN HOUSE"),
  ),
  // Subheadline 440..500 — serif normal sentence case
  h("div", { style: { position: "absolute", top: 440, left: 90, width: W - 180, height: 60, backgroundColor: "#0d2412", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" } },
    h("div", { style: { color: "#d1fae5", fontSize: 30, fontFamily: "Relevate Serif" } }, "Saturday, 1–4 PM  •  4 beds  •  3 baths"),
  ),
  // Display band 520..640 — elegant high-contrast display serif (Playfair Bold)
  h("div", { style: { position: "absolute", top: 520, left: 90, width: W - 180, height: 120, backgroundColor: "#10241a", borderRadius: 12, border: "2px solid #1c3a28", display: "flex", alignItems: "center", justifyContent: "center" } },
    h("div", { style: { color: "#f2e9d0", fontSize: 40, fontFamily: "Relevate Display", fontWeight: 700 } }, "Your Dream Home Awaits"),
  ),
  // Script band 660..790 — calligraphic script (Great Vibes), gold on dark
  h("div", { style: { position: "absolute", top: 660, left: 90, width: W - 180, height: 130, backgroundColor: "#0d2412", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" } },
    h("div", { style: { color: "#d4a017", fontSize: 46, fontFamily: "Relevate Script" } }, "Come tour our featured listing"),
  ),
  // Condensed band 810..900 — tall narrow uppercase display face (Bebas Neue)
  h("div", { style: { position: "absolute", top: 810, left: 90, width: W - 180, height: 90, backgroundColor: "#10241a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" } },
    h("div", { style: { color: "#f2e9d0", fontSize: 42, fontFamily: "Relevate Condensed", letterSpacing: 3 } }, "FOR SALE  •  OPEN THIS WEEKEND"),
  ),
  // CTA band 920..1030 — gold uppercase bold tracking 2
  h("div", { style: { position: "absolute", top: 920, left: 90, width: W - 180, height: 110, backgroundColor: "#14301e", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#d4a017", fontSize: 32, fontWeight: 700, letterSpacing: 2 } }, "BOOK A PRIVATE TOUR"),
  // Footer
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
    { name: "Relevate Display", data: display, weight: 400, style: "normal" },
    { name: "Relevate Display", data: displayBold, weight: 700, style: "normal" },
    { name: "Relevate Display", data: displayBlack, weight: 900, style: "normal" },
    { name: "Relevate Script", data: script, weight: 400, style: "normal" },
    { name: "Relevate Condensed", data: condensed, weight: 400, style: "normal" },
  ],
});
const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
await mkdir("/home/team/shared/render-samples", { recursive: true });
await writeFile("/home/team/shared/render-samples/style-template-flyer.png", png);
console.log(`wrote style-template-flyer.png (${(png.length / 1024).toFixed(0)} KB, ${W}×${H})`);
