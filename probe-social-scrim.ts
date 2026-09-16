// Probe: social-photo long/medium body-zone contrast AFTER the bsc scrim fix.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { renderMarketingPng } from "/home/team/shared/site/src/lib/render.ts";

const hero = `data:image/png;base64,${readFileSync("/home/team/shared/r5-probes/assets/hero-home.png").toString("base64")}`;
const TAGS = "\n\n#JustListed #CharlestonRealEstate #OpenHouseSunday #NewHome #LowcountryLiving";
const shortBody = "Stunning 4-bedroom craftsman on a quiet cul-de-sac. Chef's kitchen with quartz counters, hardwood floors throughout, and a screened porch overlooking the wooded backyard. Minutes from downtown and top-rated schools.";
const longBody = "Stunning 4-bedroom craftsman on a quiet cul-de-sac in the heart of Willow Creek, a sought-after neighborhood known for its tree-lined streets and community events. The open main level flows from the foyer into a light-filled great room with a stone fireplace and built-in shelving, then into a chef's kitchen featuring quartz counters, a large island, stainless appliances, and a walk-in pantry. Hardwood floors run throughout the main level, and a screened porch with a ceiling fan overlooks the wooded half-acre lot. Upstairs, the primary suite offers a spa bath with a soaking tub, a frameless glass shower, dual vanities, and a generous walk-in closet, while three additional bedrooms share a full bath. The finished lower level adds a flexible media room and a home office. Enjoy summer evenings on the deck, gardening in the raised beds, and easy access to the neighborhood pool, tennis courts, and the 12-mile greenway. Minutes from downtown shopping, top-rated schools, and the interstate, this exceptional home is priced to move and ready for its next owners. Schedule your private tour today — this one won't last long.";

// mirror of gate bodyZoneContrast: social zone x.06 y.6 w.88 h.3
function zoneDelta(pngUrl: string): number {
  const raw = Buffer.from(pngUrl.split(",")[1], "base64");
  const w = raw.readUInt32BE(16), h = raw.readUInt32BE(20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="data:image/png;base64,${raw.toString("base64")}" x="0" y="0" width="${w}" height="${h}"/></svg>`;
  const d = new Resvg(svg).render().pixels;
  const zx = 0.06, zy = 0.6, zw = 0.88, zh = 0.3;
  const x0 = Math.floor(zx * w), x1 = Math.ceil((zx + zw) * w), y0 = Math.floor(zy * h), y1 = Math.ceil((zy + zh) * h);
  const lum = (i: number) => (d[i] + d[i + 1] + d[i + 2]) / 3;
  let ts = 0, tn = 0, bs = 0, bn = 0;
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
    const i = (yy * w + xx) * 4; const L = lum(i);
    const l6 = xx - 6 >= x0 ? lum(i - 24) : -1, r6 = xx + 6 < x1 ? lum(i + 24) : -1;
    const u6 = yy - 6 >= y0 ? lum(i - w * 24) : -1, d6 = yy + 6 < y1 ? lum(i + w * 24) : -1;
    const e = [l6, r6, u6, d6].some((v) => v >= 0 && Math.abs(L - v) > 34);
    if (e) { ts += L; tn++; } else { bs += L; bn++; }
  }
  const t = tn ? ts / tn : -1, b = bn ? bs / bn : -1;
  return Math.round(Math.abs(t - b) * 10) / 10;
}

const med = await renderMarketingPng({ type: "social", title: "2847 Willow Creek Lane", body: shortBody + TAGS, agentName: "Aidan Arrowood", agentPhone: "(843) 250-4438", price: "$749,000", beds: "4", baths: "3", sqft: "3,240", imageDataUrl: hero, brandStyle: "coastal" });
const lg = await renderMarketingPng({ type: "social", title: "987 Long Meadow Court", body: longBody + TAGS, agentName: "Aidan Arrowood", agentPhone: "(843) 250-4438", price: "$1,249,000", beds: "5", baths: "4", sqft: "4,120", imageDataUrl: hero, brandStyle: "lux" });
const { writeFileSync } = await import("node:fs");
writeFileSync("/home/team/shared/render-samples/vision-gate/r5-social-photo-long-after.png", Buffer.from(lg.split(",")[1], "base64"));
writeFileSync("/home/team/shared/render-samples/vision-gate/r5-social-photo-medium-after.png", Buffer.from(med.split(",")[1], "base64"));
console.log("long  body-zone Δ =", zoneDelta(lg), "(was ≈35.8)");
console.log("med   body-zone Δ =", zoneDelta(med), "(was ≈41.8)");