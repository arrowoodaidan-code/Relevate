/**
 * WYSIWYG before/after reproduction (task c25031b9, lead directive 2026-09-29):
 * a MEASURED pair — what the editor showed vs what the export painted — using
 * the real render pipeline (renderDesignDoc) for the export and the fit engine
 * (analyzeDesignTextFit → fitTextLayer) for the numbers. No impressions.
 *
 * Artifacts → /home/team/shared/wysiwyg-before-after/
 *   export-png.png      the REAL download (identical before & after — the
 *                       renderer is untouched by the fix)
 *   canvas-before.png   what the editor showed pre-fix (full text at the chosen
 *                       size, silently clipped by the box)
 *   canvas-after.png    what the editor shows post-fix (the export's EXACT text
 *                       at the export's size — designExportText/analyzeDesignTextFit)
 *   before-side-by-side.png / after-side-by-side.png   labeled pairs
 *   notes.md            exact content, template, measured numbers, decision
 *
 * Run: bun scripts/repro-wysiwyg-before-after.ts
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { makeTextLayer, type DesignDoc } from "../src/lib/design";
import { analyzeDesignTextFit, renderDesignDoc } from "../src/lib/render-design";
import { wrapLines } from "../src/lib/branded-templates";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = "/home/team/shared/wysiwyg-before-after";
mkdirSync(OUT, { recursive: true });

const LONG = "Charming three bedroom craftsman home in the historic district";
const SHRUNK_TXT = "Beautiful four bedroom home with modern kitchen";

// The fixture: a real custom-design flyer (DesignDoc) with two text boxes an
// agent could plausibly draw — one hopeless (truncates), one oversized (shrinks).
const doc: DesignDoc = {
  width: 1275,
  height: 1650,
  background: "#ffffff",
  layers: [
    makeTextLayer({ id: "shrunk", text: SHRUNK_TXT, rect: { x: 100, y: 300, w: 300, h: 120 }, fontSize: 60 }),
    makeTextLayer({ id: "truncated", text: LONG, rect: { x: 100, y: 500, w: 110, h: 28 }, fontSize: 48, lineHeight: 1 }),
  ],
};

// 1) MEASURE with the renderer's own fit engine (single source of truth).
const infos = analyzeDesignTextFit(doc);
const byId = new Map(infos.map((i) => [i.id, i]));
const shrunk = byId.get("shrunk")!;
const trunc = byId.get("truncated")!;
const report = [
  `layer "shrunk":    requested 60px  -> export paints ${shrunk.fittedFontSize}px, ${shrunk.lines} lines, truncated=${shrunk.truncated}`,
  `layer "truncated": requested 48px  -> export paints ${trunc.fittedFontSize}px, ${trunc.lines} lines, truncated=${trunc.truncated}`,
  `  export text for "truncated": ${JSON.stringify(trunc.exportText)}  (input was ${LONG.length} chars)`,
  `  export text for "shrunk":    ${JSON.stringify(shrunk.exportText.slice(0, 40))}… (full ${shrunk.exportText.length} chars, no ellipsis)`,
];
for (const l of report) console.log("MEASURED " + l);

// 2) The REAL export PNG through the untouched renderer.
const rendered = await renderDesignDoc(doc);
const exportB64 = rendered.dataUrl.split(",")[1]!;
writeFileSync(join(OUT, "export-png.png"), Buffer.from(exportB64, "base64"));

// 3) Canvas mocks (zoomed region x60-760, y260-760). DejaVu Sans is the export's
// own registered face (Relevate Sans), so the mock draws in the export's font.
const dejavu = readFileSync(join(ROOT, "src/lib/assets/DejaVuSans.ttf"));
const RegionW = 700, RegionH = 500, RegionX = 60, RegionY = 260;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function boxLines(id: "shrunk" | "truncated", canvasSize: number): { lines: string[]; size: number; stroke: string; dash: string } {
  const layer = doc.layers.find((l) => l.id === id)! as { text: string; rect: { x: number; y: number; w: number; h: number }; fontSize: number; lineHeight?: number };
  if (id === "shrunk") {
    const size = canvasSize === 0 ? layer.fontSize : shrunk.fittedFontSize; // 0 = pre-fix canvas model
    return { lines: wrapLines(layer.text, dejavu.buffer.slice(dejavu.byteOffset, dejavu.byteOffset + dejavu.byteLength), size, 0, layer.rect.w), size, stroke: canvasSize === 0 ? "#9ca3af" : "#0c4a6e", dash: "4 3" };
  }
  const size = canvasSize === 0 ? layer.fontSize : trunc.fittedFontSize;
  const text = canvasSize === 0 ? layer.text : trunc.exportText;
  return { lines: wrapLines(text, dejavu.buffer.slice(dejavu.byteOffset, dejavu.byteOffset + dejavu.byteLength), size, 0, layer.rect.w), size, stroke: canvasSize === 0 ? "#9ca3af" : "#f59e0b", dash: "4 3" };
}

function canvasMock(variant: "before" | "after"): string {
  const pre = variant === "before";
  const parts: string[] = [];
  for (const id of ["shrunk", "truncated"] as const) {
    const layer = doc.layers.find((l) => l.id === id)! as { rect: { x: number; y: number; w: number; h: number } };
    const { lines, size, stroke, dash } = boxLines(id, pre ? 0 : 1);
    const clipId = `clip-${id}`;
    parts.push(`<clipPath id="${clipId}"><rect x="${layer.rect.x}" y="${layer.rect.y}" width="${layer.rect.w}" height="${layer.rect.h}"/></clipPath>`);
    parts.push(`<rect x="${layer.rect.x}" y="${layer.rect.y}" width="${layer.rect.w}" height="${layer.rect.h}" fill="white" stroke="${stroke}" stroke-width="2" stroke-dasharray="${dash}"/>`);
    parts.push(`<g clip-path="url(#${clipId})">`);
    lines.forEach((ln, i) => {
      const baseline = layer.rect.y + (i + 1) * size * (id === "truncated" ? 1.0 : 1.2) - 4;
      parts.push(`<text x="${layer.rect.x + 2}" y="${baseline}" font-family="DejaVu Sans" font-size="${size}" fill="#111827" xml:space="preserve">${esc(ln)}</text>`);
    });
    parts.push(`</g>`);
  }
  const caption = pre
    ? "EDITOR CANVAS — BEFORE the fix: full text at the size you chose, silently clipped by the box edge (gray dashed)"
    : "EDITOR CANVAS — AFTER the fix: the export's exact text at the export's size (amber/blue dashed = will change)";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RegionW}" height="${RegionH}" viewBox="${RegionX} ${RegionY} ${RegionW} ${RegionH}">
  <rect x="${RegionX}" y="${RegionY}" width="${RegionW}" height="${RegionH}" fill="#fafafa"/>
  ${parts.join("\n  ")}
  <text x="${RegionX + 10}" y="${RegionY + 28}" font-family="DejaVu Sans" font-size="20" font-weight="bold" fill="${pre ? "#b91c1c" : "#15803d"}">${esc(caption)}</text>
</svg>`;
}

function sheet(variant: "before" | "after"): string {
  const mock = canvasMock(variant);
  const head = variant === "before"
    ? "BEFORE — editor shows one thing, the download does another (measured)"
    : "AFTER — the canvas shows exactly what the export paints (measured)";
  const sub = variant === "before"
    ? `export paints "shrunk" at ${shrunk.fittedFontSize}px (canvas showed 60px) and "truncated" at ${trunc.fittedFontSize}px as ${JSON.stringify(trunc.exportText)} (canvas showed all ${LONG.length} chars at 48px)`
    : `canvas text/size now come from the renderer's own fit engine (analyzeDesignTextFit) — same string, same size, same box`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1560" height="640">
  <rect width="1560" height="640" fill="#ffffff"/>
  <text x="24" y="40" font-family="DejaVu Sans" font-size="26" font-weight="bold" fill="#111827">${esc(head)}</text>
  <text x="24" y="70" font-family="DejaVu Sans" font-size="17" fill="#374151">${esc(sub)}</text>
  <g transform="translate(24,90)">${mock}</g>
  <g transform="translate(760,90)">
    <text x="0" y="24" font-family="DejaVu Sans" font-size="20" font-weight="bold" fill="#111827">THE DOWNLOAD (real /api/render-design PNG)</text>
    <image href="data:image/png;base64,${exportB64}" x="0" y="36" width="373" height="483"/>
    <rect x="${((100 - 0) * 373) / 1275}" y="${36 + ((300 - 0) * 483) / 1650}" width="${(300 * 373) / 1275}" height="${(120 * 483) / 1650}" fill="none" stroke="#0c4a6e" stroke-width="3"/>
    <rect x="${((100 - 0) * 373) / 1275}" y="${36 + ((500 - 0) * 483) / 1650}" width="${(110 * 373) / 1275}" height="${(28 * 483) / 1650}" fill="none" stroke="#f59e0b" stroke-width="3"/>
  </g>
  <text x="760" y="600" font-family="DejaVu Sans" font-size="15" fill="#6b7280">Blueprint fixture: custom DesignDoc flyer 1275x1650, white bg, two text layers (geometry in notes.md). Renderer UNCHANGED by the fix.</text>
</svg>`;
}

for (const v of ["before", "after"] as const) {
  const svg = sheet(v);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1560 } }).render().asPng();
  writeFileSync(join(OUT, `${v}-side-by-side.png`), png);
}
writeFileSync(join(OUT, "canvas-before.png"), new Resvg(canvasMock("before"), { fitTo: { mode: "width", value: 1400 } }).render().asPng());
writeFileSync(join(OUT, "canvas-after.png"), new Resvg(canvasMock("after"), { fitTo: { mode: "width", value: 1400 } }).render().asPng());

// 4) notes.md — the measured pair + decision.
writeFileSync(
  join(OUT, "notes.md"),
  `# WYSIWYG before/after — measured pair (task c25031b9, PR #31)

## The fixture (exact content and template)
- Template: **custom from-scratch design** (DesignDoc), flyer surface **1275x1650**, white background — the blank-canvas editor's own output, not a native template.
- Layer "shrunk": text \`${SHRUNK_TXT}\` (${SHRUNK_TXT.length} chars), box x=100 y=300 w=300 h=120, chosen **60px**, Relevate Sans 400, default lineHeight 1.2.
- Layer "truncated": text \`${LONG}\` (${LONG.length} chars), box x=100 y=500 w=110 h=28, chosen **48px**, lineHeight 1.0.

## Measured BEFORE (pre-fix editor vs the download)
| layer | editor canvas showed | the exported PNG paints (measured via the renderer's own fitTextLayer) |
|---|---|---|
| shrunk | all ${SHRUNK_TXT.length} chars at **60px**, silently clipped by the box edge | **${shrunk.fittedFontSize}px**, ${shrunk.lines} lines, full text (truncated=${shrunk.truncated}) |
| truncated | all ${LONG.length} chars at **48px**, silently clipped | **${trunc.fittedFontSize}px**, ${trunc.lines} line, text = ${JSON.stringify(trunc.exportText)} |

The mismatch is total: size AND content. The agent approves text that is not in the PNG, and the PNG contains a decision ("…") they never saw.

## Measured AFTER (this PR)
The editor canvas renders the export's own verdict — \`analyzeDesignTextFit\` returns \`exportText\` (the renderer's exact painted string via the new \`designExportText\`) and \`fittedFontSize\`; the canvas paints those instead of the user's wish, with an amber "clips in export" / blue "Npx in export" badge and a warning strip. The properties panel still holds and edits the REAL full text.
- canvas "shrunk" now paints **${shrunk.fittedFontSize}px, full text** = the download.
- canvas "truncated" now paints **${trunc.fittedFontSize}px, ${JSON.stringify(trunc.exportText)}** = the download.

## Which side moved, and why
**The canvas moved; the renderer did not.** A fixed 1275x1650 print / 1080px social surface must never overflow its box, so "the renderer grows/shifts to fit" was the wrong direction — the fit engine already shrinks to the 8px legibility floor and only then ellipsizes. The honest answer was "the renderer is right and the canvas should match": the preview now shows the export's text at the export's size, and the download contains nothing the editor did not show.

## Evidence chain
- \`bun scripts/test-design-fit-wysiwyg.ts\` — 44/44 PASS, incl. \`exportText === designExportText(layer, fitTextLayer(layer))\` parity.
- \`export-png.png\` produced by the untouched \`renderDesignDoc\` — identical before and after the fix.
- This script regenerates every artifact: \`bun scripts/repro-wysiwyg-before-after.ts\`.
- Renderer truncation semantics (incl. the aggressive floor(lines x 1.6) char cap) are intentionally unchanged — flagged to the renderer owner separately.

Generated ${new Date().toISOString()} by scripts/repro-wysiwyg-before-after.ts.
`,
);
console.log("ARTIFACTS WRITTEN to " + OUT);
