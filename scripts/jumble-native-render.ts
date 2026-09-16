/**
 * Render the owner's likely flyer/social cases natively at full resolution so I
 * can vision-analyze the CLEAN render (not the UI screenshot). Per memory note:
 * gpt-4o confabulates defects on app-page screenshots; fix only what reproduces
 * on a clean native-res render.
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { renderMarketingPng } from "../src/lib/render.ts";

const OUT = "/home/team/shared/render-samples/jumble-verify";
await mkdir(OUT, { recursive: true });

const heroPhoto = `data:image/png;base64,${(await readFile("/home/team/shared/r5-probes/assets/hero-home.png")).toString("base64")}`;

// The owner screenshot referenced "103 Sedgefield Dr. Clemson, SC", "$399,900",
// "Open House". Reproduce that real-world case.
const flyer = {
  type: "flyer" as const,
  title: "103 Sedgefield Dr. Clemson, SC",
  body:
    "WELCOME HOME — Beautifully updated all-brick ranch on a quiet cul-de-sac. Open-concept living with vaulted ceilings, hardwood floors, and a chef's kitchen. 3 bedrooms, 2 baths.\n\nOPEN HOUSE Saturday 1-4 PM.\n\n• New roof 2024\n• Hardwood floors\n• Fenced backyard\n• Two-car garage\n\nPriced at $399,900. Come see everything this home has to offer — schedule your private tour today.",
  agentName: "Aidan Arrowood",
  agentPhone: "(843) 250-4438",
  price: "$399,900",
  beds: "3",
  baths: "2",
  sqft: "1,858",
  brandStyle: "modern",
  imageDataUrl: heroPhoto,
} as any;

const social = {
  type: "social" as const,
  title: "103 Sedgefield Dr. Clemson, SC",
  body:
    "Just listed! Beautifully updated all-brick ranch on a quiet cul-de-sac. 3 beds • 2 baths • 1,858 sq ft.\n\nOpen House Saturday 1-4 PM.\n\n#JustListed #ClemsonRealEstate #OpenHouseSunday #NewHome",
  agentName: "Aidan Arrowood",
  agentPhone: "(843) 250-4438",
  price: "$399,900",
  beds: "3",
  baths: "2",
  sqft: "1,858",
  brandStyle: "modern",
  imageDataUrl: heroPhoto,
} as any;

const toBuf = (s: string) => Buffer.from(s.split(",")[1], "base64");
await writeFile(`${OUT}/flyer-hero.png`, toBuf(await renderMarketingPng(flyer)));
await writeFile(`${OUT}/social-photo.png`, toBuf(await renderMarketingPng(social)));

// Also render the classic (no-photo) variants.
const flyerClassic = { ...flyer, imageDataUrl: undefined } as any;
const socialClassic = { ...social, imageDataUrl: undefined } as any;
await writeFile(`${OUT}/flyer-classic.png`, toBuf(await renderMarketingPng(flyerClassic)));
await writeFile(`${OUT}/social-classic.png`, toBuf(await renderMarketingPng(socialClassic)));

console.log("wrote native renders to", OUT);
