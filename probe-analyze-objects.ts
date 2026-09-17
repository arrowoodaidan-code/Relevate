// Verify hardened analyze-template: every distinct image object = its own region.
// Builds a 1080x1350 flyer template with hero photo + logo (ON the photo) +
// headshot + mascot + text, then runs analyzeTemplateRegions (gpt-4o).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createElement as h } from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { analyzeTemplateRegions } from "./src/lib/ai.ts";

const outDir = "/home/team/shared/render-samples/analyze-template-objects";
mkdirSync(outDir, { recursive: true });
const dataUrl = (p: string, mime = "image/png") => `data:${mime};base64,${readFileSync(p).toString("base64")}`;

const ASSETS = "/home/team/shared/render-samples/analyze-template-assets";
const hero = dataUrl("/home/team/shared/r5-probes/assets/hero-home.png");
const logo = dataUrl(`${ASSETS}/logo.png`);
const headshot = dataUrl(`${ASSETS}/headshot.png`);
const mascot = dataUrl(`${ASSETS}/mascot.png`);

const font = (p: string) => readFileSync("/home/team/shared/site/.vercel/output/functions/render.func/assets/" + p);

const el = h(
  "div",
  { style: { width: 1080, height: 1350, position: "relative", display: "flex", backgroundColor: "#f4f0e6", color: "#1a2e1a", fontFamily: "Relevate Sans", overflow: "hidden" } },
  [
    h("img", { key: "ph", src: hero, style: { position: "absolute", top: 0, left: 0, width: 1080, height: 650, objectFit: "cover" } }),
    h("img", { key: "logo", src: logo, style: { position: "absolute", top: 40, left: 40, width: 210, height: 210, borderRadius: 24, border: "6px solid #ffffff" } }),
    h("div", { key: "headline", style: { position: "absolute", top: 690, left: 60, width: 960, fontWeight: 700, fontSize: 64, letterSpacing: -1 } }, "2847 Willow Creek Lane"),
    h("div", { key: "sub", style: { position: "absolute", top: 790, left: 60, width: 960, fontSize: 34, color: "#4a5a4a" } }, "A 4-Bed Craftsman in the Heart of the City"),
    h("div", { key: "body", style: { position: "absolute", top: 880, left: 60, width: 960, fontSize: 26, lineHeight: 1.4, color: "#2a3a2a" } }, "Open main level with stone fireplace and chef's kitchen. Hardwood throughout and a screened porch overlooking the wooded half acre."),
    h("img", { key: "headshot", src: headshot, style: { position: "absolute", bottom: 56, left: 60, width: 180, height: 180, borderRadius: 90 } }),
    h("img", { key: "mascot", src: mascot, style: { position: "absolute", bottom: 40, right: 56, width: 170, height: 170 } }),
    h("div", { key: "cta", style: { position: "absolute", bottom: 250, left: 60, width: 960, fontSize: 30, fontWeight: 700, color: "#8a6d2f" } }, "Schedule a Private Tour Today"),
  ],
);

const svg = await satori(el, {
  width: 1080,
  height: 1350,
  fonts: [
    { name: "Relevate Sans", data: font("DejaVuSans.ttf"), weight: 400, style: "normal" },
    { name: "Relevate Sans", data: font("DejaVuSans-Bold.ttf"), weight: 700, style: "normal" },
  ],
});
const png = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng();
const tplDataUrl = `data:image/png;base64,${png.toString("base64")}`;
writeFileSync(`${outDir}/multi-object-template.png`, png);
console.log("tpl bytes:", png.length);

const regions = await analyzeTemplateRegions(tplDataUrl);
if (!regions) { console.error("analysis returned null"); process.exit(1); }
writeFileSync(`${outDir}/regions.json`, JSON.stringify({ regions }, null, 2));
const byKind = (k: string) => regions.filter((r) => r.kind === k);
console.log("\nTOTAL regions:", regions.length);
console.log("TEXT regions:", byKind("text").length, "->", byKind("text").map((r) => `${r.label}[${r.id}]`).join(", "));
console.log("IMAGE regions:", byKind("image").length, "->", byKind("image").map((r) => `${r.label}[${r.id}] x=${r.x.toFixed(2)} y=${r.y.toFixed(2)} w=${r.w.toFixed(2)} h=${r.h.toFixed(2)}`).join("\n  "));
