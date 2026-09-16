/**
 * verify-photo-adaptive-color.ts — gate for adaptive text color on native
 * photo templates (task bf6f8534).
 *
 * Asserts, with MEASURED numbers:
 *  - dual-mode legibility: bright zones flip to dark ink on a light wash;
 *    dark zones keep cream/mint on the dark brand scrim.
 *  - hard contrast floors: >= 3:1 for large text (price), >= 4.5:1 for body,
 *    computed against the photo x scrim/wash surface.
 *  - the derived accent is photo-derived and constrained to muted,
 *    brand-adjacent tones (warm gold / emerald / blue-slate / brand gold).
 *
 * Fixtures: BRIGHT (250,246,235), DARK (20,30,25), MID (128,128,128) — the
 * required bright/dark/mid trio — plus warm / green / sky hue cases.
 *
 * Run: bun scripts/verify-photo-adaptive-color.ts
 */
import { analyzePhoto, zonePalette } from "../src/lib/photo-adaptive.ts";

const WARM_GOLD = "#b98a3e";
const EMERALD = "#4f8a6f";
const BLUE_SLATE = "#6b8fa3";
const INK = "#173024";
const CREAM = "#fff5e0";
const MINT = "#f4fff9";
const ACCENTS = new Set([WARM_GOLD, EMERALD, BLUE_SLATE, "#b98a3e"]);

function solidSvg(r: number, g: number, b: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="rgb(${r},${g},${b})"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const zones = { price: { fx: 0, fy: 0.8, fw: 0.6, fh: 0.2 }, body: { fx: 0, fy: 0.5, fw: 1, fh: 0.3 } };

let passes = 0;
let fails = 0;
function check(ok: boolean, label: string, extra = "") {
  if (ok) { passes++; console.log(`  \u2713 ${label}${extra ? ` — ${extra}` : ""}`); }
  else { fails++; console.log(`  \u2717 ${label}${extra ? ` — ${extra}` : ""}`); }
}

const fixtures: Array<[string, [number, number, number], "dark" | "light"]> = [
  ["BRIGHT", [250, 246, 235], "light"],
  ["DARK", [20, 30, 25], "dark"],
  ["MID", [128, 128, 128], "dark"],
  ["WARM-LIT", [210, 140, 60], "dark"],
  ["GREEN-LAWN", [80, 160, 70], "dark"],
  ["SKY-BLUE", [90, 150, 210], "dark"],
];

const rows: string[] = [];
let allOk = true;
for (const [name, rgb, expectedMode] of fixtures) {
  const a = analyzePhoto(solidSvg(...rgb), zones)!;
  const large = zonePalette(a, "price", { type: "large", darkText: CREAM, lightText: INK });
  const body = zonePalette(a, "body", { type: "body", darkText: MINT, lightText: INK });

  check(large.mode === expectedMode, `${name}: large mode=${large.mode}`, `avgLum=${a.avgLum.toFixed(0)}`);
  check(body.mode === expectedMode, `${name}: body mode=${body.mode}`);
  check(large.contrast >= 3, `${name}: large contrast >= 3`, `measured ${large.contrast.toFixed(2)}`);
  check(body.contrast >= 4.5, `${name}: body contrast >= 4.5`, `measured ${body.contrast.toFixed(2)}`);
  check(ACCENTS.has(a.accentHex), `${name}: accent muted/brand-adjacent`, `accent=${a.accentHex}, bucket=${a.bucket}`);
  if (expectedMode === "light") {
    check(large.textColor === INK, `${name}: LIGHT mode uses dark ink`, `text=${large.textColor}`);
  }
  if (expectedMode === "dark") {
    check(large.textColor === CREAM, `${name}: DARK mode keeps cream`, `text=${large.textColor}`);
    check(body.textColor === MINT, `${name}: DARK mode keeps mint body`, `text=${body.textColor}`);
  }
  rows.push(`| ${name.padEnd(12)} | ${String(a.avgLum.toFixed(0)).padStart(3)} | ${expectedMode} | ${large.contrast.toFixed(2)} | ${body.contrast.toFixed(2)} | ${a.accentHex} | ${large.flipped ? "flipped" : "same"} |`);
  if (large.contrast < 3 || body.contrast < 4.5) allOk = false;
}

console.log("\nPhoto fixture table (price / body zone):");
console.log("| photo | avgLum | mode | large CR | body CR | accent | polarity |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) console.log(r);

console.log(`\nRESULT: ${passes} passed, ${fails} failed`);
if (fails === 0) console.log("Photo-adaptive contrast gate PASSED");
else process.exitCode = 1;
if (!allOk) { console.log("A fixture failed the contrast floor — guaranteed-visibility is non-negotiable."); process.exitCode = 1; }