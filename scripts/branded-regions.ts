/**
 * Per-object regions for the BRANDED no-template rendered output (task
 * cfbc1353, unblocks the branded-in-editor binding).
 *
 * The inline editor opens a raster base-image + a TemplateRegion[] list. For an
 * UPLOADED template, per-object detection (analyzeTemplateRegions, gpt-4o)
 * supplies those regions. For the BRANDED no-template PNG there were NO
 * regions yet, so the editor couldn't open it. This script closes that gap by
 * running the SAME hardened per-object detector on the branded rendered PNG:
 *
 *   1. render the branded flyer-hero + social-photo (known fixture),
 *   2. analyzeTemplateRegions(flyerPng) and (socialPng) → per-object regions,
 *   3. write render-samples/branded-regions/regions.{flyer-hero,social-photo}.json,
 *   4. CONFIRM THE COMPOSITOR HOLDS: feed each branded PNG back into
 *      renderMarketingPng as a plain raster (templateImage = branded PNG,
 *      templateRegions = detected regions, regionText = re-typed copy) exactly
 *      as the editor's re-render path does — it must return a valid PNG and
 *      never throw. This is the brand-as-template re-composite proof.
 *
 * Detected regions are `additive` UNSET (the compositor's erase/backing path
 * removes the baked-in branded lettering before re-baking edits, so nothing
 * ghosts). Editor-added boxes are `additive: true` (drawn on top).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { renderMarketingPng } from "../src/lib/render";
import { analyzeTemplateRegions } from "../src/lib/ai";
import type { TemplateRegion } from "../src/lib/prompts";

const outDir = "/home/team/shared/render-samples/branded-regions";
mkdirSync(outDir, { recursive: true });
const hero = `data:image/png;base64,${readFileSync("/home/team/shared/r5-probes/assets/hero-home.png").toString("base64")}`;
const save = (dataUrl: string, file: string) =>
  writeFileSync(file, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));

const common = {
  brandStyle: "professional",
  agentName: "Evergreen Realty Group",
  agentPhone: "(864) 555-0134",
  price: "$649,000",
  beds: "4", baths: "3", sqft: "2,850",
  imageDataUrl: hero,
};

interface Case {
  slug: string;
  req: Parameters<typeof renderMarketingPng>[0];
}
const cases: Case[] = [
  {
    slug: "flyer-hero",
    req: { type: "flyer", title: "2847 Willow Creek Lane", body: "Open main level with stone fireplace and chef's kitchen. Hardwood throughout and a screened porch overlooking the wooded half acre.", ...common },
  },
  {
    slug: "social-photo",
    req: { type: "social", title: "Open House Saturday", body: "Join us Saturday 11 AM–2 PM. 4 beds, 3 baths, chef's kitchen, screened porch.", ...common },
  },
];

let failures = 0;
for (const c of cases) {
  // 1. Branded render.
  const brandedPng = await renderMarketingPng(c.req);
  const pngFile = `${outDir}/${c.slug}.png`;
  save(brandedPng, pngFile);

  // 2. Per-object regions from the branded PNG (hardened gpt-4o detector).
  const regions = await analyzeTemplateRegions(brandedPng);
  if (!regions || regions.length === 0) {
    console.log(`❌ ${c.slug}: analyzeTemplateRegions returned no regions`);
    failures++;
    continue;
  }
  const texts = regions.filter((r) => r.kind === "text");
  const images = regions.filter((r) => r.kind === "image");

  // 3. Write the deliverable regions.json (branded mode contract shape).
  const payload = {
    modeLabel: "Branded mode",
    baseImage: pngFile,
    dimensions: { width: c.req.type === "flyer" ? 1275 : 1080, height: c.req.type === "flyer" ? 1650 : 1080 },
    regions,
  };
  writeFileSync(`${outDir}/regions.${c.slug}.json`, JSON.stringify(payload, null, 2));
  writeFileSync(`${outDir}/regions.${c.slug}.regions.json`, JSON.stringify({ regions }, null, 2));

  // 4. COMPOSITOR-HOLDS proof: re-bake the branded PNG as a template raster with
  //    the detected regions + re-typed text (the editor's exact re-render path).
  const regionText: Record<string, string> = {};
  for (const t of texts) {
    regionText[t.id] =
      t.label === "headline" || t.label === "subheadline" ? "2847 Willow Creek Lane"
      : t.label === "contact" ? "Evergreen Realty Group · (864) 555-0134"
      : t.label === "cta" ? "Schedule a Tour"
      : "Edited body copy — this is the re-typed text the editor sends back.";
  }
  try {
    const re = await renderMarketingPng({
      type: c.req.type,
      title: c.req.title,
      body: c.req.body,
      templateImage: brandedPng as string,
      templateRegions: regions as TemplateRegion[],
      templateWidth: c.req.type === "flyer" ? 1275 : 1080,
      templateHeight: c.req.type === "flyer" ? 1650 : 1080,
      regionText,
    });
    const ok = typeof re === "string" && re.startsWith("data:image/png;");
    console.log(`${ok ? "✅" : "❌"} ${c.slug}: ${regions.length} regions (${texts.length} text / ${images.length} image) — compositor re-composite ${ok ? "HOLDS" : "FAILED"}`);
    if (!ok) failures++;
  } catch (e) {
    console.log(`❌ ${c.slug}: compositor re-composite threw: ${String((e as Error)?.message ?? e)}`);
    failures++;
  }
}

console.log(failures === 0
  ? `✅ Branded regions + re-composite proof complete — regions.json written to ${outDir}/`
  : `❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
