// Render the redesigned (after) branded no-template flyer + social for before/after.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { renderMarketingPng } from "/home/team/shared/site/src/lib/render.ts";

const outDir = "/home/team/shared/render-samples/redesign-after";
mkdirSync(outDir, { recursive: true });
const hero = `data:image/png;base64,${readFileSync("/home/team/shared/r5-probes/assets/hero-home.png").toString("base64")}`;
const save = (dataUrl: string, file: string) =>
  writeFileSync(file, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));

const W = 100; // unused width guard — actual dims come from layout below
void W;
const common = {
  brandStyle: "professional",
  agentName: "Evergreen Realty Group",
  agentPhone: "(864) 555-0134",
  price: "$649,000",
  beds: "4", baths: "3", sqft: "2,850",
  imageDataUrl: hero,
};
const flyer = await renderMarketingPng({ type: "flyer", title: "2847 Willow Creek Lane", body: "Open main level with stone fireplace and chef's kitchen. Hardwood throughout and a screened porch overlooking the wooded half acre.", ...common });
save(flyer, `${outDir}/after-flyer-hero.png`);
const social = await renderMarketingPng({ type: "social", title: "Open House Saturday", body: "Join us Saturday 11 AM–2 PM. 4 beds, 3 baths, chef's kitchen, screened porch.", ...common });
save(social, `${outDir}/after-social-photo.png`);
console.log("wrote after-flyer-hero.png + after-social-photo.png");
