/**
 * Mark-gating smoke (task 834b0e71 follow-up, lead directive 2026-09-17):
 * EHO legend TEXT renders by default; the EHO house MARK renders ONLY when
 * ehoMark is explicitly true; footer-off removes everything.
 */
import { renderMarketingPng } from "../src/lib/render";
import { writeFile, mkdir } from "node:fs/promises";

const OUT = new URL("./smoke-out/", import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const base = {
  contentType: "flyer" as const,
  templateId: "flyer-hero",
  details: {
    address: "1420 Willow Creek Drive",
    price: "$649,000",
    beds: 4, baths: 3, sqft: 2680,
    headline: "Sun-Filled Craftsman Minutes From Top-Rated Schools",
    features: ["Chef's kitchen with quartz island", "New roof 2024", "Fenced garden"],
    description: "Light pours through updated windows across wide oak floors. The kitchen opens to a covered patio built for long evenings.",
  },
  agentName: "Dana Ruiz",
  agentPhone: "(555) 014-2288",
  agentLicense: "DRE #01998877",
  brokerName: "Ruiz Residential Realty",
  brokerLicense: "DRE #0111222",
  jurisdiction: "CA",
  brokerageName: "Ruiz Residential Realty",
};

const cases: [string, Record<string, unknown>][] = [
  ["flyer-hero-default-text-only", {}],                 // legend ON, mark OFF
  ["flyer-hero-mark-explicit", { ehoMark: true }],      // legend + mark
  ["flyer-hero-footer-off", { ehoFooter: false }],      // nothing renders
];

let fail = 0;
for (const [name, extra] of cases) {
  const res = (await renderMarketingPng({ ...base, ...extra } as any)) as unknown as string;
  if (typeof res !== "string" || !res.startsWith("data:image/png;base64,")) { console.log(`${name}: FAIL (not a PNG data URL)`); fail++; continue; }
  const bytes = Buffer.from(res.slice("data:image/png;base64,".length), "base64");
  if (bytes.length < 20_000) { console.log(`${name}: FAIL (too small: ${bytes.length}B)`); fail++; continue; }
  await writeFile(OUT + name + ".png", bytes);
  console.log(`${name}: OK ${bytes.length}B`);
}
console.log(fail === 0 ? "SMOKE PASS (3/3)" : `SMOKE FAIL (${fail})`);
