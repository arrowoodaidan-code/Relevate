// Smoke: render a set of FINER-GRAINED multi-image regions through the real
// compositor (renderMarketingPng) to prove #4 — per-object regions still work.
import { readFileSync, writeFileSync } from "node:fs";
import { renderMarketingPng } from "./src/lib/render.ts";

const outDir = "/home/team/shared/render-samples/analyze-template-objects";
const { regions } = JSON.parse(readFileSync(`${outDir}/regions.json`, "utf8"));
const tpl = `data:image/png;base64,${readFileSync(`${outDir}/multi-object-template.png`).toString("base64")}`;
const ASSETS = "/home/team/shared/render-samples/analyze-template-assets";
const img = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;

const regionText: Record<string, string> = {
  "headline-1": "123 Main Street",
  "subheadline-1": "Modern 4-Bed Home",
  "body-1": "Bright open-concept kitchen with quartz counters.",
  "cta-1": "Book a Tour Today",
};
const regionImages: Record<string, string> = {
  "photo-1": img("/home/team/shared/r5-probes/assets/hero-home.png"),
  "logo-1": img(`${ASSETS}/logo.png`),
  "headshot-1": img(`${ASSETS}/headshot.png`),
  "mascot-1": img(`${ASSETS}/mascot.png`),
};

const dataUrl = await renderMarketingPng({
  type: "flyer",
  body: "fallback",
  templateImage: tpl,
  templateRegions: regions,
  regionText,
  regionImages,
  templateWidth: 1080,
  templateHeight: 1350,
});
const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
const file = `${outDir}/render-from-object-regions.png`;
writeFileSync(file, Buffer.from(b64, "base64"));
console.log("render ok ->", file, "bytes:", Buffer.byteLength(b64, "base64"));
console.log("regions rendered:", regions.length, "(image:", regions.filter((r: any) => r.kind === "image").length, ")");
