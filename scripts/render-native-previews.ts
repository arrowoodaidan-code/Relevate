/**
 * Native template preview generator (Design Engineer B, task 226be8d1).
 *
 * Renders Relevate's OWN native template options (the four R5 branded layouts)
 * through the REAL production renderer (validateRenderRequest →
 * renderMarketingPng) and writes static preview PNGs to
 * /home/team/shared/native-templates/ for owner review.
 *
 * The renderer auto-dispatches by format + photo presence (flyer-hero/social-photo
 * when a photo is present; flyer-classic/social-classic when not). Each of the
 * four native layouts is therefore one specific render; the previews below show
 * exactly what a user gets.
 *
 * Usage: bun scripts/render-native-previews.ts
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { renderMarketingPng, validateRenderRequest } from "../src/lib/render.ts";

const OUT_DIR = "/home/team/shared/native-templates";
const PHOTO = "/home/team/shared/native-templates/sample-property-photo.jpg";

const TITLE = "2847 Willow Creek Lane";
const AGENT = "Aidan Arrowood";
const PRICE = "$749,000";
const BEDS = "4", BATHS = "3", SQFT = "2,485";
const PHONE = "(843) 250-4438";
const BODY =
  "Sun-filled 4-bed, 3-bath craftsman on a quiet cul-de-sac. Open living " +
  "space with a chef's kitchen, quartz island, and a private fenced yard. " +
  "Minutes to downtown shops, dining, and the greenway.";

interface PreviewCase {
  id: string;
  name: string;
  format: "flyer" | "social";
  photo: boolean;
}

const CASES: PreviewCase[] = [
  { id: "flyer-hero", name: "Flyer — Hero Photo", format: "flyer", photo: true },
  { id: "flyer-classic", name: "Flyer — Classic", format: "flyer", photo: false },
  { id: "social-photo", name: "Social — Photo", format: "social", photo: true },
  { id: "social-classic", name: "Social — Classic", format: "social", photo: false },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const photoDataUrl = `data:image/jpeg;base64,${(await readFile(PHOTO)).toString("base64")}`;
  for (const c of CASES) {
    const raw = {
      type: c.format,
      title: TITLE,
      body: BODY,
      agentName: AGENT,
      brandStyle: "forest modern",
      price: PRICE,
      beds: BEDS,
      baths: BATHS,
      sqft: SQFT,
      agentPhone: PHONE,
      // Explicit brandedTemplate exercises the native-layout override path
      // (task 226be8d1); the renderer honors it over photo auto-dispatch.
      brandedTemplate: c.id,
      imageDataUrl: c.photo ? photoDataUrl : undefined,
    };
    const check = validateRenderRequest(raw as never);
    if (!check.ok) throw new Error(`validateRenderRequest rejected ${c.id}: ${check.error}`);
    const dataUrl = await renderMarketingPng(check.data);
    const png = Buffer.from(dataUrl.split(",")[1], "base64");
    const out = `${OUT_DIR}/${c.id}.png`;
    await writeFile(out, png);
    console.log(`✓ ${c.name.padEnd(22)} -> ${out} (${Math.round(png.length / 1024)} KB)`);
  }
  console.log("All native templates rendered.");
}

main().catch((err) => {
  console.error("PREVIEW RENDER FAILED:", err);
  process.exit(1);
});
