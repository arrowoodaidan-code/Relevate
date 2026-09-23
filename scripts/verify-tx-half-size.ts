/**
 * TX 535.155(a) gate (task 7be13be8): for all four native templates assert
 *  (1) the planned broker-name size >= half the largest contact-info size,
 *  (2) a TX disclosure strip NEVER contains a licence-number label
 *      (tx-535-155-no-license-number) even when licence fields are supplied,
 *  (3) missing TX names produce the 535.155(a) warning and the message never
 *      claims a licence number is required.
 * Renders TX fixtures + one CA contrast render for visual inspection.
 */
import { renderMarketingPng } from "../src/lib/render";
import { txFooterPlan, largestContactPx } from "../src/lib/branded-templates";
import { disclosureWarnings } from "../src/lib/advertising-rules";
import { writeFile, mkdir } from "node:fs/promises";

const OUT = "/home/team/shared/render-samples/tx-disclosure/";
await mkdir(OUT, { recursive: true });

const base: Record<string, unknown> = {
  contentType: "flyer",
  jurisdiction: "TX",
  details: {
    address: "2201 Barton Springs Road, Austin",
    price: "$829,000",
    beds: 3, baths: 2, sqft: 2210,
    headline: "Modern Hill Country Retreat Minutes From Zilker Park",
    features: ["Whole-home sonos", "Infinity-edge patio", "Solar array"],
    description: "Floor-to-ceiling glass frames the oak canopy. Chef's kitchen with a plaster hood opens to a screened porch.",
  },
  agentName: "Dana Ruiz",
  agentPhone: "(555) 014-2288",
  brokerageName: "Ruiz Residential Realty",
  brokerName: "Ruiz Residential Realty",
  // Supplied deliberately: TX must SUPPRESS licence numbers (no requirement).
  agentLicense: "TREC #998877",
  brokerLicense: "TREC #900112",
};

// [fixtureName, templateId, strip/band width, contentType]
const CASES: [string, string, number, string][] = [
  ["flyer-hero", "flyer-hero", 1275 - 180, "flyer"],
  ["flyer-classic", "flyer-classic", 1275 - 180, "flyer"],
  ["social-photo", "social-photo", 1080 - 112, "social"],
  ["social-classic", "social-classic", 1080 - 180, "social"],
];

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`ok ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${detail}`); }
};

for (const [name, templateId, w, kind] of CASES) {
  const input: any = { ...base, contentType: kind, templateId };
  const plan = txFooterPlan(input, w, 15);
  const largest = largestContactPx(input, w);
  check(`${name}: plan.largestPx consistent with largestContactPx`, plan.largestPx === largest, `plan=${plan.largestPx} direct=${largest}`);
  check(`${name}: brokerSize >= largest/2`, plan.brokerSize >= plan.largestPx / 2, `broker=${plan.brokerSize} largest=${plan.largestPx}`);
  check(`${name}: 48px name -> broker >= 24px`, plan.largestPx === 48 && plan.brokerSize >= 24, `broker=${plan.brokerSize}`);
  check(`${name}: broker segment text`, plan.brokerSeg === "Broker Ruiz Residential Realty", String(plan.brokerSeg));
  const strip = `${plan.brokerSeg ?? ""} ${plan.detailText}`;
  check(`${name}: no licence-number label in TX strip`, !/License #|DRE #/.test(strip), strip);
  check(`${name}: supplied licence numbers suppressed`, !strip.includes("998877") && !strip.includes("9001"), strip);
  const png: string = (await renderMarketingPng(input)) as unknown as string;
  check(`${name}: render OK`, typeof png === "string" && png.startsWith("data:image/png;base64,"));
  await writeFile(`${OUT}tx-${name}.png`, Buffer.from(png.slice("data:image/png;base64,".length), "base64"));
}

// Long agent name forces the band fit smaller; broker must still be >= half.
const longName: any = { ...base, agentName: "Guadalupe Fernández de Castileja y Mendoza-Ortiz", contentType: "flyer", templateId: "flyer-hero" };
const planLong = txFooterPlan(longName, 1095, 15);
check("long-name: brokerSize >= largest/2", planLong.brokerSize >= planLong.largestPx / 2, `broker=${planLong.brokerSize} largest=${planLong.largestPx}`);
check("long-name: broker >= 9px floor when name fits small", planLong.brokerSize >= Math.ceil(planLong.largestPx / 2), `broker=${planLong.brokerSize} largest=${planLong.largestPx}`);

// Warnings: full fields -> none; missing broker -> 535.155(a) warning; the
// message must never claim a licence number is required.
const wFull = disclosureWarnings({ jurisdiction: "TX", agentName: "Dana Ruiz", brokerName: "Ruiz Residential Realty" });
check("warnings: TX full fields -> no warning", wFull.length === 0, JSON.stringify(wFull));
const wMissing = disclosureWarnings({ jurisdiction: "TX", agentName: "Dana Ruiz" });
check("warnings: missing broker -> 535.155 warning", wMissing.some((m) => m.level === "warning" && m.message.includes("535.155")), JSON.stringify(wMissing));
check("warnings: message denies licence-number requirement", wMissing.every((m) => !/(licence|license) number is required/i.test(m.message) && !/must include a (licence|license) number/i.test(m.message)));
const wNoNames = disclosureWarnings({ jurisdiction: "TX" });
check("warnings: no names at all -> warning", wNoNames.some((m) => m.level === "warning" && m.message.includes("535.155")));

// CA contrast render (licence labels still present outside TX).
const caIn: any = { ...base, jurisdiction: "CA", contentType: "flyer", templateId: "flyer-hero" };
const caPng: string = (await renderMarketingPng(caIn)) as unknown as string;
await writeFile(`${OUT}ca-flyer-hero-contrast.png`, Buffer.from(caPng.slice("data:image/png;base64,".length), "base64"));

console.log(fail === 0 ? `TX GATE PASS (${pass}/${pass + fail})` : `TX GATE FAIL (${fail} failures, ${pass} passed)`);
